/** Axis scale and tick helpers shared by dashboard charts. */

import { niceLinearStep, roundTick } from "../../../src/model-atlas/math-utils";

export type AxisScale = {
	domain: [number, number];
	ticks: number[];
};

const SCORE_AXIS_STEPS = [20, 10, 5] as const;
const SCORE_AXIS_DOMAIN: [number, number] = [0, 100];

type LinearDomainOptions = {
	fallbackDomain?: [number, number];
	max?: number;
	min?: number;
	paddingRatio?: number;
	singleValuePadding?: number;
};

type LinearAxisOptions = LinearDomainOptions & {
	formatTick?: (value: number) => string;
	minimumTicks?: number;
	minimumTicksWithoutExpansion?: number;
	targetTickCount?: number;
};

type SteppedAxisOptions = LinearDomainOptions & {
	formatTick?: (value: number) => string;
	minimumTicks?: number;
	steps: readonly number[];
};

type ScoreAxisOptions = Omit<
	SteppedAxisOptions,
	"fallbackDomain" | "max" | "min" | "steps"
>;

export function linearAxisScale(
	values: number[],
	options: LinearAxisOptions = {},
): AxisScale {
	const domain = paddedLinearDomain(values, options);
	return {
		domain,
		ticks: linearAxisTicks(domain, options),
	};
}

export function scoreAxisScale(
	values: number[],
	options: ScoreAxisOptions = {},
): AxisScale {
	return steppedLinearAxisScale(values, {
		fallbackDomain: SCORE_AXIS_DOMAIN,
		max: SCORE_AXIS_DOMAIN[1],
		min: SCORE_AXIS_DOMAIN[0],
		steps: SCORE_AXIS_STEPS,
		...options,
	});
}

export function steppedLinearAxisScale(
	values: number[],
	options: SteppedAxisOptions,
): AxisScale {
	const domain = paddedLinearDomain(values, options);
	const minimumTicks = options.minimumTicks ?? 5;
	const candidates = options.steps
		.flatMap((step) =>
			steppedAxisCandidates(domain, step, minimumTicks, options),
		)
		.sort(
			(left, right) =>
				left.ticks.length - right.ticks.length ||
				left.expansion - right.expansion ||
				right.step - left.step,
		);
	const bestCandidate = candidates[0];
	if (bestCandidate != null) {
		return {
			domain: bestCandidate.domain,
			ticks: bestCandidate.ticks,
		};
	}
	const step = options.steps.at(-1) ?? 1;
	const expandedDomain = expandDomainForMinimumTicks(
		domain,
		step,
		minimumTicks,
		options,
	);
	return {
		domain: expandedDomain,
		ticks: steppedAxisTicks(expandedDomain, step, options.formatTick),
	};
}

export function paddedLinearDomain(
	values: number[],
	options: LinearDomainOptions = {},
): [number, number] {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	const low = Math.min(...finiteValues);
	const high = Math.max(...finiteValues);
	if (!Number.isFinite(low) || !Number.isFinite(high)) {
		return options.fallbackDomain ?? [0, 1];
	}
	if (low === high) {
		const pad =
			options.singleValuePadding ??
			Math.max(Math.abs(high) * (options.paddingRatio ?? 0.05), 1);
		return clampDomain([low - pad, high + pad], options);
	}
	const span = high - low;
	const padding = span * (options.paddingRatio ?? 0.05);
	return clampDomain([low - padding, high + padding], options);
}

export function linearAxisTicks(
	[low, high]: [number, number],
	{
		formatTick = (value) => String(value),
		minimumTicks = 5,
		minimumTicksWithoutExpansion = minimumTicks,
		targetTickCount = 5,
		...domainOptions
	}: LinearAxisOptions = {},
) {
	if (!(high > low)) {
		return [];
	}
	const rawStep = (high - low) / Math.max(targetTickCount - 1, 1);
	const step = niceLinearStep(rawStep);
	if (!(step > 0)) {
		return [];
	}
	let ticks = ticksForStep([low, high], step, formatTick);
	if (ticks.length >= minimumTicksWithoutExpansion) {
		return ticks;
	}
	const expandedDomain = expandDomainForMinimumTicks(
		[low, high],
		step,
		minimumTicks,
		domainOptions,
	);
	ticks = ticksForStep(expandedDomain, step, formatTick);
	return ticks.length > 0 ? ticks : [low, high];
}

function steppedAxisTicks(
	domain: [number, number],
	step: number,
	formatTick = (value: number) => String(value),
) {
	return ticksForStep(domain, step, formatTick);
}

function steppedAxisCandidates(
	domain: [number, number],
	step: number,
	minimumTicks: number,
	options: SteppedAxisOptions,
) {
	const snappedDomain = snapDomainToNearbyStep(domain, step, options);
	const ticks = steppedAxisTicks(snappedDomain, step, options.formatTick);
	if (ticks.length >= minimumTicks) {
		return [
			{
				domain: snappedDomain,
				expansion: domainExpansion(domain, snappedDomain),
				step,
				ticks,
			},
		];
	}
	const expandedDomain = expandDomainForMinimumTicks(
		domain,
		step,
		minimumTicks,
		options,
	);
	const expansion = domainExpansion(domain, expandedDomain);
	const expandedTicks = steppedAxisTicks(
		expandedDomain,
		step,
		options.formatTick,
	);
	if (expandedTicks.length >= minimumTicks && expansion <= step / 2) {
		return [
			{
				domain: expandedDomain,
				expansion,
				step,
				ticks: expandedTicks,
			},
		];
	}
	return [];
}

function snapDomainToNearbyStep(
	[low, high]: [number, number],
	step: number,
	options: LinearDomainOptions,
): [number, number] {
	const snapDistance = step / 3;
	const lowerTick = Math.floor(low / step) * step;
	const upperTick = Math.ceil(high / step) * step;
	const snappedLow = low - lowerTick <= snapDistance ? lowerTick : low;
	const snappedHigh = upperTick - high <= snapDistance ? upperTick : high;
	return clampDomain([snappedLow, snappedHigh], options);
}

function ticksForStep(
	[low, high]: [number, number],
	step: number,
	formatTick: (value: number) => string,
) {
	if (!(high > low) || !(step > 0)) {
		return [];
	}
	const labels = new Set<string>();
	const ticks: number[] = [];
	for (
		let tick = Math.ceil(low / step) * step;
		tick <= high + step * 0.01;
		tick += step
	) {
		const roundedTick = roundTick(tick);
		const label = formatTick(roundedTick);
		if (!labels.has(label)) {
			labels.add(label);
			ticks.push(roundedTick);
		}
	}
	return ticks;
}

function expandDomainForMinimumTicks(
	domain: [number, number],
	step: number,
	minimumTicks: number,
	options: LinearDomainOptions & {
		formatTick?: (value: number) => string;
	},
): [number, number] {
	let [low, high] = domain;
	while (
		ticksForStep([low, high], step, options.formatTick ?? String).length <
		minimumTicks
	) {
		const lowerTick = Math.ceil(low / step) * step - step;
		const upperTick = Math.floor(high / step) * step + step;
		const nextLow =
			options.min == null ? lowerTick : Math.max(options.min, lowerTick);
		const nextHigh =
			options.max == null ? upperTick : Math.min(options.max, upperTick);
		const lowExpansion =
			nextLow < low ? low - nextLow : Number.POSITIVE_INFINITY;
		const highExpansion =
			nextHigh > high ? nextHigh - high : Number.POSITIVE_INFINITY;
		if (
			lowExpansion === Number.POSITIVE_INFINITY &&
			highExpansion === Number.POSITIVE_INFINITY
		) {
			break;
		}
		if (lowExpansion <= highExpansion) {
			low = nextLow;
		} else {
			high = nextHigh;
		}
	}
	return [low, high];
}

function domainExpansion(
	[low, high]: [number, number],
	[expandedLow, expandedHigh]: [number, number],
) {
	return Math.max(low - expandedLow, expandedHigh - high, 0);
}

function clampDomain(
	[low, high]: [number, number],
	{ min, max }: LinearDomainOptions,
): [number, number] {
	return [
		min == null ? low : Math.max(min, low),
		max == null ? high : Math.min(max, high),
	];
}
