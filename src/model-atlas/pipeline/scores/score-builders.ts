/** Capability score assembly owns benchmark weighting, sparse-effort calibration, speed anchors, and confidence. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import type { QualityCoverageThresholds, ScoringConfig } from "../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../identity/normalization";
import {
  clamp,
  clamp01,
  meanOfFinite,
  quantileFromSorted,
  weightedMeanOfFinite,
} from "../../numeric";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasCandidateComponentScores,
  ModelAtlasConfidence,
  ModelAtlasSpeed,
} from "../model-types";
import { normalizedMetricValue, type QualityScoringContext } from "./imputation";
import { evidenceMassConfidence } from "./normalization";
import { benchmarkMetricValue } from "./resource-metrics";

type BenchmarkScoreInput = {
  value: number | null;
  evidenceConfidence: number;
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

const MIN_SIBLING_COMPARISON_BENCHMARKS = 3;

type QualityDimensionScoreKey = "intelligence_score" | "agentic_score";

function dimensionScoreKey(dimension: BenchmarkDimension): QualityDimensionScoreKey {
  return dimension === "intelligence" ? "intelligence_score" : "agentic_score";
}

function observedDimensionWeight(
  model: ModelAtlasCandidate,
  keys: readonly string[],
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
): number {
  return keys.reduce(
    (total, key) =>
      total +
      (benchmarkMetricValue(model, key) == null
        ? 0
        : benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio)),
    0,
  );
}

function siblingQualityGap(
  target: ModelAtlasCandidate,
  anchor: ModelAtlasCandidate,
  keys: readonly string[],
  dimension: BenchmarkDimension,
  qualityContext: QualityScoringContext,
  scoringConfig: ScoringConfig,
): number | null {
  const comparisons = keys.flatMap((key) => {
    const targetValue = normalizedMetricValue(
      qualityContext.benchmarkValuesByKey,
      key,
      benchmarkMetricValue(target, key),
    );
    const anchorValue = normalizedMetricValue(
      qualityContext.benchmarkValuesByKey,
      key,
      benchmarkMetricValue(anchor, key),
    );
    const weight = benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio);
    return targetValue == null || anchorValue == null || !(weight > 0)
      ? []
      : [{ value: targetValue - anchorValue, weight }];
  });
  return comparisons.length < MIN_SIBLING_COMPARISON_BENCHMARKS
    ? null
    : weightedMeanOfFinite(comparisons);
}

/** Calibrate sparse effort variants from their direct gap to the best-observed sibling without enforcing effort order. */
export function calibrateSparseEffortQualityScores(
  models: ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): ModelAtlasCandidate[] {
  const indexesByModel = new Map<string, number[]>();
  for (const [index, model] of models.entries()) {
    if (canonicalReasoningEffort(model.reasoning_effort) == null) {
      continue;
    }
    const key = canonicalModelKey(model);
    const indexes = indexesByModel.get(key) ?? [];
    indexes.push(index);
    indexesByModel.set(key, indexes);
  }
  const componentScores = models.map((model) =>
    model.component_scores == null ? null : { ...model.component_scores },
  );
  for (const indexes of indexesByModel.values()) {
    if (indexes.length < 2) {
      continue;
    }
    for (const dimension of ["intelligence", "agentic"] as const) {
      const keys =
        dimension === "intelligence"
          ? scoringConfig.intelligenceBenchmarkKeys
          : scoringConfig.agenticBenchmarkKeys;
      const fullEvidenceWeight = scoringConfig.qualityCoverage[dimension].full;
      const observedWeightsByIndex = new Map(
        indexes.map((index) => {
          const model = models[index];
          return [
            index,
            model == null ? 0 : observedDimensionWeight(model, keys, dimension, scoringConfig),
          ];
        }),
      );
      const anchorIndex = indexes.reduce((selectedIndex, index) => {
        const selectedWeight = observedWeightsByIndex.get(selectedIndex) ?? 0;
        const weight = observedWeightsByIndex.get(index) ?? 0;
        return weight > selectedWeight ||
          (weight === selectedWeight &&
            reasoningEffortRank(models[index]?.reasoning_effort) >
              reasoningEffortRank(models[selectedIndex]?.reasoning_effort))
          ? index
          : selectedIndex;
      });
      if ((observedWeightsByIndex.get(anchorIndex) ?? 0) < fullEvidenceWeight) {
        continue;
      }
      const scoreKey = dimensionScoreKey(dimension);
      const anchor = models[anchorIndex];
      if (anchor == null) {
        continue;
      }
      const anchorScore = componentScores[anchorIndex]?.[scoreKey] ?? null;
      if (anchorScore == null) {
        continue;
      }
      for (const index of indexes) {
        if (
          index === anchorIndex ||
          (observedWeightsByIndex.get(index) ?? 0) >= fullEvidenceWeight
        ) {
          continue;
        }
        const target = models[index];
        const scores = componentScores[index];
        if (target == null || scores == null) {
          continue;
        }
        const gap = siblingQualityGap(
          target,
          anchor,
          keys,
          dimension,
          qualityContext,
          scoringConfig,
        );
        if (gap != null) {
          scores[scoreKey] = clamp(anchorScore + gap, 0, 100);
        }
      }
    }
  }
  return models.map((model, index) => ({
    ...model,
    component_scores: componentScores[index] ?? null,
  }));
}

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
    const observedValue = benchmarkMetricValue(model, key);
    const imputedValue = imputedValuesByKey.get(key) ?? null;
    const rawValue = observedValue ?? imputedValue;
    const value = normalizedMetricValue(qualityContext.benchmarkValuesByKey, key, rawValue);
    inputs.push({
      value,
      evidenceConfidence:
        observedValue != null
          ? 1
          : imputedValue == null
            ? 0
            : (imputedConfidenceByKey.get(key) ?? 0),
      weight: dimensionWeight,
    });
  }
  return inputs;
}

/** Score selected benchmarks with a coverage multiplier while reporting literal evidence support. */
function qualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  evidenceThresholds: QualityCoverageThresholds[BenchmarkDimension],
): QualityScoreResult {
  const qualityMean = weightedMeanOfFinite(
    benchmarkScoreInputs.map(({ value, evidenceConfidence, weight }) => ({
      value,
      weight: weight * evidenceConfidence,
    })),
  );
  if (qualityMean == null) {
    return { score: null, evidenceSupport: null };
  }
  const evidenceMass = benchmarkScoreInputs.reduce(
    (total, { evidenceConfidence, weight }) => total + evidenceConfidence * weight,
    0,
  );
  const coverageMultiplier = evidenceMassConfidence(
    evidenceMass,
    evidenceThresholds.floor,
    evidenceThresholds.full,
  );
  const possibleEvidenceMass = benchmarkScoreInputs.reduce(
    (total, { weight }) => total + weight,
    0,
  );
  return {
    score: qualityMean * coverageMultiplier,
    evidenceSupport: possibleEvidenceMass > 0 ? clamp01(evidenceMass / possibleEvidenceMass) : null,
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
    const rawValue = benchmarkMetricValue(model, key);
    const value = normalizedMetricValue(qualityContext.benchmarkValuesByKey, key, rawValue);
    const weight = previewBenchmarkDimensionWeight(key, dimension, scoringConfig);
    return value == null || !(weight > 0) ? [] : [{ value, weight }];
  });
  const score = weightedMeanOfFinite(inputs);
  if (score == null) {
    return { score: null, evidenceSupport: null };
  }
  const observedWeight = inputs.reduce((total, { weight }) => total + weight, 0);
  const possibleWeight = keys.reduce(
    (total, key) => total + previewBenchmarkDimensionWeight(key, dimension, scoringConfig),
    0,
  );
  return {
    score,
    evidenceSupport: possibleWeight > 0 ? clamp01(observedWeight / possibleWeight) : null,
  };
}

/** Give preview-only Intelligence fields one full unit while preserving portfolio weights for selected benchmarks. */
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

/** Score recent preview rows from direct observations only, with aggregate indexes weighted by their configured benchmark equivalents. */
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
  );
  const agentic = qualityScore(agenticBenchmarkInputs, scoringConfig.qualityCoverage.agentic);
  const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
  const throughputTokensPerSecond = asFiniteNumber(speed.throughput_tokens_per_second_median);
  const e2eLatencySeconds = asFiniteNumber(speed.e2e_latency_seconds_median);
  const imaginedSpeedScore = meanOfFinite(
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
  const speedScore = meanOfFinite([imaginedSpeedScore, observedE2eSpeedScore]);
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
