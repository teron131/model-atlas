/** Chart summary statistics and bubble radius helpers for dashboard graphs. */

import { quantile } from "d3-array";
import { areaScaledRadius, clamp } from "../../../src/model-atlas/math-utils";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import type { BoxWhiskerDistribution } from "./BoxWhiskerSummary";
import { finite, finiteValue } from "./format";

export function valueDistribution(values: number[]): BoxWhiskerDistribution {
	const sortedValues = values
		.filter(finite)
		.sort((left, right) => left - right);

	return {
		count: sortedValues.length,
		min: sortedValues[0] ?? 0,
		q1: quantile(sortedValues, 0.25) ?? 0,
		median: quantile(sortedValues, 0.5) ?? 0,
		q3: quantile(sortedValues, 0.75) ?? 0,
		max: sortedValues[sortedValues.length - 1] ?? 0,
	};
}

export function intelligenceDistribution(
	models: LlmStatsModel[],
): BoxWhiskerDistribution {
	return valueDistribution(
		models
			.map((model) => finiteValue(model.scores?.intelligence_score))
			.filter(finite),
	);
}

export function inverseLogBubbleRadius(values: number[], maxRadius = 16) {
	const minRadius = 5;
	const logs = values
		.filter((value) => finite(value) && value > 0)
		.map((value) => Math.log(value));
	const minLog = Math.min(...logs);
	const maxLog = Math.max(...logs);
	const span = maxLog - minLog;

	return (value: number) => {
		if (!finite(value) || value <= 0) {
			return minRadius;
		}
		if (!finite(span) || span === 0) {
			return areaScaledRadius(minRadius, maxRadius, 0.5);
		}
		const normalized = clamp((Math.log(value) - minLog) / span, 0, 1);
		return areaScaledRadius(minRadius, maxRadius, 1 - normalized);
	};
}

export function linearBubbleRadius(
	values: number[],
	minRadius = 3,
	maxRadius = 10,
) {
	const finiteValues = values.filter(finite);
	const minValue = Math.min(...finiteValues);
	const maxValue = Math.max(...finiteValues);
	const span = maxValue - minValue;

	return (value: number) => {
		if (!finite(value)) {
			return minRadius;
		}
		if (!finite(span) || span === 0) {
			return areaScaledRadius(minRadius, maxRadius, 0.5);
		}
		const normalized = clamp((value - minValue) / span, 0, 1);
		return areaScaledRadius(minRadius, maxRadius, normalized);
	};
}

export function bestByScore<T>(
	rows: readonly T[],
	score: (row: T) => number | null,
): T | null {
	return (
		[...rows].sort((left, right) => {
			const leftScore = score(left);
			const rightScore = score(right);
			return (rightScore ?? -Infinity) - (leftScore ?? -Infinity);
		})[0] ?? null
	);
}

export function extremeLabelRows<T>(
	rows: readonly T[],
	keyFor: (row: T) => string,
	xValue: (row: T) => number,
	yValue: (row: T) => number,
	{ xHigherIsBetter = true }: { xHigherIsBetter?: boolean } = {},
) {
	const tradeoffScore = (row: T) => {
		const x = xValue(row);
		const y = yValue(row);
		if (!finite(x) || !finite(y)) {
			return null;
		}
		return xHigherIsBetter ? y * x : x > 0 ? y / x : null;
	};
	const selected: T[] = [];
	for (const row of [
		bestByScore(rows, yValue),
		bestByScore(rows, (candidate) =>
			xHigherIsBetter ? xValue(candidate) : -xValue(candidate),
		),
		bestByScore(rows, tradeoffScore),
	]) {
		if (
			row != null &&
			!selected.some((candidate) => keyFor(candidate) === keyFor(row))
		) {
			selected.push(row);
		}
	}
	return new Set(selected);
}
