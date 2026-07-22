/** Model calibration gives each model one total unit of empirical-distribution mass. */

import { canonicalModelKey } from "../identity/normalization";

type CalibrationObservation<T> = {
	modelKey: string;
	item: T;
	value: number;
	weight: number;
};

/** Build finite calibration observations while dividing each model's unit mass across its included variants. */
export function calibrationObservations<
	T extends { id?: unknown; name?: unknown },
>(
	items: readonly T[],
	valueForItem: (item: T) => number | null,
): CalibrationObservation<T>[] {
	const finiteItems = items.flatMap((item) => {
		const value = valueForItem(item);
		return value == null || !Number.isFinite(value)
			? []
			: [{ modelKey: canonicalModelKey(item), item, value }];
	});
	const variantsPerModel = new Map<string, number>();
	for (const { modelKey } of finiteItems) {
		variantsPerModel.set(modelKey, (variantsPerModel.get(modelKey) ?? 0) + 1);
	}
	return finiteItems.map(({ modelKey, item, value }) => ({
		modelKey,
		item,
		value,
		weight: 1 / (variantsPerModel.get(modelKey) ?? 1),
	}));
}

/** Count the independent model units represented by a calibration population. */
export function effectiveModelCount(
	observations: readonly { modelKey: string }[],
): number {
	return new Set(observations.map(({ modelKey }) => modelKey)).size;
}
