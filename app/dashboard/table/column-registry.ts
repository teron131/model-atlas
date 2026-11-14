/** The table's column registry: which metric columns exist, how their keys and groups are typed, and how visible columns split into the runs the group rail names. */

import {
  BENCHMARK_COLUMNS,
  BENCHMARK_DISPLAY_ORDER,
  BENCHMARK_TASK_METRIC_COLUMNS,
  type BenchmarkDisplayGroup,
  benchmarkDisplayGroup,
  type BenchmarkKey,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { BenchmarkTaskMetricColumnFacet } from "../../../src/model-atlas/benchmarks/factory";
import { isAggregateIndex } from "../../../src/model-atlas/benchmarks/index-policy";
import { COMMUNITY_INDEXES } from "../../../src/model-atlas/community/catalog";
import { compareBenchmarkDisplayKeys } from "../shared/benchmark-display";

type TaskMetricColumns<
  TSource extends string,
  TColumns extends readonly BenchmarkTaskMetricColumnFacet[],
> = {
  readonly [Index in keyof TColumns]: TColumns[Index] & {
    readonly group: "tasks";
    readonly benchmarkGroup: TSource;
    readonly source: string;
    readonly type: "number";
  };
};

function defineTaskMetricColumns<
  const TSource extends string,
  const TColumns extends readonly BenchmarkTaskMetricColumnFacet[],
>(source: TSource, columns: TColumns): TaskMetricColumns<TSource, TColumns> {
  return columns.map((column) => ({
    ...column,
    group: "tasks" as const,
    benchmarkGroup: source,
    source: column.metricSource ?? source,
    type: "number" as const,
  })) as TaskMetricColumns<TSource, TColumns>;
}

const artificialAnalysisTaskMetricColumns = defineTaskMetricColumns("artificial_analysis", [
  {
    key: "artificialAnalysisCost",
    metric: "cost",
    direction: "ascending",
    label: "AA$",
  },
  {
    key: "artificialAnalysisSeconds",
    metric: "seconds",
    direction: "ascending",
    label: "AA Time",
  },
  {
    key: "artificialAnalysisTokens",
    metric: "output_tokens",
    direction: "descending",
    label: "AA Out",
  },
] as const);

type CatalogTaskMetricColumn =
  (typeof BENCHMARK_TASK_METRIC_COLUMNS)[keyof typeof BENCHMARK_TASK_METRIC_COLUMNS][number] & {
    group: "tasks";
    benchmarkGroup: BenchmarkKey;
    source: string;
    type: "number";
  };

const benchmarkTaskMetricColumns = BENCHMARK_DISPLAY_ORDER.flatMap<CatalogTaskMetricColumn>(
  (benchmark) => [
    ...defineTaskMetricColumns(
      benchmark,
      BENCHMARK_TASK_METRIC_COLUMNS[benchmark as keyof typeof BENCHMARK_TASK_METRIC_COLUMNS] ?? [],
    ),
  ],
).sort((left, right) =>
  compareBenchmarkTableColumns(left.benchmarkGroup, right.benchmarkGroup, left.label, right.label),
);

/** Keep the catalog's display groups while sorting short table headers within each group. */
function compareBenchmarkTableColumns(
  left: BenchmarkKey,
  right: BenchmarkKey,
  leftLabel: string,
  rightLabel: string,
): number {
  if (benchmarkDisplayGroup(left) !== benchmarkDisplayGroup(right))
    return compareBenchmarkDisplayKeys(left, right);
  return leftLabel.localeCompare(rightLabel, "en", { sensitivity: "base" });
}

export const taskMetricColumns = [
  ...artificialAnalysisTaskMetricColumns,
  ...benchmarkTaskMetricColumns,
] as const;

const profileMetricColumns = [
  {
    key: "release",
    group: "profile",
    field: "release",
    direction: "descending",
    type: "text",
    label: "Release",
  },
  {
    key: "openWeights",
    group: "profile",
    field: "open_weights",
    direction: "descending",
    type: "number",
    label: "Open",
  },
  {
    key: "modalities",
    group: "profile",
    field: "modalities",
    direction: "descending",
    type: "number",
    label: "Modality",
  },
] as const;

const communityMetricColumns = COMMUNITY_INDEXES.map(
  (index) =>
    ({
      key: index.columnKey,
      group: "community",
      field: index.key,
      direction: "ascending",
      type: "number",
      label: index.label,
    }) as const,
);
const communityColumnKeys = new Set<string>(communityMetricColumns.map((column) => column.key));

export const costMetricColumns = [
  {
    key: "blend",
    group: "costs",
    field: "blended_price",
    direction: "ascending",
    type: "number",
    label: "Blend$",
  },
  {
    key: "inputPrice",
    group: "costs",
    field: "weighted_input",
    direction: "ascending",
    type: "number",
    label: "In$",
  },
  {
    key: "cacheReadPrice",
    group: "costs",
    field: "weighted_cache_read",
    direction: "ascending",
    type: "number",
    label: "Cache$",
  },
  {
    key: "outputPrice",
    group: "costs",
    field: "weighted_output",
    direction: "ascending",
    type: "number",
    label: "Out$",
  },
] as const;

export const speedMetricColumns = [
  {
    key: "throughput",
    group: "speed",
    field: "throughput_tokens_per_second_median",
    direction: "descending",
    type: "number",
    label: "TPS",
  },
  {
    key: "latency",
    group: "speed",
    field: "latency_seconds_median",
    direction: "ascending",
    type: "number",
    label: "Latency",
  },
  {
    key: "e2eLatency",
    group: "speed",
    field: "e2e_latency_seconds_median",
    direction: "ascending",
    type: "number",
    label: "E2E",
  },
] as const;

export const benchmarkMetricColumns = BENCHMARK_DISPLAY_ORDER.map((benchmark) => {
  const column = BENCHMARK_COLUMNS[benchmark];
  return {
    key: column.key,
    group: "benchmarks" as const,
    benchmark,
    // Benchmark results are oriented so higher is better.
    direction: "descending" as const,
    type: "number" as const,
    label: column.label,
    format: column.format,
  };
}).sort((left, right) =>
  compareBenchmarkTableColumns(left.benchmark, right.benchmark, left.label, right.label),
);

export type TaskMetricColumn = (typeof taskMetricColumns)[number] & BenchmarkTaskMetricColumnFacet;
export type ProfileMetricColumn = (typeof profileMetricColumns)[number];
type CommunityMetricColumn = (typeof communityMetricColumns)[number];
type CostMetricColumn = (typeof costMetricColumns)[number];
type SpeedMetricColumn = (typeof speedMetricColumns)[number];
export type BenchmarkMetricColumn = (typeof benchmarkMetricColumns)[number];
export type DashboardMetricColumn =
  | ProfileMetricColumn
  | CommunityMetricColumn
  | CostMetricColumn
  | SpeedMetricColumn
  | BenchmarkMetricColumn
  | TaskMetricColumn;
export type SortKey =
  | "rank"
  | "model"
  | "intelligence"
  | "agentic"
  | "speed"
  | "value"
  | "taskCostRatio"
  | "totalTokenRatio"
  | "taskTimeRatio"
  | "context"
  | ProfileMetricColumn["key"]
  | CommunityMetricColumn["key"]
  | CostMetricColumn["key"]
  | SpeedMetricColumn["key"]
  | TaskMetricColumn["key"]
  | BenchmarkMetricColumn["key"];

export type TableColumnKey = SortKey | "confidence" | "change";

const taskMetricColumnsByBenchmark = new Map<string, TaskMetricColumn[]>([
  ["aa_intelligence_index", [...artificialAnalysisTaskMetricColumns]],
]);
for (const column of benchmarkTaskMetricColumns) {
  const columns = taskMetricColumnsByBenchmark.get(column.benchmarkGroup) ?? [];
  columns.push(column);
  taskMetricColumnsByBenchmark.set(column.benchmarkGroup, columns);
}

const benchmarkColumnGroups = benchmarkMetricColumns.map((column) => ({
  benchmark: column.benchmark as BenchmarkKey,
  columns: [column, ...(taskMetricColumnsByBenchmark.get(column.benchmark) ?? [])],
}));

export const dashboardMetricColumns: DashboardMetricColumn[] = [
  ...profileMetricColumns.filter((column) => column.key === "modalities"),
  ...benchmarkColumnGroups
    .filter(({ benchmark }) => isAggregateIndex(benchmark))
    .flatMap(({ columns }) => columns),
  ...communityMetricColumns,
  ...benchmarkColumnGroups
    .filter(({ benchmark }) => !isAggregateIndex(benchmark))
    .flatMap(({ columns }) => columns),
  ...profileMetricColumns.filter((column) => column.key !== "modalities"),
];

type TableColumnGroup =
  | "fixed"
  | "scores"
  | "resources"
  | BenchmarkDisplayGroup
  | "profile"
  | "confidence"
  | "change";

const scoreColumnKeys = new Set<TableColumnKey>(["intelligence", "agentic", "speed", "value"]);
const resourceColumnKeys = new Set<TableColumnKey>([
  "taskCostRatio",
  "totalTokenRatio",
  "taskTimeRatio",
  "blend",
  "throughput",
  "latency",
  "e2eLatency",
  "context",
  "modalities",
  "inputPrice",
  "cacheReadPrice",
  "outputPrice",
]);
const profileColumnKeys = new Set<TableColumnKey>(["release", "openWeights"]);
const benchmarkColumnGroupsByKey = new Map<TableColumnKey, TableColumnGroup>();
// Each benchmark column's benchmark, so a run of columns can count the benchmarks it covers.
const benchmarkByColumnKey = new Map<TableColumnKey, BenchmarkKey>();
for (const { benchmark, columns } of benchmarkColumnGroups) {
  const group = benchmarkDisplayGroup(benchmark);
  for (const column of columns) {
    benchmarkColumnGroupsByKey.set(column.key, group);
    benchmarkByColumnKey.set(column.key, benchmark);
  }
}

/** A stretch of consecutive visible columns in one group, as the table's group rail names it; the trailing release, weights, evidence, and change columns read as one `details` stretch. */
export type TableColumnRun = {
  group: "scores" | "resources" | BenchmarkDisplayGroup | "details";
  /** Position of its first column among the visible columns. */
  first: number;
  /** Distinct benchmarks among its columns; zero outside the benchmark groups. */
  benchmarks: number;
};

/** Each column group's name, as the group rail and the model sheet's benchmark sections show it. */
export const TABLE_COLUMN_GROUP_LABELS: Record<TableColumnRun["group"], string> = {
  scores: "Scores",
  resources: "Resources",
  frontier: "Frontier",
  indexes: "Indexes",
  baseline: "Baseline",
  details: "Details",
};

/** Split the visible columns after the pinned rank and model into the runs the group rail navigates. */
export function tableColumnRuns(visibleColumnKeys: readonly TableColumnKey[]): TableColumnRun[] {
  const runs: (Omit<TableColumnRun, "benchmarks"> & { benchmarkKeys: Set<string> })[] = [];
  visibleColumnKeys.forEach((key, index) => {
    const own = tableColumnGroup(key);
    if (own === "fixed") return;
    const group = own === "profile" || own === "confidence" || own === "change" ? "details" : own;
    let run = runs.at(-1);
    if (run?.group !== group) {
      run = { group, first: index, benchmarkKeys: new Set() };
      runs.push(run);
    }
    // Each community column counts as one index.
    const benchmark = benchmarkByColumnKey.get(key) ?? (communityColumnKeys.has(key) ? key : null);
    if (benchmark != null) run.benchmarkKeys.add(benchmark);
  });
  return runs.map(({ benchmarkKeys, ...run }) => ({ ...run, benchmarks: benchmarkKeys.size }));
}

/** Resolve group-ending rules against the columns that are actually visible. */
export function tableColumnRuleKeys(
  visibleColumnKeys: readonly TableColumnKey[],
): ReadonlySet<TableColumnKey> {
  const ruledKeys = new Set<TableColumnKey>();
  let previousKey: TableColumnKey | undefined;
  let previousGroup: TableColumnGroup | undefined;
  for (const key of visibleColumnKeys) {
    const group = tableColumnGroup(key);
    if (previousKey != null && previousGroup !== group && previousGroup !== "fixed") {
      ruledKeys.add(previousKey);
    }
    previousKey = key;
    previousGroup = group;
  }
  return ruledKeys;
}

function tableColumnGroup(key: TableColumnKey): TableColumnGroup {
  if (key === "rank" || key === "model") {
    return "fixed";
  }
  if (scoreColumnKeys.has(key)) {
    return "scores";
  }
  if (resourceColumnKeys.has(key)) {
    return "resources";
  }
  if (profileColumnKeys.has(key)) {
    return "profile";
  }
  if (key === "confidence") {
    return "confidence";
  }
  if (key === "change") {
    return "change";
  }
  if (communityColumnKeys.has(key)) {
    return "indexes";
  }
  return benchmarkColumnGroupsByKey.get(key) ?? "baseline";
}

/** Measured amounts read against their column median; scores, dates, and flags keep their own cells. */
export function isAmountColumn(column: DashboardMetricColumn): boolean {
  if ("benchmark" in column) return column.format === "currency";
  return "source" in column || column.group === "costs" || column.group === "speed";
}
