/** Package-wide numeric and statistical primitives used across Model Atlas domains. */
export type NumberOrNull = number | null;

export type WeightedScorePart = {
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
  supportConfidence: number[];
};

/** Estimate an IQR-based standard-deviation-like spread with an explicit floor. */
export function weightedRobustDeviation(
  values: readonly WeightedScorePart[],
  minimumDeviation: number,
): number | null {
  const q25 = weightedQuantile(values, 0.25);
  const q75 = weightedQuantile(values, 0.75);
  return q25 == null || q75 == null ? null : Math.max((q75 - q25) / 1.349, minimumDeviation);
}

/** Fit a supported local line inside the peer quality range; sparse, flat, and extrapolated comparisons retain the local mean. */
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
    supportConfidence: points.map(() => 0),
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
      const comparison = comparisons.get(peer.group) ?? { resourceTotal: 0, weight: 0 };
      comparison.resourceTotal += weight * peer.resource!;
      comparison.weight += weight;
      comparisons.set(peer.group, comparison);
    }
    const groups = [...comparisons.values()];
    const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
    if (totalWeight <= 0) continue;
    const resourceTotal = groups.reduce((sum, group) => sum + group.resourceTotal, 0);
    let expectedResource = resourceTotal / totalWeight;
    const support = Math.min(totalWeight, effectiveSampleSize(groups.map((group) => group.weight)));
    result.supportConfidence[index] = smoothstep((support - 1) / (fullSupport - 1));
    const determinant = totalWeight * qualitySquares - qualityTotal ** 2;
    const stableSlope = determinant > Number.EPSILON * totalWeight * qualitySquares * 32;
    if (
      support >= fullSupport &&
      stableSlope &&
      coordinate > minimumQuality &&
      coordinate < maximumQuality
    ) {
      expectedResource =
        (qualitySquares * resourceTotal - qualityTotal * qualityResourceTotal) / determinant;
    }
    const residual = point.resource - expectedResource;
    const tolerance =
      Number.EPSILON * Math.max(1, Math.abs(point.resource), Math.abs(expectedResource)) * 32;
    result.residuals[index] = Math.abs(residual) <= tolerance ? 0 : residual;
  }
  return result;
}

/** Map residuals to a neutral-one multiplier using the original weighted resource MAD and comparison support. */
export function boundedResidualMultipliers(
  comparisons: LocalResiduals,
  referenceValues: readonly WeightedScorePart[],
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
      : 1 - cap * comparisons.supportConfidence[index]! * clamp(residual / scale / 2, -1, 1),
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
  const finiteValues = finiteScoreValues(values);
  if (finiteValues.length === 0) {
    return null;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

/** Keep missing score values out of averages instead of silently treating them as zero evidence. */
export function finiteScoreValues(values: ReadonlyArray<number | null | undefined>): number[] {
  return values.filter((value): value is number => value != null && Number.isFinite(value));
}

export function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function interpolateLinear(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

export function logDistance(left: number, right: number) {
  return Math.abs(Math.log10(left) - Math.log10(right));
}

export function weightedMeanOfFinite(parts: WeightedScorePart[]): number | null {
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

export function weightedFinitePartCount(parts: WeightedScorePart[]): number {
  return parts.filter(
    (part) =>
      part.value != null &&
      Number.isFinite(part.value) &&
      Number.isFinite(part.weight) &&
      part.weight > 0,
  ).length;
}

/** Convert unequal positive weights into the equivalent count of equally weighted observations. */
export function effectiveSampleSize(weights: readonly number[]): number {
  const finiteWeights = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  const totalWeight = finiteWeights.reduce((sum, weight) => sum + weight, 0);
  const squaredWeightTotal = finiteWeights.reduce((sum, weight) => sum + weight ** 2, 0);
  return squaredWeightTotal > 0 ? totalWeight ** 2 / squaredWeightTotal : 0;
}

function sortedWeightedValues(parts: readonly WeightedScorePart[]): FiniteWeightedValue[] {
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
  parts: readonly WeightedScorePart[],
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const observations = sortedWeightedValues(parts);
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
export function weightedQuantile(
  parts: readonly WeightedScorePart[],
  quantile: number,
): number | null {
  const observations = sortedWeightedValues(parts).sort((left, right) => left.value - right.value);
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
  parts: readonly WeightedScorePart[],
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const observations = sortedWeightedValues(parts);
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

export function weightedMedianOfFinite(parts: readonly WeightedScorePart[]): number | null {
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
    finiteScoreValues(values).sort((left, right) => left - right),
    0.5,
  );
}

export function log10OnePlusPositive(value: unknown): number | null {
  const number = positiveFiniteNumber(value);
  if (number == null) {
    return null;
  }
  const scaledValue = Math.log10(1 + number);
  return scaledValue > 0 ? scaledValue : null;
}

export function log10OnePlusNonnegative(value: unknown): number | null {
  const number = nonnegativeFiniteNumber(value);
  return number == null ? null : Math.log10(1 + number);
}

export function gaussianWeight(leftValue: number, rightValue: number, sigma: number): number {
  return Math.exp(-0.5 * ((leftValue - rightValue) / sigma) ** 2);
}

export function smoothstep(ratio: number): number {
  const clampedRatio = clamp(ratio, 0, 1);
  return clampedRatio * clampedRatio * (3 - 2 * clampedRatio);
}
