/** Capability score assembly owns benchmark weighting and confidence. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import {
  excludesVariantIndex,
  isAggregateIndex,
  qualityIndexBreadths,
  reportedIndexBenchmarkCount,
} from "../../benchmarks/index-policy";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import { countsTowardIntelligence, type ScoringConfig } from "../../config/stage";
import { clamp01, weightedMeanOfFinite } from "../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
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
  scoreEstimate?: boolean;
  scoreExcluded?: boolean;
  weight: number;
  representedBenchmarks?: number | null;
};

type QualityScoreResult = {
  score: number | null;
  evidenceSupport: number | null;
  retention: number;
};

/** Keep task-group and index contributions separate until the population pairwise fit is available. */
export type IntelligenceScoreParts = {
  frontier: number | null;
  baseline: number | null;
  indexScore: number | null;
  indexShare: number;
  retention: number;
};

type ComponentScoreResult = {
  componentScores: ModelAtlasCandidateComponentScores | null;
  confidence: ModelAtlasConfidence;
  intelligenceScoreParts: IntelligenceScoreParts | null;
};

/** Count observed benchmarks without allowing imputed values to satisfy admission. */
export function observedBenchmarkCount(model: unknown, keys: readonly string[]): number {
  const modelRecord = asRecord(model);
  return keys.reduce((count, key) => count + (benchmarkValue(modelRecord, key) != null ? 1 : 0), 0);
}

function selectedBenchmarkScoreInputs(
  model: JsonObject,
  keys: readonly string[],
  dimension: BenchmarkDimension,
  qualityContext: QualityScoringContext,
  scoringConfig: ScoringConfig,
  imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
  imputedFactorsByKey: ReadonlyMap<string, number> = new Map(),
  benchmarkWeightMultipliersByKey: ReadonlyMap<string, number> = new Map(),
): BenchmarkScoreInput[] {
  const inputs: BenchmarkScoreInput[] = [];
  for (const key of keys) {
    if (dimension === "intelligence" && !countsTowardIntelligence(key, scoringConfig)) {
      continue;
    }
    const dimensionWeight =
      benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio) *
      (benchmarkWeightMultipliersByKey.get(key) ?? 1);
    if (!(dimensionWeight > 0)) {
      continue;
    }
    inputs.push(
      benchmarkScoreInput(model, key, dimension, qualityContext, dimensionWeight, {
        value: imputedValuesByKey.get(key) ?? null,
        evidenceFactor: imputedFactorsByKey.get(key) ?? 0,
      }),
    );
  }
  return inputs;
}

/** Quality scores use observation precedence, scoring-only effort estimates, and variant index exclusions. */
function benchmarkScoreInput(
  model: JsonObject,
  key: string,
  dimension: BenchmarkDimension,
  context: QualityScoringContext,
  weight: number,
  imputed?: { value: number | null; evidenceFactor: number },
): BenchmarkScoreInput {
  const observedValue = benchmarkValue(model, key);
  const effortEstimate = context.effortQualityEstimates
    ?.get(effortQualityKey(model, dimension))
    ?.get(key);
  const scoreEstimate = observedValue == null && effortEstimate != null;
  return {
    key,
    value: scoreEstimate
      ? (effortEstimate ?? null)
      : normalizedQualityBenchmarkValue(
          model,
          key,
          observedValue ?? imputed?.value ?? null,
          dimension,
          context,
        ),
    evidenceFactor: observedValue != null ? 1 : imputed?.value == null ? 0 : imputed.evidenceFactor,
    observed: observedValue != null,
    scoreEstimate,
    scoreExcluded: excludesVariantIndex(model, key),
    weight,
    representedBenchmarks: reportedIndexBenchmarkCount(model, key),
  };
}

/** Combine a variant's direct benchmark evidence with breadth-scaled eligible index support. */
function indexBlendedQualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  directBenchmarkWeightMultiplier: number,
  breadths: ReadonlyMap<string, number>,
): number | null {
  const observed = benchmarkScoreInputs.filter(
    ({ observed, value, weight, scoreExcluded }) =>
      !scoreExcluded && observed && value != null && weight > 0,
  );
  const benchmarks = benchmarkScoreInputs.filter(
    ({ key, observed, scoreEstimate, value, weight }) =>
      !isAggregateIndex(key) && (observed || scoreEstimate) && value != null && weight > 0,
  );
  const indexes = observed.filter(({ key }) => isAggregateIndex(key));
  return weightedMeanOfFinite([
    ...benchmarks.map((part) => ({
      ...part,
      weight: part.weight * directBenchmarkWeightMultiplier,
    })),
    ...indexes.map((part) => ({
      ...part,
      weight: part.weight * (breadths.get(part.key) ?? 0),
    })),
  ]);
}

/** Score direct evidence and breadth-scaled index support in one pool; estimates enter without advancing direct coverage. */
function qualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  directBenchmarkWeightMultiplier: number,
  minimumCoverageRetention: number,
  retentionThresholds: { floor: number; full: number },
): QualityScoreResult {
  const qualityMean = weightedMeanOfFinite(
    benchmarkScoreInputs.flatMap(({ value, observed, scoreEstimate, scoreExcluded, weight }) =>
      !scoreExcluded && (observed || scoreEstimate) ? [{ value, weight }] : [],
    ),
  );
  if (qualityMean == null) {
    return { score: null, evidenceSupport: null, retention: 1 };
  }
  const observedIndexes = benchmarkScoreInputs.filter(
    ({ key, observed, value, scoreExcluded }) =>
      isAggregateIndex(key) && observed && value != null && !scoreExcluded,
  );
  const observedBenchmarkKeys = benchmarkScoreInputs
    .filter(({ key, observed, value }) => !isAggregateIndex(key) && observed && value != null)
    .map(({ key }) => key);
  const breadths = qualityIndexBreadths(
    observedIndexes.map(({ key, representedBenchmarks }) => ({
      key,
      reportedCount: representedBenchmarks,
    })),
    observedBenchmarkKeys,
  );
  const supportedWeight = benchmarkScoreInputs.reduce(
    (total, { evidenceFactor, scoreExcluded, weight }) =>
      total + (scoreExcluded ? 0 : evidenceFactor * weight),
    0,
  );
  const totalWeight = benchmarkScoreInputs.reduce((total, { weight }) => total + weight, 0);
  const evidenceSupport = totalWeight > 0 ? clamp01(supportedWeight / totalWeight) : null;
  const weightedEvidence = benchmarkScoreInputs.reduce(
    (total, { key, evidenceFactor, scoreExcluded, weight }) =>
      total +
      (scoreExcluded
        ? 0
        : isAggregateIndex(key)
          ? weight * (breadths.get(key) ?? 0) * evidenceFactor
          : weight * directBenchmarkWeightMultiplier * evidenceFactor),
    0,
  );
  const qualityScore =
    observedIndexes.length > 0
      ? indexBlendedQualityScore(benchmarkScoreInputs, directBenchmarkWeightMultiplier, breadths)
      : qualityMean;
  const retention =
    minimumCoverageRetention +
    (1 - minimumCoverageRetention) *
      evidenceRetentionFactor(
        weightedEvidence,
        retentionThresholds.floor,
        retentionThresholds.full,
      );
  return {
    score: qualityScore == null ? null : qualityScore * retention,
    evidenceSupport,
    retention,
  };
}

/** Hold active task groups at fixed shares while leaving the index union weight and evidence retention unchanged. */
function intelligenceScore(
  inputs: BenchmarkScoreInput[],
  scoringConfig: ScoringConfig,
): QualityScoreResult & { parts: IntelligenceScoreParts | null } {
  const evidence = qualityScore(
    inputs,
    scoringConfig.directBenchmarkWeightMultiplier,
    scoringConfig.qualityCoverageMinimumRetention,
    scoringConfig.qualityRetention,
  );
  const direct = inputs.filter(
    ({ key, observed, scoreEstimate, value, weight }) =>
      !isAggregateIndex(key) && (observed || scoreEstimate) && value != null && weight > 0,
  );
  const groupScore = (group: "frontier" | "baseline") =>
    weightedMeanOfFinite(
      direct.filter(({ key }) => scoringConfig.benchmarkPortfolio[key]?.group === group),
    );
  const frontier = groupScore("frontier");
  const baseline = groupScore("baseline");

  const observedIndexes = inputs.filter(
    ({ key, observed, value, scoreExcluded }) =>
      isAggregateIndex(key) && observed && value != null && !scoreExcluded,
  );
  const breadths = qualityIndexBreadths(
    observedIndexes.map(({ key, representedBenchmarks }) => ({
      key,
      reportedCount: representedBenchmarks,
    })),
    inputs
      .filter(({ key, observed, value }) => !isAggregateIndex(key) && observed && value != null)
      .map(({ key }) => key),
  );
  const directWeight = direct.reduce((total, { weight }) => total + weight, 0);
  const indexWeight = observedIndexes.reduce(
    (total, { key, weight }) => total + weight * (breadths.get(key) ?? 0),
    0,
  );
  const indexScore = weightedMeanOfFinite(
    observedIndexes.map((input) => ({
      ...input,
      weight: input.weight * (breadths.get(input.key) ?? 0),
    })),
  );
  const indexShare =
    indexScore == null
      ? 0
      : indexWeight / (directWeight * scoringConfig.directBenchmarkWeightMultiplier + indexWeight);
  const parts: IntelligenceScoreParts = {
    frontier,
    baseline,
    indexScore,
    indexShare,
    retention: evidence.retention,
  };
  const taskScore =
    (scoringConfig.intelligenceGroupWeights.frontier > 0 && frontier == null) ||
    (scoringConfig.intelligenceGroupWeights.baseline > 0 && baseline == null)
      ? null
      : scoringConfig.intelligenceGroupWeights.frontier * (frontier ?? 0) +
        scoringConfig.intelligenceGroupWeights.baseline * (baseline ?? 0);
  return {
    ...evidence,
    score:
      taskScore == null
        ? null
        : evidence.retention * ((1 - indexShare) * taskScore + indexShare * (indexScore ?? 0)),
    parts,
  };
}

/** Average effective input and output prices when both provider-weighted sides are available. */
export function blendedPriceValue(costLike: unknown): number | null {
  const cost = asRecord(costLike);
  const inputPrice = asFiniteNumber(cost.weighted_input);
  const outputPrice = asFiniteNumber(cost.weighted_output);
  if (inputPrice == null || inputPrice < 0 || outputPrice == null || outputPrice < 0) {
    return null;
  }
  return (inputPrice + outputPrice) / 2;
}

// Below every listed price, so only free models reach it; absolute price clips its favorable tail above this floor anyway.
const MINIMUM_LOG_BLENDED_PRICE = 0.001;

/** Log blended price so equal price ratios count equally at every price level; free models stay finite and cheapest. */
export function logBlendedPrice(price: number | null): number | null {
  return price == null ? null : Math.log(Math.max(price, MINIMUM_LOG_BLENDED_PRICE));
}

export function buildComponentScoreResult(
  model: JsonObject,
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
  imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
  imputedFactorsByKey: ReadonlyMap<string, number> = new Map(),
  benchmarkWeightMultipliersByKey: ReadonlyMap<string, number> = new Map(),
): ComponentScoreResult {
  const intelligenceBenchmarkInputs = selectedBenchmarkScoreInputs(
    model,
    scoringConfig.intelligenceBenchmarkKeys,
    "intelligence",
    qualityContext,
    scoringConfig,
    imputedValuesByKey,
    imputedFactorsByKey,
    benchmarkWeightMultipliersByKey,
  );
  const agenticBenchmarkInputs = selectedBenchmarkScoreInputs(
    model,
    scoringConfig.agenticBenchmarkKeys,
    "agentic",
    qualityContext,
    scoringConfig,
    imputedValuesByKey,
    imputedFactorsByKey,
    benchmarkWeightMultipliersByKey,
  );
  const intelligence = intelligenceScore(intelligenceBenchmarkInputs, scoringConfig);
  const agentic = qualityScore(
    agenticBenchmarkInputs,
    scoringConfig.directBenchmarkWeightMultiplier,
    scoringConfig.qualityCoverageMinimumRetention,
    scoringConfig.qualityRetention,
  );
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
