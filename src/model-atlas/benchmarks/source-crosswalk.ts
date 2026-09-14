/** Model-balanced additive crosswalks reconcile sources onto primary or weighted aggregate targets. */

import { clamp01, weightedMedianOfFinite } from "../math-utils";
import { calibrationObservations, effectiveModelCount } from "./calibration-population";

type ModelIdentity = {
  id?: unknown;
  name?: unknown;
};

export type SourceCrosswalkDiagnostic = {
  overlapModelCount: number;
  medianOffset: number | null;
  validationModelCount: number;
  validationMedianAbsoluteError: number | null;
  imputationAllowed: boolean;
};

type SourceCrosswalkOptions<T extends ModelIdentity> = {
  primaryValue: (item: T) => number | null;
  fallbackValue: (item: T) => number | null;
  minimumEffectiveModels: number;
  maximumMedianAbsoluteError: number;
  /** Weight of the fallback source in the target; benchmark fusion defaults to equal source weight. */
  fallbackWeight?: number;
  normalizeProjection?: (value: number) => number;
};

type SourceCrosswalk<T extends ModelIdentity> = {
  projectionByItem: ReadonlyMap<T, number>;
  project: (primary: number | null, fallback: number | null) => number | null;
  confidence: number | null;
  diagnostic: SourceCrosswalkDiagnostic;
};

/** Fit a model-held-out additive crosswalk onto a weighted source target; paired observations need no prediction, and missing-source projections require validation. */
export function buildAdditiveSourceCrosswalk<T extends ModelIdentity>(
  items: readonly T[],
  options: SourceCrosswalkOptions<T>,
): SourceCrosswalk<T> {
  const fallbackWeight = options.fallbackWeight ?? 0.5;
  if (!Number.isFinite(fallbackWeight) || fallbackWeight < 0 || fallbackWeight > 1)
    throw new Error("Crosswalk fallback weight must be between zero and one");
  const offsets = calibrationObservations(items, (item) => {
    const fallback = options.fallbackValue(item);
    const primary = options.primaryValue(item);
    return fallback == null || primary == null ? null : fallback - primary;
  });
  const overlapModelCount = effectiveModelCount(offsets);
  const medianOffset = weightedMedianOfFinite(offsets);
  const validationErrorByItem = new Map<T, number>();
  for (const offset of offsets) {
    const heldOutOffset = weightedMedianOfFinite(
      offsets.filter((candidate) => candidate.modelKey !== offset.modelKey),
    );
    if (heldOutOffset != null) {
      validationErrorByItem.set(
        offset.item,
        Math.abs(offset.value - heldOutOffset) * Math.max(fallbackWeight, 1 - fallbackWeight),
      );
    }
  }
  const validationErrors = calibrationObservations(
    items,
    (item) => validationErrorByItem.get(item) ?? null,
  );
  const validationModelCount = effectiveModelCount(validationErrors);
  const validationMedianAbsoluteError = weightedMedianOfFinite(validationErrors);
  const imputationAllowed =
    options.minimumEffectiveModels > 0 &&
    options.maximumMedianAbsoluteError > 0 &&
    overlapModelCount >= options.minimumEffectiveModels &&
    validationModelCount >= options.minimumEffectiveModels &&
    medianOffset != null &&
    validationMedianAbsoluteError != null &&
    validationMedianAbsoluteError <= options.maximumMedianAbsoluteError;
  const confidence = imputationAllowed
    ? clamp01(1 - (validationMedianAbsoluteError ?? 0) / options.maximumMedianAbsoluteError)
    : null;
  const projectionByItem = new Map<T, number>();
  for (const item of items) {
    const primary = options.primaryValue(item);
    const fallback = options.fallbackValue(item);
    if (fallbackWeight === 0 && primary != null) continue;
    const projection = project(primary, fallback);
    if (projection != null) projectionByItem.set(item, projection);
  }
  return {
    projectionByItem,
    project,
    confidence,
    diagnostic: {
      overlapModelCount,
      medianOffset,
      validationModelCount,
      validationMedianAbsoluteError,
      imputationAllowed,
    },
  };

  /** Apply this fitted target to another pair, including source-default summaries that were not calibration observations. */
  function project(primary: number | null, fallback: number | null): number | null {
    let rawProjection: number | null = null;
    if (fallbackWeight === 0 && primary != null) rawProjection = primary;
    else if (fallbackWeight === 1 && fallback != null) rawProjection = fallback;
    else if (primary != null && fallback != null) {
      rawProjection = (1 - fallbackWeight) * primary + fallbackWeight * fallback;
    } else if (imputationAllowed && medianOffset != null) {
      if (primary == null && fallback != null)
        rawProjection = fallback - (1 - fallbackWeight) * medianOffset;
      else if (fallbackWeight > 0 && primary != null && fallback == null)
        rawProjection = primary + fallbackWeight * medianOffset;
    }
    if (rawProjection == null) return null;
    const projection = options.normalizeProjection?.(rawProjection) ?? rawProjection;
    return Number.isFinite(projection) ? projection : null;
  }
}
