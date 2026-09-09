/** Frontier benchmark analysis owns row projection, normalization, axis policy, and hover evidence. */

import {
  AA_INDEX_STANDALONE_COMPONENT_KEYS,
  indexPolicy,
  isAggregateIndex,
  residualIndexBreadth,
} from "../../../../src/model-atlas/benchmarks/index-policy";
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

export type FrontierBenchmarkAxisKey = "cost" | "time" | "tokens" | "speed" | "value";
export type PerformanceMetric = "intelligence" | "agentic" | "benchmarks";
type FrontierBenchmarkResourceMetric = Exclude<FrontierBenchmarkAxisKey, "speed" | "value">;

export const PERFORMANCE_SCORES = [
  { key: "intelligence", label: "Intelligence" },
  { key: "agentic", label: "Agentic" },
] as const;

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
  detail?: string;
};

export const frontierBenchmarkAxisConfig: Record<
  FrontierBenchmarkAxisKey,
  FrontierBenchmarkAxisConfig
> = {
  cost: {
    label: "Cost ↓",
    shortLabel: "Cost",
    get: (row) => row.cost,
    format: fmtMoney,
    detailLabel: (row) => resourceMetricLabel(row, "cost"),
    normalizedLabel: "Normalized Cost ↓",
    normalizedDetailLabel: "Normalized Cost ↓",
  },
  time: {
    label: "Time ↓",
    shortLabel: "Time",
    get: (row) => row.seconds,
    format: fmtDurationShort,
    detailLabel: (row) => resourceMetricLabel(row, "time"),
    normalizedLabel: "Normalized Time ↓",
    normalizedDetailLabel: "Normalized Time ↓",
  },
  tokens: {
    label: "Tokens ↓",
    shortLabel: "Tokens",
    get: (row) => row.totalTokens,
    format: fmtCompact,
    detailLabel: (row) => resourceMetricLabel(row, "tokens"),
    normalizedLabel: "Normalized Tokens ↓",
    normalizedDetailLabel: "Normalized Tokens ↓",
  },
  speed: {
    label: "Speed Score",
    shortLabel: "Speed Score",
    get: (row) => finiteValue(row.model.scores?.speed_score),
    format: fmtTooltipScore,
    detailLabel: () => "Speed Score",
    normalizedLabel: "Speed Score",
    normalizedDetailLabel: "Speed Score",
    xHigherIsBetter: true,
  },
  value: {
    label: "Value Score",
    shortLabel: "Value Score",
    get: (row) => finiteValue(row.model.scores?.value_score),
    format: fmtTooltipScore,
    detailLabel: () => "Value Score",
    normalizedLabel: "Value Score",
    normalizedDetailLabel: "Value Score",
    xHigherIsBetter: true,
  },
};

const BENCHMARK_SCORE_AXIS_OPTIONS = {
  formatTick: (tick: number) => `${tick}%`,
  max: 100,
  minimumTicks: 5,
  steps: [10, 5, 2] as const,
};

/** Effort curves use the selected task sources with broad effort coverage, plus catalogued index proxies. */
const EFFORT_BENCHMARK_KEYS = new Set([
  "arc_agi_2",
  "frontier_code",
  "automation_bench",
  "deep_swe",
  "cursorbench",
  "arc_agi_3",
]);

export function frontierBenchmarkRows(
  models: ModelAtlasPublishedModel[],
  portfolio: BenchmarkPortfolio,
): FrontierBenchmarkRow[] {
  const frontierKeys = Object.entries(portfolio)
    .filter(
      ([key]) =>
        EFFORT_BENCHMARK_KEYS.has(key) ||
        AA_INDEX_STANDALONE_COMPONENT_KEYS.has(key) ||
        isAggregateIndex(key),
    )
    .map(([key]) => key);
  return models
    .flatMap((model): FrontierBenchmarkRow[] => {
      return frontierKeys.flatMap((benchmarkKey) => {
        const policy = indexPolicy(benchmarkKey);
        const indexProxy = policy != null;
        if (
          indexProxy &&
          canonicalReasoningEffort(model.reasoning_effort) != null &&
          !policy.effortAware
        )
          return [];
        const value = benchmarkMetricValue(model, benchmarkKey);
        const score = indexProxy ? value : toPercent(value);
        const resources = policy?.resources;
        const resourcePolicy = resources?.policy ?? portfolio[benchmarkKey]?.resourcePolicy ?? null;
        const task =
          resourcePolicy == null
            ? null
            : benchmarkTaskMetrics(model, resources?.key ?? benchmarkKey);
        const cost = finiteValue(task?.cost);
        const seconds = finiteValue(task?.seconds);
        const inputTokens = finiteValue(task?.input_tokens);
        const outputTokens = finiteValue(task?.output_tokens);
        const resourceKey = resources?.key ?? benchmarkKey;
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
            benchmarkLabel: `${benchmarkLabels[benchmarkKey] ?? benchmarkKey}${indexProxy ? " (index)" : ""}`,
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
        benchmarkLabel: "Normalized performance",
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
      cost: minMaxScale(ranges?.cost ?? null, row.cost),
      seconds: minMaxScale(ranges?.seconds ?? null, row.seconds),
      totalTokens: minMaxScale(ranges?.totalTokens ?? null, row.totalTokens),
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
  return rows.flatMap((row) => {
    const normalizedScore = minMaxScale(rangesByBenchmark.get(row.benchmarkKey) ?? null, row.score);
    return normalizedScore == null ? [] : [{ ...row, score: clampScore(normalizedScore) }];
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
    format: (value) => value.toFixed(0),
    detailLabel: () => axisConfig.normalizedDetailLabel,
  };
}

export function frontierAxisDescription(
  axisKey: FrontierBenchmarkAxisKey,
  isAggregateView: boolean,
  row?: FrontierBenchmarkRow,
): string {
  if (isScoreAxis(axisKey)) {
    return `${frontierBenchmarkAxisConfig[axisKey].label} is the published model-wide score; evidence selection does not recalculate it. Higher is better.`;
  }
  if (axisKey === "cost") {
    return isAggregateView
      ? "Cost is normalized within each source against the full reference population before averaging; lower is better."
      : `Cost is the observed dollars ${resourceUnitPhrase(row)}; lower is better.`;
  }
  if (axisKey === "time") {
    return isAggregateView
      ? "Time is normalized within each source against the full reference population before averaging; lower is better."
      : `Runtime is the observed time ${resourceUnitPhrase(row)}; lower is better.`;
  }
  if (isAggregateView) {
    return "Matching token measurements are normalized within each source against the full reference population before averaging; lower is better.";
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
  if (row == null || axisConfig.xHigherIsBetter) return axisConfig.label;
  const unit = row.resourcePolicy?.unit === "total" ? "run" : "task";
  if (axisConfig.get === frontierBenchmarkAxisConfig.cost.get) return `Cost ($ / ${unit})`;
  if (axisConfig.get === frontierBenchmarkAxisConfig.time.get) return `Time / ${unit}`;
  const tokens =
    row.resourcePolicy?.tokenMeasure === "output_tokens" ? "Output tokens" : "Total tokens";
  return `${tokens} / ${unit}`;
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
  isAggregateView = false,
): AxisScale {
  if (
    isScoreAxis(axisKey) ||
    (isAggregateView && values.every((value) => value >= 0 && value <= 100))
  ) {
    return scoreAxisScale(values, {
      formatTick: axisConfig.format,
    });
  }
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
    ...(publishedScore
      ? [
          [
            "Performance basis",
            "Published score, including supported estimates and coverage adjustments",
          ] as HoverRow,
        ]
      : []),
  ];
}

/** Published resource scores are independent coordinates, never an implicit efficiency blend. */
export function isScoreAxis(axisKey: FrontierBenchmarkAxisKey): boolean {
  return axisKey === "speed" || axisKey === "value";
}

/** Keep model-wide Y scores intact; measured X values still require selected resource evidence. */
export function performanceComparisonRows(
  models: ModelAtlasPublishedModel[],
  evidenceRows: FrontierBenchmarkRow[],
  performance: PerformanceMetric,
  axisKey: FrontierBenchmarkAxisKey,
): FrontierBenchmarkRow[] {
  if (performance === "benchmarks") return evidenceRows;
  const sourceRows = isScoreAxis(axisKey)
    ? models.map(
        (model): FrontierBenchmarkRow => ({
          benchmarkKey: performance,
          benchmarkLabel: performance === "intelligence" ? "Intelligence" : "Agentic",
          resourcePolicy: null,
          model,
          score: 0,
          cost: null,
          seconds: null,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        }),
      )
    : evidenceRows;
  return sourceRows.flatMap((row) => {
    const score = finiteValue(
      row.model.scores?.[performance === "intelligence" ? "intelligence_score" : "agentic_score"],
    );
    return score == null ? [] : [{ ...row, score }];
  });
}

/** Published performance scores use measured sources contributing to that dimension, independent of any previous manual selection. */
export function automaticResourceKeys(
  rows: FrontierBenchmarkRow[],
  portfolio: BenchmarkPortfolio,
  performance: Exclude<PerformanceMetric, "benchmarks">,
  axisKey: FrontierBenchmarkAxisKey,
): string[] {
  if (isScoreAxis(axisKey)) return [];
  const metric = frontierBenchmarkAxisConfig[axisKey].get;
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            (portfolio[row.benchmarkKey]?.dimensionLoadings[performance] ?? 0) > 0 &&
            positiveMetric(metric(row)),
        )
        .map((row) => row.benchmarkKey),
    ),
  ];
}

/** A normalized resource basket must represent the same measurement, not merely share a numeric range. */
export function resourceComparisonIssue(
  rows: FrontierBenchmarkRow[],
  selectedKeys: readonly string[],
  axisKey: FrontierBenchmarkAxisKey,
): string | null {
  if (isScoreAxis(axisKey) || selectedKeys.length < 2) return null;
  const selected = new Set(selectedKeys);
  const measured = rows.filter(
    (row) =>
      selected.has(row.benchmarkKey) &&
      positiveMetric(frontierBenchmarkAxisConfig[axisKey].get(row)),
  );
  const units = new Set(measured.map((row) => row.resourcePolicy?.unit));
  if (units.has(undefined))
    return "Some selected sources have no declared resource unit. Select sources with a known per-task or full-run basis.";
  if (units.size > 1)
    return "Selected sources mix per-task and full-run measurements. Select sources with the same resource basis.";
  if (axisKey === "tokens") {
    const measures = new Set(
      measured.map((row) =>
        row.resourcePolicy?.tokenMeasure === "output_tokens" ? "output" : "total",
      ),
    );
    if (measures.size > 1)
      return "Selected sources mix output tokens and total tokens. Select sources with the same token measurement.";
  }
  return null;
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
      weight: residualIndexBreadth(row.benchmarkKey, includedKeys),
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
    return `Normalized ${resourceMetricName(metric)}`;
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
