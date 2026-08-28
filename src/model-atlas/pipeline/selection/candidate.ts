/** Candidate assembly projects heterogeneous source rows into the scorer's stable input shape. */

import { benchmarkValueLocation } from "../../benchmarks/registry";
import {
  type ScoringConfig,
  TASK_COST_PRICE_TRANSITIONS,
  type TaskCostPriceTransition,
} from "../../config/stage";
import {
  canonicalReasoningEffort,
  normalizeProviderId,
  normalizeProviderModelId,
} from "../../identity/normalization";
import { resolveModelLogo } from "../../logos/resolve";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
  ModelAtlasBenchmarks,
  ModelAtlasCandidate,
  ModelAtlasContextWindow,
  ModelAtlasCost,
  ModelAtlasCostBreakdown,
  ModelAtlasCostTier,
  ModelAtlasIntelligence,
  ModelAtlasModalities,
  ModelAtlasModel,
  ModelAtlasScoringSources,
  ModelAtlasSpeed,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
} from "../model-types";
import {
  benchmarkImputationConfidence,
  benchmarkImputationValues,
  type BenchmarkScoringPreparation,
  blendedPriceValue,
  buildComponentScoreResult,
} from "../scores";

type TaskMetricNumericKey = "cost" | "seconds" | "tokens" | "input_tokens" | "output_tokens";

const EMPTY_OPENROUTER_PRICING = {
  weighted_input: null,
  weighted_output: null,
} as const;
const PRICE_RATIO_TOLERANCE = 1e-9;

export type BenchmarkVersioningOptions = {
  baselineDate: string;
  observedDate: string;
  priceTransitions?: readonly TaskCostPriceTransition[];
};

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

/** Place selected quality values in their declared public persistence location after scoring consumes the source row. */
function buildPersistedQualityValues(model: JsonObject): {
  intelligence: ModelAtlasIntelligence | null;
  benchmarks: ModelAtlasBenchmarks | null;
} {
  const intelligence = buildNumericMap<ModelAtlasIntelligence>(model.intelligence) ?? {};
  const benchmarks = buildNumericMap<ModelAtlasBenchmarks>(model.benchmarks) ?? {};
  for (const [key, value] of Object.entries(benchmarks)) {
    const location = benchmarkValueLocation(key);
    if (location?.kind !== "intelligence" || value == null) {
      continue;
    }
    intelligence[location.field] = value;
    delete benchmarks[key];
  }
  return {
    intelligence: hasFields(intelligence) ? intelligence : null,
    benchmarks: hasFields(benchmarks) ? benchmarks : null,
  };
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
    ? modalities.input.filter((value): value is string => typeof value === "string")
    : undefined;
  const output = Array.isArray(modalities.output)
    ? modalities.output.filter((value): value is string => typeof value === "string")
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
  modelId: string | null,
  speedByModelId: Map<string, JsonObject>,
): ModelAtlasSpeed {
  const openRouterSpeed = lookupOpenRouterData(speedByModelId, modelId, hasSpeedData);
  return {
    throughput_tokens_per_second_median: asFiniteNumber(
      openRouterSpeed?.throughput_tokens_per_second_median,
    ),
    latency_seconds_median: asFiniteNumber(openRouterSpeed?.latency_seconds_median),
    e2e_latency_seconds_median: asFiniteNumber(openRouterSpeed?.e2e_latency_seconds_median),
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
  const input = asFiniteNumber(pricing.weighted_input);
  const output = asFiniteNumber(pricing.weighted_output);
  return (input != null && input >= 0) || (output != null && output >= 0);
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
    ...buildCostBreakdown(source),
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

function buildCost(model: JsonObject, openRouterPricing: JsonObject): ModelAtlasCost {
  const baseCost = asRecord(model.cost);
  const cost: Exclude<ModelAtlasCost, null> = {
    ...buildCostBreakdown(baseCost),
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
  const blendedPrice = blendedPriceValue(cost);
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

function uniformPriceRatio(transition: TaskCostPriceTransition): number {
  const inputRatio = transition.priceFrom.input / transition.priceBefore.input;
  const outputRatio = transition.priceFrom.output / transition.priceBefore.output;
  if (
    !Number.isFinite(inputRatio) ||
    !Number.isFinite(outputRatio) ||
    inputRatio <= 0 ||
    Math.abs(inputRatio - outputRatio) > PRICE_RATIO_TOLERANCE
  ) {
    throw new Error(
      `Task-cost repricing requires one positive input/output ratio for ${transition.modelId}`,
    );
  }
  return inputRatio;
}

function taskCostMultiplier(
  modelId: string | null,
  observedAt: string | null,
  options: BenchmarkVersioningOptions,
): number {
  if (modelId == null || observedAt == null) {
    return 1;
  }
  const transitions = options.priceTransitions ?? TASK_COST_PRICE_TRANSITIONS;
  let multiplier = 1;
  for (const transition of transitions) {
    if (
      transition.modelId !== modelId ||
      options.observedDate < transition.effectiveDate ||
      observedAt > transition.effectiveDate
    ) {
      continue;
    }
    multiplier *= uniformPriceRatio(transition);
  }
  return multiplier;
}

/** Normalize source telemetry into unit-neutral task metrics. */
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

function rawTaskMetricValue(
  metrics: ModelAtlasTaskMetricValues | null | undefined,
  key: TaskMetricNumericKey,
): number | null {
  if (metrics == null) {
    return null;
  }
  if (key === "cost") {
    return asFiniteNumber(metrics.observed_cost) ?? asFiniteNumber(metrics.cost);
  }
  return asFiniteNumber(metrics[key]);
}

/** Serialize the normalized source-reported task row used by both change detection and history. */
export function taskMetricVersionValue(metrics: ModelAtlasTaskMetricValues): string {
  return JSON.stringify({
    cost: rawTaskMetricValue(metrics, "cost"),
    seconds: rawTaskMetricValue(metrics, "seconds"),
    tokens: rawTaskMetricValue(metrics, "tokens"),
    input_tokens: rawTaskMetricValue(metrics, "input_tokens"),
    output_tokens: rawTaskMetricValue(metrics, "output_tokens"),
  });
}

function taskMetricContentMatches(
  current: ModelAtlasTaskMetricValues,
  previous: ModelAtlasTaskMetricValues | null | undefined,
): boolean {
  return previous != null && taskMetricVersionValue(current) === taskMetricVersionValue(previous);
}

/**
 * Date benchmark observations against the previous published model and reprice only task rows whose complete normalized telemetry remains unchanged across a model-price transition.
 */
export function versionCandidateBenchmarkData(
  candidate: ModelAtlasCandidate,
  previous: ModelAtlasModel | null | undefined,
  options: BenchmarkVersioningOptions,
): ModelAtlasCandidate {
  const previousBenchmarks = previous?.benchmarks ?? {};
  const previousBenchmarkDates = previous?.benchmark_dates ?? {};
  const benchmarkDates = Object.fromEntries(
    Object.entries(candidate.benchmarks ?? {}).flatMap(([key, value]) => {
      const currentValue = asFiniteNumber(value);
      if (currentValue == null) {
        return [];
      }
      const previousValue = asFiniteNumber(previousBenchmarks[key]);
      return [
        [
          key,
          previousValue === currentValue
            ? (previousBenchmarkDates[key] ?? options.baselineDate)
            : options.observedDate,
        ],
      ];
    }),
  );
  const previousTaskMetrics = previous?.task_metrics ?? {};
  const taskMetrics = Object.fromEntries(
    Object.entries(candidate.task_metrics ?? {}).flatMap(([key, metrics]) => {
      if (metrics == null) {
        return [];
      }
      const previousMetrics = previousTaskMetrics[key];
      const rowUnchanged = taskMetricContentMatches(metrics, previousMetrics);
      const observedAt = rowUnchanged
        ? (previousMetrics?.observed_at ?? options.baselineDate)
        : options.observedDate;
      const observedCost = rawTaskMetricValue(metrics, "cost");
      const costPriceRatio = rowUnchanged
        ? taskCostMultiplier(candidate.id, observedAt, options)
        : 1;
      return [
        [
          key,
          {
            ...metrics,
            observed_at: observedAt,
            ...(observedCost == null
              ? {}
              : {
                  observed_cost: observedCost,
                  cost: observedCost * costPriceRatio,
                  cost_price_ratio: costPriceRatio,
                }),
          },
        ],
      ];
    }),
  );
  return {
    ...candidate,
    task_metrics: hasFields(taskMetrics) ? taskMetrics : null,
    benchmark_dates: hasFields(benchmarkDates) ? benchmarkDates : null,
  };
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const candidate of values) {
    const value = asFiniteNumber(candidate);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function minimumFiniteNumber(...values: unknown[]): number | null {
  let minimum: number | null = null;
  for (const candidate of values) {
    const value = asFiniteNumber(candidate);
    if (value != null && (minimum == null || value < minimum)) {
      minimum = value;
    }
  }
  return minimum;
}

/** Translate known source resource fields into the benchmark-neutral task-metric contract. */
function buildSourceMetrics(source: unknown): ModelAtlasTaskMetricValues | null {
  const row = asRecord(source);
  const cost =
    firstFiniteNumber(row.cost, row.cost_per_task, row.cost_per_task_usd) ??
    minimumFiniteNumber(
      row.median_cost_usd_per_task,
      row.mean_cost_usd_per_task,
      row.median_cost_usd,
      row.mean_cost_usd,
    );
  const seconds =
    firstFiniteNumber(row.seconds_per_task, row.duration_seconds_per_task) ??
    minimumFiniteNumber(
      row.median_duration_seconds_per_task,
      row.mean_duration_seconds_per_task,
      row.median_duration_seconds,
      row.mean_duration_seconds,
    );
  const tokens =
    firstFiniteNumber(row.tokens_per_task) ??
    minimumFiniteNumber(row.median_tokens_per_task, row.mean_tokens_per_task);
  const inputTokens =
    firstFiniteNumber(row.input_tokens_per_task) ??
    minimumFiniteNumber(row.median_input_tokens_per_task, row.mean_input_tokens_per_task);
  const outputTokens =
    firstFiniteNumber(row.output_tokens_per_task) ??
    minimumFiniteNumber(
      row.median_output_tokens_per_task,
      row.mean_output_tokens_per_task,
      row.median_output_tokens,
      row.mean_output_tokens,
    );
  const taskMetrics: ModelAtlasTaskMetricValues = {
    ...(cost != null && cost >= 0 ? { cost } : {}),
    ...(seconds != null && seconds >= 0 ? { seconds } : {}),
    ...(tokens != null && tokens >= 0 ? { tokens } : {}),
    ...(inputTokens != null && inputTokens >= 0 ? { input_tokens: inputTokens } : {}),
    ...(outputTokens != null && outputTokens >= 0 ? { output_tokens: outputTokens } : {}),
  };
  return hasFields(taskMetrics) ? taskMetrics : null;
}

export function buildModelCandidate(
  row: unknown,
  speedByModelId: Map<string, JsonObject>,
  pricingByModelId: Map<string, JsonObject>,
  outputTokenAnchors: number[],
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
  benchmarkWeightMultipliersByKey?: ReadonlyMap<string, number>,
): ModelAtlasCandidate {
  const model = asRecord(row);
  const provider = providerFromModel(model);
  const modelId = typeof model.id === "string" ? model.id : null;
  const speed = buildSpeed(modelId, speedByModelId);
  const pricing =
    lookupOpenRouterData(pricingByModelId, modelId, hasPricingData) ?? EMPTY_OPENROUTER_PRICING;
  const cost = buildCost(model, pricing);
  const scoringSources = buildScoringSources(model);
  const qualityValues = buildPersistedQualityValues(model);
  const imputedValues = benchmarkImputationValues(scoringPreparation, model);
  const imputedConfidence = benchmarkImputationConfidence(scoringPreparation, model);
  const { componentScores, confidence } = buildComponentScoreResult(
    model,
    speed,
    outputTokenAnchors,
    scoringConfig,
    scoringPreparation.qualityContext,
    imputedValues,
    imputedConfidence,
    benchmarkWeightMultipliersByKey,
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
    release_date: typeof model.release_date === "string" ? model.release_date : null,
    modalities: buildModalities(model),
    open_weights: typeof model.open_weights === "boolean" ? model.open_weights : null,
    cost,
    context_window: buildContextWindow(model),
    speed,
    intelligence: qualityValues.intelligence,
    task_metrics: buildTaskMetrics(model.intelligence_index_cost, scoringSources),
    benchmarks: qualityValues.benchmarks,
    benchmark_dates: null,
    confidence,
    scoring_sources: scoringSources,
    component_scores: componentScores,
    scores: null,
  };
}
