/** Shared dashboard chart axis scales and tick selection. */

import { ticks as linearTicks } from "d3-array";
import { scaleLog } from "d3-scale";

export type AxisScale = {
  domain: [number, number];
  ticks: number[];
};

const SCORE_AXIS_STEPS = [20, 10, 5] as const;
const SCORE_AXIS_DOMAIN: [number, number] = [0, 100];

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

type LinearDomainOptions = {
  fallbackDomain?: [number, number];
  max?: number;
  min?: number;
  paddingRatio?: number;
  singleValuePadding?: number;
};

type LinearAxisOptions = LinearDomainOptions & {
  formatTick?: (value: number) => string;
  targetTickCount?: number;
};

type SteppedAxisOptions = LinearDomainOptions & {
  formatTick?: (value: number) => string;
  minimumTicks?: number;
  steps: readonly number[];
};

type ScoreAxisOptions = Omit<SteppedAxisOptions, "fallbackDomain" | "max" | "min" | "steps">;

/** Fit ticks inside the padded observations; readable intervals must not enlarge the measured range. */
export function linearAxisScale(values: number[], options: LinearAxisOptions = {}): AxisScale {
  const firstFinite = values.find(Number.isFinite) ?? 0;
  const domain = paddedLinearDomain(values, {
    ...options,
    singleValuePadding:
      options.singleValuePadding ?? (Math.abs(firstFinite) * (options.paddingRatio ?? 0.05) || 1),
  });
  return linearAxisForDomain(domain, options);
}

/** Fit positive ratios and the 1× reference in base-10 log space without expanding to a round endpoint. */
export function logRatioAxisScale(
  values: number[],
  formatTick: (value: number) => string,
): AxisScale {
  const logs = values.filter((value) => Number.isFinite(value) && value > 0).map(Math.log10);
  if (logs.length === 0) return { domain: [0.1, 10], ticks: [0.1, 1, 10] };
  const low = Math.min(0, ...logs);
  const high = Math.max(0, ...logs);
  const padding = (high - low) * 0.05 || 0.05;
  const domain: [number, number] = [
    Math.max(Number.MIN_VALUE, 10 ** (low - padding)),
    Math.min(Number.MAX_VALUE, 10 ** (high + padding)),
  ];
  const candidates: number[] = [1];
  if (high - low < 1) {
    candidates.push(...scaleLog().base(10).domain(domain).ticks(5));
  } else {
    for (
      let exponent = Math.floor(low - padding);
      exponent <= Math.ceil(high + padding);
      exponent++
    )
      for (const multiple of [1, 2, 5]) {
        const tick = multiple * 10 ** exponent;
        if (tick >= domain[0] && tick <= domain[1]) candidates.push(tick);
      }
  }
  const ticks = ticksWithUniqueLabels(candidates, formatTick).sort((left, right) => left - right);
  return { domain, ticks };
}

export function scoreAxisScale(values: number[], options: ScoreAxisOptions = {}): AxisScale {
  if (values.some((value) => Number.isFinite(value) && (value < 0 || value > 100)))
    return linearAxisScale(values, options);
  return steppedLinearAxisScale(values, {
    fallbackDomain: SCORE_AXIS_DOMAIN,
    max: SCORE_AXIS_DOMAIN[1],
    min: SCORE_AXIS_DOMAIN[0],
    steps: SCORE_AXIS_STEPS,
    ...options,
  });
}

export function steppedLinearAxisScale(values: number[], options: SteppedAxisOptions): AxisScale {
  const domain = paddedLinearDomain(values, options);
  const minimumTicks = options.minimumTicks ?? 5;
  const candidates = options.steps
    .flatMap((step) => steppedAxisCandidates(domain, step, minimumTicks, options))
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
  const expandedDomain = expandDomainForMinimumTicks(domain, step, minimumTicks, options);
  return {
    domain: expandedDomain,
    ticks: ticksForStep(expandedDomain, step, options.formatTick),
  };
}

function paddedLinearDomain(values: number[], options: LinearDomainOptions = {}): [number, number] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const low = Math.min(...finiteValues);
  const high = Math.max(...finiteValues);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return options.fallbackDomain ?? [0, 1];
  }
  if (low === high) {
    const pad =
      options.singleValuePadding ?? Math.max(Math.abs(high) * (options.paddingRatio ?? 0.05), 1);
    return clampDomain([low - pad, high + pad], options);
  }
  const span = high - low;
  const padding = span * (options.paddingRatio ?? 0.05);
  return clampDomain([low - padding, high + padding], options);
}

function linearAxisForDomain(
  [low, high]: [number, number],
  { formatTick = (value) => String(value), targetTickCount = 5 }: LinearAxisOptions = {},
): AxisScale {
  const domain: [number, number] = [low, high];
  if (!(high > low)) {
    return { domain, ticks: [] };
  }
  const candidates = linearTicks(low, high, Math.max(targetTickCount - 1, 1));
  return {
    domain,
    ticks: ticksWithUniqueLabels(candidates.length > 0 ? candidates : [low, high], formatTick),
  };
}

/** Preserve candidate priority when different values round to the same visible ruler label. */
function ticksWithUniqueLabels(ticks: number[], formatTick: (value: number) => string): number[] {
  const labels = new Set<string>();
  return ticks.filter((tick) => {
    const label = formatTick(tick);
    if (labels.has(label)) return false;
    labels.add(label);
    return true;
  });
}

function steppedAxisCandidates(
  domain: [number, number],
  step: number,
  minimumTicks: number,
  options: SteppedAxisOptions,
) {
  const snappedDomain = snapDomainToNearbyStep(domain, step, options);
  const ticks = ticksForStep(snappedDomain, step, options.formatTick);
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
  const expandedDomain = expandDomainForMinimumTicks(domain, step, minimumTicks, options);
  const expansion = domainExpansion(domain, expandedDomain);
  const expandedTicks = ticksForStep(expandedDomain, step, options.formatTick);
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
  formatTick: (value: number) => string = String,
) {
  if (!(high > low) || !(step > 0)) {
    return [];
  }
  const labels = new Set<string>();
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high + step * 0.01; tick += step) {
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
  while (ticksForStep([low, high], step, options.formatTick).length < minimumTicks) {
    const lowerTick = Math.ceil(low / step) * step - step;
    const upperTick = Math.floor(high / step) * step + step;
    const nextLow = options.min == null ? lowerTick : Math.max(options.min, lowerTick);
    const nextHigh = options.max == null ? upperTick : Math.min(options.max, upperTick);
    const lowExpansion = nextLow < low ? low - nextLow : Number.POSITIVE_INFINITY;
    const highExpansion = nextHigh > high ? nextHigh - high : Number.POSITIVE_INFINITY;
    if (lowExpansion === Number.POSITIVE_INFINITY && highExpansion === Number.POSITIVE_INFINITY) {
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
  return [min == null ? low : Math.max(min, low), max == null ? high : Math.min(max, high)];
}
