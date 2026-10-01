/** Frontier benchmark analysis owns row projection, normalization, axis policy, and hover evidence. */

import {
  AA_INDEX_COMPONENT_BENCHMARK_KEYS,
  indexPolicy,
  isAggregateIndex,
  residualIndexBreadth,
} from "../../../../src/model-atlas/benchmarks/index-policy";
import { BENCHMARK_RESOURCE_SOURCE_LABELS } from "../../../../src/model-atlas/benchmarks/resource-sources";
import { canonicalReasoningEffort } from "../../../../src/model-atlas/identity/normalization";
import {
  linearScore,
  minMaxRange,
  pearsonCorrelation,
  weightedMeanOfFinite,
} from "../../../../src/model-atlas/math-utils";
import { clampScore } from "../../../../src/model-atlas/pipeline/scores/normalization";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
} from "../../../../src/model-atlas/pipeline/scores/resource-metrics";
import {
  type ResourceRatioObservation,
  resourceRatioObservations,
  resourceRatioReferences,
  summarizeResourceRatios,
} from "../../../../src/model-atlas/stats/resource-ratios";
import type {
  BenchmarkPortfolio,
  BenchmarkResourcePolicy,
  ModelAtlasModel,
} from "../../../../src/model-atlas/stats/types";
import { benchmarkLabels } from "../../shared/constants";
import { modelVariantKey } from "../../shared/model-display";
import { formatResourceRatio } from "../../shared/resource-ratio-display";
import {
  finiteValue,
  fmtCompact,
  fmtDurationShort,
  fmtMoney,
  fmtPercentScore,
  fmtTooltipScore,
  toPercent,
} from "../format";
import type { HoverRow } from "../hover-state";
import type { AxisScale } from "../plot/axis-scale";
import {
  linearAxisScale,
  logRatioAxisScale,
  scoreAxisScale,
  steppedLinearAxisScale,
} from "../plot/axis-scale";

export type FrontierBenchmarkAxisKey = "cost" | "time" | "tokens" | "speed" | "value";
export type PerformanceMetric = "intelligence" | "agentic" | "benchmarks";
type FrontierBenchmarkResourceMetric = Exclude<FrontierBenchmarkAxisKey, "speed" | "value">;

export const PERFORMANCE_SCORES = [
  { key: "intelligence", label: "Intelligence" },
  { key: "agentic", label: "Agentic" },
] as const;

export type FrontierBenchmarkRow = {
  benchmarkKey: string;
  baseBenchmarkKey: string;
  benchmarkLabel: string;
  weight: number;
  resourcePolicy: BenchmarkResourcePolicy | null;
  model: ModelAtlasModel;
  score: number;
  cost: number | null;
  seconds: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  resourceCount?: number;
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
  logarithmic?: boolean;
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
    normalizedLabel: "Relative Cost ↓",
    normalizedDetailLabel: "Relative Cost ↓",
  },
  time: {
    label: "Time ↓",
    shortLabel: "Time",
    get: (row) => row.seconds,
    format: fmtDurationShort,
    detailLabel: (row) => resourceMetricLabel(row, "time"),
    normalizedLabel: "Relative Time ↓",
    normalizedDetailLabel: "Relative Time ↓",
  },
  tokens: {
    label: "Tokens ↓",
    shortLabel: "Tokens",
    get: (row) => row.totalTokens,
    format: fmtCompact,
    detailLabel: (row) => resourceMetricLabel(row, "tokens"),
    normalizedLabel: "Relative Tokens ↓",
    normalizedDetailLabel: "Relative Tokens ↓",
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
  "arc_agi_3",
  "terminal_bench_4",
  "terminal_bench_science",
]);

/** Build native quality/resource pairs for the selected axis without substituting output-only telemetry for total tokens. */
export function frontierBenchmarkRows(
  models: ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
  axisKey: FrontierBenchmarkAxisKey = "cost",
): FrontierBenchmarkRow[] {
  const kind = axisKey === "speed" || axisKey === "value" ? "cost" : axisKey;
  const observations = resourceRatioObservations(models, portfolio, kind);
  const byModel = groupBy(observations, (observation) => observation.model);
  const keys = Object.entries(portfolio)
    .filter(
      ([key, entry]) =>
        EFFORT_BENCHMARK_KEYS.has(key) ||
        AA_INDEX_COMPONENT_BENCHMARK_KEYS.has(key) ||
        isAggregateIndex(key) ||
        entry.resourcePolicy != null,
    )
    .map(([key]) => key);
  return models
    .flatMap((model) =>
      keys.flatMap((key): FrontierBenchmarkRow[] => {
        const policy = indexPolicy(key);
        if (
          policy != null &&
          canonicalReasoningEffort(model.reasoning_effort) != null &&
          !policy.effortAware
        )
          return [];
        const resourcePolicy = policy?.resources?.policy ?? portfolio[key]?.resourcePolicy ?? null;
        const measured =
          byModel.get(model)?.filter((observation) => observation.baseBenchmarkKey === key) ?? [];
        const nativeScore = benchmarkMetricValue(model, key);
        if (measured.length === 0 && nativeScore == null) return [];
        const components =
          measured.length > 0
            ? measured
            : [{ benchmarkKey: key, quality: nativeScore!, amount: null, weight: 1 }];
        return components.map((observation): FrontierBenchmarkRow => {
          const sourceKey = observation.benchmarkKey;
          const source = sourceKey.split("__")[1];
          const labels = BENCHMARK_RESOURCE_SOURCE_LABELS[
            key as keyof typeof BENCHMARK_RESOURCE_SOURCE_LABELS
          ] as Partial<Record<string, string>> | undefined;
          const sourceLabel =
            source == null
              ? ""
              : ` — ${labels?.[source] ?? source.replace("source_", "Source ").toUpperCase()}`;
          const resourceKey = policy?.resources?.key ?? sourceKey;
          const task = benchmarkTaskMetrics(model, resourceKey);
          const inputTokens = finiteValue(task?.input_tokens);
          const outputTokens = finiteValue(task?.output_tokens);
          const totalTokens =
            inputTokens != null && inputTokens >= 0 && outputTokens != null && outputTokens >= 0
              ? inputTokens + outputTokens
              : finiteValue(task?.tokens);
          return {
            benchmarkKey: policy == null ? sourceKey : key,
            baseBenchmarkKey: key,
            benchmarkLabel: `${benchmarkLabels[key] ?? key}${policy != null ? " (index)" : ""}${sourceLabel}`,
            weight: observation.weight,
            resourcePolicy,
            model,
            score: policy != null ? observation.quality : toPercent(observation.quality)!,
            cost: kind === "cost" ? observation.amount : finiteValue(task?.cost),
            seconds: kind === "time" ? observation.amount : finiteValue(task?.seconds),
            inputTokens,
            outputTokens,
            totalTokens: kind === "tokens" ? observation.amount : totalTokens,
          };
        });
      }),
    )
    .sort((left, right) => right.score - left.score);
}

/** Aggregate each paired variant basket; quality keeps a mean while resource amounts use source-weighted medians. */
export function aggregateFrontierBenchmarkRows(
  rows: FrontierBenchmarkRow[],
): FrontierBenchmarkRow[] {
  return [...groupBy(rows, (row) => modelVariantKey(row.model)).values()]
    .map((modelRows): FrontierBenchmarkRow | null => {
      const first = modelRows[0];
      if (first == null) {
        return null;
      }
      return {
        benchmarkKey: "all",
        baseBenchmarkKey: "all",
        benchmarkLabel: "Normalized performance",
        weight: 1,
        resourcePolicy: null,
        model: first.model,
        score: meanMetric(modelRows, (row) => row.score)!,
        cost: medianMetric(modelRows, (row) => row.cost),
        seconds: medianMetric(modelRows, (row) => row.seconds),
        inputTokens: null,
        outputTokens: null,
        totalTokens: medianMetric(modelRows, (row) => row.totalTokens),
        resourceCount: new Set(modelRows.map((row) => row.baseBenchmarkKey)).size,
      };
    })
    .filter((row): row is FrontierBenchmarkRow => row != null)
    .sort((left, right) => right.score - left.score);
}

/** Fixed full-population source medians define resource ratios; quality retains its established min–max reference. */
export function normalizedFrontierBenchmarkRows(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[] = rows,
): FrontierBenchmarkRow[] {
  const references = (get: (row: FrontierBenchmarkRow) => number | null) =>
    resourceRatioReferences(metricObservations(referenceRows, get));
  const costReferences = references((row) => row.cost);
  const tokenReferences = references((row) => row.totalTokens);
  const timeReferences = references((row) => row.seconds);
  const ratio = (value: number | null, reference: number | undefined) =>
    value != null && reference != null && reference > 0 ? value / reference : null;
  return normalizedFrontierBenchmarkScoreRows(rows, referenceRows).map((row) => ({
    ...row,
    cost: ratio(row.cost, costReferences.get(row.benchmarkKey)),
    seconds: ratio(row.seconds, timeReferences.get(row.benchmarkKey)),
    totalTokens: ratio(row.totalTokens, tokenReferences.get(row.benchmarkKey)),
  }));
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
    const normalizedScore = linearScore(rangesByBenchmark.get(row.benchmarkKey) ?? null, row.score);
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
  return aggregateFrontierBenchmarkRows(
    normalizedFrontierBenchmarkRows(selectedRows, referenceRows),
  );
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
    format: formatResourceRatio,
    detailLabel: () => axisConfig.normalizedDetailLabel,
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

/** Published resource scores are independent coordinates, never an implicit efficiency blend. */
export function isScoreAxis(axisKey: FrontierBenchmarkAxisKey): boolean {
  return axisKey === "speed" || axisKey === "value";
}

/** Keep model-wide Y scores intact; measured X values still require selected resource evidence. */
export function performanceComparisonRows(
  models: ModelAtlasModel[],
  evidenceRows: FrontierBenchmarkRow[],
  performance: PerformanceMetric,
  axisKey: FrontierBenchmarkAxisKey,
): FrontierBenchmarkRow[] {
  if (performance === "benchmarks") return evidenceRows;
  const sourceRows = isScoreAxis(axisKey)
    ? models.map(
        (model): FrontierBenchmarkRow => ({
          benchmarkKey: performance,
          baseBenchmarkKey: performance,
          benchmarkLabel: performance === "intelligence" ? "Intelligence" : "Agentic",
          weight: 1,
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

/** Resource amounts use every active measured source independently of the selected published performance score. */
export function automaticResourceKeys(
  rows: FrontierBenchmarkRow[],
  axisKey: FrontierBenchmarkAxisKey,
): string[] {
  if (isScoreAxis(axisKey)) return [];
  const metric = frontierBenchmarkAxisConfig[axisKey].get;
  return [
    ...new Set(rows.filter((row) => positiveMetric(metric(row))).map((row) => row.benchmarkKey)),
  ];
}

export function positiveMetric(value: number | null, allowZero = false): value is number {
  return value != null && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}

/** Retain the source/index weights while resisting resource outliers in the aggregate coordinate. */
function medianMetric(
  rows: FrontierBenchmarkRow[],
  get: (row: FrontierBenchmarkRow) => number | null,
): number | null {
  const measured = metricObservations(rows, get);
  return summarizeResourceRatios(measured, new Map(measured.map((row) => [row.benchmarkKey, 1])))
    .ratio;
}

/** Preserve source identity and allocation when graph coordinates enter the shared resource calculation. */
function metricObservations(
  rows: FrontierBenchmarkRow[],
  get: (row: FrontierBenchmarkRow) => number | null,
): ResourceRatioObservation[] {
  return rows.flatMap((row) => {
    const amount = get(row);
    return positiveMetric(amount)
      ? [
          {
            model: row.model,
            benchmarkKey: row.benchmarkKey,
            baseBenchmarkKey: row.baseBenchmarkKey,
            quality: row.score,
            amount,
            weight: row.weight,
          },
        ]
      : [];
  });
}

function meanMetric(
  rows: FrontierBenchmarkRow[],
  get: (row: FrontierBenchmarkRow) => number | null,
): number | null {
  const measured = rows.filter((row) => finiteValue(get(row)) != null);
  const includedKeys = [...new Set(measured.map((row) => row.baseBenchmarkKey))];
  return weightedMeanOfFinite(
    measured.map((row) => ({
      value: get(row),
      weight: row.weight * residualIndexBreadth(row.baseBenchmarkKey, includedKeys),
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
  const points = rows.flatMap((row) => {
    const intelligenceScore = finiteValue(row.model.scores?.intelligence_score);
    return intelligenceScore == null ? [] : [{ x: row.score, y: intelligenceScore }];
  });
  // Three measured pairs are required before presenting a benchmark correlation.
  if (points.length < 3) return null;
  return pearsonCorrelation(
    points.map((point) => point.x),
    points.map((point) => point.y),
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
