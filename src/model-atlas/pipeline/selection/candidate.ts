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
const INTELLIGENCE_COST_TOTAL_COST_KEY = "intelligence_index_cost_total_cost";
const INTELLIGENCE_COST_TOTAL_TOKENS_KEY =
	"intelligence_index_cost_total_tokens";
const TASK_METRIC_FIELDS = {
	cost: {
		direct: ["cost_per_task_usd", "cost_per_task"],
		summaries: [
			"median_cost_usd_per_task",
			"mean_cost_usd_per_task",
			"median_cost_usd",
			"mean_cost_usd",
		],
	},
	seconds: {
		direct: ["seconds_per_task", "duration_seconds_per_task"],
		summaries: [
			"median_duration_seconds_per_task",
			"mean_duration_seconds_per_task",
			"median_duration_seconds",
			"mean_duration_seconds",
		],
	},
	tokens: {
		direct: ["tokens_per_task"],
		summaries: ["median_tokens_per_task", "mean_tokens_per_task"],
	},
	input_tokens: {
		direct: ["input_tokens_per_task"],
		summaries: ["median_input_tokens_per_task", "mean_input_tokens_per_task"],
	},
	output_tokens: {
		direct: ["output_tokens_per_task"],
		summaries: [
			"median_output_tokens_per_task",
			"mean_output_tokens_per_task",
			"median_output_tokens",
			"mean_output_tokens",
		],
	},
} as const satisfies Record<
	TaskMetricKey,
	{
		direct: readonly string[];
		summaries: readonly string[];
	}
>;

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

function buildScoringSources(model: JsonObject): ModelAtlasScoringSources {
	const scoringSources: NonNullable<ModelAtlasScoringSources> = {};
	for (const [key, value] of Object.entries(asRecord(model.scoring_sources))) {
		const source = asRecord(value);
		if (hasFields(source)) {
			scoringSources[key] = source;
		}
	}
	return hasFields(scoringSources) ? scoringSources : null;
}

/** Normalize benchmark resource telemetry into the candidate's public per-task shape. */
export function buildTaskMetrics(
	artificialAnalysisSource: unknown,
	scoringSources: ModelAtlasScoringSources,
): ModelAtlasTaskMetrics {
	const taskMetrics: NonNullable<ModelAtlasTaskMetrics> = {};
	for (const [key, source] of Object.entries(scoringSources ?? {})) {
		const sourceTaskMetrics = buildSourceMetrics(source);
		if (sourceTaskMetrics != null) {
			taskMetrics[key] = sourceTaskMetrics;
		}
	}
	const artificialAnalysis = buildSourceMetrics(artificialAnalysisSource);
	if (artificialAnalysis != null) {
		taskMetrics.artificial_analysis = artificialAnalysis;
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

function minimumFiniteNumber(
	record: Record<string, unknown>,
	keys: readonly string[],
): number | null {
	let minimum: number | null = null;
	for (const key of keys) {
		const value = asFiniteNumber(record[key]);
		if (value != null && (minimum == null || value < minimum)) {
			minimum = value;
		}
	}
	return minimum;
}

/** Extract common per-task telemetry field shapes from any benchmark source row. */
function buildSourceMetrics(source: unknown): TaskMetricValues | null {
	const row = asRecord(source);
	const taskMetrics: TaskMetricValues = {};
	for (const [key, fields] of Object.entries(TASK_METRIC_FIELDS)) {
		const value =
			firstFiniteNumber(row, fields.direct) ??
			minimumFiniteNumber(row, fields.summaries);
		if (value != null && value >= 0) {
			taskMetrics[key as TaskMetricKey] = value;
		}
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
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
		task_metrics: buildTaskMetrics(
			model.intelligence_index_cost,
			scoringSources,
		),
		benchmarks: buildNumericMap(model.benchmarks),
		confidence,
		scoring_sources: scoringSources,
		component_scores: componentScores,
		scores: null,
	};
}
