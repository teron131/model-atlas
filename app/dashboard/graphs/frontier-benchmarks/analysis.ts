/** Frontier benchmark analysis owns row projection, normalization, axis policy, and hover evidence. */

import {
  clampScore,
  minMaxRange,
  minMaxScale,
} from "../../../../src/model-atlas/pipeline/scores/normalization";
import { benchmarkTaskMetrics } from "../../../../src/model-atlas/pipeline/scores/resource-metrics";
import type {
  BenchmarkPortfolio,
  BenchmarkResourcePolicy,
  ModelAtlasPublishedModel,
} from "../../../../src/model-atlas/stats/types";
import { benchmarkLabels } from "../../shared/constants";
import { modelVariantKey } from "../../shared/model-display";
import { correlationValue } from "../chart-stats";
import {
  finiteValue,
  fmtCompact,
  fmtDurationShort,
  fmtMoney,
  fmtPercentScore,
  toPercent,
} from "../format";
import type { AxisScale } from "../plot/axis-scale";
import { linearAxisScale, scoreAxisScale, steppedLinearAxisScale } from "../plot/axis-scale";
import type { HoverRow } from "../types";

export type FrontierBenchmarkAxisKey = "speedValue" | "cost" | "time" | "tokens";
type FrontierBenchmarkResourceMetric = Exclude<FrontierBenchmarkAxisKey, "speedValue">;

export type FrontierBenchmarkRow = {
  benchmarkKey: string;
  benchmarkLabel: string;
  resourcePolicy: BenchmarkResourcePolicy | null;
  model: ModelAtlasPublishedModel;
  score: number;
  cost: number | null;
  seconds: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type FrontierBenchmarkAxisConfig = {
  label: string;
  shortLabel: string;
  get: (row: FrontierBenchmarkRow) => number | null;
  format: (value: number) => string;
  detailLabel: (row: FrontierBenchmarkRow) => string;
  normalizedLabel: string;
  normalizedDetailLabel: string;
  xHigherIsBetter?: boolean;
};

export type FrontierBenchmarkOption = {
  key: string;
  label: string;
  count: number;
};

type FrontierBenchmarkAxisOption = {
  key: FrontierBenchmarkAxisKey;
  label: string;
  disabled?: boolean;
};

export const frontierBenchmarkAxisConfig: Record<
  FrontierBenchmarkAxisKey,
  FrontierBenchmarkAxisConfig
> = {
  speedValue: {
    label: "Speed and Value Scores",
    shortLabel: "Efficiency ↑",
    get: speedValueBlendScore,
    format: (value) => value.toFixed(0),
    detailLabel: () => "Speed and Value Scores",
    normalizedLabel: "Speed and Value Scores",
    normalizedDetailLabel: "Speed and Value Scores",
    xHigherIsBetter: true,
  },
  cost: {
    label: "Cost ↓",
    shortLabel: "Cost ↓",
    get: (row) => row.cost,
    format: fmtMoney,
    detailLabel: (row) => resourceMetricLabel(row, "cost"),
    normalizedLabel: "Mean Normalized Cost ↓",
    normalizedDetailLabel: "Mean Normalized Cost ↓",
  },
  time: {
    label: "Time ↓",
    shortLabel: "Time ↓",
    get: (row) => row.seconds,
    format: fmtDurationShort,
    detailLabel: (row) => resourceMetricLabel(row, "time"),
    normalizedLabel: "Mean Normalized Time ↓",
    normalizedDetailLabel: "Mean Normalized Time ↓",
  },
  tokens: {
    label: "Tokens ↓",
    shortLabel: "Tokens ↓",
    get: (row) => row.totalTokens,
    format: fmtCompact,
    detailLabel: (row) => resourceMetricLabel(row, "tokens"),
    normalizedLabel: "Mean Normalized Tokens ↓",
    normalizedDetailLabel: "Mean Normalized Tokens ↓",
  },
};

const FRONTIER_SCORE_AXIS_OPTIONS = {
  formatTick: (tick: number) => `${tick}%`,
};

const BENCHMARK_SCORE_AXIS_OPTIONS = {
  formatTick: (tick: number) => `${tick}%`,
  max: 100,
  minimumTicks: 5,
  steps: [10, 5, 2] as const,
};

export function frontierBenchmarkRows(
  models: ModelAtlasPublishedModel[],
  portfolio: BenchmarkPortfolio,
): FrontierBenchmarkRow[] {
  const frontierKeys = Object.entries(portfolio)
    .filter(([, entry]) => entry.group === "frontier")
    .map(([key]) => key);
  return models
    .flatMap((model): FrontierBenchmarkRow[] => {
      const benchmarks = model.benchmarks ?? {};
      return frontierKeys.flatMap((benchmarkKey) => {
        const score = toPercent(benchmarks[benchmarkKey]);
        const resourcePolicy = portfolio[benchmarkKey]?.resourcePolicy ?? null;
        const task =
          resourcePolicy == null ? null : benchmarkTaskMetrics(model, benchmarkKey, resourcePolicy);
        const cost = finiteValue(task?.cost);
        const seconds = finiteValue(task?.seconds);
        const inputTokens = finiteValue(task?.input_tokens);
        const outputTokens = finiteValue(task?.output_tokens);
        const totalTokens = frontierResourceTokens(resourcePolicy, inputTokens, outputTokens);
        if (score == null) {
          return [];
        }
        return [
          {
            benchmarkKey,
            benchmarkLabel: benchmarkLabels[benchmarkKey] ?? benchmarkKey,
            resourcePolicy,
            model,
            score,
            cost: positiveMetric(cost) ? cost : null,
            seconds: positiveMetric(seconds) ? seconds : null,
            inputTokens,
            outputTokens,
            totalTokens: positiveMetric(totalTokens) ? totalTokens : null,
          },
        ];
      });
    })
    .sort((left, right) => right.score - left.score);
}

export function meanFrontierBenchmarkRows(rows: FrontierBenchmarkRow[]): FrontierBenchmarkRow[] {
  return [...groupBy(rows, (row) => modelVariantKey(row.model)).values()]
    .map((modelRows): FrontierBenchmarkRow | null => {
      const first = modelRows[0];
      if (first == null) {
        return null;
      }
      return {
        benchmarkKey: "all",
        benchmarkLabel: "Normalized frontier score",
        resourcePolicy: null,
        model: first.model,
        score: meanNumber(modelRows.map((row) => row.score)),
        cost: meanFiniteMetric(modelRows.map((row) => row.cost)),
        seconds: meanFiniteMetric(modelRows.map((row) => row.seconds)),
        inputTokens: null,
        outputTokens: null,
        totalTokens: meanFiniteMetric(modelRows.map((row) => row.totalTokens)),
      };
    })
    .filter((row): row is FrontierBenchmarkRow => row != null)
    .sort((left, right) => right.score - left.score);
}

export function normalizedFrontierBenchmarkRows(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[] = rows,
): FrontierBenchmarkRow[] {
  const rangesByBenchmark = new Map(
    [...groupBy(referenceRows, (row) => row.benchmarkKey)].map(([key, benchmarkRows]) => [
      key,
      {
        cost: minMaxRange(benchmarkRows.map((row) => row.cost)),
        seconds: minMaxRange(benchmarkRows.map((row) => row.seconds)),
        totalTokens: minMaxRange(benchmarkRows.map((row) => row.totalTokens)),
      },
    ]),
  );
  return normalizedFrontierBenchmarkScoreRows(rows, referenceRows).map((row) => {
    const ranges = rangesByBenchmark.get(row.benchmarkKey);
    return {
      ...row,
      cost: minMaxScale(ranges?.cost ?? null, row.cost) ?? row.cost,
      seconds: minMaxScale(ranges?.seconds ?? null, row.seconds) ?? row.seconds,
      totalTokens: minMaxScale(ranges?.totalTokens ?? null, row.totalTokens) ?? row.totalTokens,
    };
  });
}

/** Normalize benchmark-native quality values onto the shared 0-100 chart scale without changing resource measurements. */
export function normalizedFrontierBenchmarkScoreRows(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[] = rows,
): FrontierBenchmarkRow[] {
  const rangesByBenchmark = new Map(
    [...groupBy(referenceRows, (row) => row.benchmarkKey)].map(([key, benchmarkRows]) => [
      key,
      minMaxRange(benchmarkRows.map((row) => row.score)),
    ]),
  );
  return rows.map((row) => {
    const normalizedScore = minMaxScale(rangesByBenchmark.get(row.benchmarkKey) ?? null, row.score);
    return {
      ...row,
      score: normalizedScore == null ? row.score : clampScore(normalizedScore),
    };
  });
}

/** Resolve one native benchmark or a normalized aggregate for the selected benchmark subset. */
export function selectedFrontierBenchmarkRows(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[],
  selectedBenchmarkKeys: readonly string[],
): FrontierBenchmarkRow[] {
  const selectedKeySet = new Set(selectedBenchmarkKeys);
  if (selectedKeySet.size === 0) {
    return [];
  }
  const selectedRows = rows.filter((row) => selectedKeySet.has(row.benchmarkKey));
  if (selectedKeySet.size === 1) {
    const [selectedBenchmarkKey] = selectedKeySet;
    return selectedBenchmarkKey === "ale_bench"
      ? normalizedFrontierBenchmarkScoreRows(selectedRows, referenceRows)
      : selectedRows;
  }
  return meanFrontierBenchmarkRows(normalizedFrontierBenchmarkRows(selectedRows, referenceRows));
}

export function frontierBenchmarkOptions(rows: FrontierBenchmarkRow[]): FrontierBenchmarkOption[] {
  const options = new Map<string, FrontierBenchmarkOption>();
  for (const row of rows) {
    const option = options.get(row.benchmarkKey) ?? {
      key: row.benchmarkKey,
      label: row.benchmarkLabel,
      count: 0,
    };
    option.count += 1;
    options.set(row.benchmarkKey, option);
  }
  return [...options.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true }) ||
      right.count - left.count,
  );
}

export function frontierBenchmarkCorrelationByBenchmark(
  benchmarkRows: FrontierBenchmarkRow[],
): Map<string, number | null> {
  const correlations = new Map<string, number | null>();
  for (const [benchmarkKey, rows] of groupBy(benchmarkRows, (row) => row.benchmarkKey)) {
    correlations.set(benchmarkKey, benchmarkCorrelation(rows));
  }
  return correlations;
}

export function frontierBenchmarkAxisOptions(
  rows: FrontierBenchmarkRow[],
  isAggregateView: boolean,
): FrontierBenchmarkAxisOption[] {
  return Object.entries(frontierBenchmarkAxisConfig).map(([key, config]) => {
    const axisKey = key as FrontierBenchmarkAxisKey;
    const axisConfig = frontierBenchmarkAxisConfigFor(axisKey, isAggregateView);
    return {
      key: axisKey,
      label: config.shortLabel,
      disabled: !rows.some((row) => positiveMetric(axisConfig.get(row))),
    };
  });
}

export function selectedFrontierBenchmarkAxisKey(
  axisKey: FrontierBenchmarkAxisKey,
  options: FrontierBenchmarkAxisOption[],
): FrontierBenchmarkAxisKey {
  return options.some((option) => option.key === axisKey && !option.disabled)
    ? axisKey
    : (firstAvailableAxis(options, "speedValue") ??
        firstAvailableAxis(options, "cost") ??
        options.find((option) => !option.disabled)?.key ??
        axisKey);
}

function firstAvailableAxis(
  options: FrontierBenchmarkAxisOption[],
  axisKey: FrontierBenchmarkAxisKey,
): FrontierBenchmarkAxisKey | null {
  const option = options.find((candidate) => candidate.key === axisKey);
  return option != null && !option.disabled ? option.key : null;
}

export function frontierBenchmarkAxisConfigFor(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
): FrontierBenchmarkAxisConfig {
  const axisConfig = frontierBenchmarkAxisConfig[axisKey];
  if (!isAggregateView || isEfficiencyScoreAxis(axisKey)) {
    return axisConfig;
  }
  return {
    ...axisConfig,
    label: axisConfig.normalizedLabel,
    format: (value) => value.toFixed(0),
    detailLabel: () => axisConfig.normalizedDetailLabel,
  };
}

export function frontierAxisDescription(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
  row?: FrontierBenchmarkRow,
): string {
  if (axisKey === "speedValue") {
    return "Speed and Value Scores are averaged with equal weight; higher is better.";
  }
  if (axisKey === "cost") {
    return isAggregateView
      ? "Cost is normalized within each benchmark before averaging, while preserving whether the source reports resources per task or for the full run."
      : `Cost is the observed dollars ${resourceUnitPhrase(row)}; lower is better.`;
  }
  if (axisKey === "time") {
    return isAggregateView
      ? "Runtime is normalized within each benchmark before averaging, while preserving whether the source reports resources per task or for the full run."
      : `Runtime is the observed time ${resourceUnitPhrase(row)}; lower is better.`;
  }
  if (isAggregateView) {
    return "Token use is normalized within each benchmark before averaging, while preserving whether the source reports resources per task or for the full run.";
  }
  const tokenUse =
    row?.resourcePolicy?.tokenMeasure === "output_tokens" ? "output-token use" : "token use";
  return `The axis shows observed ${tokenUse} ${resourceUnitPhrase(row)}; lower is better.`;
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
  return row == null ? axisConfig.label : axisConfig.detailLabel(row);
}

export function frontierScoreAxisScale(values: number[], isAggregateView: boolean): AxisScale {
  if (isAggregateView) {
    return scoreAxisScale(values, FRONTIER_SCORE_AXIS_OPTIONS);
  }
  return steppedLinearAxisScale(values, BENCHMARK_SCORE_AXIS_OPTIONS);
}

export function frontierXAxisScale(
  values: number[],
  axisKey: FrontierBenchmarkAxisKey,
  axisConfig: FrontierBenchmarkAxisConfig,
): AxisScale {
  if (isEfficiencyScoreAxis(axisKey)) {
    return scoreAxisScale(values, {
      formatTick: axisConfig.format,
    });
  }
  return linearAxisScale(values, {
    formatTick: axisConfig.format,
    min: 0,
  });
}

export function frontierBenchmarkHoverRows(
  row: FrontierBenchmarkRow,
  axisConfig: FrontierBenchmarkAxisConfig,
): HoverRow[] {
  const rows: HoverRow[] = [];
  rows.push(
    [
      row.benchmarkKey === "all"
        ? "Mean Normalized Benchmark Score"
        : row.benchmarkKey === "ale_bench"
          ? "Normalized Benchmark Score"
          : "Benchmark Score",
      fmtPercentScore(row.score),
    ],
    [axisConfig.detailLabel(row), axisConfig.format(axisConfig.get(row) ?? 0)],
  );
  if (axisConfig.get !== speedValueBlendScore) {
    rows.push(["Speed and Value Scores", speedValueBlendScore(row).toFixed(1)]);
  }
  return rows;
}

function speedScore(row: FrontierBenchmarkRow): number {
  return finiteValue(row.model.scores?.speed_score) ?? 0;
}

function valueScore(row: FrontierBenchmarkRow): number {
  return finiteValue(row.model.scores?.value_score) ?? 0;
}

export function speedValueBlendScore(row: FrontierBenchmarkRow): number {
  return (valueScore(row) + speedScore(row)) / 2;
}

function isEfficiencyScoreAxis(axisKey: FrontierBenchmarkAxisKey): boolean {
  return axisKey === "speedValue";
}

export function positiveMetric(value: number | null): value is number {
  return value != null && value > 0;
}

function meanNumber(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanFiniteMetric(values: Array<number | null>): number | null {
  const finiteValues = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finiteValues.length === 0 ? null : meanNumber(finiteValues);
}

function frontierResourceTokens(
  resourcePolicy: BenchmarkResourcePolicy | null,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (resourcePolicy == null) {
    return null;
  }
  if (resourcePolicy.tokenMeasure === "output_tokens") {
    return outputTokens != null && outputTokens > 0 ? outputTokens : null;
  }
  return inputTokens != null && inputTokens > 0
    ? inputTokens + Math.max(outputTokens ?? 0, 0)
    : outputTokens != null && outputTokens > 0
      ? outputTokens
      : null;
}

function groupBy<T, TKey>(values: T[], getKey: (value: T) => TKey): Map<TKey, T[]> {
  const groups = new Map<TKey, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function benchmarkCorrelation(rows: FrontierBenchmarkRow[]): number | null {
  return correlationValue(
    rows.flatMap((row) => {
      const intelligenceScore = finiteValue(row.model.scores?.intelligence_score);
      if (intelligenceScore == null) {
        return [];
      }
      return [
        {
          x: row.score,
          y: intelligenceScore,
        },
      ];
    }),
  );
}

function resourceMetricLabel(
  row: FrontierBenchmarkRow,
  metric: FrontierBenchmarkResourceMetric,
): string {
  if (row.benchmarkKey === "all") {
    return `Mean Normalized ${resourceMetricName(metric)}`;
  }
  const policy = row.resourcePolicy;
  if (policy == null) {
    return `${row.benchmarkLabel} ${resourceMetricName(metric)}`;
  }
  const metricName = resourceMetricName(metric, policy);
  if (policy.unit === "total") {
    return `${row.benchmarkLabel} total ${metricName}`;
  }
  return `${row.benchmarkLabel} ${metricName} per task`;
}

function resourceUnitPhrase(row?: FrontierBenchmarkRow): string {
  return row?.resourcePolicy?.unit === "total" ? "for the full run" : "per task";
}

function resourceMetricName(
  metric: FrontierBenchmarkResourceMetric,
  policy?: BenchmarkResourcePolicy,
): string {
  if (metric === "time") {
    return "time";
  }
  if (metric === "cost") {
    return "cost";
  }
  return policy?.tokenMeasure === "output_tokens" ? "output tokens" : "tokens";
}
