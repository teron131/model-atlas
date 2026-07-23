/** Score-scale normalization, confidence, and robust calibration policies. */

import {
	clamp,
	clamp01,
	finiteScoreValues,
	smoothstep,
	type WeightedScorePart,
	weightedQuantile,
} from "../../numeric";

const COVERAGE_CONFIDENCE_FLOOR = 0.1;
const COVERAGE_CONFIDENCE_FULL = 0.6;

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
		throw new RangeError(
			`Logit quality coordinates require a finite 0-1 score, received ${value}`,
		);
	}
	return probabilityLogit(value);
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

/** Convert evidence mass into confidence using the configured floor and full point. */
export function evidenceMassConfidence(
	evidenceMass: number,
	floor: number,
	full: number,
): number {
	if (
		!Number.isFinite(evidenceMass) ||
		!Number.isFinite(floor) ||
		!Number.isFinite(full) ||
		floor < 0 ||
		full <= floor
	) {
		throw new RangeError(
			`Evidence confidence requires finite mass and 0 <= floor < full, received ${evidenceMass}, ${floor}, ${full}`,
		);
	}
	if (evidenceMass >= full) {
		return 1;
	}
	return smoothstep((evidenceMass - floor) / (full - floor));
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
		values.map((value) =>
			value != null && Number.isFinite(value) && value > 0
				? Math.log(value)
				: null,
		),
		direction,
	);
}
