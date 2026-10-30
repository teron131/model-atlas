/** Candidate assembly projects heterogeneous source rows into the scorer's stable input shape. */

import { benchmarkValueLocation } from "../../benchmarks/registry";
import {
  resourceSourceMetricKey,
  resourceSourcesFromMetadata,
} from "../../benchmarks/resource-sources";
import type { ScoringConfig } from "../../config/stage";
import { canonicalReasoningEffort, normalizeProviderId } from "../../identity/normalization";
import { resolveModelLogo } from "../../logos/resolve";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
  ModelAtlasBenchmarks,
  ModelAtlasCandidate,
  ModelAtlasContextWindow,
  ModelAtlasCost,
  ModelAtlasCostBreakdown,
  ModelAtlasCostTier,
  ModelAtlasIntelligence,
  ModelAtlasModalities,
  ModelAtlasScoringSources,
  ModelAtlasSpeed,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
  ModelRow,
} from "../model-types";
import {
  lookupOpenRouterPricing,
  lookupOpenRouterSpeed,
  type OpenRouterModelData,
} from "../openrouter-data";
import {
  benchmarkImputationFactors,
  benchmarkImputationValues,
  type BenchmarkScoringPreparation,
  blendedPriceValue,
  buildComponentScoreResult,
} from "../scores";

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
function buildPersistedQualityValues(row: ModelRow): {
  intelligence: ModelAtlasIntelligence | null;
  benchmarks: ModelAtlasBenchmarks | null;
} {
  const intelligence = buildNumericMap<ModelAtlasIntelligence>(row.intelligence) ?? {};
  const benchmarks = buildNumericMap<ModelAtlasBenchmarks>(row.benchmarks) ?? {};
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

function providerFromId(modelId: string | null): string | null {
  if (modelId == null) {
    return null;
  }
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  return normalizeProviderId(modelId.slice(0, slashIndex));
}

function providerFromRow(row: ModelRow): string | null {
  return providerFromId(row.id) || (row.provider_id ?? null);
}

function buildModalities(row: ModelRow): ModelAtlasModalities | null {
  const modalities = row.modalities ?? {};
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

function buildContextWindow(row: ModelRow): ModelAtlasContextWindow {
  const limit = row.limit ?? {};
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

/** Fill missing OpenRouter telemetry from the exact Artificial Analysis observation, never a sibling effort. */
function buildSpeed(row: ModelRow, openRouterData: OpenRouterModelData): ModelAtlasSpeed {
  const openRouterSpeed = lookupOpenRouterSpeed(openRouterData, row.id);
  return {
    throughput_tokens_per_second_median:
      asFiniteNumber(openRouterSpeed?.throughput_tokens_per_second_median) ??
      row.median_output_tokens_per_second ??
      null,
    latency_seconds_median:
      asFiniteNumber(openRouterSpeed?.latency_seconds_median) ??
      row.median_time_to_first_token_seconds ??
      null,
    e2e_latency_seconds_median:
      asFiniteNumber(openRouterSpeed?.e2e_latency_seconds_median) ??
      row.median_end_to_end_response_time_seconds ??
      null,
  };
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

/** Keep catalog prices and effective OpenRouter prices authoritative, filling only missing fields from Artificial Analysis USD-per-million-token prices. */
function buildCost(row: ModelRow, openRouterData: OpenRouterModelData): ModelAtlasCost {
  const baseCost = row.cost ?? {};
  const cost: Exclude<ModelAtlasCost, null> = {
    ...buildCostBreakdown(baseCost),
  };
  for (const key of ["input", "output"] as const) {
    const fallback = asFiniteNumber(row.artificial_analysis_cost?.[key]);
    if (cost[key] == null && fallback != null && fallback >= 0) cost[key] = fallback;
  }
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
  const openRouterPricing = lookupOpenRouterPricing(openRouterData, row.id);
  const weightedInput = asFiniteNumber(openRouterPricing?.weighted_input) ?? cost.input;
  const weightedOutput = asFiniteNumber(openRouterPricing?.weighted_output) ?? cost.output;
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

function buildScoringSources(row: ModelRow): ModelAtlasScoringSources {
  const scoringSources: NonNullable<ModelAtlasScoringSources> = {};
  for (const [key, value] of Object.entries(row.scoring_sources ?? {})) {
    const source = asRecord(value);
    if (hasFields(source)) {
      scoringSources[key] = source;
    }
  }
  return hasFields(scoringSources) ? scoringSources : null;
}

export function buildTaskMetrics(
  intelligenceIndexCost: unknown,
  scoringSources: ModelAtlasScoringSources,
): ModelAtlasTaskMetrics {
  const taskMetrics: NonNullable<ModelAtlasTaskMetrics> = {};
  for (const [key, source] of Object.entries(scoringSources ?? {})) {
    const sourceTaskMetrics = buildSourceMetrics(source);
    if (sourceTaskMetrics != null) {
      const metadata = asRecord(asRecord(source).metadata);
      const comparableMetrics = { ...sourceTaskMetrics };
      if (metadata.fusion_cost_comparable === false) delete comparableMetrics.cost;
      if (metadata.fusion_seconds_per_task_comparable === false) delete comparableMetrics.seconds;
      if (metadata.fusion_tokens_per_task_comparable === false) delete comparableMetrics.tokens;
      if (metadata.fusion_output_tokens_per_task_comparable === false)
        delete comparableMetrics.output_tokens;
      if (hasFields(comparableMetrics)) taskMetrics[key] = comparableMetrics;
    }
    for (const [sourceKey, metrics] of buildSeparatedSourceMetrics(key, source)) {
      taskMetrics[sourceKey] = metrics;
    }
  }
  const artificialAnalysis = buildSourceMetrics(intelligenceIndexCost);
  if (artificialAnalysis != null) {
    taskMetrics.artificial_analysis = artificialAnalysis;
  }
  return hasFields(taskMetrics) ? taskMetrics : null;
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const raw of values) {
    const value = asFiniteNumber(raw);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function minimumFiniteNumber(...values: unknown[]): number | null {
  let minimum: number | null = null;
  for (const raw of values) {
    const value = asFiniteNumber(raw);
    if (value != null && (minimum == null || value < minimum)) {
      minimum = value;
    }
  }
  return minimum;
}

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

/** Preserve incompatible source resources under stable suffix keys for source-labelled UI columns. */
function buildSeparatedSourceMetrics(
  key: string,
  source: unknown,
): Array<[string, ModelAtlasTaskMetricValues]> {
  const row = asRecord(source);
  const metadata = asRecord(row.metadata);
  const separated = ["cost", "seconds_per_task", "tokens_per_task", "output_tokens_per_task"].some(
    (field) => metadata[`fusion_${field}_comparable`] === false,
  );
  if (!separated) return [];
  return resourceSourcesFromMetadata(metadata).flatMap((side) => {
    const quality = asFiniteNumber(metadata[`${side}_score`]);
    if (quality == null) return [];
    const metrics = buildSourceMetrics({
      cost: metadata[`${side}_cost`],
      seconds_per_task: metadata[`${side}_seconds_per_task`],
      tokens_per_task: metadata[`${side}_tokens_per_task`],
      output_tokens_per_task: metadata[`${side}_output_tokens_per_task`],
    });
    if (metrics == null) return [];
    return [
      [
        resourceSourceMetricKey(key, side),
        {
          quality,
          ...metrics,
          observed_at: typeof row.observed_at === "string" ? row.observed_at : null,
        },
      ],
    ];
  });
}

export function buildModelCandidate(
  row: ModelRow,
  openRouterData: OpenRouterModelData,
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
  benchmarkWeightMultipliersByKey?: ReadonlyMap<string, number>,
): ModelAtlasCandidate {
  const provider = providerFromRow(row);
  const speed = buildSpeed(row, openRouterData);
  const cost = buildCost(row, openRouterData);
  const scoringSources = buildScoringSources(row);
  const qualityValues = buildPersistedQualityValues(row);
  const imputedValues = benchmarkImputationValues(scoringPreparation, row);
  const imputedFactors = benchmarkImputationFactors(scoringPreparation, row);
  const { componentScores, confidence } = buildComponentScoreResult(
    row,
    scoringConfig,
    scoringPreparation.qualityContext,
    imputedValues,
    imputedFactors,
    benchmarkWeightMultipliersByKey,
  );
  return {
    id: row.id,
    name: row.name ?? null,
    provider,
    logo: resolveModelLogo({ provider, artificialAnalysisLogo: row.logo ?? null }),
    reasoning: row.reasoning ?? null,
    reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
    release_date: row.release_date ?? null,
    modalities: buildModalities(row),
    open_weights: row.open_weights ?? null,
    cost,
    context_window: buildContextWindow(row),
    speed,
    intelligence: qualityValues.intelligence,
    task_metrics: buildTaskMetrics(row.intelligence_index_cost, scoringSources),
    benchmarks: qualityValues.benchmarks,
    benchmark_dates: null,
    confidence,
    scoring_sources: scoringSources,
    component_scores: componentScores,
    scores: null,
  };
}

/** Attach OpenRouter speed and effective pricing to an already-scored candidate without recomputing or changing its quality. */
export function enrichModelResources(
  candidate: ModelAtlasCandidate,
  row: ModelRow,
  openRouterData: OpenRouterModelData,
): ModelAtlasCandidate {
  return {
    ...candidate,
    cost: buildCost(row, openRouterData),
    speed: buildSpeed(row, openRouterData),
  };
}
