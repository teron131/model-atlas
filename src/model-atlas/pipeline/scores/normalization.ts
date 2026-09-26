/** Score normalization, evidence retention, coverage multipliers, and robust calibration. */

import {
  clamp,
  clamp01,
  smoothstep,
  weightedQuantile,
  type WeightedScorePart,
} from "../../math-utils";

const COVERAGE_MULTIPLIER_FLOOR = 0.1;
const COVERAGE_MULTIPLIER_FULL = 0.6;

export type MinMaxRange = {
  min: number;
  max: number;
};

/** Clamp public score-scale values to 0-100 after normalization or interpolation. */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function probabilityLogit(value: number): number {
  const clamped = clamp(value, 0.001, 0.999);
  return Math.log(clamped / (1 - clamped));
}

/** Transform a declared 0-1 probability-like score into its finite log-odds coordinate. */
export function logitUnitScore(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`Logit quality coordinates require a finite 0-1 score, received ${value}`);
  }
  return probabilityLogit(value);
}

export function coverageMultiplier(supportedWeight: number, totalWeight: number) {
  if (totalWeight <= 0) {
    return 0;
  }
  const coverage = supportedWeight / totalWeight;
  if (coverage >= COVERAGE_MULTIPLIER_FULL) {
    return 1;
  }
  return smoothstep(
    (coverage - COVERAGE_MULTIPLIER_FLOOR) / (COVERAGE_MULTIPLIER_FULL - COVERAGE_MULTIPLIER_FLOOR),
  );
}

/** Calculate the retention factor from supported weight between the configured thresholds. */
export function evidenceRetentionFactor(
  supportedWeight: number,
  floor: number,
  full: number,
): number {
  if (
    !Number.isFinite(supportedWeight) ||
    !Number.isFinite(floor) ||
    !Number.isFinite(full) ||
    floor < 0 ||
    full <= floor
  ) {
    throw new RangeError(
      `Evidence confidence requires finite mass and 0 <= floor < full, received ${supportedWeight}, ${floor}, ${full}`,
    );
  }
  if (supportedWeight >= full) {
    return 1;
  }
  return smoothstep((supportedWeight - floor) / (full - floor));
}

/** Prepare finite reference bounds once so a population can be normalized without rescanning it for every value. */
export function minMaxRange(values: ReadonlyArray<number | null>): MinMaxRange | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return min === Infinity ? null : { min, max };
}

/** Map a metric linearly within its observed range; quality callers clamp estimates to the public score bounds. */
export function minMaxScale(range: MinMaxRange | null, value: number | null): number | null {
  if (value == null || range == null) return null;
  if (range.max === range.min) return 100;
  const position = (value - range.min) / (range.max - range.min);
  return position * 100;
}

/** Min-max normalize finite signals in the requested scoring direction. */
export function minMaxScores(
  values: ReadonlyArray<number | null>,
  direction: "higher" | "lower",
): Array<number | null> {
  const directionMultiplier = direction === "higher" ? 1 : -1;
  const directedValues = values.map((value) =>
    value != null && Number.isFinite(value) ? directionMultiplier * value : null,
  );
  const range = minMaxRange(directedValues);
  return directedValues.map((value) => minMaxScale(range, value));
}

/** Min-max normalize against weighted anchors while winsorizing only the favorable tail. */
export function winsorizedMinMaxScores(
  values: ReadonlyArray<number | null>,
  calibrationValues: readonly WeightedScorePart[],
  direction: "higher" | "lower",
  tailShare: number,
): Array<number | null> {
  const boundedTailShare = Math.min(0.5, clamp01(tailShare));
  const lower = weightedQuantile(calibrationValues, direction === "lower" ? boundedTailShare : 0);
  const upper = weightedQuantile(
    calibrationValues,
    direction === "higher" ? 1 - boundedTailShare : 1,
  );
  if (lower == null || upper == null) {
    return values.map(() => null);
  }
  if (upper <= lower) {
    return values.map((value) => (value == null || !Number.isFinite(value) ? null : 100));
  }
  return values.map((value) => {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }
    const normalized = (clamp(value, lower, upper) - lower) / (upper - lower);
    return 100 * (direction === "higher" ? normalized : 1 - normalized);
  });
}

/** Log raw positive inputs before min-max normalization in the requested direction. */
export function logInputMinMaxScores(
  values: ReadonlyArray<number | null>,
  direction: "higher" | "lower",
): Array<number | null> {
  return minMaxScores(
    values.map((value) =>
      value != null && Number.isFinite(value) && value > 0 ? Math.log(value) : null,
    ),
    direction,
  );
}
