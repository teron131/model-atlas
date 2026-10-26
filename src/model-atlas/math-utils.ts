/** Package-wide numeric and statistical primitives used across Model Atlas domains. */

export type NumberOrNull = number | null;

export type MinMaxRange = {
  min: number;
  max: number;
};

export type WeightedValue = {
  value: number | null;
  weight: number;
};

type FiniteWeightedValue = {
  value: number;
  weight: number;
};

/** Estimate an IQR-based standard-deviation-like spread with an explicit floor. */
export function weightedRobustDeviation(
  values: readonly WeightedValue[],
  minimumDeviation: number,
): number | null {
  const q25 = weightedQuantile(values, 0.25);
  const q75 = weightedQuantile(values, 0.75);
  return q25 == null || q75 == null ? null : Math.max((q75 - q25) / 1.349, minimumDeviation);
}

export function positiveFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function nonnegativeFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function meanOfFinite(values: Array<number | null>): number | null {
  const finite = finiteValues(values);
  if (finite.length === 0) {
    return null;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function finiteValues(values: ReadonlyArray<number | null | undefined>): number[] {
  return values.filter((value): value is number => value != null && Number.isFinite(value));
}

export function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

/** Pearson correlation needs paired arrays with at least two observations; a constant coordinate has no defined correlation. */
export function pearsonCorrelation(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (const [index, value] of left.entries()) {
    const leftOffset = value - leftMean;
    const rightOffset = (right[index] ?? rightMean) - rightMean;
    covariance += leftOffset * rightOffset;
    leftVariance += leftOffset * leftOffset;
    rightVariance += rightOffset * rightOffset;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : covariance / denominator;
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

/** Map reference bounds to 0–1 without clamping; missing inputs stay missing, and equal bounds map every value to 1. */
export function linearScale(range: MinMaxRange | null, value: number | null): number | null {
  if (value == null || range == null) return null;
  if (range.max === range.min) return 1;
  return (value - range.min) / (range.max - range.min);
}

/** Express linear scaling in 0–100 score units while retaining missing values and unclamped extrapolation. */
export function linearScore(range: MinMaxRange | null, value: number | null): number | null {
  const position = linearScale(range, value);
  return position == null ? null : position * 100;
}

/** Scores land on 0–100, with `"lower"` putting the smallest value at 100; nonfinite inputs stay `null`. */
export function minMaxScores(
  values: ReadonlyArray<number | null>,
  direction: "higher" | "lower",
): Array<number | null> {
  const directionMultiplier = direction === "higher" ? 1 : -1;
  const directedValues = values.map((value) =>
    value != null && Number.isFinite(value) ? directionMultiplier * value : null,
  );
  const range = minMaxRange(directedValues);
  return directedValues.map((value) => linearScore(range, value));
}

/** Min-max normalize against weighted anchors while winsorizing only the favorable tail, preparing the anchors once for every value scored. */
export function winsorizedMinMaxScorer(
  calibrationValues: readonly WeightedValue[],
  direction: "higher" | "lower",
  tailShare: number,
): (value: number | null) => number | null {
  const boundedTailShare = Math.min(0.5, clamp01(tailShare));
  const lower = weightedQuantile(calibrationValues, direction === "lower" ? boundedTailShare : 0);
  const upper = weightedQuantile(
    calibrationValues,
    direction === "higher" ? 1 - boundedTailShare : 1,
  );
  return (value) => {
    if (lower == null || upper == null || value == null || !Number.isFinite(value)) {
      return null;
    }
    if (upper <= lower) {
      return 100;
    }
    const normalized = (clamp(value, lower, upper) - lower) / (upper - lower);
    return 100 * (direction === "higher" ? normalized : 1 - normalized);
  };
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

export function weightedMeanOfFinite(parts: WeightedValue[]): number | null {
  const finiteParts = parts.filter(
    (part): part is { value: number; weight: number } =>
      part.value != null &&
      Number.isFinite(part.value) &&
      Number.isFinite(part.weight) &&
      part.weight > 0,
  );
  if (finiteParts.length === 0) {
    return null;
  }
  const totalWeight = finiteParts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) {
    return null;
  }
  return finiteParts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;
}

export function weightedFinitePartCount(parts: WeightedValue[]): number {
  return parts.filter(
    (part) =>
      part.value != null &&
      Number.isFinite(part.value) &&
      Number.isFinite(part.weight) &&
      part.weight > 0,
  ).length;
}

/** Convert unequal positive weights into the equivalent count of equally weighted observations. */
export function effectiveCount(weights: readonly number[]): number {
  const finiteWeights = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  const totalWeight = finiteWeights.reduce((sum, weight) => sum + weight, 0);
  const squaredWeightTotal = finiteWeights.reduce((sum, weight) => sum + weight ** 2, 0);
  return squaredWeightTotal > 0 ? totalWeight ** 2 / squaredWeightTotal : 0;
}

/** Combine finite positive weights for equal values while retaining first-seen value order. */
function aggregateWeightedValues(parts: readonly WeightedValue[]): FiniteWeightedValue[] {
  const weightByValue = new Map<number, number>();
  for (const part of parts) {
    if (
      part.value == null ||
      !Number.isFinite(part.value) ||
      !Number.isFinite(part.weight) ||
      part.weight <= 0
    ) {
      continue;
    }
    weightByValue.set(part.value, (weightByValue.get(part.value) ?? 0) + part.weight);
  }
  return [...weightByValue].map(([value, weight]) => ({ value, weight }));
}

/** Generalize the empirical less-than-or-equal percentile to weighted observations, aggregating the distribution once for every value ranked. */
export function weightedPercentileRanker(
  parts: readonly WeightedValue[],
): (value: number | null) => number | null {
  const observations = aggregateWeightedValues(parts);
  const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  return (value) => {
    if (value == null || !Number.isFinite(value) || totalWeight <= 0) {
      return null;
    }
    const lessOrEqualWeight = observations.reduce(
      (sum, observation) => (observation.value <= value ? sum + observation.weight : sum),
      0,
    );
    return Number(((100 * lessOrEqualWeight) / totalWeight).toFixed(4));
  };
}

/** Invert cumulative weight without spreading tied mass across gaps; average adjacent values only at an exact mass boundary. */
export function weightedQuantile(parts: readonly WeightedValue[], quantile: number): number | null {
  const observations = aggregateWeightedValues(parts).sort(
    (left, right) => left.value - right.value,
  );
  if (observations.length === 0) {
    return null;
  }
  if (quantile <= 0) return observations[0]!.value;
  if (quantile >= 1) return observations.at(-1)!.value;
  const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  const targetWeight = clamp01(quantile) * totalWeight;
  const tolerance = Number.EPSILON * totalWeight * 8;
  let cumulativeWeight = 0;
  for (const [index, observation] of observations.entries()) {
    cumulativeWeight += observation.weight;
    if (targetWeight < cumulativeWeight - tolerance) return observation.value;
    if (Math.abs(targetWeight - cumulativeWeight) <= tolerance) {
      const next = observations[index + 1];
      return next == null ? observation.value : (observation.value + next.value) / 2;
    }
  }
  return observations.at(-1)!.value;
}

/** Locate observed values at the middle of their cumulative mass; values in a gap share its cumulative boundary. */
export function weightedQuantileRank(
  parts: readonly WeightedValue[],
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const observations = aggregateWeightedValues(parts);
  const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  if (totalWeight <= 0) return null;
  const rankWeight = observations.reduce(
    (sum, observation) =>
      sum +
      (observation.value < value
        ? observation.weight
        : observation.value === value
          ? observation.weight / 2
          : 0),
    0,
  );
  return (100 * rankWeight) / totalWeight;
}

export function weightedMedianOfFinite(parts: readonly WeightedValue[]): number | null {
  return weightedQuantile(parts, 0.5);
}

export function quantileFromSorted(values: number[], quantile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  if (values.length === 1) {
    return values[0] ?? null;
  }
  const clampedQuantile = Math.min(1, Math.max(0, quantile));
  const index = (values.length - 1) * clampedQuantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) {
    return values[lowerIndex] ?? null;
  }
  const lowerValue = values[lowerIndex];
  const upperValue = values[upperIndex];
  if (lowerValue == null || upperValue == null) {
    return null;
  }
  const ratio = index - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * ratio;
}

export function medianOfFinite(values: ReadonlyArray<number | null | undefined>): number | null {
  return quantileFromSorted(
    finiteValues(values).sort((left, right) => left - right),
    0.5,
  );
}

export function gaussianWeight(leftValue: number, rightValue: number, sigma: number): number {
  return Math.exp(-0.5 * ((leftValue - rightValue) / sigma) ** 2);
}

export function smoothstep(ratio: number): number {
  const clampedRatio = clamp(ratio, 0, 1);
  return clampedRatio * clampedRatio * (3 - 2 * clampedRatio);
}
