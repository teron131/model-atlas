/** Candidate assembly projects heterogeneous source rows into the scorer's stable input shape. */

import type { ScoringConfig } from "../../config/stage";
import {
	canonicalReasoningEffort,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../../identity/normalization";
import { resolveModelLogo } from "../../logos/resolve";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
	ModelAtlasContextWindow,
	ModelAtlasCost,
	ModelAtlasCostBreakdown,
	ModelAtlasCostTier,
	ModelAtlasIntelligenceIndexCost,
	ModelAtlasModalities,
	ModelAtlasModelCandidate,
	ModelAtlasScoringSources,
	ModelAtlasSpeed,
	ModelAtlasTaskMetrics,
	ModelAtlasTaskMetricValues,
} from "../model-types";
import {
	type BenchmarkImputationByModel,
	type BenchmarkImputationConfidenceByModel,
	blendedPriceValue,
	buildComponentScoreResult,
	type QualityScoringContext,
} from "../scores";

type TaskMetricValues = ModelAtlasTaskMetricValues;
type TaskMetricKey = keyof TaskMetricValues;

const EMPTY_OPENROUTER_PRICING = {
	weighted_input: null,
	weighted_output: null,
} as const;
const MIN_INTELLIGENCE_COST_TOTAL_TOKENS = 1_000_000;
const INTELLIGENCE_COST_TOTAL_COST_KEY = "intelligence_index_cost_total_cost";
const INTELLIGENCE_COST_TOTAL_TOKENS_KEY =
	"intelligence_index_cost_total_tokens";
const GENERIC_TASK_METRIC_FIELDS = {
	cost: [
		"cost_per_task_usd",
		"cost_per_task",
		"mean_cost_usd",
		"median_cost_usd",
	],
	seconds: [
		"seconds_per_task",
		"duration_seconds_per_task",
		"mean_duration_seconds_per_task",
		"median_duration_seconds_per_task",
		"mean_duration_seconds",
		"median_duration_seconds",
	],
	tokens: ["tokens_per_task", "mean_tokens_per_task", "median_tokens_per_task"],
	input_tokens: [
		"input_tokens_per_task",
		"mean_input_tokens_per_task",
		"median_input_tokens_per_task",
	],
	output_tokens: [
		"output_tokens_per_task",
		"mean_output_tokens_per_task",
		"median_output_tokens_per_task",
		"mean_output_tokens",
		"median_output_tokens",
	],
} as const satisfies Record<TaskMetricKey, readonly string[]>;

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

function buildNumericMap<T extends Record<string, number | null | undefined>>(
	value: unknown,
): T | null {
	const numericFields: Record<string, number> = {};
	for (const [key, fieldValue] of Object.entries(asRecord(value))) {
		const numericValue = asFiniteNumber(fieldValue);
		if (numericValue != null) {
			numericFields[key] = numericValue;
		}
	}
	return hasFields(numericFields) ? (numericFields as T) : null;
}

function providerFromId(modelId: unknown): string | null {
	if (typeof modelId !== "string") {
		return null;
	}
	const slashIndex = modelId.indexOf("/");
	if (slashIndex <= 0) {
		return null;
	}
	return normalizeProviderId(modelId.slice(0, slashIndex));
}

function providerFromModel(model: JsonObject): string | null {
	const fromId = providerFromId(model.id);
	if (fromId) {
		return fromId;
	}
	return typeof model.provider_id === "string" ? model.provider_id : null;
}

/** Projects input and output modalities when source data provides them. */
function buildModalities(model: JsonObject): ModelAtlasModalities | null {
	const modalities = asRecord(model.modalities);
	const input = Array.isArray(modalities.input)
		? modalities.input.filter(
				(value): value is string => typeof value === "string",
			)
		: undefined;
	const output = Array.isArray(modalities.output)
		? modalities.output.filter(
				(value): value is string => typeof value === "string",
			)
		: undefined;
	const normalized: ModelAtlasModalities = {};
	if (input && input.length > 0) {
		normalized.input = input;
	}
	if (output && output.length > 0) {
		normalized.output = output;
	}
	return Object.keys(normalized).length > 0 ? normalized : null;
}

function buildContextWindow(model: JsonObject): ModelAtlasContextWindow {
	const limit = asRecord(model.limit);
	const context = asFiniteNumber(limit.context);
	const input = asFiniteNumber(limit.input);
	const output = asFiniteNumber(limit.output);
	if (context == null && input == null && output == null) {
		return null;
	}
	return {
		...(context != null ? { context } : {}),
		...(input != null ? { input } : {}),
		...(output != null ? { output } : {}),
	};
}

function buildSpeed(
	model: JsonObject,
	modelId: string | null,
	speedByModelId: Map<string, JsonObject>,
): ModelAtlasSpeed {
	const openRouterSpeed = lookupOpenRouterData(
		speedByModelId,
		modelId,
		hasSpeedData,
	);
	const throughput =
		asFiniteNumber(openRouterSpeed?.throughput_tokens_per_second_median) ??
		asFiniteNumber(model.median_output_tokens_per_second);
	const latency =
		asFiniteNumber(openRouterSpeed?.latency_seconds_median) ??
		asFiniteNumber(model.median_time_to_first_token_seconds);
	const e2eLatency =
		asFiniteNumber(openRouterSpeed?.e2e_latency_seconds_median) ??
		asFiniteNumber(model.median_end_to_end_response_time_seconds) ??
		asFiniteNumber(model.median_time_to_first_answer_token) ??
		latency;
	return {
		throughput_tokens_per_second_median: throughput,
		latency_seconds_median: latency,
		e2e_latency_seconds_median: e2eLatency,
	};
}

function hasSpeedData(speed: JsonObject): boolean {
	return (
		asFiniteNumber(speed.throughput_tokens_per_second_median) != null ||
		asFiniteNumber(speed.latency_seconds_median) != null ||
		asFiniteNumber(speed.e2e_latency_seconds_median) != null
	);
}

function hasPricingData(pricing: JsonObject): boolean {
	return (
		(asFiniteNumber(pricing.weighted_input) ?? 0) > 0 ||
		(asFiniteNumber(pricing.weighted_output) ?? 0) > 0
	);
}

/** Looks up OpenRouter data by exact and normalized model IDs. */
function lookupOpenRouterData(
	valuesById: Map<string, JsonObject>,
	modelId: string | null,
	hasData: (value: JsonObject) => boolean,
): JsonObject | null {
	if (modelId == null) {
		return null;
	}
	const exact = valuesById.get(modelId);
	const normalized = valuesById.get(normalizeProviderModelId(modelId));
	if (exact != null && hasData(exact)) {
		return exact;
	}
	if (normalized != null && hasData(normalized)) {
		return normalized;
	}
	return exact ?? normalized ?? null;
}

function buildCostBreakdown(value: unknown): ModelAtlasCostBreakdown | null {
	const source = asRecord(value);
	const cost: ModelAtlasCostBreakdown = {};
	const input = asFiniteNumber(source.input);
	const output = asFiniteNumber(source.output);
	const cacheRead = asFiniteNumber(source.cache_read);
	const cacheWrite = asFiniteNumber(source.cache_write);
	if (input != null) {
		cost.input = input;
	}
	if (output != null) {
		cost.output = output;
	}
	if (cacheRead != null) {
		cost.cache_read = cacheRead;
	}
	if (cacheWrite != null) {
		cost.cache_write = cacheWrite;
	}
	return hasFields(cost) ? cost : null;
}

/** Projects one tiered pricing record for public output. */
function buildCostTier(value: unknown): ModelAtlasCostTier | null {
	const source = asRecord(value);
	const costTier: ModelAtlasCostTier = {
		...(buildCostBreakdown(source) ?? {}),
	};
	const tier = asRecord(source.tier);
	const tierType = typeof tier.type === "string" ? tier.type : null;
	const tierSize = asFiniteNumber(tier.size);
	if (tierType != null || tierSize != null) {
		costTier.tier = {
			...(tierType != null ? { type: tierType } : {}),
			...(tierSize != null ? { size: tierSize } : {}),
		};
	}
	return hasFields(costTier) ? costTier : null;
}

function buildCost(
	model: JsonObject,
	openRouterPricing: JsonObject,
	scoringConfig: ScoringConfig,
): ModelAtlasCost {
	const baseCost = asRecord(model.cost);
	const cost: Exclude<ModelAtlasCost, null> = {
		...(buildCostBreakdown(baseCost) ?? {}),
	};
	const contextOver200k = buildCostBreakdown(baseCost.context_over_200k);
	if (contextOver200k != null) {
		cost.context_over_200k = contextOver200k;
	}
	if (Array.isArray(baseCost.tiers)) {
		const tiers = baseCost.tiers
			.map((tier) => buildCostTier(tier))
			.filter((tier): tier is ModelAtlasCostTier => tier != null);
		if (tiers.length > 0) {
			cost.tiers = tiers;
		}
	}
	const weightedInput = asFiniteNumber(openRouterPricing.weighted_input);
	const weightedOutput = asFiniteNumber(openRouterPricing.weighted_output);
	if (weightedInput != null) {
		cost.weighted_input = weightedInput;
	}
	if (weightedOutput != null) {
		cost.weighted_output = weightedOutput;
	}
	const blendedPrice = blendedPriceValue(cost, scoringConfig);
	if (blendedPrice != null) {
		cost.blended_price = blendedPrice;
	}
	return hasFields(cost) ? cost : null;
}

function buildIntelligenceIndexCost(
	model: JsonObject,
): ModelAtlasIntelligenceIndexCost {
	const fromRow = asRecord(model.intelligence_index_cost);
	const fromIntelligence = asRecord(model.intelligence);
	const totalCost =
		asFiniteNumber(fromRow.total_cost) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_COST_KEY]);
	const totalTokens =
		asFiniteNumber(fromRow.total_tokens) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY]);
	const cost: Exclude<ModelAtlasIntelligenceIndexCost, null> = {};
	for (const key of [
		"input_cost",
		"reasoning_cost",
		"output_cost",
		"input_tokens",
		"reasoning_tokens",
		"answer_tokens",
		"output_tokens",
		"cost_per_task",
		"seconds_per_task",
		"output_tokens_per_task",
	] as const) {
		const value = asFiniteNumber(fromRow[key]);
		if (value != null) {
			cost[key] = value;
		}
	}
	if (totalCost != null) {
		cost.total_cost = totalCost;
	}
	if (
		totalTokens != null &&
		totalTokens >= MIN_INTELLIGENCE_COST_TOTAL_TOKENS
	) {
		cost.total_tokens = totalTokens;
	}
	return hasFields(cost) ? cost : null;
}

function buildScoringSources(model: JsonObject): ModelAtlasScoringSources {
	const scoringSources: NonNullable<ModelAtlasScoringSources> = {};
	for (const [key, value] of Object.entries(asRecord(model.scoring_sources))) {
		const source = asRecord(value);
		if (hasFields(source)) {
			scoringSources[key] = source;
		}
	}
	const deepSwe = buildDeepSWESource(model);
	const agentsLastExam = buildAgentsLastExamSource(model);
	if (deepSwe != null) {
		scoringSources.deep_swe = deepSwe;
	}
	if (agentsLastExam != null) {
		scoringSources.agents_last_exam = agentsLastExam;
	}
	return hasFields(scoringSources) ? scoringSources : null;
}

function buildDeepSWESource(model: JsonObject) {
	const source = asRecord(asRecord(model.scoring_sources).deep_swe);
	const passAt1 = asFiniteNumber(source.pass_at_1);
	const tasksAttempted = asFiniteNumber(source.n_tasks_attempted);
	const meanCostUsd = asFiniteNumber(source.mean_cost_usd);
	const meanDurationSeconds = asFiniteNumber(source.mean_duration_seconds);
	const meanOutputTokens = asFiniteNumber(source.mean_output_tokens);
	if (
		typeof source.model !== "string" ||
		passAt1 == null ||
		tasksAttempted == null ||
		meanCostUsd == null ||
		meanOutputTokens == null
	) {
		return null;
	}
	return {
		model: source.model,
		reasoning_effort:
			typeof source.reasoning_effort === "string"
				? source.reasoning_effort
				: null,
		config: typeof source.config === "string" ? source.config : null,
		pass_at_1: passAt1,
		ci_lo: asFiniteNumber(source.ci_lo),
		ci_hi: asFiniteNumber(source.ci_hi),
		ci_half: asFiniteNumber(source.ci_half),
		n_tasks_attempted: tasksAttempted,
		mean_cost_usd: meanCostUsd,
		mean_duration_seconds: meanDurationSeconds ?? null,
		mean_output_tokens: meanOutputTokens,
	};
}

function buildAgentsLastExamSource(model: JsonObject) {
	const source = asRecord(asRecord(model.scoring_sources).agents_last_exam);
	const medianScore = asFiniteNumber(source.median_score);
	const meanScore = asFiniteNumber(source.mean_score);
	const medianAccuracy = asFiniteNumber(source.median_accuracy);
	const meanAccuracy = asFiniteNumber(source.mean_accuracy);
	const medianTotalDurationSeconds = asFiniteNumber(
		source.median_total_duration_seconds,
	);
	const meanTotalDurationSeconds = asFiniteNumber(
		source.mean_total_duration_seconds,
	);
	const medianTotalInputTokens = asFiniteNumber(
		source.median_total_input_tokens,
	);
	const meanTotalInputTokens = asFiniteNumber(source.mean_total_input_tokens);
	const medianTotalOutputTokens = asFiniteNumber(
		source.median_total_output_tokens,
	);
	const meanTotalOutputTokens = asFiniteNumber(source.mean_total_output_tokens);
	const medianDurationSecondsPerTask = asFiniteNumber(
		source.median_duration_seconds_per_task,
	);
	const meanDurationSecondsPerTask = asFiniteNumber(
		source.mean_duration_seconds_per_task,
	);
	const medianInputTokensPerTask = asFiniteNumber(
		source.median_input_tokens_per_task,
	);
	const meanInputTokensPerTask = asFiniteNumber(
		source.mean_input_tokens_per_task,
	);
	const medianOutputTokensPerTask = asFiniteNumber(
		source.median_output_tokens_per_task,
	);
	const meanOutputTokensPerTask = asFiniteNumber(
		source.mean_output_tokens_per_task,
	);
	const medianCostUsdPerTask = asFiniteNumber(source.median_cost_usd_per_task);
	const meanCostUsdPerTask = asFiniteNumber(source.mean_cost_usd_per_task);
	const frequency = asFiniteNumber(source.frequency);
	if (
		typeof source.model !== "string" ||
		typeof source.split !== "string" ||
		medianScore == null ||
		meanScore == null ||
		medianAccuracy == null ||
		meanAccuracy == null ||
		medianTotalDurationSeconds == null ||
		meanTotalDurationSeconds == null ||
		medianTotalInputTokens == null ||
		meanTotalInputTokens == null ||
		medianTotalOutputTokens == null ||
		meanTotalOutputTokens == null ||
		medianDurationSecondsPerTask == null ||
		meanDurationSecondsPerTask == null ||
		medianInputTokensPerTask == null ||
		meanInputTokensPerTask == null ||
		medianOutputTokensPerTask == null ||
		meanOutputTokensPerTask == null ||
		frequency == null
	) {
		return null;
	}
	return {
		model: source.model,
		split: source.split,
		median_score: medianScore,
		mean_score: meanScore,
		median_accuracy: medianAccuracy,
		mean_accuracy: meanAccuracy,
		median_total_duration_seconds: medianTotalDurationSeconds,
		mean_total_duration_seconds: meanTotalDurationSeconds,
		median_total_input_tokens: medianTotalInputTokens,
		mean_total_input_tokens: meanTotalInputTokens,
		median_total_output_tokens: medianTotalOutputTokens,
		mean_total_output_tokens: meanTotalOutputTokens,
		median_duration_seconds_per_task: medianDurationSecondsPerTask,
		mean_duration_seconds_per_task: meanDurationSecondsPerTask,
		median_input_tokens_per_task: medianInputTokensPerTask,
		mean_input_tokens_per_task: meanInputTokensPerTask,
		median_output_tokens_per_task: medianOutputTokensPerTask,
		mean_output_tokens_per_task: meanOutputTokensPerTask,
		median_cost_usd_per_task: medianCostUsdPerTask,
		mean_cost_usd_per_task: meanCostUsdPerTask,
		frequency,
	};
}

/** Normalize benchmark resource telemetry into the candidate's public per-task shape. */
export function buildTaskMetrics(
	intelligenceIndexCost: ModelAtlasIntelligenceIndexCost,
	scoringSources: ModelAtlasScoringSources,
): ModelAtlasTaskMetrics {
	const taskMetrics: NonNullable<ModelAtlasTaskMetrics> = {};
	for (const [key, source] of Object.entries(scoringSources ?? {})) {
		const sourceTaskMetrics = buildSourceMetrics(source);
		if (sourceTaskMetrics != null) {
			taskMetrics[key] = sourceTaskMetrics;
		}
	}
	const artificialAnalysis = buildArtificialAnalysisMetrics(
		intelligenceIndexCost,
	);
	if (artificialAnalysis != null) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	const deepSwe = buildDeepSWEMetrics(scoringSources);
	if (deepSwe != null) {
		taskMetrics.deep_swe = deepSwe;
	}
	const agentsLastExam = buildAgentsLastExamMetrics(scoringSources);
	if (agentsLastExam != null) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function firstFiniteNumber(
	record: Record<string, unknown>,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = asFiniteNumber(record[key]);
		if (value != null) {
			return value;
		}
	}
	return null;
}

function setNonNegativeMetric(
	taskMetrics: TaskMetricValues,
	key: TaskMetricKey,
	value: number | null,
): void {
	if (value != null && value >= 0) {
		taskMetrics[key] = value;
	}
}

/** Extract common per-task telemetry field shapes from any benchmark source row. */
function buildSourceMetrics(source: unknown): TaskMetricValues | null {
	const row = asRecord(source);
	const taskMetrics: TaskMetricValues = {};
	for (const [key, fields] of Object.entries(GENERIC_TASK_METRIC_FIELDS)) {
		setNonNegativeMetric(
			taskMetrics,
			key as TaskMetricKey,
			firstFiniteNumber(row, fields),
		);
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function buildArtificialAnalysisMetrics(
	intelligenceIndexCost: ModelAtlasIntelligenceIndexCost,
): TaskMetricValues | null {
	if (intelligenceIndexCost == null) {
		return null;
	}
	const costPerTask = asFiniteNumber(intelligenceIndexCost.cost_per_task);
	const outputTokensPerTask = asFiniteNumber(
		intelligenceIndexCost.output_tokens_per_task,
	);
	const secondsPerTask = asFiniteNumber(intelligenceIndexCost.seconds_per_task);
	const taskMetrics: TaskMetricValues = {};

	if (costPerTask != null && costPerTask >= 0) {
		taskMetrics.cost = costPerTask;
	}
	if (outputTokensPerTask != null && outputTokensPerTask >= 0) {
		taskMetrics.output_tokens = outputTokensPerTask;
	}
	if (secondsPerTask != null && secondsPerTask >= 0) {
		taskMetrics.seconds = secondsPerTask;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function buildDeepSWEMetrics(
	scoringSources: ModelAtlasScoringSources,
): TaskMetricValues | null {
	const deepSwe = scoringSources?.deep_swe;
	if (deepSwe == null) {
		return null;
	}
	const taskMetrics: TaskMetricValues = {
		cost: deepSwe.mean_cost_usd,
		output_tokens: deepSwe.mean_output_tokens,
	};
	setNonNegativeMetric(taskMetrics, "seconds", deepSwe.mean_duration_seconds);
	return taskMetrics;
}

/** Expose Agents' Last Exam resource telemetry using the lower of median and mean. */
function buildAgentsLastExamMetrics(
	scoringSources: ModelAtlasScoringSources,
): TaskMetricValues | null {
	const agentsLastExam = scoringSources?.agents_last_exam;
	if (agentsLastExam == null) {
		return null;
	}
	const inputTokens = Math.min(
		agentsLastExam.median_input_tokens_per_task,
		agentsLastExam.mean_input_tokens_per_task,
	);
	const outputTokens = Math.min(
		agentsLastExam.median_output_tokens_per_task,
		agentsLastExam.mean_output_tokens_per_task,
	);
	const taskMetrics: TaskMetricValues = {
		seconds: Math.min(
			agentsLastExam.median_duration_seconds_per_task,
			agentsLastExam.mean_duration_seconds_per_task,
		),
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	};
	const costPerTask = Math.min(
		agentsLastExam.median_cost_usd_per_task ?? Number.POSITIVE_INFINITY,
		agentsLastExam.mean_cost_usd_per_task ?? Number.POSITIVE_INFINITY,
	);
	if (Number.isFinite(costPerTask)) {
		taskMetrics.cost = costPerTask;
	}
	return taskMetrics;
}

export function buildModelCandidate(
	row: unknown,
	speedByModelId: Map<string, JsonObject>,
	pricingByModelId: Map<string, JsonObject>,
	outputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	imputationByModel: BenchmarkImputationByModel,
	imputationConfidenceByModel: BenchmarkImputationConfidenceByModel,
	qualityContext: QualityScoringContext,
): ModelAtlasModelCandidate {
	const model = asRecord(row);
	const provider = providerFromModel(model);
	const modelId = typeof model.id === "string" ? model.id : null;
	const speed = buildSpeed(model, modelId, speedByModelId);
	const pricing =
		lookupOpenRouterData(pricingByModelId, modelId, hasPricingData) ??
		EMPTY_OPENROUTER_PRICING;
	const cost = buildCost(model, pricing, scoringConfig);
	const intelligenceIndexCost = buildIntelligenceIndexCost(model);
	const scoringSources = buildScoringSources(model);
	const intelligence = { ...asRecord(model.intelligence) };
	delete intelligence[INTELLIGENCE_COST_TOTAL_COST_KEY];
	delete intelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY];
	const { componentScores, confidence } = buildComponentScoreResult(
		model,
		speed,
		outputTokenAnchors,
		scoringConfig,
		qualityContext,
		imputationByModel.get(model),
		imputationConfidenceByModel.get(model),
	);
	return {
		id: modelId,
		name: typeof model.name === "string" ? model.name : null,
		provider,
		logo: resolveModelLogo({
			provider,
			explicitLogo: typeof model.logo === "string" ? model.logo : null,
		}),
		reasoning: typeof model.reasoning === "boolean" ? model.reasoning : null,
		reasoning_effort: canonicalReasoningEffort(model.reasoning_effort),
		release_date:
			typeof model.release_date === "string" ? model.release_date : null,
		modalities: buildModalities(model),
		open_weights:
			typeof model.open_weights === "boolean" ? model.open_weights : null,
		cost,
		context_window: buildContextWindow(model),
		speed,
		intelligence: buildNumericMap(intelligence),
		intelligence_index_cost: intelligenceIndexCost,
		task_metrics: buildTaskMetrics(intelligenceIndexCost, scoringSources),
		benchmarks: buildNumericMap(model.benchmarks),
		confidence,
		scoring_sources: scoringSources,
		component_scores: componentScores,
		scores: null,
	};
}
