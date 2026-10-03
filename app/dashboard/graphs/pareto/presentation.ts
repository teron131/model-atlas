/** Pareto axes, resource units, and hover labels present prepared comparison rows without choosing their evidence or changing scores. */

import { isAggregateIndex } from "../../../../src/model-atlas/benchmarks/index-policy";
import { formatResourceRatio } from "../../shared/resource-ratio-display";
import {
  fmtCompact,
  fmtDurationShort,
  fmtMoney,
  fmtPercentScore,
  fmtTooltipScore,
} from "../format";
import type { HoverRow } from "../hover-state";
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

type FrontierBenchmarkResourceMetric = Exclude<FrontierBenchmarkAxisKey, "speed" | "value">;

export const PERFORMANCE_SCORES = [
  { key: "intelligence", label: "Intelligence" },
  { key: "agentic", label: "Agentic" },
] as const;

type FrontierBenchmarkAxisConfig = {
  label: string;
  shortLabel: string;
  get: (row: FrontierBenchmarkRow) => number | null;
  format: (value: number) => string;
  detailLabel: (row: FrontierBenchmarkRow) => string;
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
    format: fmtMoney,
    detailLabel: (row) => resourceMetricLabel(row, "cost"),
    normalizedLabel: "Relative Cost ↓",
  },
  time: {
    label: "Time ↓",
    shortLabel: "Time",
    get: (row) => frontierAxisValue(row, "time"),
    format: fmtDurationShort,
    detailLabel: (row) => resourceMetricLabel(row, "time"),
    normalizedLabel: "Relative Time ↓",
  },
  tokens: {
    label: "Tokens ↓",
    shortLabel: "Tokens",
    get: (row) => frontierAxisValue(row, "tokens"),
    format: fmtCompact,
    detailLabel: (row) => resourceMetricLabel(row, "tokens"),
    normalizedLabel: "Relative Tokens ↓",
  },
  speed: {
    label: "Speed Score",
    shortLabel: "Speed Score",
    get: (row) => frontierAxisValue(row, "speed"),
    format: fmtTooltipScore,
    detailLabel: () => "Speed Score",
    normalizedLabel: "Speed Score",
    xHigherIsBetter: true,
  },
  value: {
    label: "Value Score",
    shortLabel: "Value Score",
    get: (row) => frontierAxisValue(row, "value"),
    format: fmtTooltipScore,
    detailLabel: () => "Value Score",
    normalizedLabel: "Value Score",
    xHigherIsBetter: true,
  },
};

const BENCHMARK_SCORE_AXIS_OPTIONS = {
  formatTick: (tick: number) => `${tick}%`,
  max: 100,
  minimumTicks: 5,
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
    format: formatResourceRatio,
    detailLabel: () => axisConfig.normalizedLabel,
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
  axisConfig: FrontierBenchmarkAxisConfig,
  isAggregateView: boolean,
  rows: FrontierBenchmarkRow[],
): string {
  if (isAggregateView) {
    return axisConfig.label;
  }
  const row = rows.find((candidate) => positiveMetric(axisConfig.get(candidate)));
  if (row == null || axisConfig.xHigherIsBetter) return axisConfig.label;
  const unit = row.resourcePolicy?.unit === "total" ? "run" : "task";
  if (axisConfig.get === frontierBenchmarkAxisConfig.cost.get) return `Cost ($ / ${unit})`;
  if (axisConfig.get === frontierBenchmarkAxisConfig.time.get) return `Time / ${unit}`;
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

/** Describe exactly the two plotted coordinates, retaining native units and published-score identity. */
export function frontierBenchmarkHoverRows(
  row: FrontierBenchmarkRow,
  axisConfig: FrontierBenchmarkAxisConfig,
  performance: PerformanceMetric = "benchmarks",
): HoverRow[] {
  const publishedScore = performance !== "benchmarks";
  const label = publishedScore
    ? `${performance === "intelligence" ? "Intelligence" : "Agentic"} Score`
    : row.benchmarkKey === "all"
      ? "Normalized Performance"
      : row.benchmarkKey === "ale_bench"
        ? "Normalized ALE-Bench Score"
        : `${row.benchmarkLabel} Score`;
  return [
    [
      label,
      publishedScore ||
      isAggregateIndex(row.benchmarkKey) ||
      row.benchmarkKey === "all" ||
      row.benchmarkKey === "ale_bench"
        ? fmtTooltipScore(row.score)
        : fmtPercentScore(row.score),
    ],
    [axisConfig.detailLabel(row), axisConfig.format(axisConfig.get(row) ?? 0)],
    ...(row.resourceCount == null
      ? []
      : [["Measured benchmarks", String(row.resourceCount)] as HoverRow]),
    ...(publishedScore
      ? [
          [
            "Performance basis",
            "Published; includes supported estimates and coverage adjustments",
          ] as HoverRow,
        ]
      : []),
  ];
}

function resourceMetricLabel(
  row: FrontierBenchmarkRow,
  metric: FrontierBenchmarkResourceMetric,
): string {
  if (row.benchmarkKey === "all") {
    return `Normalized ${resourceMetricName(metric)}`;
  }
  const policy = row.resourcePolicy;
  if (policy == null) {
    return `${row.benchmarkLabel} ${resourceMetricName(metric)}`;
  }
  const metricName = resourceMetricName(metric);
  if (policy.unit === "total") {
    return `${row.benchmarkLabel} total ${metricName}`;
  }
  return `${row.benchmarkLabel} ${metricName} per task`;
}

function resourceUnitPhrase(row?: FrontierBenchmarkRow): string {
  return row?.resourcePolicy?.unit === "total" ? "for the full run" : "per task";
}

function resourceMetricName(metric: FrontierBenchmarkResourceMetric): string {
  if (metric === "time") {
    return "time";
  }
  if (metric === "cost") {
    return "cost";
  }
  return "total tokens";
}
