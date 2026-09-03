/** Quality-local and model-balanced resource-efficiency scoring. */

import { calibrationObservations } from "../../benchmarks/calibration-population";
import type { BenchmarkResourceQualityCoordinate } from "../../benchmarks/factory";
import { canonicalModelKey } from "../../identity/normalization";
import {
  boundedResidualMultipliers,
  meanOfFinite,
  qualityLocalResiduals,
  weightedPercentileRank,
} from "../../math-utils";
import { logitUnitScore, winsorizedMinMaxScores } from "./normalization";

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
    models.map((model, index) => [
      model,
      calibrationMask?.[index] === false ? null : (values[index] ?? null),
    ]),
  );
  return calibrationObservations(models, (model) => valueByModel.get(model) ?? null);
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

/** Translate model-balanced calibration evidence into the package-wide quality-local comparison. */
function qualityLocalResourceComparisons<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
) {
  const observations = observationsFromValues(
    models,
    qualityCoordinates.map((value, index) => (resourceSignals[index] == null ? null : value)),
    calibrationMask,
  );
  const weights = new Map(observations.map(({ item, weight }) => [item, weight]));
  return qualityLocalResiduals(
    models.map((model, index) => ({
      group: canonicalModelKey(model),
      quality: qualityCoordinates[index] ?? null,
      resource: resourceSignals[index] ?? null,
      weight: weights.get(model) ?? 0,
    })),
    RESOURCE_QUALITY_SIGMA,
    MIN_QUALITY_DEVIATION,
    FULL_RESOURCE_SUPPORT,
  );
}

/** Score resource magnitude after removing the model-balanced local expectation at comparable quality. */
export function qualityLocalResourceScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  const { residuals, supportConfidence } = qualityLocalResourceComparisons(
    models,
    qualityCoordinates,
    resourceSignals,
    calibrationMask,
  );
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

/** Bound a quality-conditioned log-resource residual around one, retaining the original resource MAD scale rather than rescaling residuals. */
export function qualityAdjustedResourceMultipliers<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  logResources: readonly (number | null)[],
  cap: number,
): number[] {
  const observations = observationsFromValues(
    models,
    logResources.map((value, index) => (qualityCoordinates[index] == null ? null : value)),
  );
  const comparisons = qualityLocalResourceComparisons(models, qualityCoordinates, logResources);
  return boundedResidualMultipliers(comparisons, observations, cap);
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
