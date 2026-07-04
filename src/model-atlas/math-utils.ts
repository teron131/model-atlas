/** Shared numeric policies for Model Atlas scoring, chart scales, and public summaries. */
export type NumberOrNull = number | null;

export type WeightedScorePart = {
	value: number | null;
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

/** Keep missing score components out of averages instead of silently treating them as zero evidence. */
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

export function fillMissingWithQualityMirror(
	qualityScores: Array<number | null>,
	targetScores: Array<number | null>,
	tradeoffStrength: number,
): Array<number | null> {
	const knownScores = sortedFiniteScores(targetScores);
	if (knownScores.length === 0) {
		return targetScores;
	}
	const qualityDistribution = finiteScoreValues(qualityScores);
	return targetScores.map((targetScore, index) => {
		if (targetScore != null) {
			return targetScore;
		}
		const qualityScore = qualityScores[index] ?? null;
		const qualityPercentile = percentileRank(qualityDistribution, qualityScore);
		if (qualityPercentile == null) {
			return null;
		}
		const targetPercentile = clampScore(
			50 - tradeoffStrength * (qualityPercentile - 50),
		);
		return quantileFromSorted(knownScores, targetPercentile / 100);
	});
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

export function benchmarkDeviation(
	values: number[],
	minimumDeviation: number,
): number | null {
	const q25 = quantileFromSorted(values, 0.25);
	const q75 = quantileFromSorted(values, 0.75);
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

/** Normalize multiplicative resource differences on the 0-100 score scale while rejecting non-positive inputs. */
export function logMinMaxScale(
	values: Array<number | null>,
	value: number | null,
): number | null {
	if (!isPositiveFinite(value)) {
		return null;
	}
	const logs = values
		.filter(isPositiveFinite)
		.map((candidate) => Math.log(candidate));
	if (logs.length === 0) {
		return null;
	}
	const minLog = Math.min(...logs);
	const maxLog = Math.max(...logs);
	if (maxLog === minLog) {
		return 100;
	}
	const score = ((Math.log(value) - minLog) / (maxLog - minLog)) * 100;
	return Math.max(0, Math.min(100, score));
}
