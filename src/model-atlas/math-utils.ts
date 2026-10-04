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

export type QualityResourcePoint = {
  group: string;
  quality: number | null;
  resource: number | null;
  weight: number;
};

type LocalResiduals = {
  residuals: Array<number | null>;
  peerSupport: number[];
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

/** Blend a stable local trend with the peer mean as peer support grows, evaluating the trend only within observed peer bounds. */
export function qualityLocalResiduals(
  points: readonly QualityResourcePoint[],
  bandwidth: number,
  minimumDeviation: number,
  fullSupport: number,
): LocalResiduals {
  const references = points.filter(
    (point) => point.quality != null && point.resource != null && point.weight > 0,
  );
  const observations = references.map((point) => ({ value: point.quality, weight: point.weight }));
  const median = weightedQuantile(observations, 0.5);
  const deviation = weightedRobustDeviation(observations, minimumDeviation);
  const result: LocalResiduals = {
    residuals: points.map(() => null),
    peerSupport: points.map(() => 0),
  };
  if (median == null || deviation == null) return result;
  const coordinateOf = (quality: number) =>
    deviation > 0 ? (quality - median) / deviation : quality === median ? 0 : Infinity;
  const peers = references.map((point) => ({
    ...point,
    coordinate: coordinateOf(point.quality!),
  }));
  for (const [index, point] of points.entries()) {
    if (point.quality == null || point.resource == null) continue;
    result.residuals[index] = 0;
    const coordinate = coordinateOf(point.quality);
    const comparisons = new Map<string, { resourceTotal: number; weight: number }>();
    let qualityTotal = 0;
    let qualitySquares = 0;
    let qualityResourceTotal = 0;
    let minimumQuality = Infinity;
    let maximumQuality = -Infinity;
    let minimumResource = Infinity;
    let maximumResource = -Infinity;
    for (const peer of peers) {
      if (peer.group === point.group) continue;
      const weight = peer.weight * gaussianWeight(coordinate, peer.coordinate, bandwidth);
      if (!(weight > 0)) continue;
      const distance = peer.coordinate - coordinate;
      qualityTotal += weight * distance;
      qualitySquares += weight * distance * distance;
      qualityResourceTotal += weight * distance * peer.resource!;
      minimumQuality = Math.min(minimumQuality, peer.coordinate);
      maximumQuality = Math.max(maximumQuality, peer.coordinate);
      minimumResource = Math.min(minimumResource, peer.resource!);
      maximumResource = Math.max(maximumResource, peer.resource!);
      const comparison = comparisons.get(peer.group) ?? { resourceTotal: 0, weight: 0 };
      comparison.resourceTotal += weight * peer.resource!;
      comparison.weight += weight;
      comparisons.set(peer.group, comparison);
    }
    const groups = [...comparisons.values()];
    const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
    if (totalWeight <= 0) continue;
    const resourceTotal = groups.reduce((sum, group) => sum + group.resourceTotal, 0);
    let expectedSignal = resourceTotal / totalWeight;
    const supportedModelCount = Math.min(
      totalWeight,
      effectiveCount(groups.map((group) => group.weight)),
    );
    result.peerSupport[index] = smoothstep((supportedModelCount - 1) / (fullSupport - 1));
    const determinant = totalWeight * qualitySquares - qualityTotal ** 2;
    const stableSlope = determinant > Number.EPSILON * totalWeight * qualitySquares * 32;
    if (stableSlope && result.peerSupport[index]! > 0) {
      const intercept =
        (qualitySquares * resourceTotal - qualityTotal * qualityResourceTotal) / determinant;
      const slope =
        (totalWeight * qualityResourceTotal - qualityTotal * resourceTotal) / determinant;
      const offset = clamp(coordinate, minimumQuality, maximumQuality) - coordinate;
      const fittedSignal = clamp(intercept + slope * offset, minimumResource, maximumResource);
      expectedSignal += result.peerSupport[index]! * (fittedSignal - expectedSignal);
    }
    const residual = point.resource - expectedSignal;
    const tolerance =
      Number.EPSILON * Math.max(1, Math.abs(point.resource), Math.abs(expectedSignal)) * 32;
    result.residuals[index] = Math.abs(residual) <= tolerance ? 0 : residual;
  }
  return result;
}

/** Map residuals to a neutral-one multiplier using the original weighted resource MAD and comparison support. */
export function boundedResidualMultipliers(
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

/** Exclude missing and nonfinite numeric values from statistical summaries. */
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

/** Map reference bounds to 0–1 without clamping; missing inputs stay missing and equal bounds use the established upper-end convention. */
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
  return directedValues.map((value) => linearScore(range, value));
}

/** Min-max normalize against weighted anchors while winsorizing only the favorable tail. */
export function winsorizedMinMaxScores(
  values: ReadonlyArray<number | null>,
  calibrationValues: readonly WeightedValue[],
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

/** Generalize the empirical less-than-or-equal percentile to weighted observations. */
export function weightedPercentileRank(
  parts: readonly WeightedValue[],
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const observations = aggregateWeightedValues(parts);
  const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }
  const lessOrEqualWeight = observations.reduce(
    (sum, observation) => (observation.value <= value ? sum + observation.weight : sum),
    0,
  );
  return Number(((100 * lessOrEqualWeight) / totalWeight).toFixed(4));
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
