/** Capability score assembly owns benchmark weighting, sparse-effort calibration, speed anchors, and confidence. */

import {
  calibrationObservations,
  effectiveModelCount,
} from "../../benchmarks/calibration-population";
import type { BenchmarkDimension } from "../../benchmarks/factory";
import {
  benchmarkDimensionWeight,
  INDEX_REPRESENTED_BENCHMARK_COUNTS,
} from "../../benchmarks/registry";
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
} from "../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasCandidateComponentScores,
  ModelAtlasConfidence,
  ModelAtlasSpeed,
} from "../model-types";
import { normalizedMetricValue, type QualityScoringContext } from "./imputation";
import {
  evidenceMassConfidence,
  logitUnitScore,
  minMaxRange,
  type MinMaxRange,
  minMaxScale,
} from "./normalization";
import { qualityAdjustedResourceMultipliers } from "./resource-efficiency";
import {
  benchmarkMetricValue,
  type BenchmarkTokenMeasure,
  directBenchmarkTokens,
} from "./resource-metrics";

type BenchmarkScoreInput = {
  key: string;
  value: number | null;
  evidenceConfidence: number;
  observed: boolean;
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
const QUALITY_REGULARIZATION_TARGET = 50;
const AGGREGATE_INDEX_KEYS = new Set(Object.keys(INDEX_REPRESENTED_BENCHMARK_COUNTS));

type UnproxiedQualityScore = "observed-mean" | "regularized";

type QualityDimensionScoreKey = "intelligence_score" | "agentic_score";

const TOKEN_MEASURES = ["input-output", "tokens", "output_tokens"] as const;

/** Build only the Agentic scoring projection; raw quality, imputation inputs, and telemetry remain unchanged. */
export function buildAgenticTokenScoringContext(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): QualityScoringContext {
  const adjustments = new Map<
    string,
    {
      resourceKey: string;
      measure: BenchmarkTokenMeasure;
      range: MinMaxRange | null;
      multipliersByObservation: Map<string, number>;
    }
  >();
  if (scoringConfig.agenticTokenModifierCap === 0) {
    return { ...qualityContext, agenticTokenAdjustments: adjustments };
  }
  for (const key of scoringConfig.agenticBenchmarkKeys) {
    const coordinate =
      scoringConfig.benchmarkPortfolio[key]?.resourcePolicy?.qualityCoordinate ??
      (key === "aa_intelligence_index" ? "linear" : null);
    if (coordinate == null) continue;
    const resourceKey = key === "aa_intelligence_index" ? "artificial_analysis" : key;
    const qualityRange = qualityContext.benchmarkRangesByKey.get(key);
    if (qualityRange == null || !(qualityRange.min < qualityRange.max)) continue;
    const qualities = models.map((model) => benchmarkMetricValue(model, key));
    for (const measure of TOKEN_MEASURES) {
      const tokensByModel = new Map(
        models.map((model) => [model, directBenchmarkTokens(model, resourceKey, measure)]),
      );
      const observations = calibrationObservations(models, (model) =>
        benchmarkMetricValue(model, key) == null ? null : (tokensByModel.get(model) ?? null),
      );
      if (effectiveModelCount(observations) < 3) continue;
      const tokens = observations.map(({ value }) => value);
      // The first supported measure owns the benchmark, even when its token population is flat.
      if (!(Math.min(...tokens) < Math.max(...tokens))) break;
      const multipliers = qualityAdjustedResourceMultipliers(
        models,
        qualities.map((value) =>
          value == null || coordinate === "linear" ? value : logitUnitScore(value),
        ),
        models.map((model) => {
          const amount = tokensByModel.get(model) ?? null;
          return amount == null ? null : Math.log(amount);
        }),
        scoringConfig.agenticTokenModifierCap,
      );
      const values: number[] = [];
      const multipliersByObservation = new Map<string, number>();
      for (const [index, model] of models.entries()) {
        const value = normalizedMetricValue(
          qualityContext.benchmarkRangesByKey,
          key,
          qualities[index] ?? null,
        );
        if (value == null) continue;
        const multiplier = multipliers[index]!;
        values.push(value * multiplier);
        multipliersByObservation.set(
          tokenObservationKey(model, qualities[index]!, tokensByModel.get(model) ?? null),
          multiplier,
        );
      }
      adjustments.set(key, {
        resourceKey,
        measure,
        range: minMaxRange(values),
        multipliersByObservation,
      });
      // One consistent measure owns the entire benchmark; do not mix totals and output-only rows.
      break;
    }
  }
  return { ...qualityContext, agenticTokenAdjustments: adjustments };
}

/** Historical candidates can share an ID and effort; their distinct quality/token observations must not overwrite each other. */
function tokenObservationKey(
  model: { id?: unknown; name?: unknown; reasoning_effort?: unknown },
  quality: number,
  tokens: number | null,
): string {
  return JSON.stringify([
    model.id ?? model.name,
    canonicalReasoningEffort(model.reasoning_effort),
    quality,
    tokens,
  ]);
}

/** Apply token efficiency only in the Agentic view, before the adjusted cohort is mapped back to 0–100. */
function normalizedQualityBenchmarkValue(
  model: {
    id?: unknown;
    name?: unknown;
    reasoning_effort?: unknown;
    benchmarks?: unknown;
    intelligence?: unknown;
    task_metrics?: unknown;
  },
  key: string,
  rawValue: number | null,
  dimension: BenchmarkDimension,
  context: QualityScoringContext,
): number | null {
  const value = normalizedMetricValue(context.benchmarkRangesByKey, key, rawValue);
  const adjustment = dimension === "agentic" ? context.agenticTokenAdjustments?.get(key) : null;
  if (value == null || adjustment == null) return value;
  const observed = benchmarkMetricValue(model, key);
  const multiplier =
    observed == null
      ? 1
      : (adjustment.multipliersByObservation.get(
          tokenObservationKey(
            model,
            observed,
            directBenchmarkTokens(model, adjustment.resourceKey, adjustment.measure),
          ),
        ) ?? 1);
  const adjusted = minMaxScale(adjustment.range, value * multiplier);
  return adjusted == null ? null : clamp(adjusted, 0, 100);
}

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
    const targetValue = normalizedQualityBenchmarkValue(
      target,
      key,
      benchmarkMetricValue(target, key),
      dimension,
      qualityContext,
    );
    const anchorValue = normalizedQualityBenchmarkValue(
      anchor,
      key,
      benchmarkMetricValue(anchor, key),
      dimension,
      qualityContext,
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
    const value = normalizedQualityBenchmarkValue(model, key, rawValue, dimension, qualityContext);
    inputs.push({
      key,
      value,
      evidenceConfidence:
        observedValue != null
          ? 1
          : imputedValue == null
            ? 0
            : (imputedConfidenceByKey.get(key) ?? 0),
      observed: observedValue != null,
      weight: dimensionWeight,
    });
  }
  return inputs;
}

/** Regularize sparse high quality means toward neutral without rewarding below-neutral results. */
function evidenceRegularizedQualityScore(qualityMean: number, evidenceReliability: number): number {
  return qualityMean <= QUALITY_REGULARIZATION_TARGET
    ? qualityMean
    : QUALITY_REGULARIZATION_TARGET +
        (qualityMean - QUALITY_REGULARIZATION_TARGET) * evidenceReliability;
}

/** Weight observed aggregate indexes by represented breadth in an undercovered quality mean. */
function undercoveredQualityScore(benchmarkScoreInputs: BenchmarkScoreInput[]): number | null {
  return weightedMeanOfFinite(
    benchmarkScoreInputs.flatMap(({ key, value, observed, weight }) => {
      const representedBenchmarkCount =
        INDEX_REPRESENTED_BENCHMARK_COUNTS[key as keyof typeof INDEX_REPRESENTED_BENCHMARK_COUNTS];
      return observed ? [{ value, weight: representedBenchmarkCount ?? weight }] : [];
    }),
  );
}

/** Score direct observations while aggregate indexes proxy the missing share below full task coverage. */
function qualityScore(
  benchmarkScoreInputs: BenchmarkScoreInput[],
  evidenceThresholds: QualityCoverageThresholds[BenchmarkDimension],
  unproxiedScore: UnproxiedQualityScore,
): QualityScoreResult {
  const qualityMean = weightedMeanOfFinite(
    benchmarkScoreInputs.flatMap(({ value, observed, weight }) =>
      observed ? [{ value, weight }] : [],
    ),
  );
  if (qualityMean == null) {
    return { score: null, evidenceSupport: null };
  }
  const evidenceMass = benchmarkScoreInputs.reduce(
    (total, { evidenceConfidence, weight }) => total + evidenceConfidence * weight,
    0,
  );
  const taskInputs = benchmarkScoreInputs.filter(({ key }) => !AGGREGATE_INDEX_KEYS.has(key));
  const observedTaskEvidenceMass = taskInputs.reduce(
    (total, { observed, weight }) => total + (observed ? weight : 0),
    0,
  );
  const possibleTaskEvidenceMass = taskInputs.reduce((total, { weight }) => total + weight, 0);
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
    ({ key, observed }) => observed && AGGREGATE_INDEX_KEYS.has(key),
  );
  if (hasObservedIndex && observedTaskEvidenceMass < possibleTaskEvidenceMass) {
    return {
      score: undercoveredQualityScore(benchmarkScoreInputs),
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
    const rawValue = benchmarkMetricValue(model, key);
    const value = normalizedQualityBenchmarkValue(model, key, rawValue, dimension, qualityContext);
    const weight = previewBenchmarkDimensionWeight(key, dimension, scoringConfig);
    return !(weight > 0)
      ? []
      : [
          {
            key,
            value,
            evidenceConfidence: value == null ? 0 : 1,
            observed: value != null,
            weight,
          },
        ];
  });
  return qualityScore(inputs, scoringConfig.qualityCoverage[dimension], "observed-mean");
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
  );
  const agentic = qualityScore(
    agenticBenchmarkInputs,
    scoringConfig.qualityCoverage.agentic,
    "regularized",
  );
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
