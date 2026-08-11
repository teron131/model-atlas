/** Final component scoring for public Model Atlas model rows. */

import type { ScoringConfig } from "../../config/stage";
import { canonicalModelKey, reasoningEffortRank } from "../../identity/normalization";
import {
  log10OnePlusNonnegative,
  meanOfFinite,
  nonnegativeFiniteNumber,
  positiveFiniteNumber,
  weightedMeanOfFinite,
} from "../../numeric";
import type { ModelAtlasCandidate, ModelAtlasScoredCandidate } from "../model-types";
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

const ACTIVE_COMPONENT_WEIGHT = 1;
type WeightedSignal = {
  value: number | null;
  weight: number;
};

type WeightedResourceEfficiencyEvidence = {
  benchmarkKeys: readonly string[];
  signalsByModel: WeightedSignal[][];
};

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

function blendedPrice(model: ModelAtlasCandidate): number | null {
  return nonnegativeFiniteNumber(model.cost?.blended_price) ?? blendedPriceValue(model.cost);
}

function taskResourceEfficiencyEvidence(
  models: ModelAtlasCandidate[],
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
  totalCount: number,
  score: number | null,
): number | null {
  return score == null ? null : Math.min(1, finiteSignalWeight(signals) / totalCount);
}

/** Use the source-default variant's coverage uniformly across every reasoning effort. */
function defaultVariantCoverageMultipliers(
  models: readonly ModelAtlasCandidate[],
  signalsByModel: readonly WeightedSignal[][],
  totalCount: number,
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
      totalCount,
    );
    for (const index of indexes) {
      multipliers[index] = multiplier;
    }
  }
  return multipliers;
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
  const speedSignalsByModel = models.map((_, index) => [
    ...providerSpeedScores.map((scores) => ({
      value: scores[index] ?? null,
      weight: ACTIVE_COMPONENT_WEIGHT,
    })),
    ...(taskTimeComponentEvidence.signalsByModel[index] ?? []),
  ]);
  const speedEstimates = speedSignalsByModel.map((signals) => weightedMeanOfFinite(signals));
  const speedCoverageMultipliers = defaultVariantCoverageMultipliers(
    models,
    speedSignalsByModel,
    taskTimeComponentEvidence.benchmarkKeys.length + providerSpeedScores.length,
  );
  const speedScores = speedEstimates.map((estimate, index) =>
    estimate == null ? null : estimate * (speedCoverageMultipliers[index] ?? 0),
  );
  const speedConfidences = speedSignalsByModel.map((signals, index) =>
    evidenceConfidence(
      signals,
      taskTimeComponentEvidence.benchmarkKeys.length + providerSpeedScores.length,
      speedScores[index] ?? null,
    ),
  );
  const valueSignalsByModel = models.map((_, index) => [
    ...priceComponentScores.map((scores) => ({
      value: scores[index] ?? null,
      weight: ACTIVE_COMPONENT_WEIGHT,
    })),
    ...(taskCostComponentEvidence.signalsByModel[index] ?? []),
  ]);
  const valueEstimates = valueSignalsByModel.map((signals) => weightedMeanOfFinite(signals));
  const valueCoverageMultipliers = defaultVariantCoverageMultipliers(
    models,
    valueSignalsByModel,
    taskCostComponentEvidence.benchmarkKeys.length + priceComponentScores.length,
  );
  const valueScores = valueEstimates.map((estimate, index) =>
    estimate == null ? null : estimate * (valueCoverageMultipliers[index] ?? 0),
  );
  const valueConfidences = valueSignalsByModel.map((signals, index) =>
    evidenceConfidence(
      signals,
      taskCostComponentEvidence.benchmarkKeys.length + priceComponentScores.length,
      valueScores[index] ?? null,
    ),
  );
  return models.map((model, index) => {
    const intelligenceScore = intelligenceScores[index] ?? null;
    const agenticScore = agenticScores[index] ?? null;
    const speedScore = speedScores[index] ?? null;
    const valueScore = valueScores[index] ?? null;
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
        speed: speedConfidences[index] ?? null,
        value: valueConfidences[index] ?? null,
      },
    };
  });
}
