/** Public model candidate builder for Model Atlas. */

import { resolveStatsLogo } from "../../../logo";
import {
	asFiniteNumber,
	asRecord,
	type JsonObject,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../../shared";
import {
	type BenchmarkImputationByModel,
	blendedPriceValue,
	buildScores,
	type QualityScoringContext,
} from "../scores";
import type {
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsCostBreakdown,
	LlmStatsCostTier,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsIntelligenceIndexCost,
	LlmStatsModalities,
	LlmStatsModelCandidate,
	LlmStatsScoringSources,
	LlmStatsSpeed,
	ScoringConfig,
} from "../types";
import { buildTaskMetrics } from "./task-metrics";

const EMPTY_OPENROUTER_PRICING = {
	weighted_input: null,
	weighted_output: null,
} as const;
const MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD = 1_000_000;
const INTELLIGENCE_COST_TOTAL_COST_KEY = "intelligence_index_cost_total_cost";
const INTELLIGENCE_COST_TOTAL_TOKENS_KEY =
	"intelligence_index_cost_total_tokens";

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

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

function buildNumericMap<T extends Record<string, number | null | undefined>>(
	value: unknown,
): T | null {
	const numericFields: Record<string, number> = {};
	for (const [key, fieldValue] of Object.entries(asRecord(value))) {
		assignFiniteNumber(numericFields, key, fieldValue);
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

function buildLogo(model: JsonObject, provider: string | null): string {
	return resolveStatsLogo({
		provider,
		explicitLogo: typeof model.logo === "string" ? model.logo : null,
	});
}

/** Projects input and output modalities when source data provides them. */
function buildModalities(model: JsonObject): LlmStatsModalities | null {
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
	const normalized: LlmStatsModalities = {};
	if (input && input.length > 0) {
		normalized.input = input;
	}
	if (output && output.length > 0) {
		normalized.output = output;
	}
	return Object.keys(normalized).length > 0 ? normalized : null;
}

function buildContextWindow(model: JsonObject): LlmStatsContextWindow {
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
	openRouterSpeedById: Map<string, JsonObject>,
): LlmStatsSpeed {
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

function buildCostBreakdown(value: unknown): LlmStatsCostBreakdown | null {
	const source = asRecord(value);
	const cost: LlmStatsCostBreakdown = {};
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
function buildCostTier(value: unknown): LlmStatsCostTier | null {
	const source = asRecord(value);
	const costTier: LlmStatsCostTier = {
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
): LlmStatsCost {
	const baseCost = asRecord(model.cost);
	const cost: Exclude<LlmStatsCost, null> = {
		...(buildCostBreakdown(baseCost) ?? {}),
	};
	const contextOver200k = buildCostBreakdown(baseCost.context_over_200k);
	if (contextOver200k != null) {
		cost.context_over_200k = contextOver200k;
	}
	if (Array.isArray(baseCost.tiers)) {
		const tiers = baseCost.tiers
			.map((tier) => buildCostTier(tier))
			.filter((tier): tier is LlmStatsCostTier => tier != null);
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

function buildEvaluations(model: JsonObject): LlmStatsEvaluations | null {
	return buildNumericMap<LlmStatsEvaluations>(model.evaluations);
}

function buildIntelligence(model: JsonObject): LlmStatsIntelligence | null {
	const intelligence = { ...asRecord(model.intelligence) };
	delete intelligence[INTELLIGENCE_COST_TOTAL_COST_KEY];
	delete intelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY];
	return buildNumericMap<LlmStatsIntelligence>(intelligence);
}

function buildIntelligenceIndexCost(
	model: JsonObject,
): LlmStatsIntelligenceIndexCost {
	const fromRow = asRecord(model.intelligence_index_cost);
	const fromIntelligence = asRecord(model.intelligence);
	const totalCost =
		asFiniteNumber(fromRow.total_cost) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_COST_KEY]);
	const totalTokens =
		asFiniteNumber(fromRow.total_tokens) ??
		asFiniteNumber(fromIntelligence[INTELLIGENCE_COST_TOTAL_TOKENS_KEY]);
	const cost: Exclude<LlmStatsIntelligenceIndexCost, null> = {};
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
		totalTokens >= MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD
	) {
		cost.total_tokens = totalTokens;
	}
	return hasFields(cost) ? cost : null;
}

function buildScoringSources(model: JsonObject): LlmStatsScoringSources {
	const deepSWE = buildDeepSWEScoringSource(model);
	const agentsLastExam = buildAgentsLastExamScoringSource(model);
	const automationBench = buildAutomationBenchScoringSource(model);
	const scoringSources = {
		...(deepSWE == null ? {} : { deep_swe: deepSWE }),
		...(agentsLastExam == null ? {} : { agents_last_exam: agentsLastExam }),
		...(automationBench == null ? {} : { automation_bench: automationBench }),
	};
	return hasFields(scoringSources) ? scoringSources : null;
}

function buildAutomationBenchScoringSource(model: JsonObject) {
	const source = asRecord(asRecord(model.scoring_sources).automation_bench);
	const costPerTaskUsd = asFiniteNumber(source.cost_per_task_usd);
	const adjustedScore = asFiniteNumber(source.adjusted_score);
	const score = asFiniteNumber(source.score);
	if (costPerTaskUsd == null || adjustedScore == null || score == null) {
		return null;
	}
	return {
		model: typeof source.model === "string" ? source.model : "",
		reasoning_effort:
			typeof source.reasoning_effort === "string"
				? source.reasoning_effort
				: null,
		score,
		cost_per_task_usd: costPerTaskUsd,
		domain_lead_scores: Array.isArray(source.domain_lead_scores)
			? source.domain_lead_scores
					.map(asFiniteNumber)
					.filter((value) => value != null)
			: [],
		domain_lead_score_median:
			asFiniteNumber(source.domain_lead_score_median) ?? null,
		adjusted_score: adjustedScore,
	};
}

function buildDeepSWEScoringSource(model: JsonObject) {
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
		n_tasks_attempted: tasksAttempted,
		mean_cost_usd: meanCostUsd,
		mean_duration_seconds: meanDurationSeconds,
		mean_output_tokens: meanOutputTokens,
	};
}

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
	const medianDurationSecondsPerRun = asFiniteNumber(
		source.median_duration_seconds_per_run,
	);
	const meanDurationSecondsPerRun = asFiniteNumber(
		source.mean_duration_seconds_per_run,
	);
	const medianInputTokensPerRun = asFiniteNumber(
		source.median_input_tokens_per_run,
	);
	const meanInputTokensPerRun = asFiniteNumber(
		source.mean_input_tokens_per_run,
	);
	const medianOutputTokensPerRun = asFiniteNumber(
		source.median_output_tokens_per_run,
	);
	const meanOutputTokensPerRun = asFiniteNumber(
		source.mean_output_tokens_per_run,
	);
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
		medianDurationSecondsPerRun == null ||
		meanDurationSecondsPerRun == null ||
		medianInputTokensPerRun == null ||
		meanInputTokensPerRun == null ||
		medianOutputTokensPerRun == null ||
		meanOutputTokensPerRun == null ||
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
		median_duration_seconds_per_run: medianDurationSecondsPerRun,
		mean_duration_seconds_per_run: meanDurationSecondsPerRun,
		median_input_tokens_per_run: medianInputTokensPerRun,
		mean_input_tokens_per_run: meanInputTokensPerRun,
		median_output_tokens_per_run: medianOutputTokensPerRun,
		mean_output_tokens_per_run: meanOutputTokensPerRun,
		frequency,
	};
}

export function buildModelCandidate(
	row: unknown,
	openRouterSpeedById: Map<string, JsonObject>,
	openRouterPricingById: Map<string, JsonObject>,
	speedOutputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	benchmarkImputationByModel: BenchmarkImputationByModel,
	qualityContext: QualityScoringContext,
): LlmStatsModelCandidate {
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
		task_metrics: buildTaskMetrics(intelligenceIndexCost, cost, scoringSources),
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
