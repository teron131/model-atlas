/** Pareto axes, resource units, and hover labels present prepared comparison rows without choosing their evidence or changing scores. */

import { isAggregateIndex } from "../../../../src/model-atlas/benchmarks/index-policy";
import { formatResourceRatio } from "../../../shared/resource-ratio-display";
import type { ReadoutFact } from "../ChartReadout";
import {
  formatCompact,
  formatDurationShort,
  formatMoney,
  formatPercentScore,
  formatTooltipScore,
} from "../format";
import {
  type AxisScale,
  linearAxisScale,
  logRatioAxisScale,
  scoreAxisScale,
  steppedLinearAxisScale,
} from "../plot/axis-scale";
import {
  frontierAxisValue,
  type FrontierBenchmarkAxisKey,
  type FrontierBenchmarkRow,
  isScoreAxis,
  type PerformanceMetric,
  positiveMetric,
} from "./analysis";

export const PERFORMANCE_SCORES = [
  { key: "intelligence", label: "Intelligence" },
  { key: "agentic", label: "Agentic" },
] as const;

type FrontierBenchmarkAxisConfig = {
  label: string;
  shortLabel: string;
  get: (row: FrontierBenchmarkRow) => number | null;
  format: (value: number) => string;
  normalizedLabel: string;
  xHigherIsBetter?: boolean;
  logarithmic?: boolean;
};

export const frontierBenchmarkAxisConfig: Record<
  FrontierBenchmarkAxisKey,
  FrontierBenchmarkAxisConfig
> = {
  cost: {
    label: "Cost ↓",
    shortLabel: "Cost",
    get: (row) => frontierAxisValue(row, "cost"),
    format: formatMoney,
    normalizedLabel: "Cost× ↓",
  },
  time: {
    label: "Time ↓",
    shortLabel: "Time",
    get: (row) => frontierAxisValue(row, "time"),
    format: formatDurationShort,
    normalizedLabel: "Time× ↓",
  },
  tokens: {
    label: "Tokens ↓",
    shortLabel: "Tokens",
    get: (row) => frontierAxisValue(row, "tokens"),
    format: formatCompact,
    normalizedLabel: "Tokens× ↓",
  },
  speed: {
    label: "Speed Score",
    shortLabel: "Speed Score",
    get: (row) => frontierAxisValue(row, "speed"),
    format: formatTooltipScore,
    normalizedLabel: "Speed Score",
    xHigherIsBetter: true,
  },
  value: {
    label: "Value Score",
    shortLabel: "Value Score",
    get: (row) => frontierAxisValue(row, "value"),
    format: formatTooltipScore,
    normalizedLabel: "Value Score",
    xHigherIsBetter: true,
  },
};

const BENCHMARK_SCORE_AXIS_OPTIONS = {
  formatTick: (tick: number) => `${tick}%`,
  max: 100,
  steps: [10, 5, 2] as const,
};

export function frontierBenchmarkAxisConfigFor(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
): FrontierBenchmarkAxisConfig {
  const axisConfig = frontierBenchmarkAxisConfig[axisKey];
  if (!isAggregateView || isScoreAxis(axisKey)) {
    return axisConfig;
  }
  return {
    ...axisConfig,
    label: axisConfig.normalizedLabel,
    shortLabel: `${axisConfig.shortLabel}×`,
    format: formatResourceRatio,
    logarithmic: true,
  };
}

export function frontierAxisDescription(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
  row?: FrontierBenchmarkRow,
): string {
  if (isScoreAxis(axisKey)) {
    return `Published ${frontierBenchmarkAxisConfig[axisKey].label}; unchanged by evidence selection. Higher is better.`;
  }
  if (axisKey === "cost") {
    return isAggregateView
      ? "Cost: weighted median of benchmark/source cost ratios. 1× is the model-balanced reference median; lower is cheaper."
      : `Observed cost in dollars ${resourceUnitPhrase(row)}. Lower is better.`;
  }
  if (axisKey === "time") {
    return isAggregateView
      ? "Time: weighted median of benchmark/source runtime ratios. 1× is the model-balanced reference median; lower is faster."
      : `Observed runtime ${resourceUnitPhrase(row)}. Lower is better.`;
  }
  if (isAggregateView) {
    return "Tokens: weighted median of benchmark/source total-token ratios. 1× is the model-balanced reference median; lower uses fewer tokens.";
  }
  return `Observed total token use ${resourceUnitPhrase(row)}. Lower is better.`;
}

export function frontierAxisMetricLabel(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
  rows: FrontierBenchmarkRow[],
): string {
  const axisConfig = frontierBenchmarkAxisConfigFor(axisKey, isAggregateView);
  if (isAggregateView) {
    return axisConfig.label;
  }
  const row = rows.find((candidate) => positiveMetric(axisConfig.get(candidate)));
  if (row == null || axisConfig.xHigherIsBetter) return axisConfig.label;
  const unit = row.resourcePolicy?.unit === "total" ? "run" : "task";
  if (axisKey === "cost") return `Cost ($ / ${unit})`;
  if (axisKey === "time") return `Time / ${unit}`;
  return `Tokens / ${unit}`;
}

/** Native benchmark percentages and index points retain their distinct tick scales. */
export function frontierScoreAxisScale(values: number[], indexProxy: boolean): AxisScale {
  return indexProxy
    ? linearAxisScale(values, { formatTick: (value) => value.toFixed(0) })
    : steppedLinearAxisScale(values, BENCHMARK_SCORE_AXIS_OPTIONS);
}

export function frontierXAxisScale(
  values: number[],
  axisKey: FrontierBenchmarkAxisKey,
  axisConfig: FrontierBenchmarkAxisConfig,
): AxisScale {
  if (isScoreAxis(axisKey)) {
    return scoreAxisScale(values, {
      formatTick: axisConfig.format,
    });
  }
  if (axisConfig.logarithmic) return logRatioAxisScale(values, axisConfig.format);
  return linearAxisScale(values, {
    formatTick: axisConfig.format,
    min: 0,
  });
}

/**
 * The readout's facts for both plotted coordinates in their native units, then how many benchmarks the resource was measured on.
 * `noun` names the X measure as a frontier step does, such as `cost` or `Speed Score`.
 */
export function frontierBenchmarkReadoutFacts(
  row: FrontierBenchmarkRow,
  axisConfig: FrontierBenchmarkAxisConfig,
  noun: string,
  performance: PerformanceMetric,
): ReadoutFact[] {
  const publishedScore = performance !== "benchmarks";
  const label = publishedScore
    ? `${performance === "intelligence" ? "Intelligence" : "Agentic"} Score`
    : row.benchmarkKey === "all"
      ? "Normalized Performance"
      : row.benchmarkKey === "ale_bench"
        ? "Normalized ALE-Bench Score"
        : `${row.benchmarkLabel} Score`;
  const count = row.resourceCount;
  return [
    {
      label,
      value:
        publishedScore ||
        isAggregateIndex(row.benchmarkKey) ||
        row.benchmarkKey === "all" ||
        row.benchmarkKey === "ale_bench"
          ? formatTooltipScore(row.score)
          : formatPercentScore(row.score),
    },
    `${axisConfig.format(axisConfig.get(row) ?? 0)} ${noun}`,
    ...(count == null ? [] : [`${count} measured ${count === 1 ? "benchmark" : "benchmarks"}`]),
  ];
}

function resourceUnitPhrase(row?: FrontierBenchmarkRow): string {
  return row?.resourcePolicy?.unit === "total" ? "for the full run" : "per task";
}
