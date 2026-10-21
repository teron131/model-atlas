/** Scoring policy owns public score bounds, evidence retention, and coverage thresholds above shared numeric normalization. */

import { clamp, linearScale, smoothstep } from "../../math-utils";

const COVERAGE_MULTIPLIER_FLOOR = 0.1;
const COVERAGE_MULTIPLIER_FULL = 0.6;

export function clampScore(value: number): number {
  return clamp(value, 0, 100);
}

/** Grant no coverage credit through 10% of active weight and full credit at 60%; no active weight yields zero. */
export function coverageMultiplier(supportedWeight: number, totalWeight: number) {
  if (totalWeight <= 0) {
    return 0;
  }
  const coverage = supportedWeight / totalWeight;
  if (coverage >= COVERAGE_MULTIPLIER_FULL) {
    return 1;
  }
  return smoothstep(
    linearScale({ min: COVERAGE_MULTIPLIER_FLOOR, max: COVERAGE_MULTIPLIER_FULL }, coverage)!,
  );
}

/** Zero at or below `floor`, one at or above `full`, and a smoothstep between; invalid thresholds throw a `RangeError`. */
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
  return smoothstep(linearScale({ min: floor, max: full }, supportedWeight)!);
}
