/** Frontier benchmark analysis owns row projection, normalization, axis policy, and hover evidence. */

import {
  AA_INDEX_STANDALONE_COMPONENT_KEYS,
  EFFORT_INDEX_BENCHMARK_KEYS,
  INDEX_REPRESENTED_BENCHMARK_COUNTS,
} from "../../../../src/model-atlas/benchmarks/catalog/portfolio";
import { canonicalReasoningEffort } from "../../../../src/model-atlas/identity/normalization";
import { weightedMeanOfFinite } from "../../../../src/model-atlas/math-utils";
import {
  clampScore,
  minMaxRange,
  minMaxScale,
} from "../../../../src/model-atlas/pipeline/scores/normalization";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  directBenchmarkTokens,
} from "../../../../src/model-atlas/pipeline/scores/resource-metrics";
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
  fmtTooltipScore,
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

/** Index identities follow the scoring catalog; resource ownership remains specific to each source. */
export function isIndexProxy(key: string): boolean {
  return Object.hasOwn(INDEX_REPRESENTED_BENCHMARK_COUNTS, key);
}

/** Effort curves use the selected task sources with broad effort coverage, plus catalogued index proxies. */
const EFFORT_BENCHMARK_KEYS = new Set([
  "arc_agi_2",
  "frontier_code",
  "automation_bench",
  "deep_swe",
  "cursorbench",
  "arc_agi_3",
]);

const AA_INDEX_RESOURCE_POLICY = {
  source: "artificial_analysis",
  unit: "per_task",
  tokenMeasure: "output_tokens",
  qualityCoordinate: "linear",
} as const satisfies BenchmarkResourcePolicy;

export function frontierBenchmarkRows(
  models: ModelAtlasPublishedModel[],
  portfolio: BenchmarkPortfolio,
): FrontierBenchmarkRow[] {
  const frontierKeys = Object.entries(portfolio)
    .filter(
      ([key]) =>
        EFFORT_BENCHMARK_KEYS.has(key) ||
        AA_INDEX_STANDALONE_COMPONENT_KEYS.has(key) ||
        isIndexProxy(key),
    )
    .map(([key]) => key);
  return models
    .flatMap((model): FrontierBenchmarkRow[] => {
      return frontierKeys.flatMap((benchmarkKey) => {
        const indexProxy = isIndexProxy(benchmarkKey);
        if (
          indexProxy &&
          canonicalReasoningEffort(model.reasoning_effort) != null &&
          !EFFORT_INDEX_BENCHMARK_KEYS.has(benchmarkKey)
        )
          return [];
        const value = benchmarkMetricValue(model, benchmarkKey);
        const score = indexProxy ? value : toPercent(value);
        const aaIndex = benchmarkKey === "aa_intelligence_index";
        const resourcePolicy = aaIndex
          ? AA_INDEX_RESOURCE_POLICY
          : (portfolio[benchmarkKey]?.resourcePolicy ?? null);
        const task =
          resourcePolicy == null
            ? null
            : benchmarkTaskMetrics(model, aaIndex ? "artificial_analysis" : benchmarkKey);
        const cost = finiteValue(task?.cost);
        const seconds = finiteValue(task?.seconds);
        const inputTokens = finiteValue(task?.input_tokens);
        const outputTokens = finiteValue(task?.output_tokens);
        const resourceKey = aaIndex ? "artificial_analysis" : benchmarkKey;
        const totalTokens =
          resourcePolicy == null
            ? null
            : resourcePolicy.tokenMeasure === "output_tokens"
              ? directBenchmarkTokens(model, resourceKey, "output_tokens")
              : (directBenchmarkTokens(model, resourceKey, "tokens") ??
                directBenchmarkTokens(model, resourceKey, "input-output"));
        if (score == null) {
          return [];
        }
        return [
          {
            benchmarkKey,
            benchmarkLabel: `${benchmarkLabels[benchmarkKey] ?? benchmarkKey}${indexProxy ? " (index proxy)" : ""}`,
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

/** AA represents only component breadth not already counted as standalone evidence in this basket. */
export function frontierEvidenceWeight(key: string, includedKeys: readonly string[] = []): number {
  const breadth =
    INDEX_REPRESENTED_BENCHMARK_COUNTS[key as keyof typeof INDEX_REPRESENTED_BENCHMARK_COUNTS] ?? 1;
  if (key !== "aa_intelligence_index") return breadth;
  const standaloneCount = [...new Set(includedKeys)].filter((candidate) =>
    AA_INDEX_STANDALONE_COMPONENT_KEYS.has(candidate),
  ).length;
  return Math.max(0, breadth - standaloneCount);
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
        score: meanMetric(modelRows, (row) => row.score)!,
        cost: meanMetric(modelRows, (row) => row.cost),
        seconds: meanMetric(modelRows, (row) => row.seconds),
        inputTokens: null,
        outputTokens: null,
        totalTokens: meanMetric(modelRows, (row) => row.totalTokens),
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
      disabled: !rows.some((row) =>
        positiveMetric(axisConfig.get(row), isAggregateView || axisKey === "speedValue"),
      ),
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
    return "Speed and Value Scores are averaged with equal weight; both scores are required and higher is better.";
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

export function frontierScoreAxisScale(
  values: number[],
  isAggregateView: boolean,
  indexProxy = false,
): AxisScale {
  if (indexProxy) return linearAxisScale(values, { formatTick: (value) => value.toFixed(0) });
  if (isAggregateView) {
    return scoreAxisScale(values, FRONTIER_SCORE_AXIS_OPTIONS);
  }
  return steppedLinearAxisScale(values, BENCHMARK_SCORE_AXIS_OPTIONS);
}

export function frontierXAxisScale(
  values: number[],
  axisKey: FrontierBenchmarkAxisKey,
  axisConfig: FrontierBenchmarkAxisConfig,
  isAggregateView = false,
): AxisScale {
  if (isAggregateView && values.every((value) => value >= 0 && value <= 100)) {
    return scoreAxisScale(values, { formatTick: axisConfig.format });
  }
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
          : isIndexProxy(row.benchmarkKey)
            ? "Index Score"
            : "Benchmark Score",
      isIndexProxy(row.benchmarkKey)
        ? `${row.score.toFixed(2)} points`
        : fmtPercentScore(row.score),
    ],
    [axisConfig.detailLabel(row), axisConfig.format(axisConfig.get(row) ?? 0)],
  );
  if (axisConfig.get !== speedValueBlendScore) {
    rows.push(["Speed and Value Scores", fmtTooltipScore(speedValueBlendScore(row))]);
  }
  return rows;
}

/** Missing resource scores cannot become zero-valued coordinates in a two-score comparison. */
export function speedValueBlendScore(row: FrontierBenchmarkRow): number | null {
  const value = finiteValue(row.model.scores?.value_score);
  const speed = finiteValue(row.model.scores?.speed_score);
  return value == null || speed == null ? null : (value + speed) / 2;
}

function isEfficiencyScoreAxis(axisKey: FrontierBenchmarkAxisKey): boolean {
  return axisKey === "speedValue";
}

export function positiveMetric(value: number | null, allowZero = false): value is number {
  return value != null && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}

function meanMetric(
  rows: FrontierBenchmarkRow[],
  get: (row: FrontierBenchmarkRow) => number | null,
): number | null {
  const measured = rows.filter((row) => finiteValue(get(row)) != null);
  const includedKeys = measured.map((row) => row.benchmarkKey);
  return weightedMeanOfFinite(
    measured.map((row) => ({
      value: get(row),
      weight: frontierEvidenceWeight(row.benchmarkKey, includedKeys),
    })),
  );
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
