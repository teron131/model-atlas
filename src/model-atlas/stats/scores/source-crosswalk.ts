/** Model-balanced additive crosswalks project missing primary-source values from overlapping fallback sources. */

import { clamp01, weightedMedianOfFinite } from "../../math-utils";
import {
	calibrationObservations,
	effectiveModelCount,
} from "./calibration-population";

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
	normalizeProjection?: (value: number) => number;
};

type SourceCrosswalk<T extends ModelIdentity> = {
	projectionByItem: ReadonlyMap<T, number>;
	confidence: number | null;
	diagnostic: SourceCrosswalkDiagnostic;
};

/** Fit an additive fallback-to-primary offset and reject it unless model-family-held-out error passes. */
export function buildAdditiveSourceCrosswalk<T extends ModelIdentity>(
	items: readonly T[],
	options: SourceCrosswalkOptions<T>,
): SourceCrosswalk<T> {
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
				Math.abs(offset.value - heldOutOffset),
			);
		}
	}
	const validationErrors = calibrationObservations(
		items,
		(item) => validationErrorByItem.get(item) ?? null,
	);
	const validationModelCount = effectiveModelCount(validationErrors);
	const validationMedianAbsoluteError =
		weightedMedianOfFinite(validationErrors);
	const imputationAllowed =
		options.minimumEffectiveModels > 0 &&
		options.maximumMedianAbsoluteError > 0 &&
		overlapModelCount >= options.minimumEffectiveModels &&
		validationModelCount >= options.minimumEffectiveModels &&
		medianOffset != null &&
		validationMedianAbsoluteError != null &&
		validationMedianAbsoluteError <= options.maximumMedianAbsoluteError;
	const confidence = imputationAllowed
		? clamp01(
				1 -
					(validationMedianAbsoluteError ?? 0) /
						options.maximumMedianAbsoluteError,
			)
		: null;
	const projectionByItem = new Map<T, number>();
	if (imputationAllowed && medianOffset != null) {
		for (const item of items) {
			const fallback = options.fallbackValue(item);
			if (fallback == null || options.primaryValue(item) != null) {
				continue;
			}
			const rawProjection = fallback - medianOffset;
			const projection =
				options.normalizeProjection?.(rawProjection) ?? rawProjection;
			if (Number.isFinite(projection)) {
				projectionByItem.set(item, projection);
			}
		}
	}
	return {
		projectionByItem,
		confidence,
		diagnostic: {
			overlapModelCount,
			medianOffset,
			validationModelCount,
			validationMedianAbsoluteError,
			imputationAllowed,
		},
	};
}
