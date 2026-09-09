/** Capability score assembly owns benchmark weighting, speed anchors, and confidence. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import { indexPolicy, isAggregateIndex } from "../../benchmarks/index-policy";
import {
  benchmarkDimensionWeight,
  INDEX_REPRESENTED_BENCHMARK_COUNTS,
} from "../../benchmarks/registry";
import {
  QUALITY_SCORE_BUCKET_WEIGHTS,
  type QualityCoverageThresholds,
  type ScoringConfig,
} from "../../config/stage";
import { canonicalReasoningEffort } from "../../identity/normalization";
import {
  clamp01,
  meanOfFinite,
  quantileFromSorted,
  smoothstep,
  weightedMeanOfFinite,
} from "../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
  ModelAtlasCandidateComponentScores,
  ModelAtlasConfidence,
  ModelAtlasSpeed,
} from "../model-types";
import { evidenceMassConfidence } from "./normalization";
import {
  normalizedQualityBenchmarkValue,
  type QualityScoringContext,
  siblingQualityKey,
} from "./quality-context";
import { benchmarkMetricValue } from "./resource-metrics";

type BenchmarkScoreInput = {
  key: string;
  value: number | null;
  evidenceConfidence: number;
  observed: boolean;
  scoreEstimate?: boolean;
  scoreExcluded?: boolean;
  weight: number;
};

type QualityScoreResult = {
  score: number | null;
  evidenceSupport: number | null;
};

type ComponentScoreResult = {
  componentScores: ModelAtlasCandidateComponentScores | null;
  confidence: ModelAtlasConfidence;
};

const QUALITY_REGULARIZATION_TARGET = 50;

type UnproxiedQualityScore = "observed-mean" | "regularized";

/** Count observed benchmarks without allowing imputed values to satisfy admission. */
export function observedBenchmarkCount(model: unknown, keys: readonly string[]): number {
  const modelRecord = asRecord(model);
  return keys.reduce(
    (count, key) => count + (benchmarkMetricValue(modelRecord, key) != null ? 1 : 0),
    0,
  );
}

function selectedBenchmarkScoreInputs(
  model: JsonObject,
  keys: readonly string[],
  dimension: BenchmarkDimension,
  qualityContext: QualityScoringContext,
  scoringConfig: ScoringConfig,
  imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
  imputedConfidenceByKey: ReadonlyMap<string, number> = new Map(),
  benchmarkWeightMultipliersByKey: ReadonlyMap<string, number> = new Map(),
): BenchmarkScoreInput[] {
  const inputs: BenchmarkScoreInput[] = [];
  for (const key of keys) {
    const dimensionWeight =
      benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio) *
      (benchmarkWeightMultipliersByKey.get(key) ?? 1);
    if (!(dimensionWeight > 0)) {
      continue;
    }
    inputs.push(
      benchmarkScoreInput(model, key, dimension, qualityContext, dimensionWeight, {
        value: imputedValuesByKey.get(key) ?? null,
        confidence: imputedConfidenceByKey.get(key) ?? 0,
      }),
    );
  }
  return inputs;
}

/** Ordinary and preview scores share observation precedence, scoring-only sibling estimates, and variant index exclusions. */
function benchmarkScoreInput(
  model: JsonObject,
  key: string,
  dimension: BenchmarkDimension,
  context: QualityScoringContext,
  weight: number,
  imputed?: { value: number | null; confidence: number },
): BenchmarkScoreInput {
  const observedValue = benchmarkMetricValue(model, key);
  const siblingEstimate = context.siblingQualityEstimates
    ?.get(siblingQualityKey(model, dimension))
    ?.get(key);
  const scoreEstimate = observedValue == null && siblingEstimate != null;
  return {
    key,
    value: scoreEstimate
      ? siblingEstimate
      : normalizedQualityBenchmarkValue(
          model,
          key,
          observedValue ?? imputed?.value ?? null,
          dimension,
          context,
        ),
    evidenceConfidence: observedValue != null ? 1 : imputed?.value == null ? 0 : imputed.confidence,
    observed: observedValue != null,
    scoreEstimate,
    scoreExcluded: excludesVariantIndex(model, key),
    weight,
  };
}

/** Unlabelled index observations remain available as metadata and admission evidence, not as substitutes for variant measurements. */
function excludesVariantIndex(model: { reasoning_effort?: unknown }, key: string): boolean {
  const policy = indexPolicy(key);
  return (
    canonicalReasoningEffort(model.reasoning_effort) != null &&
    policy != null &&
    !policy.effortAware
  );
}

/** Regularize sparse high quality means toward neutral without rewarding below-neutral results. */
function evidenceRegularizedQualityScore(qualityMean: number, evidenceReliability: number): number {
  return qualityMean <= QUALITY_REGULARIZATION_TARGET
    ? qualityMean
    : QUALITY_REGULARIZATION_TARGET +
        (qualityMean - QUALITY_REGULARIZATION_TARGET) * evidenceReliability;
}

/** Blend each variant's direct task mean with index support, reaching the curated endpoint at the configured direct-task count. */
function indexBlendedQualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  fullTaskCount: number,
): number | null {
  const observed = benchmarkScoreInputs.filter(
    ({ observed, value, weight, scoreExcluded }) =>
      !scoreExcluded && observed && value != null && weight > 0,
  );
  const tasks = benchmarkScoreInputs.filter(
    ({ key, observed, scoreEstimate, value, weight }) =>
      !isAggregateIndex(key) && (observed || scoreEstimate) && value != null && weight > 0,
  );
  const indexes = observed.filter(({ key }) => isAggregateIndex(key));
  const indexMean = weightedMeanOfFinite(
    indexes.map(({ key, value, weight }) => ({
      value,
      weight:
        weight *
        INDEX_REPRESENTED_BENCHMARK_COUNTS[key as keyof typeof INDEX_REPRESENTED_BENCHMARK_COUNTS],
    })),
  );
  const taskMean = weightedMeanOfFinite(tasks);
  if (taskMean == null) return indexMean;
  if (indexMean == null) return taskMean;
  const progress =
    fullTaskCount <= 1
      ? 1
      : smoothstep((tasks.filter((input) => input.observed).length - 1) / (fullTaskCount - 1));
  const taskShare =
    QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark +
    progress * (QUALITY_SCORE_BUCKET_WEIGHTS.benchmark - QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark);
  return taskShare * taskMean + (1 - taskShare) * indexMean;
}

/** Score direct evidence with index support converging to the 80/20 task/index blend; supported sibling estimates enter the task mean without advancing direct coverage. */
function qualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  evidenceThresholds: QualityCoverageThresholds[BenchmarkDimension],
  unproxiedScore: UnproxiedQualityScore,
  fullTaskCount: number,
): QualityScoreResult {
  const qualityMean = weightedMeanOfFinite(
    benchmarkScoreInputs.flatMap(({ value, observed, scoreEstimate, scoreExcluded, weight }) =>
      !scoreExcluded && (observed || scoreEstimate) ? [{ value, weight }] : [],
    ),
  );
  if (qualityMean == null) {
    return { score: null, evidenceSupport: null };
  }
  const evidenceMass = benchmarkScoreInputs.reduce(
    (total, { evidenceConfidence, weight }) => total + evidenceConfidence * weight,
    0,
  );
  const evidenceReliability = evidenceMassConfidence(
    evidenceMass,
    evidenceThresholds.floor,
    evidenceThresholds.full,
  );
  const possibleEvidenceMass = benchmarkScoreInputs.reduce(
    (total, { weight }) => total + weight,
    0,
  );
  const evidenceSupport =
    possibleEvidenceMass > 0 ? clamp01(evidenceMass / possibleEvidenceMass) : null;
  const hasObservedIndex = benchmarkScoreInputs.some(
    ({ key, observed, scoreExcluded }) => !scoreExcluded && observed && isAggregateIndex(key),
  );
  if (hasObservedIndex) {
    return {
      score: indexBlendedQualityScore(benchmarkScoreInputs, fullTaskCount),
      evidenceSupport,
    };
  }
  const regularizedScore = evidenceRegularizedQualityScore(qualityMean, evidenceReliability);
  return {
    score: unproxiedScore === "regularized" ? regularizedScore : qualityMean,
    evidenceSupport,
  };
}

function previewQualityScore(
  model: JsonObject,
  keys: readonly string[],
  dimension: BenchmarkDimension,
  qualityContext: QualityScoringContext,
  scoringConfig: ScoringConfig,
): QualityScoreResult {
  const inputs = keys.flatMap((key) => {
    const weight = previewBenchmarkDimensionWeight(key, dimension, scoringConfig);
    return weight > 0 ? [benchmarkScoreInput(model, key, dimension, qualityContext, weight)] : [];
  });
  return qualityScore(
    inputs,
    scoringConfig.qualityCoverage[dimension],
    "observed-mean",
    scoringConfig.qualityTaskFullCount,
  );
}

/** Give preview-only Intelligence fields one unit while retaining normal portfolio weights elsewhere. */
function previewBenchmarkDimensionWeight(
  key: string,
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
): number {
  if (scoringConfig.previewAdditionalIntelligenceBenchmarkKeys.includes(key)) {
    return dimension === "intelligence" ? 1 : 0;
  }
  return benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio);
}

/** Score recent previews from direct observations with the shared under-coverage index proxy. */
export function buildPreviewComponentScoreResult(
  model: JsonObject,
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): ComponentScoreResult {
  const intelligenceKeys = [
    ...new Set([
      ...scoringConfig.intelligenceBenchmarkKeys,
      ...scoringConfig.previewAdditionalIntelligenceBenchmarkKeys,
    ]),
  ];
  const intelligence = previewQualityScore(
    model,
    intelligenceKeys,
    "intelligence",
    qualityContext,
    scoringConfig,
  );
  const agentic = previewQualityScore(
    model,
    scoringConfig.agenticBenchmarkKeys,
    "agentic",
    qualityContext,
    scoringConfig,
  );
  return {
    componentScores:
      intelligence.score == null && agentic.score == null
        ? null
        : {
            intelligence_score: intelligence.score,
            agentic_score: agentic.score,
            speed_score: null,
          },
    confidence: {
      intelligence: intelligence.evidenceSupport,
      agentic: agentic.evidenceSupport,
      speed: null,
      value: null,
    },
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

/** Derive representative output-token workloads from observed latency and throughput, falling back when evidence cannot produce five usable anchors. */
export function deriveSpeedOutputTokenAnchors(
  speedByModelId: Map<string, JsonObject>,
  scoringConfig: ScoringConfig,
): number[] {
  const impliedTokenUsages = Array.from(speedByModelId.values())
    .map((speed) => {
      const throughputTokensPerSecond = asFiniteNumber(speed.throughput_tokens_per_second_median);
      const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
      const e2eLatencySeconds = asFiniteNumber(speed.e2e_latency_seconds_median);
      if (
        throughputTokensPerSecond == null ||
        throughputTokensPerSecond <= 0 ||
        latencySeconds == null ||
        e2eLatencySeconds == null
      ) {
        return null;
      }
      const generationSeconds = e2eLatencySeconds - latencySeconds;
      if (generationSeconds <= 0) {
        return null;
      }
      return generationSeconds * throughputTokensPerSecond;
    })
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (impliedTokenUsages.length === 0) {
    return [...scoringConfig.defaultSpeedOutputTokenAnchors];
  }

  const q0 = impliedTokenUsages[0] ?? null;
  const [q1, q2, q3] = scoringConfig.speedAnchorQuantiles.map((quantile) =>
    quantileFromSorted(impliedTokenUsages, quantile),
  );
  const q4 = impliedTokenUsages.at(-1) ?? null;
  const anchors = [q0, q1, q2, q3, q4].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (anchors.length !== 5) {
    return [...scoringConfig.defaultSpeedOutputTokenAnchors];
  }

  const sourceMin = anchors[0] as number;
  const sourceMax = anchors.at(-1) as number;
  if (!(sourceMax > sourceMin)) {
    return [...scoringConfig.defaultSpeedOutputTokenAnchors];
  }

  return anchors.map((anchor) => {
    const normalized = (anchor - sourceMin) / (sourceMax - sourceMin);
    const mapped =
      scoringConfig.speedOutputTokenRangeMin +
      normalized *
        (scoringConfig.speedOutputTokenRangeMax - scoringConfig.speedOutputTokenRangeMin);
    return Math.round(mapped);
  });
}

/** Build quality and speed components from normalized benchmark evidence and resource metrics while preserving missing scores and evidence support. */
export function buildComponentScoreResult(
  model: JsonObject,
  speed: ModelAtlasSpeed,
  speedOutputTokenAnchors: number[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
  imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
  imputedConfidenceByKey: ReadonlyMap<string, number> = new Map(),
  benchmarkWeightMultipliersByKey: ReadonlyMap<string, number> = new Map(),
): ComponentScoreResult {
  const intelligenceBenchmarkInputs = selectedBenchmarkScoreInputs(
    model,
    scoringConfig.intelligenceBenchmarkKeys,
    "intelligence",
    qualityContext,
    scoringConfig,
    imputedValuesByKey,
    imputedConfidenceByKey,
    benchmarkWeightMultipliersByKey,
  );
  const agenticBenchmarkInputs = selectedBenchmarkScoreInputs(
    model,
    scoringConfig.agenticBenchmarkKeys,
    "agentic",
    qualityContext,
    scoringConfig,
    imputedValuesByKey,
    imputedConfidenceByKey,
    benchmarkWeightMultipliersByKey,
  );
  const intelligence = qualityScore(
    intelligenceBenchmarkInputs,
    scoringConfig.qualityCoverage.intelligence,
    "regularized",
    scoringConfig.qualityTaskFullCount,
  );
  const agentic = qualityScore(
    agenticBenchmarkInputs,
    scoringConfig.qualityCoverage.agentic,
    "regularized",
    scoringConfig.qualityTaskFullCount,
  );
  const speedScore = buildSpeedComponentScore(speed, speedOutputTokenAnchors);
  return {
    componentScores:
      intelligence.score == null && agentic.score == null && speedScore == null
        ? null
        : {
            intelligence_score: intelligence.score,
            agentic_score: agentic.score,
            speed_score: speedScore,
          },
    confidence: {
      intelligence: intelligence.evidenceSupport,
      agentic: agentic.evidenceSupport,
      speed: null,
      value: null,
    },
  };
}

/** Compute route delivery speed independently of quality so enrichment cannot alter the score-filter decision. */
export function buildSpeedComponentScore(
  speed: ModelAtlasSpeed,
  speedOutputTokenAnchors: number[],
): number | null {
  const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
  const throughputTokensPerSecond = asFiniteNumber(speed.throughput_tokens_per_second_median);
  const e2eLatencySeconds = asFiniteNumber(speed.e2e_latency_seconds_median);
  const estimatedSpeedScore = meanOfFinite(
    speedOutputTokenAnchors.map((targetTokens) =>
      latencySeconds != null && throughputTokensPerSecond != null && throughputTokensPerSecond > 0
        ? targetTokens / (latencySeconds + targetTokens / throughputTokensPerSecond)
        : null,
    ),
  );
  const sortedAnchors = [...speedOutputTokenAnchors].sort((left, right) => left - right);
  const representativeTargetTokens = quantileFromSorted(sortedAnchors, 0.5);
  const observedE2eSpeedScore =
    representativeTargetTokens != null && e2eLatencySeconds != null && e2eLatencySeconds > 0
      ? representativeTargetTokens / e2eLatencySeconds
      : null;
  return meanOfFinite([estimatedSpeedScore, observedE2eSpeedScore]);
}
