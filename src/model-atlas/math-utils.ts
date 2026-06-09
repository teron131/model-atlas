/** Shared finite-number math helpers for stats scoring. */

export type NumberOrNull = number | null;

export type WeightedScorePart = {
	value: number | null;
	weight: number;
};

/** Return finite numeric values from a mixed input list. */
export function finiteNumbers(values: unknown[]): number[] {
	return values
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value));
}

/** Return whether a value is a positive finite number. */
export function isPositiveFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Compute a finite-aware mean. */
export function meanOfFinite(values: Array<number | null>): number | null {
	const finiteValues = finiteScoreValues(values);
	if (finiteValues.length === 0) {
		return null;
	}
	return (
		finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
	);
}

/** Return finite score values without coercing nullish entries into zero. */
export function finiteScoreValues(
	values: ReadonlyArray<number | null | undefined>,
): number[] {
	return values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
}

/** Map input items to finite numeric values. */
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

/** Clamp a number into an inclusive range. */
export function clamp(value: number, minValue: number, maxValue: number) {
	return Math.max(minValue, Math.min(maxValue, value));
}

/** Scale circle radius so visible area changes linearly with a normalized score. */
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

/** Compute a finite-aware mean only when enough components are present. */
export function meanOfFiniteWithMinimum(
	values: Array<number | null>,
	minimumFiniteValues: number,
): number | null {
	const finiteValues = finiteScoreValues(values);
	return finiteValues.length >= minimumFiniteValues
		? meanOfFinite(finiteValues)
		: null;
}

/** Return finite score values sorted ascending. */
export function sortedFiniteScores(values: Array<number | null>): number[] {
	return finiteScoreValues(values).sort((left, right) => left - right);
}

/** Compute a finite-aware weighted mean. */
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

/** Compute a weighted score only when every configured part is present. */
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

/** Compute a rounded finite-aware mean for public payload summaries. */
export function meanOrNull(values: unknown[]): NumberOrNull {
	const mean = meanOfFinite(finiteNumbers(values));
	return mean == null ? null : Number(mean.toFixed(4));
}

/** Compute percentile rank within the finite values of the current comparison set. */
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

/** Clamp a score-like number into the 0-100 range. */
export function clampScore(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Return a linearly interpolated quantile from an already sorted numeric list. */
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

/** Min-max normalize one value against the current comparison set. */
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

/** Log-min-max normalize one positive value against a positive source distribution. */
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
