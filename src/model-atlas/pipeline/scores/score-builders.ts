/** Capability score assembly owns benchmark weighting and confidence. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import {
  isAggregateIndex,
  qualityIndexBreadths,
  reportedIndexBenchmarkCount,
} from "../../benchmarks/index-policy";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import { countsTowardIntelligence, type ScoringConfig } from "../../config/stage";
import { clamp01, weightedMeanOfFinite } from "../../math-utils";
import { asRecord, type JsonObject } from "../../runtime";
import type { ModelAtlasCandidateComponentScores, ModelAtlasConfidence } from "../model-types";
import { evidenceRetentionFactor } from "./normalization";
import {
  effortQualityKey,
  normalizedQualityBenchmarkValue,
  type QualityScoringContext,
} from "./quality-context";
import { benchmarkValue } from "./resource-metrics";

type BenchmarkScoreInput = {
  key: string;
  value: number | null;
  evidenceFactor: number;
  observed: boolean;
  weight: number;
  representedBenchmarks: number | null;
};

/** Keep task-group and index contributions separate until the population can fit pairwise comparisons and place index results on the frontier scale. */
export type IntelligenceScoreParts = {
  frontier: number | null;
  baseline: number | null;
  taskWeight: number;
  indexes: { key: string; value: number; weight: number }[];
  retention: number;
};

type ComponentScoreResult = {
  componentScores: ModelAtlasCandidateComponentScores | null;
  confidence: ModelAtlasConfidence;
  intelligenceScoreParts: IntelligenceScoreParts | null;
};

export function buildComponentScoreResult(
  model: JsonObject,
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
  imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
  imputedFactorsByKey: ReadonlyMap<string, number> = new Map(),
  benchmarkWeightMultipliersByKey: ReadonlyMap<string, number> = new Map(),
): ComponentScoreResult {
  const score = (dimension: BenchmarkDimension) => {
    const inputs = benchmarkScoreInputs(
      model,
      dimension,
      qualityContext,
      scoringConfig,
      imputedValuesByKey,
      imputedFactorsByKey,
      benchmarkWeightMultipliersByKey,
    );
    return qualityScore(inputs, dimension, scoringConfig);
  };
  const intelligence = score("intelligence");
  const agentic = score("agentic");
  return {
    componentScores:
      intelligence.score == null && agentic.score == null
        ? null
        : { intelligence_score: intelligence.score, agentic_score: agentic.score },
    confidence: {
      intelligence: intelligence.evidenceSupport,
      agentic: agentic.evidenceSupport,
      speed: null,
      value: null,
    },
    intelligenceScoreParts: intelligence.parts,
  };
}

/** Count observed benchmarks without allowing imputed values to satisfy admission. */
export function observedBenchmarkCount(model: unknown, keys: readonly string[]): number {
  const modelRecord = asRecord(model);
  return keys.reduce((count, key) => count + (benchmarkValue(modelRecord, key) != null ? 1 : 0), 0);
}

function benchmarkScoreInputs(
  model: JsonObject,
  dimension: BenchmarkDimension,
  context: QualityScoringContext,
  config: ScoringConfig,
  imputedValues: ReadonlyMap<string, number>,
  imputedFactors: ReadonlyMap<string, number>,
  weightMultipliers: ReadonlyMap<string, number>,
): BenchmarkScoreInput[] {
  const keys =
    dimension === "intelligence" ? config.intelligenceBenchmarkKeys : config.agenticBenchmarkKeys;
  const estimates = context.effortQualityEstimates?.get(effortQualityKey(model, dimension));
  const inputs: BenchmarkScoreInput[] = [];
  for (const key of keys) {
    if (dimension === "intelligence" && !countsTowardIntelligence(key, config)) continue;
    const weight =
      benchmarkDimensionWeight(key, dimension, config.benchmarkPortfolio) *
      (weightMultipliers.get(key) ?? 1);
    if (!(weight > 0)) continue;

    const observed = benchmarkValue(model, key);
    inputs.push({
      key,
      value:
        observed == null
          ? (estimates?.get(key) ?? null)
          : normalizedQualityBenchmarkValue(model, key, observed, dimension, context),
      evidenceFactor:
        observed != null ? 1 : imputedValues.has(key) ? (imputedFactors.get(key) ?? 0) : 0,
      observed: observed != null,
      weight,
      representedBenchmarks: isAggregateIndex(key) ? reportedIndexBenchmarkCount(model, key) : null,
    });
  }
  return inputs;
}

function qualityScore(
  inputs: BenchmarkScoreInput[],
  dimension: BenchmarkDimension,
  config: ScoringConfig,
) {
  const tasks = inputs.filter(({ key }) => !isAggregateIndex(key));
  const scoredTasks = tasks.filter(({ value }) => value != null);
  const observedIndexes = inputs.flatMap(
    ({ key, value, observed, weight, representedBenchmarks }) =>
      isAggregateIndex(key) && observed && value != null
        ? [{ key, value, weight, reportedCount: representedBenchmarks }]
        : [],
  );
  const breadths = qualityIndexBreadths(
    observedIndexes,
    scoredTasks.filter(({ observed }) => observed).map(({ key }) => key),
  );
  const indexes = observedIndexes.map(({ key, value, weight }) => ({
    key,
    value,
    weight: weight * (breadths.get(key) ?? 0),
  }));
  // The blend uses all selected task weights. Retention counts only the supported part of each weight.
  const taskWeight =
    tasks.reduce((sum, task) => sum + task.weight, 0) * config.directBenchmarkWeightMultiplier;
  const { evidenceSupport, retention } = qualityEvidence(inputs, breadths, config);

  if (dimension === "agentic") {
    const taskMean = weightedMeanOfFinite(scoredTasks);
    const mean =
      indexes.length === 0
        ? taskMean
        : weightedMeanOfFinite([{ value: taskMean, weight: taskWeight }, ...indexes]);
    return { score: mean == null ? null : mean * retention, evidenceSupport, parts: null };
  }

  // Intelligence blends indexes only in the population step, after reading each result off the frontier scale; until then the score is task-only.
  const groupMean = (group: "frontier" | "baseline") =>
    weightedMeanOfFinite(
      scoredTasks.filter(({ key }) => config.benchmarkPortfolio[key]?.group === group),
    );
  const frontier = groupMean("frontier");
  const baseline = groupMean("baseline");
  const weights = config.intelligenceGroupWeights;
  const taskScore =
    (weights.frontier > 0 && frontier == null) || (weights.baseline > 0 && baseline == null)
      ? null
      : weights.frontier * (frontier ?? 0) + weights.baseline * (baseline ?? 0);
  return {
    score: taskScore == null ? null : retention * taskScore,
    evidenceSupport,
    parts: { frontier, baseline, taskWeight, indexes, retention },
  };
}

function qualityEvidence(
  inputs: BenchmarkScoreInput[],
  breadths: ReadonlyMap<string, number>,
  config: ScoringConfig,
) {
  if (!inputs.some(({ value }) => value != null)) return { evidenceSupport: null, retention: 1 };
  let totalWeight = 0;
  let supportedWeight = 0;
  let retentionWeight = 0;
  for (const { key, weight, evidenceFactor } of inputs) {
    totalWeight += weight;
    supportedWeight += weight * evidenceFactor;
    const multiplier = isAggregateIndex(key)
      ? (breadths.get(key) ?? 0)
      : config.directBenchmarkWeightMultiplier;
    retentionWeight += weight * multiplier * evidenceFactor;
  }
  const minimum = config.qualityCoverageMinimumRetention;
  return {
    evidenceSupport: clamp01(supportedWeight / totalWeight),
    retention:
      minimum +
      (1 - minimum) *
        evidenceRetentionFactor(
          retentionWeight,
          config.qualityRetention.floor,
          config.qualityRetention.full,
        ),
  };
}

/** USD per million tokens of each kind of token an agent request is billed for. */
export type BlendPrices = { cache_read: number; new_input: number; output: number };

/**
 * Token shares of new input and output at the two ends of the agent workloads the blend spans; every other token is a cache read.
 * Long sessions re-read more context per new token than short tasks, so they sit at the low end of both shares.
 */
const BLEND_MIXES = {
  long_sessions: { new_input: 0.025, output: 0.003 },
  short_tasks: { new_input: 0.05, output: 0.015 },
} as const;

/**
 * Resolve one listed price card into blend prices.
 * New input pays the cache-write price where one is listed, since providers that bill writes bill every new token as one; an unlisted cache read costs a tenth of input, the median listed ratio.
 */
export function listedBlendPrices(card: {
  input?: number | null;
  output?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}): BlendPrices | null {
  const { input, output } = card;
  if (input == null || input < 0 || output == null || output < 0) return null;
  return {
    cache_read: card.cache_read ?? input / 10,
    new_input: card.cache_write ?? input,
    output,
  };
}

/** Blend at both ends of the workload range; the blended price is their midpoint, the blend at the middle mix. */
export function blendedPrices(prices: BlendPrices): {
  long_sessions: number;
  short_tasks: number;
  middle: number;
} {
  const longSessions = blendAt(prices, BLEND_MIXES.long_sessions);
  const shortTasks = blendAt(prices, BLEND_MIXES.short_tasks);
  return {
    long_sessions: longSessions,
    short_tasks: shortTasks,
    middle: (longSessions + shortTasks) / 2,
  };
}

function blendAt(prices: BlendPrices, mix: { new_input: number; output: number }): number {
  return (
    (1 - mix.new_input - mix.output) * prices.cache_read +
    mix.new_input * prices.new_input +
    mix.output * prices.output
  );
}

// Below every listed price, so only free models reach it; absolute price clips its favorable tail above this floor anyway.
const MINIMUM_LOG_BLENDED_PRICE = 0.001;

/** Log blended price so equal price ratios count equally at every price level; free models stay finite and cheapest. */
export function logBlendedPrice(price: number | null): number | null {
  return price == null ? null : Math.log(Math.max(price, MINIMUM_LOG_BLENDED_PRICE));
}
