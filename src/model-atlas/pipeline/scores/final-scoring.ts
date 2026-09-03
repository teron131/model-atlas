/** Final scoring combines capability, resource efficiency, coverage, and confidence into public model scores. */

import { RESOURCE_SCORE_BUCKET_WEIGHTS, type ScoringConfig } from "../../config/stage";
import { canonicalModelKey, reasoningEffortRank } from "../../identity/normalization";
import {
  log10OnePlusNonnegative,
  meanOfFinite,
  nonnegativeFiniteNumber,
  positiveFiniteNumber,
  weightedMeanOfFinite,
} from "../../math-utils";
import type {
  ModelAtlasCandidate,
  ModelAtlasCandidateComponentScores,
  ModelAtlasScoredCandidate,
} from "../model-types";
import {
  benchmarkQualityEvidence,
  type BenchmarkScoringPreparation,
  type EffortResourceImputation,
  imputedTaskResource,
  type TaskResourceKind,
} from "./imputation";
import { coverageConfidence, logInputMinMaxScores } from "./normalization";
import {
  benchmarkResourceEfficiencyScores,
  modelBalancedMinMaxScores,
  qualityLocalResourceScores,
} from "./resource-efficiency";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  effectiveTaskSeconds,
} from "./resource-metrics";
import { blendedPriceValue } from "./score-builders";

type WeightedSignal = {
  value: number | null;
  weight: number;
};

type WeightedResourceEfficiencyEvidence = {
  benchmarkKeys: readonly string[];
  signalsByModel: WeightedSignal[][];
};

type ResourceScoreResult = {
  scores: Array<number | null>;
  confidences: Array<number | null>;
};

type ResourceScoreInputs = {
  providerSpeedScores: readonly (readonly (number | null)[])[];
  priceComponentScores: readonly (readonly (number | null)[])[];
  taskTimeComponentEvidence: WeightedResourceEfficiencyEvidence;
  taskCostComponentEvidence: WeightedResourceEfficiencyEvidence;
};

export type PreviewResourceScoreResult = {
  scores: {
    speed_score: number | null;
    value_score: number | null;
  };
  confidence: {
    speed: number | null;
    value: number | null;
  };
};

const PREVIEW_RESOURCE_BUCKET_WEIGHTS = {
  nonBenchmark: 0.7,
  benchmark: 0.3,
} as const;

type ResourceScoringModel = ModelAtlasCandidate | ModelAtlasScoredCandidate;

function finiteSignalWeight(signals: WeightedSignal[]): number {
  return signals.reduce(
    (total, signal) =>
      signal.value != null &&
      Number.isFinite(signal.value) &&
      Number.isFinite(signal.weight) &&
      signal.weight > 0
        ? total + signal.weight
        : total,
    0,
  );
}

function perComponentWeight(bucketWeight: number, componentCount: number): number {
  return componentCount > 0 ? bucketWeight / componentCount : 0;
}

function blendedPrice(model: ResourceScoringModel): number | null {
  return nonnegativeFiniteNumber(model.cost?.blended_price) ?? blendedPriceValue(model.cost);
}

function taskResourceEfficiencyEvidence(
  models: ResourceScoringModel[],
  scoringConfig: ScoringConfig,
  kind: TaskResourceKind,
  benchmarkPreparation?: BenchmarkScoringPreparation,
  resourceImputation?: EffortResourceImputation,
): WeightedResourceEfficiencyEvidence {
  const signalsByModel = models.map(() => [] as WeightedSignal[]);
  const benchmarkKeys: string[] = [];
  for (const [key, entry] of Object.entries(scoringConfig.benchmarkPortfolio).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const qualityCoordinate = entry.resourcePolicy?.qualityCoordinate;
    if (qualityCoordinate == null) {
      continue;
    }
    const evidence = models.map((model) => {
      const quality = benchmarkQualityEvidence(model, key, benchmarkPreparation);
      if (quality == null) {
        return null;
      }
      const taskMetrics = benchmarkTaskMetrics(model, key, entry.resourcePolicy);
      const directAmount =
        kind === "cost"
          ? positiveFiniteNumber(taskMetrics?.cost)
          : effectiveTaskSeconds(model, taskMetrics);
      if (directAmount != null) {
        return {
          calibration: benchmarkMetricValue(model, key) != null,
          quality: quality.value,
          resource: Math.log(directAmount),
          weight: quality.confidence,
        };
      }
      const estimate =
        resourceImputation == null
          ? null
          : imputedTaskResource(resourceImputation, model, key, kind);
      return estimate == null
        ? null
        : {
            calibration: false,
            quality: quality.value,
            resource: Math.log(estimate.amount),
            weight: quality.confidence * estimate.confidence,
          };
    });
    if (!evidence.some((item) => item != null)) {
      continue;
    }
    benchmarkKeys.push(key);
    const scores = benchmarkResourceEfficiencyScores(
      models,
      evidence.map((item) => item?.quality ?? null),
      evidence.map((item) => item?.resource ?? null),
      qualityCoordinate,
      evidence.map((item) => item?.calibration === true),
    );
    for (const [modelIndex, score] of scores.entries()) {
      signalsByModel[modelIndex]?.push({
        value: score,
        weight: score == null ? 0 : (evidence[modelIndex]?.weight ?? 0),
      });
    }
  }
  return { benchmarkKeys, signalsByModel };
}

function evidenceConfidence(
  signals: WeightedSignal[],
  totalWeight: number,
  score: number | null,
): number | null {
  return score == null ? null : Math.min(1, finiteSignalWeight(signals) / totalWeight);
}

/** Use the source-default variant's coverage uniformly across every reasoning effort. */
function defaultVariantCoverageMultipliers(
  models: readonly ResourceScoringModel[],
  signalsByModel: readonly WeightedSignal[][],
  totalWeight: number,
): number[] {
  const indexesByModel = new Map<string, number[]>();
  for (const [index, model] of models.entries()) {
    const modelKey = canonicalModelKey(model);
    indexesByModel.set(modelKey, [...(indexesByModel.get(modelKey) ?? []), index]);
  }
  const multipliers = models.map(() => 0);
  for (const indexes of indexesByModel.values()) {
    const defaultIndex = indexes.reduce((selectedIndex, index) =>
      reasoningEffortRank(models[index]?.reasoning_effort) >
      reasoningEffortRank(models[selectedIndex]?.reasoning_effort)
        ? index
        : selectedIndex,
    );
    const multiplier = coverageConfidence(
      finiteSignalWeight(signalsByModel[defaultIndex] ?? []),
      totalWeight,
    );
    for (const index of indexes) {
      multipliers[index] = multiplier;
    }
  }
  return multipliers;
}

function scoreResourceDimension(
  models: readonly ResourceScoringModel[],
  nonBenchmarkScores: readonly (readonly (number | null)[])[],
  benchmarkEvidence: WeightedResourceEfficiencyEvidence,
): ResourceScoreResult {
  const nonBenchmarkComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.nonBenchmark,
    nonBenchmarkScores.length,
  );
  const benchmarkComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.benchmark,
    benchmarkEvidence.benchmarkKeys.length,
  );
  const signalsByModel = models.map((_, index) => [
    ...nonBenchmarkScores.map((scores) => ({
      value: scores[index] ?? null,
      weight: nonBenchmarkComponentWeight,
    })),
    ...(benchmarkEvidence.signalsByModel[index] ?? []).map((signal) => ({
      ...signal,
      weight: signal.weight * benchmarkComponentWeight,
    })),
  ]);
  const totalWeight =
    nonBenchmarkComponentWeight * nonBenchmarkScores.length +
    benchmarkComponentWeight * benchmarkEvidence.benchmarkKeys.length;
  const estimates = signalsByModel.map((signals) => weightedMeanOfFinite(signals));
  const coverageMultipliers = defaultVariantCoverageMultipliers(
    models,
    signalsByModel,
    totalWeight,
  );
  const scores = estimates.map((estimate, index) =>
    estimate == null ? null : estimate * (coverageMultipliers[index] ?? 0),
  );
  const confidences = signalsByModel.map((signals, index) =>
    evidenceConfidence(signals, totalWeight, scores[index] ?? null),
  );
  return {
    scores,
    confidences,
  };
}

/** Score a preview from provider specs first, adding direct benchmark resources without a missing-coverage multiplier. */
function scorePreviewResourceDimension(
  nonBenchmarkScores: readonly (readonly (number | null)[])[],
  benchmarkEvidence: WeightedResourceEfficiencyEvidence,
): ResourceScoreResult {
  const nonBenchmarkConfidenceWeight = perComponentWeight(
    PREVIEW_RESOURCE_BUCKET_WEIGHTS.nonBenchmark,
    nonBenchmarkScores.length,
  );
  const benchmarkConfidenceWeight = perComponentWeight(
    PREVIEW_RESOURCE_BUCKET_WEIGHTS.benchmark,
    benchmarkEvidence.benchmarkKeys.length,
  );
  const modelCount = nonBenchmarkScores[0]?.length ?? benchmarkEvidence.signalsByModel.length;
  const scores: Array<number | null> = [];
  const confidences: Array<number | null> = [];
  for (let index = 0; index < modelCount; index += 1) {
    const nonBenchmarkSignals = nonBenchmarkScores.map((componentScores) => ({
      value: componentScores[index] ?? null,
      weight: 1,
    }));
    const benchmarkSignals = benchmarkEvidence.signalsByModel[index] ?? [];
    const nonBenchmarkScore = weightedMeanOfFinite(nonBenchmarkSignals);
    const benchmarkScore = weightedMeanOfFinite(benchmarkSignals);
    const score =
      nonBenchmarkScore == null
        ? null
        : benchmarkScore == null
          ? nonBenchmarkScore
          : nonBenchmarkScore * PREVIEW_RESOURCE_BUCKET_WEIGHTS.nonBenchmark +
            benchmarkScore * PREVIEW_RESOURCE_BUCKET_WEIGHTS.benchmark;
    const confidence =
      score == null
        ? null
        : Math.min(
            1,
            finiteSignalWeight(nonBenchmarkSignals) * nonBenchmarkConfidenceWeight +
              finiteSignalWeight(benchmarkSignals) * benchmarkConfidenceWeight,
          );
    scores.push(score);
    confidences.push(confidence);
  }
  return { scores, confidences };
}

function buildResourceScoreInputs(
  models: ResourceScoringModel[],
  qualityCoordinates: readonly (number | null)[],
  scoringConfig: ScoringConfig,
  benchmarkPreparation?: BenchmarkScoringPreparation,
  resourceImputation?: EffortResourceImputation,
): ResourceScoreInputs {
  const logBlendedPriceSignals = models.map((model) =>
    log10OnePlusNonnegative(blendedPrice(model)),
  );
  const logBlendedPriceScores = modelBalancedMinMaxScores(models, logBlendedPriceSignals, "lower");
  const qualityAdjustedBlendedPriceScores = qualityLocalResourceScores(
    models,
    qualityCoordinates,
    logBlendedPriceSignals,
  );
  const priceComponentScores = [logBlendedPriceScores, qualityAdjustedBlendedPriceScores] as const;
  const throughputSpeedSignals = models.map((model) =>
    positiveFiniteNumber(model.speed?.throughput_tokens_per_second_median),
  );
  const latencySecondsSignals = models.map((model) =>
    positiveFiniteNumber(model.speed?.latency_seconds_median),
  );
  const e2eSecondsSignals = models.map((model) =>
    positiveFiniteNumber(model.speed?.e2e_latency_seconds_median),
  );
  const throughputSpeedScores = logInputMinMaxScores(throughputSpeedSignals, "higher");
  const latencySpeedScores = logInputMinMaxScores(latencySecondsSignals, "lower");
  const e2eSpeedScores = logInputMinMaxScores(e2eSecondsSignals, "lower");
  const providerSpeedScores = [throughputSpeedScores, latencySpeedScores, e2eSpeedScores] as const;
  const taskTimeComponentEvidence = taskResourceEfficiencyEvidence(
    models,
    scoringConfig,
    "time",
    benchmarkPreparation,
    resourceImputation,
  );
  const taskCostComponentEvidence = taskResourceEfficiencyEvidence(
    models,
    scoringConfig,
    "cost",
    benchmarkPreparation,
    resourceImputation,
  );
  return {
    providerSpeedScores,
    priceComponentScores,
    taskTimeComponentEvidence,
    taskCostComponentEvidence,
  };
}

/** Compute unranked preview Speed and Value from direct evidence with a spec-heavy fallback. */
export function buildPreviewResourceScoreResults(
  models: ModelAtlasScoredCandidate[],
  previewQualityByModel: readonly (ModelAtlasCandidateComponentScores | null)[],
  scoringConfig: ScoringConfig,
): PreviewResourceScoreResult[] {
  const qualityCoordinates = models.map((model, index) => {
    const previewQuality = previewQualityByModel[index];
    return meanOfFinite([
      previewQuality?.intelligence_score ?? model.component_scores?.intelligence_score ?? null,
      previewQuality?.agentic_score ?? model.component_scores?.agentic_score ?? null,
    ]);
  });
  const inputs = buildResourceScoreInputs(models, qualityCoordinates, scoringConfig);
  const speed = scorePreviewResourceDimension(
    inputs.providerSpeedScores,
    inputs.taskTimeComponentEvidence,
  );
  const value = scorePreviewResourceDimension(
    inputs.priceComponentScores,
    inputs.taskCostComponentEvidence,
  );
  return models.map((_, index) => ({
    scores: {
      speed_score: speed.scores[index] ?? null,
      value_score: value.scores[index] ?? null,
    },
    confidence: {
      speed: speed.confidences[index] ?? null,
      value: value.confidences[index] ?? null,
    },
  }));
}

export function attachFinalScores(
  models: ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  benchmarkPreparation?: BenchmarkScoringPreparation,
  resourceImputation?: EffortResourceImputation,
): ModelAtlasScoredCandidate[] {
  const intelligenceScores = models.map(
    (model) => model.component_scores?.intelligence_score ?? null,
  );
  const agenticScores = models.map((model) => model.component_scores?.agentic_score ?? null);
  const qualityCoordinates = models.map((_, index) =>
    meanOfFinite([intelligenceScores[index] ?? null, agenticScores[index] ?? null]),
  );
  const inputs = buildResourceScoreInputs(
    models,
    qualityCoordinates,
    scoringConfig,
    benchmarkPreparation,
    resourceImputation,
  );
  const speed = scoreResourceDimension(
    models,
    inputs.providerSpeedScores,
    inputs.taskTimeComponentEvidence,
  );
  const value = scoreResourceDimension(
    models,
    inputs.priceComponentScores,
    inputs.taskCostComponentEvidence,
  );
  return models.map((model, index) => {
    const intelligenceScore = intelligenceScores[index] ?? null;
    const agenticScore = agenticScores[index] ?? null;
    const speedScore = speed.scores[index] ?? null;
    const valueScore = value.scores[index] ?? null;
    return {
      ...model,
      scores: {
        intelligence_score: intelligenceScore,
        agentic_score: agenticScore,
        speed_score: speedScore,
        value_score: valueScore,
      },
      confidence: {
        ...model.confidence,
        speed: speed.confidences[index] ?? null,
        value: value.confidences[index] ?? null,
      },
    };
  });
}
