/** Interaction-chart tick selection for linear and logarithmic axes. */

import {
	interpolateLinear,
	logDistance,
} from "../../../src/model-atlas/numeric";
import { niceLinearStep, roundTick } from "./axis-scale";
import type { InteractionConfig } from "./types";

const TARGET_TICK_COUNT = 5;
const NICE_LOG_MANTISSAS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 10] as const;

export function interactionXAxisTicks(
	config: InteractionConfig,
	domain: [number, number],
) {
	if (config.key === "context") {
		return config.ticks.filter(
			(tick) => tick >= domain[0] && tick <= domain[1],
		);
	}
	return config.logScale
		? logStepTicks(domain, config.format)
		: linearAxisTicks(domain, config.format);
}

function logStepTicks(
	[low, high]: [number, number],
	format: (value: number) => string,
) {
	if (!(low > 0) || !(high > low)) {
		return [];
	}
	const logLow = Math.log10(low);
	const logHigh = Math.log10(high);
	const ticks = Array.from({ length: TARGET_TICK_COUNT }, (_, index) =>
		nearestNiceLogTick(
			10 ** interpolateLinear(logLow, logHigh, index / (TARGET_TICK_COUNT - 1)),
			[low, high],
		),
	);
	return uniqueFormattedTicks(ticks, format);
}

function linearAxisTicks(
	[low, high]: [number, number],
	format: (value: number) => string,
) {
	if (!(high > low)) {
		return [];
	}
	const step = niceLinearStep((high - low) / (TARGET_TICK_COUNT - 1));
	if (!(step > 0)) {
		return [];
	}
	const first = Math.ceil(low / step) * step;
	const ticks: number[] = [];
	for (
		let tick = first;
		tick <= high + step * 0.01 && ticks.length <= TARGET_TICK_COUNT + 1;
		tick += step
	) {
		ticks.push(roundTick(tick));
	}
	return uniqueFormattedTicks(ticks, format);
}

function nearestNiceLogTick(value: number, domain: [number, number]) {
	const exponent = Math.floor(Math.log10(value));
	const candidates = [-1, 0, 1]
		.flatMap((offset) => {
			const base = 10 ** (exponent + offset);
			return NICE_LOG_MANTISSAS.map((mantissa) => mantissa * base);
		})
		.filter((candidate) => candidate >= domain[0] && candidate <= domain[1]);
	const pool =
		candidates.length > 0
			? candidates
			: NICE_LOG_MANTISSAS.map((mantissa) => mantissa * 10 ** exponent);
	const nearest = pool.reduce((best, candidate) =>
		logDistance(candidate, value) < logDistance(best, value) ? candidate : best,
	);
	return roundTick(nearest);
}

function uniqueFormattedTicks(
	ticks: number[],
	format: (value: number) => string,
) {
	const labels = new Set<string>();
	return ticks
		.filter((tick) => Number.isFinite(tick))
		.sort((left, right) => left - right)
		.filter(
			(tick, index, sortedTicks) =>
				index === 0 || tick !== sortedTicks[index - 1],
		)
		.filter((tick) => {
			const label = format(tick);
			if (labels.has(label)) {
				return false;
			}
			labels.add(label);
			return true;
		});
}
