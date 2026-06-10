/** Final-stage helpers for Model Atlas selection. */

import { resolveStatsLogo } from "../../logo";
import { cacheStatsLogos } from "../../logo-cache";
import {
	asFiniteNumber,
	asRecord,
	type JsonObject,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../shared";

import {
	hasPublicFreeRouteLabel,
	isOpenRouterFreeRouteId,
	publicModelDisplayName,
	publicOpenRouterModelId,
} from "./model-aliases";
import {
	attachRelativeScores,
	type BenchmarkImputationByModel,
	blendedPriceValue,
	buildBenchmarkImputationByModel,
	buildQualityScoringContext,
	buildScores,
	type QualityScoringContext,
} from "./scores";
import type {
	EnrichedRows,
	FinalStageConfig,
	ModelStatsNullableScores,
	ModelStatsProjectedModel,
	ModelStatsScoredModel,
	ModelStatsScoringSources,
	ModelStatsSelectedContextWindow,
	ModelStatsSelectedCost,
	ModelStatsSelectedCostBreakdown,
	ModelStatsSelectedCostTier,
	ModelStatsSelectedEvaluations,
	ModelStatsSelectedIntelligence,
	ModelStatsSelectedIntelligenceIndexCost,
	ModelStatsSelectedModalities,
	ModelStatsSelectedModel,
	ModelStatsSelectedSpeed,
	ModelStatsSelectedTaskMetrics,
	ModelStatsSelectedTaskMetricValues,
	ScoringConfig,
} from "./types";

/** Final projection stage for Model Atlas: build the public model shape, attach normalized ranking data, then sort/prune/filter. */
const EMPTY_OPENROUTER_PRICING = {
	weighted_input: null,
	weighted_output: null,
} as const;
const MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD = 1_000_000;
const ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS = 12_826;
const MIN_REQUIRED_RELATIVE_SCORE = 10;
const INTELLIGENCE_COST_TOTAL_COST_KEY = "intelligence_index_cost_total_cost";
const INTELLIGENCE_COST_TOTAL_TOKENS_KEY =
	"intelligence_index_cost_total_tokens";
const STABLE_TOP_LEVEL_KEYS = new Set<string>([
	"id",
	"name",
	"provider",
	"logo",
	"attachment",
	"reasoning",
	"release_date",
	"modalities",
	"open_weights",
	"cost",
	"context_window",
	"speed",
	"intelligence",
	"intelligence_index_cost",
	"task_metrics",
	"evaluations",
	"scores",
	"relative_scores",
]);
const REQUIRED_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;
const REQUIRED_RELATIVE_SCORE_KEYS = [
	"overall_score",
	"intelligence_score",
	"agentic_score",
] as const;
type TaskMetricValues = ModelStatsSelectedTaskMetricValues;

/** Return whether an object has at least one own field. */
function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

/** Assign a finite numeric field when the source value is usable. */
function assignFiniteNumber(
	target: Record<string, number>,
	key: string,
	value: unknown,
): void {
	const numericValue = asFiniteNumber(value);
	if (numericValue != null) {
		target[key] = numericValue;
	}
}

/** Build a numeric map from a dynamic upstream object. */
function buildNumericMap<T extends Record<string, number | null | undefined>>(
	value: unknown,
): T | null {
	const numericFields: Record<string, number> = {};
	for (const [key, fieldValue] of Object.entries(asRecord(value))) {
		assignFiniteNumber(numericFields, key, fieldValue);
	}
	return hasFields(numericFields) ? (numericFields as T) : null;
}

/** Return a stable sort key for model tie-breakers. */
function modelSortKey(model: ModelStatsSelectedModel): string {
	return model.id ?? "";
}

/** Return whether the original public row came from an OpenRouter free route. */
function isFreeRouteModel(model: ModelStatsSelectedModel): boolean {
	return (
		isOpenRouterFreeRouteId(model.id) || hasPublicFreeRouteLabel(model.name)
	);
}

/** Resolve the provider for Final-stage Model Atlas selection. */
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

/** Resolve the provider for Final-stage Model Atlas selection. */
function providerFromModel(model: JsonObject): string | null {
	const fromId = providerFromId(model.id);
	if (fromId) {
		return fromId;
	}
	return typeof model.provider_id === "string" ? model.provider_id : null;
}

/** Build the logo field for Final-stage Model Atlas selection. */
function buildLogo(model: JsonObject, provider: string | null): string {
	return resolveStatsLogo({
		provider,
		explicitLogo: typeof model.logo === "string" ? model.logo : null,
	});
}

/** Build the modalities field for Final-stage Model Atlas selection. */
function buildModalities(
	model: JsonObject,
): ModelStatsSelectedModalities | null {
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
	const normalized: ModelStatsSelectedModalities = {};
	if (input && input.length > 0) {
		normalized.input = input;
	}
	if (output && output.length > 0) {
		normalized.output = output;
	}
	return Object.keys(normalized).length > 0 ? normalized : null;
}

/** Build the context window field for Final-stage Model Atlas selection. */
function buildContextWindow(
	model: JsonObject,
): ModelStatsSelectedContextWindow {
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

/** Build the speed field for Final-stage Model Atlas selection. */
function buildSpeed(
	model: JsonObject,
	modelId: string | null,
	openRouterSpeedById: Map<string, JsonObject>,
): ModelStatsSelectedSpeed {
	const openRouterSpeed = lookupOpenRouterData(
		openRouterSpeedById,
		modelId,
		speedHasData,
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

function speedHasData(speed: JsonObject): boolean {
	return (
		asFiniteNumber(speed.throughput_tokens_per_second_median) != null ||
		asFiniteNumber(speed.latency_seconds_median) != null ||
		asFiniteNumber(speed.e2e_latency_seconds_median) != null
	);
}

function pricingHasData(pricing: JsonObject): boolean {
	return (
		(asFiniteNumber(pricing.weighted_input) ?? 0) > 0 ||
		(asFiniteNumber(pricing.weighted_output) ?? 0) > 0
	);
}

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

/** Build one cost breakdown from a dynamic upstream object. */
function buildCostBreakdown(
	value: unknown,
): ModelStatsSelectedCostBreakdown | null {
	const source = asRecord(value);
	const cost: ModelStatsSelectedCostBreakdown = {};
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

/** Build one tiered cost row from a dynamic upstream object. */
function buildCostTier(value: unknown): ModelStatsSelectedCostTier | null {
	const source = asRecord(value);
	const costTier: ModelStatsSelectedCostTier = {
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

/** Build the cost field for Final-stage Model Atlas selection. */
function buildCost(
	model: JsonObject,
	openRouterPricing: JsonObject,
	scoringConfig: ScoringConfig,
): ModelStatsSelectedCost {
	const baseCost = asRecord(model.cost);
	const cost: Exclude<ModelStatsSelectedCost, null> = {
		...(buildCostBreakdown(baseCost) ?? {}),
	};
	const contextOver200k = buildCostBreakdown(baseCost.context_over_200k);
	if (contextOver200k != null) {
		cost.context_over_200k = contextOver200k;
	}
	if (Array.isArray(baseCost.tiers)) {
		const tiers = baseCost.tiers
			.map((tier) => buildCostTier(tier))
			.filter((tier): tier is ModelStatsSelectedCostTier => tier != null);
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

/** Build evaluation fields for Final-stage Model Atlas selection. */
function buildEvaluations(
	model: JsonObject,
): ModelStatsSelectedEvaluations | null {
	return buildNumericMap<ModelStatsSelectedEvaluations>(model.evaluations);
}

/** Build the intelligence field for Final-stage Model Atlas selection. */
function buildIntelligence(
	model: JsonObject,
): ModelStatsSelectedIntelligence | null {
	const intelligence = { ...asRecord(model.intelligence) };
	const nonhallucinationRate = asFiniteNumber(
		intelligence.omniscience_hallucination_rate,
	);
	if (nonhallucinationRate != null) {
		intelligence.omniscience_nonhallucination_rate = nonhallucinationRate;
		delete intelligence.omniscience_hallucination_rate;
	}
	delete intelligence[INTELLIGENCE_COST_TOTAL_COST_KEY];
	delete intelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY];
	return buildNumericMap<ModelStatsSelectedIntelligence>(intelligence);
}

/** Build the intelligence index cost for Final-stage Model Atlas selection. */
function buildIntelligenceIndexCost(
	model: JsonObject,
): ModelStatsSelectedIntelligenceIndexCost {
	const fromRow = asRecord(model.intelligence_index_cost);
	const fromIntelligence = asRecord(model.intelligence);
	const totalCost =
		asFiniteNumber(fromRow.total_cost) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_COST_KEY]);
	const totalTokens =
		asFiniteNumber(fromRow.total_tokens) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY]);
	const cost: Exclude<ModelStatsSelectedIntelligenceIndexCost, null> = {};
	for (const key of [
		"input_cost",
		"reasoning_cost",
		"output_cost",
		"input_tokens",
		"reasoning_tokens",
		"answer_tokens",
		"output_tokens",
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
		totalTokens >= MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD
	) {
		cost.total_tokens = totalTokens;
	}
	return hasFields(cost) ? cost : null;
}

/** Build internal-only scoring source telemetry that is pruned before the public payload is returned. */
function buildScoringSources(model: JsonObject): ModelStatsScoringSources {
	const deepSWE = buildDeepSWEScoringSource(model);
	const agentsLastExam = buildAgentsLastExamScoringSource(model);
	const scoringSources = {
		...(deepSWE == null ? {} : { deep_swe: deepSWE }),
		...(agentsLastExam == null ? {} : { agents_last_exam: agentsLastExam }),
	};
	return hasFields(scoringSources) ? scoringSources : null;
}

/** Build DeepSWE source telemetry when a model matched the standalone leaderboard. */
function buildDeepSWEScoringSource(model: JsonObject) {
	const source = asRecord(asRecord(model.scoring_sources).deep_swe);
	const passAt1 = asFiniteNumber(source.pass_at_1);
	const meanCostUsd = asFiniteNumber(source.mean_cost_usd);
	const meanDurationSeconds = asFiniteNumber(source.mean_duration_seconds);
	const meanOutputTokens = asFiniteNumber(source.mean_output_tokens);
	if (
		typeof source.model !== "string" ||
		passAt1 == null ||
		meanCostUsd == null ||
		meanDurationSeconds == null ||
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
		mean_cost_usd: meanCostUsd,
		mean_duration_seconds: meanDurationSeconds,
		mean_output_tokens: meanOutputTokens,
	};
}

/** Build Agents' Last Exam source telemetry when a model matched the standalone leaderboard. */
function buildAgentsLastExamScoringSource(model: JsonObject) {
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
		frequency,
	};
}

/** Build normalized per-task metrics for AA Intelligence, DeepSWE, and ALE runs. */
function buildTaskMetrics(
	intelligenceIndexCost: ModelStatsSelectedIntelligenceIndexCost,
	speed: ModelStatsSelectedSpeed,
	cost: ModelStatsSelectedCost,
	scoringSources: ModelStatsScoringSources,
): ModelStatsSelectedTaskMetrics {
	const taskMetrics: NonNullable<ModelStatsSelectedTaskMetrics> = {};
	const artificialAnalysis = buildArtificialAnalysisTaskMetrics(
		intelligenceIndexCost,
		speed,
	);
	if (artificialAnalysis != null) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	const deepSWE = buildDeepSWETaskMetrics(scoringSources);
	if (deepSWE != null) {
		taskMetrics.deep_swe = deepSWE;
	}
	const agentsLastExam = buildAgentsLastExamTaskMetrics(scoringSources, cost);
	if (agentsLastExam != null) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

/** Normalize AA Intelligence run telemetry to one repeated evaluation attempt. */
function buildArtificialAnalysisTaskMetrics(
	intelligenceIndexCost: ModelStatsSelectedIntelligenceIndexCost,
	speed: ModelStatsSelectedSpeed,
): TaskMetricValues | null {
	if (intelligenceIndexCost == null) {
		return null;
	}
	const cost = asFiniteNumber(intelligenceIndexCost.total_cost);
	const outputTokens = artificialAnalysisOutputTokens(intelligenceIndexCost);
	const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
	const throughputTokensPerSecond = asFiniteNumber(
		speed.throughput_tokens_per_second_median,
	);
	const taskMetrics: TaskMetricValues = {};

	if (cost != null && cost >= 0) {
		taskMetrics.cost =
			cost / ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS;
	}
	if (outputTokens != null && outputTokens >= 0) {
		const outputTokensPerTask =
			outputTokens / ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS;
		taskMetrics.output_tokens = outputTokensPerTask;
		if (
			latencySeconds != null &&
			latencySeconds >= 0 &&
			throughputTokensPerSecond != null &&
			throughputTokensPerSecond > 0
		) {
			taskMetrics.seconds =
				latencySeconds + outputTokensPerTask / throughputTokensPerSecond;
		}
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function artificialAnalysisOutputTokens(
	intelligenceIndexCost: NonNullable<ModelStatsSelectedIntelligenceIndexCost>,
): number | null {
	const outputTokens = asFiniteNumber(intelligenceIndexCost.output_tokens);
	if (outputTokens != null) {
		return outputTokens;
	}
	const answerTokens = asFiniteNumber(intelligenceIndexCost.answer_tokens) ?? 0;
	const reasoningTokens =
		asFiniteNumber(intelligenceIndexCost.reasoning_tokens) ?? 0;
	const totalOutputTokens = answerTokens + reasoningTokens;
	return totalOutputTokens > 0 ? totalOutputTokens : null;
}

/** Expose DeepSWE's own per-task attempt telemetry beside the AA normalized values. */
function buildDeepSWETaskMetrics(
	scoringSources: ModelStatsScoringSources,
): TaskMetricValues | null {
	const deepSWE = scoringSources?.deep_swe;
	if (deepSWE == null) {
		return null;
	}
	return {
		cost: deepSWE.mean_cost_usd,
		seconds: deepSWE.mean_duration_seconds,
		output_tokens: deepSWE.mean_output_tokens,
	};
}

/** Expose Agents' Last Exam resource telemetry using the lower of median and mean. */
function buildAgentsLastExamTaskMetrics(
	scoringSources: ModelStatsScoringSources,
	cost: ModelStatsSelectedCost,
): TaskMetricValues | null {
	const agentsLastExam = scoringSources?.agents_last_exam;
	if (agentsLastExam == null) {
		return null;
	}
	const inputTokens = Math.min(
		agentsLastExam.median_total_input_tokens,
		agentsLastExam.mean_total_input_tokens,
	);
	const outputTokens = Math.min(
		agentsLastExam.median_total_output_tokens,
		agentsLastExam.mean_total_output_tokens,
	);
	const taskMetrics: TaskMetricValues = {
		seconds: Math.min(
			agentsLastExam.median_total_duration_seconds,
			agentsLastExam.mean_total_duration_seconds,
		),
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	};
	const taskCost = tokenUsageTaskCost(cost, inputTokens, outputTokens);
	if (taskCost != null) {
		taskMetrics.cost = taskCost;
	}
	return taskMetrics;
}

/** Estimate task cost from per-million input/output token prices and observed tokens. */
function tokenUsageTaskCost(
	cost: ModelStatsSelectedCost,
	inputTokens: number,
	outputTokens: number,
): number | null {
	const inputCost =
		asFiniteNumber(cost?.weighted_input) ?? asFiniteNumber(cost?.input);
	const outputCost =
		asFiniteNumber(cost?.weighted_output) ?? asFiniteNumber(cost?.output);
	return inputCost != null &&
		inputCost > 0 &&
		outputCost != null &&
		outputCost > 0
		? (inputTokens * inputCost + outputTokens * outputCost) / 1_000_000
		: null;
}

/** Sort the models by intelligence relative score. */
function sortModelsByIntelligenceRelativeScore(
	models: ModelStatsSelectedModel[],
): ModelStatsSelectedModel[] {
	return [...models].sort((left, right) => {
		const leftIntelligence = left.relative_scores.intelligence_score;
		const rightIntelligence = right.relative_scores.intelligence_score;
		if (leftIntelligence !== rightIntelligence) {
			return rightIntelligence - leftIntelligence;
		}
		return modelSortKey(left).localeCompare(modelSortKey(right));
	});
}

/** Return whether the model has the minimum score signal needed for the public list. */
function hasMinimumScoreSignal(
	model: ModelStatsScoredModel,
): model is ModelStatsSelectedModel {
	const scores: ModelStatsNullableScores | null = model.scores;
	if (scores == null) {
		return false;
	}
	const hasRequiredRawScores = REQUIRED_SCORE_KEYS.every((key) => {
		const value = scores[key];
		return value != null;
	});
	if (!hasRequiredRawScores) {
		return false;
	}
	const relativeScores = model.relative_scores;
	return REQUIRED_RELATIVE_SCORE_KEYS.every((key) => {
		const value = asFiniteNumber(relativeScores[key]);
		return value != null && value >= MIN_REQUIRED_RELATIVE_SCORE;
	});
}

/** Filter out low-signal models from the public list. */
function filterLowSignalModels(
	models: ModelStatsScoredModel[],
): ModelStatsSelectedModel[] {
	return models.filter(hasMinimumScoreSignal);
}

/** Return whether a value is a non-array object. */
function isPlainObject(value: unknown): value is JsonObject {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Return whether a release date falls inside the recent pruning window. */
function isWithinRecentLookback(
	releaseDate: string | null,
	lookbackDays: number,
): boolean {
	if (typeof releaseDate !== "string" || releaseDate.length === 0) {
		return false;
	}
	const releaseTimestampMs = Date.parse(releaseDate);
	if (!Number.isFinite(releaseTimestampMs)) {
		return false;
	}
	const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
	return releaseTimestampMs >= cutoffMs;
}

/** Select the prune sample models. */
function selectPruneSampleModels(
	models: ModelStatsSelectedModel[],
	finalConfig: FinalStageConfig,
): ModelStatsSelectedModel[] {
	const recentModels = models.filter((model) =>
		isWithinRecentLookback(
			model.release_date,
			finalConfig.nullFieldPruneRecentLookbackDays,
		),
	);
	return recentModels.length > 0 ? recentModels : models;
}

/** Count models where a top-level field is nullish. */
function countNullishTopLevelKey(
	models: ModelStatsSelectedModel[],
	key: string,
): number {
	return models.reduce((count, model) => {
		const modelRecord = asRecord(model);
		return modelRecord[key] == null ? count + 1 : count;
	}, 0);
}

/** Count models where a nested field is nullish or absent. */
function countNullishNestedKey(
	models: ModelStatsSelectedModel[],
	parentKey: string,
	nestedKey: string,
): number {
	return models.reduce((count, model) => {
		const modelRecord = asRecord(model);
		const parentValue = modelRecord[parentKey];
		if (!isPlainObject(parentValue) || parentValue[nestedKey] == null) {
			return count + 1;
		}
		return count;
	}, 0);
}

/** Prune the sparse fields. */
function pruneSparseFields(
	models: ModelStatsSelectedModel[],
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): ModelStatsSelectedModel[] {
	if (models.length === 0) {
		return models;
	}

	const selectedBenchmarkKeys = new Set([
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]);
	const sampleModels = selectPruneSampleModels(models, finalConfig);
	const sampleTotal = sampleModels.length;
	const topLevelKeys = new Set<string>();
	const nestedKeysByParent = new Map<string, Set<string>>();

	for (const model of models) {
		for (const [key, value] of Object.entries(model)) {
			topLevelKeys.add(key);
			if (!isPlainObject(value)) {
				continue;
			}
			const nestedKeys = nestedKeysByParent.get(key) ?? new Set<string>();
			for (const nestedKey of Object.keys(value)) {
				nestedKeys.add(nestedKey);
			}
			nestedKeysByParent.set(key, nestedKeys);
		}
	}

	const topLevelKeysToPrune = new Set<string>();
	for (const key of topLevelKeys) {
		if (STABLE_TOP_LEVEL_KEYS.has(key)) {
			continue;
		}
		const nullCount = countNullishTopLevelKey(sampleModels, key);
		if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
			topLevelKeysToPrune.add(key);
		}
	}

	const nestedKeysToPruneByParent = new Map<string, Set<string>>();
	for (const [parentKey, nestedKeys] of nestedKeysByParent) {
		if (parentKey !== "evaluations") {
			continue;
		}
		const keysToPrune = new Set<string>();
		for (const nestedKey of nestedKeys) {
			if (selectedBenchmarkKeys.has(nestedKey)) {
				continue;
			}
			const nullCount = countNullishNestedKey(
				sampleModels,
				parentKey,
				nestedKey,
			);
			if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
				keysToPrune.add(nestedKey);
			}
		}
		if (keysToPrune.size > 0) {
			nestedKeysToPruneByParent.set(parentKey, keysToPrune);
		}
	}

	return models.map((model) => {
		const nextModel: JsonObject = { ...model };
		for (const key of topLevelKeysToPrune) {
			delete nextModel[key];
		}
		for (const [parentKey, nestedKeysToPrune] of nestedKeysToPruneByParent) {
			const parentValue = nextModel[parentKey];
			if (!isPlainObject(parentValue)) {
				continue;
			}
			const nextParentValue: JsonObject = { ...parentValue };
			for (const nestedKey of nestedKeysToPrune) {
				delete nextParentValue[nestedKey];
			}
			nextModel[parentKey] = nextParentValue;
		}
		return nextModel as ModelStatsSelectedModel;
	});
}

/** Filter the models by id. */
function filterModelsById(
	models: ModelStatsSelectedModel[],
	id: string | null | undefined,
): ModelStatsSelectedModel[] {
	const normalizedId = publicOpenRouterModelId(id ?? null);
	return normalizedId == null
		? models
		: models.filter(
				(model) => publicOpenRouterModelId(model.id) === normalizedId,
			);
}

/** Normalize free-route public identifiers and collapse paid/free duplicate rows. */
function normalizePublicFreeRoutes(
	models: ModelStatsSelectedModel[],
): ModelStatsSelectedModel[] {
	const modelByPublicId = new Map<
		string,
		{ model: ModelStatsSelectedModel; isFreeRoute: boolean }
	>();
	const passthrough: ModelStatsSelectedModel[] = [];

	for (const model of models) {
		const publicId = publicOpenRouterModelId(model.id);
		const publicName = publicModelDisplayName(model.name);
		const normalizedModel: ModelStatsSelectedModel = {
			...model,
			id: publicId,
			name: publicName,
		};
		if (!publicId) {
			passthrough.push(normalizedModel);
			continue;
		}
		const candidateIsFreeRoute = isFreeRouteModel(model);
		const existing = modelByPublicId.get(publicId);
		if (!existing || (existing.isFreeRoute && !candidateIsFreeRoute)) {
			modelByPublicId.set(publicId, {
				model: normalizedModel,
				isFreeRoute: candidateIsFreeRoute,
			});
		}
	}

	return sortModelsByIntelligenceRelativeScore([
		...passthrough,
		...[...modelByPublicId.values()].map(({ model }) => model),
	]);
}

/** Build the final public model row from one enriched intermediate row. */
function projectFinalModel(
	row: unknown,
	openRouterSpeedById: Map<string, JsonObject>,
	openRouterPricingById: Map<string, JsonObject>,
	speedOutputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	benchmarkImputationByModel: BenchmarkImputationByModel,
	qualityContext: QualityScoringContext,
): ModelStatsProjectedModel {
	const model = asRecord(row);
	const provider = providerFromModel(model);
	const modelId = typeof model.id === "string" ? model.id : null;
	const speed = buildSpeed(model, modelId, openRouterSpeedById);
	const pricing =
		lookupOpenRouterData(openRouterPricingById, modelId, pricingHasData) ??
		EMPTY_OPENROUTER_PRICING;
	const cost = buildCost(model, pricing, scoringConfig);
	const intelligenceIndexCost = buildIntelligenceIndexCost(model);
	const scoringSources = buildScoringSources(model);
	return {
		id: modelId,
		name: typeof model.name === "string" ? model.name : null,
		provider,
		logo: buildLogo(model, provider),
		attachment: typeof model.attachment === "boolean" ? model.attachment : null,
		reasoning: typeof model.reasoning === "boolean" ? model.reasoning : null,
		release_date:
			typeof model.release_date === "string" ? model.release_date : null,
		modalities: buildModalities(model),
		open_weights:
			typeof model.open_weights === "boolean" ? model.open_weights : null,
		cost,
		context_window: buildContextWindow(model),
		speed,
		intelligence: buildIntelligence(model),
		intelligence_index_cost: intelligenceIndexCost,
		task_metrics: buildTaskMetrics(
			intelligenceIndexCost,
			speed,
			cost,
			scoringSources,
		),
		evaluations: buildEvaluations(model),
		scoring_sources: scoringSources,
		scores: buildScores(
			model,
			cost,
			speed,
			speedOutputTokenAnchors,
			scoringConfig,
			qualityContext,
			benchmarkImputationByModel.get(model),
		),
		relative_scores: null,
	};
}

/** Build all projected models and attach nullable normalized ranking data. */
export function buildScoredModels(
	enrichedRows: EnrichedRows,
	scoringConfig: ScoringConfig,
): ModelStatsScoredModel[] {
	const benchmarkImputationByModel = buildBenchmarkImputationByModel(
		enrichedRows.rows,
		scoringConfig,
	);
	const qualityContext = buildQualityScoringContext(
		enrichedRows.rows,
		scoringConfig,
		benchmarkImputationByModel,
	);
	const models = enrichedRows.rows.map((row) =>
		projectFinalModel(
			row,
			enrichedRows.openRouterSpeedById,
			enrichedRows.openRouterPricingById,
			enrichedRows.speedOutputTokenAnchors,
			scoringConfig,
			benchmarkImputationByModel,
			qualityContext,
		),
	);
	const modelsWithRelativeScores = attachRelativeScores(models, scoringConfig);
	return modelsWithRelativeScores;
}

/** Build the final selected models list and attach the normalized ranking layer used for ordering. */
export async function buildFinalModels(
	enrichedRows: EnrichedRows,
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): Promise<ModelStatsSelectedModel[]> {
	const modelsWithRelativeScores = buildScoredModels(
		enrichedRows,
		scoringConfig,
	);
	const scoreFilteredModels = filterLowSignalModels(modelsWithRelativeScores);
	const sortedModels =
		sortModelsByIntelligenceRelativeScore(scoreFilteredModels);
	const prunedModels = pruneSparseFields(
		sortedModels,
		finalConfig,
		scoringConfig,
	);
	const normalizedModels = normalizePublicFreeRoutes(prunedModels);
	return cacheStatsLogos(
		filterModelsById(normalizedModels, id),
		(model) => model.provider ?? model.id,
	);
}
