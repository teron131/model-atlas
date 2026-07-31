/** Quality-local and model-balanced resource-efficiency scoring. */

import { calibrationObservations } from "../../benchmarks/calibration-population";
import type { BenchmarkResourceQualityCoordinate } from "../../benchmarks/factory";
import { canonicalModelKey } from "../../identity/normalization";
import {
  effectiveSampleSize,
  gaussianWeight,
  meanOfFinite,
  smoothstep,
  weightedPercentileRank,
  weightedQuantile,
} from "../../numeric";
import { logitUnitScore, weightedRobustDeviation, winsorizedMinMaxScores } from "./normalization";

const RESOURCE_QUALITY_SIGMA = 0.5;
const MIN_QUALITY_DEVIATION = 0.35;
const RESOURCE_TAIL_SHARE = 0.025;
const FULL_RESOURCE_SUPPORT = 3;

function observationsFromValues<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  values: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
) {
  const valueByModel = new Map(
    models.map((model, index) => [model, values[index] ?? null] as const),
  );
  const modelIndexByModel = new Map(models.map((model, index) => [model, index] as const));
  return calibrationObservations(models, (model) => {
    const index = modelIndexByModel.get(model);
    return index == null || calibrationMask?.[index] === false
      ? null
      : (valueByModel.get(model) ?? null);
  });
}

/** Apply model-balanced favorable-tail anchors to a completed signal. */
export function modelBalancedMinMaxScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  scores: readonly (number | null)[],
  direction: "higher" | "lower",
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  return winsorizedMinMaxScores(
    scores,
    observationsFromValues(models, scores, calibrationMask),
    direction,
    RESOURCE_TAIL_SHARE,
  );
}

/** Score resource magnitude after removing the model-balanced local expectation at comparable quality. */
export function qualityLocalResourceScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  const modelIndexByModel = new Map(models.map((model, index) => [model, index] as const));
  const qualityObservations = calibrationObservations(models, (model) => {
    const modelIndex = modelIndexByModel.get(model);
    const qualityCoordinate = modelIndex == null ? null : (qualityCoordinates[modelIndex] ?? null);
    const resourceSignal = modelIndex == null ? null : (resourceSignals[modelIndex] ?? null);
    return qualityCoordinate == null ||
      resourceSignal == null ||
      calibrationMask?.[modelIndex ?? -1] === false
      ? null
      : qualityCoordinate;
  });
  const benchmarkQualityMedian = weightedQuantile(qualityObservations, 0.5);
  const benchmarkQualityDeviation = weightedRobustDeviation(
    qualityObservations,
    MIN_QUALITY_DEVIATION,
  );
  if (benchmarkQualityMedian == null || benchmarkQualityDeviation == null) {
    return models.map(() => null);
  }
  const calibrationWeightByModel = new Map(
    qualityObservations.map(({ item, weight }) => [item, weight] as const),
  );
  const points = models.flatMap((model, modelIndex) => {
    const quality = qualityCoordinates[modelIndex] ?? null;
    const resourceSignal = resourceSignals[modelIndex] ?? null;
    return quality == null || resourceSignal == null
      ? []
      : [
          {
            modelIndex,
            modelKey: canonicalModelKey(model),
            qualityDeviation: (quality - benchmarkQualityMedian) / benchmarkQualityDeviation,
            resourceSignal,
          },
        ];
  });
  const calibrationPoints = points.flatMap((point) => {
    const model = models[point.modelIndex];
    const calibrationWeight = model == null ? null : calibrationWeightByModel.get(model);
    return calibrationWeight == null ? [] : [{ ...point, calibrationWeight }];
  });
  const residuals = models.map(() => null as number | null);
  const supportConfidence = models.map(() => 0);
  for (const point of points) {
    residuals[point.modelIndex] = 0;
    const comparisonsByModel = new Map<string, { resourceTotal: number; weight: number }>();
    for (const comparisonPoint of calibrationPoints) {
      if (comparisonPoint.modelKey === point.modelKey) {
        continue;
      }
      const weight =
        comparisonPoint.calibrationWeight *
        gaussianWeight(
          point.qualityDeviation,
          comparisonPoint.qualityDeviation,
          RESOURCE_QUALITY_SIGMA,
        );
      const comparison = comparisonsByModel.get(comparisonPoint.modelKey) ?? {
        resourceTotal: 0,
        weight: 0,
      };
      comparison.resourceTotal += weight * comparisonPoint.resourceSignal;
      comparison.weight += weight;
      comparisonsByModel.set(comparisonPoint.modelKey, comparison);
    }
    const comparisons = [...comparisonsByModel.values()];
    const totalWeight = comparisons.reduce((sum, comparison) => sum + comparison.weight, 0);
    if (totalWeight > 0) {
      residuals[point.modelIndex] =
        point.resourceSignal -
        comparisons.reduce((sum, comparison) => sum + comparison.resourceTotal, 0) / totalWeight;
      const effectivePeers = Math.min(
        totalWeight,
        effectiveSampleSize(comparisons.map((comparison) => comparison.weight)),
      );
      supportConfidence[point.modelIndex] = smoothstep(
        (effectivePeers - 1) / (FULL_RESOURCE_SUPPORT - 1),
      );
    }
  }
  const supportedResiduals = residuals.map((residual, index) =>
    (supportConfidence[index] ?? 0) > 0 ? residual : null,
  );
  const calibrationResiduals = supportedResiduals.map((residual, index) =>
    calibrationMask?.[index] === false ? null : residual,
  );
  const finiteSupportedResiduals = calibrationResiduals.filter(
    (residual): residual is number => residual != null && Number.isFinite(residual),
  );
  const residualRange =
    finiteSupportedResiduals.length > 1
      ? Math.max(...finiteSupportedResiduals) - Math.min(...finiteSupportedResiduals)
      : 0;
  const residualScale = Math.max(1, ...finiteSupportedResiduals.map(Math.abs));
  const hasMeaningfulSpread = residualRange > Number.EPSILON * residualScale * 32;
  if (!hasMeaningfulSpread) {
    return residuals.map((residual) => (residual == null ? null : 50));
  }
  const minMaxScores = modelBalancedMinMaxScores(
    models,
    supportedResiduals,
    "lower",
    calibrationMask,
  );
  const inverseResidualObservations = observationsFromValues(
    models,
    supportedResiduals.map((residual) => (residual == null ? null : -residual)),
    calibrationMask,
  );
  const percentileScores = supportedResiduals.map((residual) =>
    residual == null ? null : weightedPercentileRank(inverseResidualObservations, -residual),
  );
  return residuals.map((residual, index) => {
    if (residual == null) {
      return null;
    }
    const confidence = supportConfidence[index] ?? 0;
    const hybridScore = meanOfFinite([
      minMaxScores[index] ?? null,
      percentileScores[index] ?? null,
    ]);
    return 50 + confidence * ((hybridScore ?? 50) - 50);
  });
}

/** Score benchmark resource use within quality-local comparisons. */
export function benchmarkResourceEfficiencyScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  benchmarkScores: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  qualityCoordinate: BenchmarkResourceQualityCoordinate,
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  return qualityLocalResourceScores(
    models,
    benchmarkScores.map((score) =>
      score == null || qualityCoordinate === "linear" ? score : logitUnitScore(score),
    ),
    resourceSignals,
    calibrationMask,
  );
}
