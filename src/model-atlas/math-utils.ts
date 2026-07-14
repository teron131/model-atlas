/** Shared numeric policies for Model Atlas scoring, chart scales, and public summaries. */
export type NumberOrNull = number | null;

export type WeightedScorePart = {
	value: number | null;
	weight: number;
};

type FiniteWeightedValue = {
	value: number;
	weight: number;
};

export function finiteNumbers(values: unknown[]): number[] {
	return values
		.filter((value) => value != null)
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value));
}

export function isPositiveFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function positiveFiniteNumber(value: unknown): number | null {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

export function meanOfFinite(values: Array<number | null>): number | null {
	const finiteValues = finiteScoreValues(values);
	if (finiteValues.length === 0) {
		return null;
	}
	return (
		finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
	);
}

/** Keep missing score values out of averages instead of silently treating them as zero evidence. */
export function finiteScoreValues(
	values: ReadonlyArray<number | null | undefined>,
): number[] {
	return values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
}

export function mapFiniteNumbers<T>(
	values: readonly T[],
	valueForItem: (item: T) => number | null,
): number[] {
	return values
		.map(valueForItem)
		.filter(
			(value): value is number => value != null && Number.isFinite(value),
		);
}

export function clamp(value: number, minValue: number, maxValue: number) {
	return Math.max(minValue, Math.min(maxValue, value));
}

export function clamp01(value: number) {
	return clamp(value, 0, 1);
}

/** Map Elo-like ratings onto a clamped 0-1 interval from a source-defined lower bound and range. */
export function normalizeElo(value: number, lowerBound: number, range: number) {
	return clamp01((value - lowerBound) / range);
}

export function interpolateLinear(start: number, end: number, ratio: number) {
	return start + (end - start) * ratio;
}

export function expectedLogUniformValue(lower: number, upper: number): number {
	if (lower <= 0 || upper <= 0 || lower === upper) {
		return (lower + upper) / 2;
	}
	return (upper - lower) / (Math.log(upper) - Math.log(lower));
}

export function logDistance(left: number, right: number) {
	return Math.abs(Math.log10(left) - Math.log10(right));
}

export function niceLinearStep(rawStep: number) {
	const exponent = Math.floor(Math.log10(rawStep));
	const base = 10 ** exponent;
	const mantissa = rawStep / base;
	const niceMantissa =
		mantissa <= 1
			? 1
			: mantissa <= 2
				? 2
				: mantissa <= 2.5
					? 2.5
					: mantissa <= 5
						? 5
						: 10;
	return niceMantissa * base;
}

export function roundTick(value: number) {
	if (Math.abs(value) >= 100) {
		return Number(value.toFixed(0));
	}
	if (Math.abs(value) >= 10) {
		return Number(value.toFixed(1));
	}
	if (Math.abs(value) >= 1) {
		return Number(value.toFixed(2));
	}
	return Number(value.toPrecision(3));
}

/** Scale chart markers by visible area, not raw radius, so normalized score differences read proportionally. */
export function areaScaledRadius(
	minRadius: number,
	maxRadius: number,
	score: number,
): number {
	const clampedScore = clamp(score, 0, 1);
	return Math.sqrt(
		minRadius ** 2 + clampedScore * (maxRadius ** 2 - minRadius ** 2),
	);
}

export function meanOfFiniteWithMinimum(
	values: Array<number | null>,
	minimumFiniteValues: number,
): number | null {
	const finiteValues = finiteScoreValues(values);
	return finiteValues.length >= minimumFiniteValues
		? meanOfFinite(finiteValues)
		: null;
}

export function sortedFiniteScores(values: Array<number | null>): number[] {
	return finiteScoreValues(values).sort((left, right) => left - right);
}

export function weightedMeanOfFinite(
	parts: WeightedScorePart[],
): number | null {
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
	return (
		finiteParts.reduce((sum, part) => sum + part.value * part.weight, 0) /
		totalWeight
	);
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

export function weightedCoverageRatio(
	parts: WeightedScorePart[],
): number | null {
	const totalWeight = parts.reduce(
		(total, part) =>
			Number.isFinite(part.weight) && part.weight > 0
				? total + part.weight
				: total,
		0,
	);
	if (totalWeight <= 0) {
		return null;
	}
	const coveredWeight = parts.reduce((total, part) => {
		if (!Number.isFinite(part.weight) || part.weight <= 0) {
			return total;
		}
		return part.value == null || !Number.isFinite(part.value)
			? total
			: total + part.weight;
	}, 0);
	return coveredWeight / totalWeight;
}

/** Convert unequal positive weights into the equivalent count of equally weighted observations. */
export function effectiveSampleSize(weights: readonly number[]): number {
	const finiteWeights = weights.filter(
		(weight) => Number.isFinite(weight) && weight > 0,
	);
	const totalWeight = finiteWeights.reduce((sum, weight) => sum + weight, 0);
	const squaredWeightTotal = finiteWeights.reduce(
		(sum, weight) => sum + weight ** 2,
		0,
	);
	return squaredWeightTotal > 0 ? totalWeight ** 2 / squaredWeightTotal : 0;
}

function sortedWeightedValues(
	parts: readonly WeightedScorePart[],
): FiniteWeightedValue[] {
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
		weightByValue.set(
			part.value,
			(weightByValue.get(part.value) ?? 0) + part.weight,
		);
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
	const totalWeight = observations.reduce(
		(sum, observation) => sum + observation.weight,
		0,
	);
	if (totalWeight <= 0) {
		return null;
	}
	const lessOrEqualWeight = observations.reduce(
		(sum, observation) =>
			observation.value <= value ? sum + observation.weight : sum,
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
	const targetPosition = interpolateLinear(
		first.position,
		last.position,
		clampedQuantile,
	);
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
		const position = interpolateLinear(
			lower.position,
			upper.position,
			valueRatio,
		);
		return Number(
			(
				(100 * (position - first.position)) /
				(last.position - first.position)
			).toFixed(4),
		);
	}
	return 100;
}

export function weightedMedianOfFinite(
	parts: readonly WeightedScorePart[],
): number | null {
	return weightedQuantile(parts, 0.5);
}

/** Require every configured part so fixed-weight scores do not reweight themselves around missing data. */
export function fixedWeightedScore(parts: WeightedScorePart[]): number | null {
	if (parts.some((part) => part.value == null)) {
		return null;
	}
	const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
	if (totalWeight <= 0) {
		return null;
	}
	return (
		parts.reduce((sum, part) => sum + (part.value ?? 0) * part.weight, 0) /
		totalWeight
	);
}

/** Round finite-only means for public metadata where null means no numeric evidence was available. */
export function meanOrNull(values: unknown[]): NumberOrNull {
	const mean = meanOfFinite(finiteNumbers(values));
	return mean == null ? null : Number(mean.toFixed(4));
}

/** Percentile ranks are local to the current comparison set, so adding or pruning models can change them. */
export function percentileRank(
	values: unknown[],
	value: unknown,
): NumberOrNull {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) {
		return null;
	}
	const finiteValues = finiteNumbers(values);
	if (finiteValues.length === 0) {
		return null;
	}
	const lessOrEqualCount = finiteValues.filter(
		(item) => item <= numericValue,
	).length;
	const rawPercentile = (lessOrEqualCount / finiteValues.length) * 100;
	return Number(rawPercentile.toFixed(4));
}

export function percentileScoreAt(
	values: Array<number | null>,
	index: number,
): NumberOrNull {
	const value = values[index] ?? null;
	return value == null ? null : percentileRank(values, value);
}

export function percentileScoreForValue(
	values: ReadonlyArray<number | null>,
	value: number | null,
): NumberOrNull {
	return value == null ? null : percentileRank([...values], value);
}

/** Clamp public score-scale values to 0-100 after normalization or interpolation. */
export function clampScore(value: number): number {
	return Math.min(100, Math.max(0, value));
}

export function quantileFromSorted(
	values: number[],
	quantile: number,
): number | null {
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

export function medianOfFinite(
	values: ReadonlyArray<number | null | undefined>,
): number | null {
	return quantileFromSorted(
		finiteScoreValues(values).sort((left, right) => left - right),
		0.5,
	);
}

export function fillMissingWithMedian(
	values: Array<number | null>,
): Array<number | null> {
	const knownValues = sortedFiniteScores(values);
	const medianValue = quantileFromSorted(knownValues, 0.5);
	if (medianValue == null) {
		return values;
	}
	return values.map((value) => value ?? medianValue);
}

export function inversePositiveFinite(value: unknown): number | null {
	const number = positiveFiniteNumber(value);
	return number == null ? null : 1 / number;
}

export function log10OnePlusPositive(value: unknown): number | null {
	const number = positiveFiniteNumber(value);
	if (number == null) {
		return null;
	}
	const scaledValue = Math.log10(1 + number);
	return scaledValue > 0 ? scaledValue : null;
}

export function probabilityLogit(value: number): number {
	const clamped = clamp(value, 0.001, 0.999);
	return Math.log(clamped / (1 - clamped));
}

export function logitBenchmarkScore(value: number): number {
	return probabilityLogit(value > 1 ? value / 100 : value);
}

/** Transform a public 0-100 score into its log-odds coordinate. */
export function logitPercentageScore(value: number): number {
	return probabilityLogit(value / 100);
}

export function weightedRobustDeviation(
	values: readonly WeightedScorePart[],
	minimumDeviation: number,
): number | null {
	const q25 = weightedQuantile(values, 0.25);
	const q75 = weightedQuantile(values, 0.75);
	if (q25 == null || q75 == null) {
		return null;
	}
	return Math.max((q75 - q25) / 1.349, minimumDeviation);
}

export function gaussianWeight(
	leftValue: number,
	rightValue: number,
	sigma: number,
): number {
	return Math.exp(-0.5 * ((leftValue - rightValue) / sigma) ** 2);
}

export function smoothstep(ratio: number): number {
	const clampedRatio = clamp(ratio, 0, 1);
	return clampedRatio * clampedRatio * (3 - 2 * clampedRatio);
}

const COVERAGE_CONFIDENCE_FLOOR = 0.1;
const COVERAGE_CONFIDENCE_FULL = 0.6;

export function coverageConfidence(availableCount: number, totalCount: number) {
	if (totalCount <= 0) {
		return 0;
	}
	const coverage = availableCount / totalCount;
	if (coverage >= COVERAGE_CONFIDENCE_FULL) {
		return 1;
	}
	return smoothstep(
		(coverage - COVERAGE_CONFIDENCE_FLOOR) /
			(COVERAGE_CONFIDENCE_FULL - COVERAGE_CONFIDENCE_FLOOR),
	);
}

/** Normalize onto the 0-100 score scale, giving full credit when the comparison set has no spread. */
export function minMaxScale(
	values: ReadonlyArray<number | null>,
	value: number | null,
): number | null {
	if (value == null) {
		return null;
	}
	const finiteValues = finiteScoreValues(values);
	if (finiteValues.length === 0) {
		return null;
	}
	const minValue = Math.min(...finiteValues);
	const maxValue = Math.max(...finiteValues);
	if (maxValue === minValue) {
		return 100;
	}
	return ((value - minValue) / (maxValue - minValue)) * 100;
}

/** Min-max normalize finite signals in the requested scoring direction. */
export function minMaxScores(
	values: ReadonlyArray<number | null>,
	direction: "higher" | "lower",
): Array<number | null> {
	const directionMultiplier = direction === "higher" ? 1 : -1;
	const directedValues = values.map((value) =>
		value != null && Number.isFinite(value)
			? directionMultiplier * value
			: null,
	);
	return directedValues.map((value) => minMaxScale(directedValues, value));
}

/** Min-max normalize against weighted anchors while winsorizing only the favorable tail. */
export function winsorizedMinMaxScores(
	values: ReadonlyArray<number | null>,
	calibrationValues: readonly WeightedScorePart[],
	direction: "higher" | "lower",
	tailShare: number,
): Array<number | null> {
	const boundedTailShare = Math.min(0.5, clamp01(tailShare));
	const lower = weightedQuantile(
		calibrationValues,
		direction === "lower" ? boundedTailShare : 0,
	);
	const upper = weightedQuantile(
		calibrationValues,
		direction === "higher" ? 1 - boundedTailShare : 1,
	);
	if (lower == null || upper == null) {
		return values.map(() => null);
	}
	if (upper <= lower) {
		return values.map((value) =>
			value == null || !Number.isFinite(value) ? null : 100,
		);
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
		values.map((value) => (isPositiveFinite(value) ? Math.log(value) : null)),
		direction,
	);
}
