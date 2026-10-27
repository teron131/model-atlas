/** Quality-local and model-balanced resource-efficiency scoring. */

import { calibrationObservations } from "../../benchmarks/calibration-population";
import { canonicalModelKey } from "../../identity/normalization";
import {
  clamp,
  effectiveCount,
  gaussianWeight,
  meanOfFinite,
  smoothstep,
  weightedPercentileRanker,
  weightedQuantile,
  weightedRobustDeviation,
  type WeightedValue,
  winsorizedMinMaxScorer,
} from "../../math-utils";

const RESOURCE_QUALITY_SIGMA = 0.5;
const MIN_QUALITY_RANGE_SHARE = 0.35;
const RESOURCE_TAIL_SHARE = 0.025;
const FULL_RESOURCE_SUPPORT = 3;

type QualityResourcePoint = {
  modelKey: string;
  quality: number | null;
  resource: number | null;
  weight: number;
};

type LocalResiduals = {
  residuals: Array<number | null>;
  peerSupport: number[];
};

type LocalResidual = {
  residual: number;
  peerSupport: number;
};

type ResidualPeers = {
  peers: (QualityResourcePoint & { quality: number; resource: number; coordinate: number })[];
  coordinateOf: (quality: number) => number;
};

type ResourceScoreScale = {
  hasMeaningfulSpread: boolean;
  minMaxScore: (residual: number | null) => number | null;
  percentileScore: (residual: number | null) => number | null;
};

/** Blend a stable local trend with the peer mean as peer support grows, evaluating the trend only within observed peer bounds. */
export function qualityLocalResiduals(
  points: readonly QualityResourcePoint[],
  bandwidth: number,
  minimumDeviation: number,
  fullSupport: number,
): LocalResiduals {
  return localResiduals(points, residualPeers(points, minimumDeviation), bandwidth, fullSupport);
}

/** Apply model-balanced favorable-tail anchors to a completed signal. */
export function modelBalancedMinMaxScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  scores: readonly (number | null)[],
  direction: "higher" | "lower",
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  return scores.map(
    winsorizedMinMaxScorer(
      observationsFromValues(models, scores, calibrationMask),
      direction,
      RESOURCE_TAIL_SHARE,
    ),
  );
}

/** Score resource magnitude after removing the model-balanced local expectation at comparable quality. */
export function qualityLocalResourceScores<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
): Array<number | null> {
  const { points, minimumDeviation } = comparisonPopulation(
    models,
    qualityCoordinates,
    resourceSignals,
    calibrationMask,
  );
  const comparisons = qualityLocalResiduals(
    points,
    RESOURCE_QUALITY_SIGMA,
    minimumDeviation,
    FULL_RESOURCE_SUPPORT,
  );
  const scale = resourceScoreScale(models, comparisons, calibrationMask);
  return comparisons.residuals.map((residual, index) =>
    resourceScore(residual, comparisons.peerSupport[index] ?? 0, scale),
  );
}

/**
 * Score one model at any resource signal against the population without it, preparing that population once.
 * The held-out model is neither a peer nor a calibration value, so its signal cannot move any other model's residual or the score scale; each score equals `qualityLocalResourceScores` at that model with only that model masked out.
 */
export function heldOutResourceScorer<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  heldOutIndex: number,
): (resourceSignal: number) => number | null {
  const calibrationMask = models.map((_, index) => index !== heldOutIndex);
  const { points, minimumDeviation } = comparisonPopulation(
    models,
    qualityCoordinates,
    resourceSignals,
    calibrationMask,
  );
  const peers = residualPeers(points, minimumDeviation);
  const heldOut = points[heldOutIndex];
  if (peers == null || heldOut?.quality == null) {
    return () => null;
  }
  const { modelKey, quality } = heldOut;
  const scale = resourceScoreScale(
    models,
    localResiduals(points, peers, RESOURCE_QUALITY_SIGMA, FULL_RESOURCE_SUPPORT),
    calibrationMask,
  );
  return (resourceSignal) => {
    const { residual, peerSupport } = localResidual(
      modelKey,
      quality,
      resourceSignal,
      peers,
      RESOURCE_QUALITY_SIGMA,
      FULL_RESOURCE_SUPPORT,
    );
    return resourceScore(residual, peerSupport, scale);
  };
}

/** Bound a quality-conditioned log-resource residual around one, retaining the original resource MAD scale rather than rescaling residuals. */
export function qualityAdjustedResourceMultipliers<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  logResources: readonly (number | null)[],
  cap: number,
  calibrationMask?: readonly boolean[],
): number[] {
  const observations = observationsFromValues(
    models,
    logResources.map((value, index) => (qualityCoordinates[index] == null ? null : value)),
    calibrationMask,
  );
  const { points, minimumDeviation } = comparisonPopulation(
    models,
    qualityCoordinates,
    logResources,
    calibrationMask,
  );
  return boundedResidualMultipliers(
    qualityLocalResiduals(points, RESOURCE_QUALITY_SIGMA, minimumDeviation, FULL_RESOURCE_SUPPORT),
    observations,
    cap,
  );
}

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

/** A masked or incomplete model weighs zero, so it can be scored but never serves as a peer. */
function comparisonPopulation<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  qualityCoordinates: readonly (number | null)[],
  resourceSignals: readonly (number | null)[],
  calibrationMask?: readonly boolean[],
): { points: QualityResourcePoint[]; minimumDeviation: number } {
  const observations = observationsFromValues(
    models,
    qualityCoordinates.map((value, index) => (resourceSignals[index] == null ? null : value)),
    calibrationMask,
  );
  const weights = new Map(observations.map(({ item, weight }) => [item, weight]));
  const qualityValues = observations.map(({ value }) => value);
  const qualityRange =
    qualityValues.length > 0 ? Math.max(...qualityValues) - Math.min(...qualityValues) : 0;
  const points = models.map((model, index) => ({
    modelKey: canonicalModelKey(model),
    quality: qualityCoordinates[index] ?? null,
    resource: resourceSignals[index] ?? null,
    weight: weights.get(model) ?? 0,
  }));
  return { points, minimumDeviation: MIN_QUALITY_RANGE_SHARE * qualityRange };
}

/** Robust quality coordinates and the weighted peers measured in them; `null` when no point can anchor the coordinates. */
function residualPeers(
  points: readonly QualityResourcePoint[],
  minimumDeviation: number,
): ResidualPeers | null {
  const references = points.filter(
    (point): point is QualityResourcePoint & { quality: number; resource: number } =>
      point.quality != null && point.resource != null && point.weight > 0,
  );
  const observations = references.map((point) => ({ value: point.quality, weight: point.weight }));
  const median = weightedQuantile(observations, 0.5);
  const deviation = weightedRobustDeviation(observations, minimumDeviation);
  if (median == null || deviation == null) return null;
  const coordinateOf = (quality: number) =>
    deviation > 0 ? (quality - median) / deviation : quality === median ? 0 : Infinity;
  return {
    peers: references.map((point) => ({ ...point, coordinate: coordinateOf(point.quality) })),
    coordinateOf,
  };
}

function localResiduals(
  points: readonly QualityResourcePoint[],
  peers: ResidualPeers | null,
  bandwidth: number,
  fullSupport: number,
): LocalResiduals {
  const comparisons = points.map((point) =>
    peers == null || point.quality == null || point.resource == null
      ? null
      : localResidual(point.modelKey, point.quality, point.resource, peers, bandwidth, fullSupport),
  );
  return {
    residuals: comparisons.map((comparison) => comparison?.residual ?? null),
    peerSupport: comparisons.map((comparison) => comparison?.peerSupport ?? 0),
  };
}

/** Compare one point with peers from other models only, so a model's own variants never set its expectation. */
function localResidual(
  modelKey: string,
  quality: number,
  resource: number,
  { peers, coordinateOf }: ResidualPeers,
  bandwidth: number,
  fullSupport: number,
): LocalResidual {
  const coordinate = coordinateOf(quality);
  const comparisons = new Map<string, { resourceTotal: number; weight: number }>();
  let distanceTotal = 0;
  let distanceSquares = 0;
  let distanceResourceTotal = 0;
  let minimumCoordinate = Infinity;
  let maximumCoordinate = -Infinity;
  let minimumResource = Infinity;
  let maximumResource = -Infinity;
  for (const peer of peers) {
    if (peer.modelKey === modelKey) continue;
    const weight = peer.weight * gaussianWeight(coordinate, peer.coordinate, bandwidth);
    if (!(weight > 0)) continue;
    const distance = peer.coordinate - coordinate;
    distanceTotal += weight * distance;
    distanceSquares += weight * distance * distance;
    distanceResourceTotal += weight * distance * peer.resource;
    minimumCoordinate = Math.min(minimumCoordinate, peer.coordinate);
    maximumCoordinate = Math.max(maximumCoordinate, peer.coordinate);
    minimumResource = Math.min(minimumResource, peer.resource);
    maximumResource = Math.max(maximumResource, peer.resource);
    const comparison = comparisons.get(peer.modelKey) ?? { resourceTotal: 0, weight: 0 };
    comparison.resourceTotal += weight * peer.resource;
    comparison.weight += weight;
    comparisons.set(peer.modelKey, comparison);
  }
  const peerModels = [...comparisons.values()];
  const totalWeight = peerModels.reduce((sum, peerModel) => sum + peerModel.weight, 0);
  if (totalWeight <= 0) return { residual: 0, peerSupport: 0 };
  const resourceTotal = peerModels.reduce((sum, peerModel) => sum + peerModel.resourceTotal, 0);
  let expectedSignal = resourceTotal / totalWeight;
  const supportedModelCount = Math.min(
    totalWeight,
    effectiveCount(peerModels.map((peerModel) => peerModel.weight)),
  );
  const peerSupport = smoothstep((supportedModelCount - 1) / (fullSupport - 1));
  const determinant = totalWeight * distanceSquares - distanceTotal ** 2;
  const stableSlope = determinant > Number.EPSILON * totalWeight * distanceSquares * 32;
  if (stableSlope && peerSupport > 0) {
    const intercept =
      (distanceSquares * resourceTotal - distanceTotal * distanceResourceTotal) / determinant;
    const slope =
      (totalWeight * distanceResourceTotal - distanceTotal * resourceTotal) / determinant;
    const offset = clamp(coordinate, minimumCoordinate, maximumCoordinate) - coordinate;
    const fittedSignal = clamp(intercept + slope * offset, minimumResource, maximumResource);
    expectedSignal += peerSupport * (fittedSignal - expectedSignal);
  }
  const residual = resource - expectedSignal;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(resource), Math.abs(expectedSignal)) * 32;
  return { residual: Math.abs(residual) <= tolerance ? 0 : residual, peerSupport };
}

/** Calibrate score anchors on supported residuals of unmasked models only. */
function resourceScoreScale<T extends { id?: unknown; name?: unknown }>(
  models: readonly T[],
  { residuals, peerSupport }: LocalResiduals,
  calibrationMask?: readonly boolean[],
): ResourceScoreScale {
  const supportedResiduals = residuals.map((residual, index) =>
    (peerSupport[index] ?? 0) > 0 ? residual : null,
  );
  const finiteSupportedResiduals = supportedResiduals.filter(
    (residual, index): residual is number =>
      calibrationMask?.[index] !== false && residual != null && Number.isFinite(residual),
  );
  const residualRange =
    finiteSupportedResiduals.length > 1
      ? Math.max(...finiteSupportedResiduals) - Math.min(...finiteSupportedResiduals)
      : 0;
  const residualScale = Math.max(1, ...finiteSupportedResiduals.map(Math.abs));
  const minMaxScore = winsorizedMinMaxScorer(
    observationsFromValues(models, supportedResiduals, calibrationMask),
    "lower",
    RESOURCE_TAIL_SHARE,
  );
  const percentileRank = weightedPercentileRanker(
    observationsFromValues(
      models,
      supportedResiduals.map((residual) => (residual == null ? null : -residual)),
      calibrationMask,
    ),
  );
  return {
    hasMeaningfulSpread: residualRange > Number.EPSILON * residualScale * 32,
    minMaxScore,
    percentileScore: (residual) => (residual == null ? null : percentileRank(-residual)),
  };
}

function resourceScore(
  residual: number | null,
  peerSupport: number,
  scale: ResourceScoreScale,
): number | null {
  if (residual == null) {
    return null;
  }
  if (!scale.hasMeaningfulSpread) {
    return 50;
  }
  const supportedResidual = peerSupport > 0 ? residual : null;
  const hybridScore = meanOfFinite([
    scale.minMaxScore(supportedResidual),
    scale.percentileScore(supportedResidual),
  ]);
  return 50 + peerSupport * ((hybridScore ?? 50) - 50);
}

/** Map residuals to a neutral-one multiplier using the original weighted resource MAD and comparison support. */
function boundedResidualMultipliers(
  comparisons: LocalResiduals,
  referenceValues: readonly WeightedValue[],
  cap: number,
): number[] {
  const median = weightedQuantile(referenceValues, 0.5);
  const mad =
    median == null
      ? null
      : weightedQuantile(
          referenceValues.map(({ value, weight }) => ({
            value: value == null ? null : Math.abs(value - median),
            weight,
          })),
          0.5,
        );
  if (cap === 0 || mad == null || mad <= 0) return comparisons.residuals.map(() => 1);
  const scale = 1.4826 * mad;
  return comparisons.residuals.map((residual, index) =>
    residual == null
      ? 1
      : 1 - cap * comparisons.peerSupport[index]! * clamp(residual / scale / 2, -1, 1),
  );
}
