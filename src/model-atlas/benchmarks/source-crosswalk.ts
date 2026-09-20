/** Model-balanced additive crosswalks reconcile sources onto source A or weighted aggregate targets. */

import { clamp01, weightedMedianOfFinite } from "../math-utils";
import { calibrationObservations, distinctModelCount } from "./calibration-population";

type ModelIdentity = {
  id?: unknown;
  name?: unknown;
};

export type SourceCrosswalkDiagnostic = {
  overlapModelCount: number;
  /** Typical signed difference B minus A, fitted with model-balanced weights. */
  delta: number | null;
  validationModelCount: number;
  validationMedianAbsoluteError: number | null;
  imputationAllowed: boolean;
};

type SourceCrosswalkOptions<T extends ModelIdentity> = {
  sourceAValue: (item: T) => number | null;
  sourceBValue: (item: T) => number | null;
  minimumEffectiveModels: number;
  maximumMedianAbsoluteError: number;
  /** Weight of source B in the target; benchmark fusion defaults to equal source weight. */
  sourceBWeight?: number;
  normalizeProjection?: (value: number) => number;
};

type SourceCrosswalk<T extends ModelIdentity> = {
  projectionByItem: ReadonlyMap<T, number>;
  project: (sourceA: number | null, sourceB: number | null) => number | null;
  confidence: number | null;
  diagnostic: SourceCrosswalkDiagnostic;
};

/** Fit a model-held-out additive crosswalk onto a weighted source target; paired observations need no prediction, and missing-source projections require validation. */
export function buildAdditiveSourceCrosswalk<T extends ModelIdentity>(
  items: readonly T[],
  options: SourceCrosswalkOptions<T>,
): SourceCrosswalk<T> {
  const sourceBWeight = options.sourceBWeight ?? 0.5;
  if (!Number.isFinite(sourceBWeight) || sourceBWeight < 0 || sourceBWeight > 1)
    throw new Error("Crosswalk source B weight must be between zero and one");
  const offsets = calibrationObservations(items, (item) => {
    const sourceB = options.sourceBValue(item);
    const sourceA = options.sourceAValue(item);
    return sourceB == null || sourceA == null ? null : sourceB - sourceA;
  });
  const overlapModelCount = distinctModelCount(offsets);
  const delta = weightedMedianOfFinite(offsets);
  const validationErrorByItem = new Map<T, number>();
  for (const offset of offsets) {
    const heldOutOffset = weightedMedianOfFinite(
      offsets.filter((candidate) => candidate.modelKey !== offset.modelKey),
    );
    if (heldOutOffset != null) {
      validationErrorByItem.set(
        offset.item,
        Math.abs(offset.value - heldOutOffset) * Math.max(sourceBWeight, 1 - sourceBWeight),
      );
    }
  }
  const validationErrors = calibrationObservations(
    items,
    (item) => validationErrorByItem.get(item) ?? null,
  );
  const validationModelCount = distinctModelCount(validationErrors);
  const validationMedianAbsoluteError = weightedMedianOfFinite(validationErrors);
  const imputationAllowed =
    options.minimumEffectiveModels > 0 &&
    options.maximumMedianAbsoluteError > 0 &&
    overlapModelCount >= options.minimumEffectiveModels &&
    validationModelCount >= options.minimumEffectiveModels &&
    delta != null &&
    validationMedianAbsoluteError != null &&
    validationMedianAbsoluteError <= options.maximumMedianAbsoluteError;
  const confidence = imputationAllowed
    ? clamp01(1 - (validationMedianAbsoluteError ?? 0) / options.maximumMedianAbsoluteError)
    : null;
  const projectionByItem = new Map<T, number>();
  for (const item of items) {
    const sourceA = options.sourceAValue(item);
    const sourceB = options.sourceBValue(item);
    if (sourceBWeight === 0 && sourceA != null) continue;
    const projection = project(sourceA, sourceB);
    if (projection != null) projectionByItem.set(item, projection);
  }
  return {
    projectionByItem,
    project,
    confidence,
    diagnostic: {
      overlapModelCount,
      delta,
      validationModelCount,
      validationMedianAbsoluteError,
      imputationAllowed,
    },
  };

  /** Apply this fitted target to another pair, including source-default summaries that were not calibration observations. */
  function project(sourceA: number | null, sourceB: number | null): number | null {
    // A single-source target needs no imputation when that source is observed.
    let rawProjection: number;
    if (sourceBWeight === 0 && sourceA != null) rawProjection = sourceA;
    else if (sourceBWeight === 1 && sourceB != null) rawProjection = sourceB;
    else {
      if (sourceA == null && sourceB == null) return null;
      if (sourceA == null || sourceB == null) {
        if (!imputationAllowed || delta == null) return null;
        if (sourceA == null) sourceA = sourceB! - delta;
        else sourceB = sourceA + delta;
      }
      rawProjection = (1 - sourceBWeight) * sourceA! + sourceBWeight * sourceB!;
    }
    const projection = options.normalizeProjection?.(rawProjection) ?? rawProjection;
    return Number.isFinite(projection) ? projection : null;
  }
}
