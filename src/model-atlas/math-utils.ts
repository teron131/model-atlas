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

/** Estimate quality-local residuals and independent-group support without knowing model identities or benchmark policy. */
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
  const peers = references.map((point) => ({
    ...point,
    coordinate: (point.quality! - median) / deviation,
  }));
  for (const [index, point] of points.entries()) {
    if (point.quality == null || point.resource == null) continue;
    result.residuals[index] = 0;
    const coordinate = (point.quality - median) / deviation;
    const comparisons = new Map<string, { resourceTotal: number; weight: number }>();
    for (const peer of peers) {
      if (peer.group === point.group) continue;
      const weight = peer.weight * gaussianWeight(coordinate, peer.coordinate, bandwidth);
      const comparison = comparisons.get(peer.group) ?? { resourceTotal: 0, weight: 0 };
      comparison.resourceTotal += weight * peer.resource!;
      comparison.weight += weight;
      comparisons.set(peer.group, comparison);
    }
    const groups = [...comparisons.values()];
    const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
    if (totalWeight <= 0) continue;
    result.residuals[index] =
      point.resource - groups.reduce((sum, group) => sum + group.resourceTotal, 0) / totalWeight;
    const support = Math.min(totalWeight, effectiveSampleSize(groups.map((group) => group.weight)));
    result.supportConfidence[index] = smoothstep((support - 1) / (fullSupport - 1));
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

export function mapFiniteNumbers<T>(
  values: readonly T[],
  valueForItem: (item: T) => number | null,
): number[] {
  return values
    .map(valueForItem)
    .filter((value): value is number => value != null && Number.isFinite(value));
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

function positionedWeightedValues(
  parts: readonly WeightedScorePart[],
): Array<FiniteWeightedValue & { position: number }> {
  let cumulativeWeight = 0;
  return sortedWeightedValues(parts)
    .sort((left, right) => left.value - right.value)
    .map((observation) => {
      cumulativeWeight += observation.weight;
      return {
        ...observation,
        position: cumulativeWeight - observation.weight / 2,
      };
    });
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

/** Interpolate a quantile across weighted empirical value masses. */
export function weightedQuantile(
  parts: readonly WeightedScorePart[],
  quantile: number,
): number | null {
  const positioned = positionedWeightedValues(parts);
  if (positioned.length === 0) {
    return null;
  }
  const first = positioned[0];
  const last = positioned.at(-1);
  if (first == null || last == null) {
    return null;
  }
  if (positioned.length === 1) {
    return first.value;
  }
  const clampedQuantile = clamp01(quantile);
  const targetPosition = interpolateLinear(first.position, last.position, clampedQuantile);
  for (let index = 1; index < positioned.length; index += 1) {
    const upper = positioned[index];
    const lower = positioned[index - 1];
    if (upper == null || lower == null || targetPosition > upper.position) {
      continue;
    }
    const positionRange = upper.position - lower.position;
    if (positionRange <= 0) {
      return upper.value;
    }
    return interpolateLinear(
      lower.value,
      upper.value,
      (targetPosition - lower.position) / positionRange,
    );
  }
  return last.value;
}

/** Locate a value on the same weighted mid-mass axis used by weightedQuantile. */
export function weightedQuantileRank(
  parts: readonly WeightedScorePart[],
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const positioned = positionedWeightedValues(parts);
  const first = positioned[0];
  const last = positioned.at(-1);
  if (first == null || last == null) {
    return null;
  }
  if (first.value === last.value) {
    return 50;
  }
  if (value <= first.value) {
    return 0;
  }
  if (value >= last.value) {
    return 100;
  }
  for (let index = 1; index < positioned.length; index += 1) {
    const upper = positioned[index];
    const lower = positioned[index - 1];
    if (upper == null || lower == null || value > upper.value) {
      continue;
    }
    const valueRatio = (value - lower.value) / (upper.value - lower.value);
    const position = interpolateLinear(lower.position, upper.position, valueRatio);
    return Number(
      ((100 * (position - first.position)) / (last.position - first.position)).toFixed(4),
    );
  }
  return 100;
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
