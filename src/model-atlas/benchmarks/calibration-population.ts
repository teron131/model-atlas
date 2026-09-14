/** Model calibration gives each model one total unit of empirical-distribution mass. */

import { canonicalModelKey } from "../identity/normalization";

type CalibrationObservation<T> = {
  modelKey: string;
  item: T;
  value: number;
  weight: number;
};

/** Build finite calibration observations while dividing each model's unit mass across its included variants. */
export function calibrationObservations<T extends { id?: unknown; name?: unknown }>(
  items: readonly T[],
  valueForItem: (item: T) => number | null,
): CalibrationObservation<T>[] {
  const finiteItems = items.flatMap((item) => {
    const value = valueForItem(item);
    return value == null || !Number.isFinite(value)
      ? []
      : [{ modelKey: canonicalModelKey(item), item, value }];
  });
  const weights = modelCalibrationWeights(finiteItems.map(({ modelKey }) => modelKey));
  return finiteItems.map(({ modelKey, item, value }, index) => ({
    modelKey,
    item,
    value,
    weight: weights[index]!,
  }));
}

/** Count the independent model units represented by a calibration population. */
export function effectiveModelCount(observations: readonly { modelKey: string }[]): number {
  return new Set(observations.map(({ modelKey }) => modelKey)).size;
}

/** Divide each resolved model's unit mass across its included observations without renormalizing caller-owned identities. */
export function modelCalibrationWeights(modelKeys: readonly string[]): number[] {
  const counts = new Map<string, number>();
  for (const key of modelKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return modelKeys.map((key) => 1 / counts.get(key)!);
}
