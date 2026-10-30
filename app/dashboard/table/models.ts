/** Dashboard row shaping and sort semantics for LLM stats payloads. */

import {
  BENCHMARK_COLUMNS,
  BENCHMARK_DISPLAY_ORDER,
  BENCHMARK_SCORING_WEIGHTS,
  BENCHMARK_TASK_METRIC_COLUMNS,
  type BenchmarkKey,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { BenchmarkTaskMetricColumnFacet } from "../../../src/model-atlas/benchmarks/factory";
import { isAggregateIndex } from "../../../src/model-atlas/benchmarks/index-policy";
import { COMMUNITY_INDEXES } from "../../../src/model-atlas/community/catalog";
import { reasoningEffortRank } from "../../../src/model-atlas/identity/normalization";
import {
  linearScore,
  medianOfFinite,
  minMaxRange,
  positiveFiniteNumber,
} from "../../../src/model-atlas/math-utils";
import { clampScore } from "../../../src/model-atlas/pipeline/scores/normalization";
import { benchmarkValue } from "../../../src/model-atlas/pipeline/scores/resource-metrics";
import {
  displayResourceRatios,
  type ResourceRatioReferenceSets,
  resourceRatioReferenceSets,
  type ResourceRatios,
} from "../../../src/model-atlas/stats/resource-ratios";
import { type ModelAtlasModel, type ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { compareBenchmarkDisplayKeys } from "../shared/constants";
import { modelDisplayName, modelsForVariantDisplay } from "../shared/model-display";

export type SortDirection = "ascending" | "descending";

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

/** Keep the catalog's frontier, index, and baseline groups while sorting short table headers within each group. */
function compareBenchmarkTableColumns(
  left: BenchmarkKey,
  right: BenchmarkKey,
  leftLabel: string,
  rightLabel: string,
): number {
  const leftGroup = isAggregateIndex(left) ? "index" : BENCHMARK_SCORING_WEIGHTS[left].group;
  const rightGroup = isAggregateIndex(right) ? "index" : BENCHMARK_SCORING_WEIGHTS[right].group;
  if (leftGroup !== rightGroup) return compareBenchmarkDisplayKeys(left, right);
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

const costMetricColumns = [
  {
    key: "effectiveInputPrice",
    group: "costs",
    field: "weighted_input",
    direction: "ascending",
    type: "number",
    label: "In$",
  },
  {
    key: "effectiveOutputPrice",
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

const inputModalityScores = [
  ["text", 8],
  ["image", 4],
  ["audio", 2],
  ["video", 1],
] as const;

export const benchmarkMetricColumns = BENCHMARK_DISPLAY_ORDER.map((benchmark) => {
  const column = BENCHMARK_COLUMNS[benchmark];
  return {
    key: column.key,
    group: "benchmarks" as const,
    benchmark,
    direction: column.defaultSort,
    type: "number" as const,
    label: column.label,
    format: column.format,
  };
}).sort((left, right) =>
  compareBenchmarkTableColumns(left.benchmark, right.benchmark, left.label, right.label),
);
const scaledBenchmarkMetricColumns = benchmarkMetricColumns.filter(
  (column) => column.format !== "currency",
);

export type TaskMetricColumn = (typeof taskMetricColumns)[number] & BenchmarkTaskMetricColumnFacet;
type ProfileMetricColumn = (typeof profileMetricColumns)[number];
type CommunityMetricColumn = (typeof communityMetricColumns)[number];
type CostMetricColumn = (typeof costMetricColumns)[number];
type SpeedMetricColumn = (typeof speedMetricColumns)[number];
type BenchmarkMetricColumn = (typeof benchmarkMetricColumns)[number];
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
  | "blend"
  | "context"
  | ProfileMetricColumn["key"]
  | CommunityMetricColumn["key"]
  | CostMetricColumn["key"]
  | SpeedMetricColumn["key"]
  | TaskMetricColumn["key"]
  | BenchmarkMetricColumn["key"];

export type TableColumnKey = SortKey | "confidence" | "change";

export type SortState = {
  key: SortKey;
  direction: SortDirection;
};

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
  ...costMetricColumns,
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
  | "frontier"
  | "indexes"
  | "baseline"
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
  "effectiveInputPrice",
  "effectiveOutputPrice",
]);
const profileColumnKeys = new Set<TableColumnKey>(["release", "openWeights"]);
const benchmarkColumnGroupsByKey = new Map<TableColumnKey, TableColumnGroup>();
// Each benchmark column's benchmark, so a run of columns can count the benchmarks it covers.
const benchmarkByColumnKey = new Map<TableColumnKey, BenchmarkKey>();
for (const { benchmark, columns } of benchmarkColumnGroups) {
  const group = benchmarkEvidenceGroup(benchmark);
  for (const column of columns) {
    benchmarkColumnGroupsByKey.set(column.key, group);
    benchmarkByColumnKey.set(column.key, benchmark);
  }
}

/** Frontier benchmarks carry score weight, aggregate indexes summarize other benchmarks, and baseline benchmarks stay visible without direct weight; the table rules and the model sheet share these groups. */
export function benchmarkEvidenceGroup(
  benchmark: BenchmarkKey,
): "frontier" | "indexes" | "baseline" {
  if (BENCHMARK_SCORING_WEIGHTS[benchmark].group === "frontier") return "frontier";
  return isAggregateIndex(benchmark) ? "indexes" : "baseline";
}

/** A stretch of consecutive visible columns in one group, as the table's group rail names it; the trailing release, weights, evidence, and change columns read as one `details` stretch. */
export type TableColumnRun = {
  group: "scores" | "resources" | "frontier" | "indexes" | "baseline" | "details";
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

export type TableRow = {
  model: ModelAtlasModel;
  intelligenceRank: number;
  originalIndex: number;
  aliasPriority: number;
  benchmarkDisplayScores: Partial<Record<BenchmarkMetricColumn["key"], number | null>>;
  /** Each measured amount (price, speed, context, benchmark resources) relative to its column's median across the incoming population. */
  metricRatios: Partial<Record<TableColumnKey, number | null>>;
  resourceRatios: ResourceRatios;
};

/** A row before its resource ratios, which are measured once the whole display population is known. */
type DisplayRow = Omit<TableRow, "resourceRatios">;
type UnrankedTableRow = Omit<DisplayRow, "intelligenceRank">;

type Sorter = {
  direction: SortDirection;
  type: "number" | "text";
  get: (row: TableRow) => number | string | null | undefined;
};

const dashboardMetricSorters = Object.fromEntries(
  [...speedMetricColumns, ...dashboardMetricColumns].map((column) => [
    column.key,
    {
      direction: column.direction,
      type: column.type,
      get: (row: TableRow) => dashboardMetricValue(row.model, column),
    },
  ]),
) as Record<DashboardMetricColumn["key"], Sorter>;

export const sorters: Record<SortKey, Sorter> = {
  rank: {
    direction: "ascending",
    type: "number",
    get: (row) => {
      const score = intelligenceScore(row);
      return typeof score === "number" ? -score : null;
    },
  },
  model: {
    direction: "ascending",
    type: "text",
    get: (row) => modelDisplayName(row.model),
  },
  intelligence: {
    direction: "descending",
    type: "number",
    get: intelligenceScore,
  },
  agentic: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores?.agentic_score,
  },
  speed: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores?.speed_score,
  },
  value: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores?.value_score,
  },
  taskCostRatio: {
    direction: "ascending",
    type: "number",
    get: (row) => row.resourceRatios.cost.ratio,
  },
  totalTokenRatio: {
    direction: "ascending",
    type: "number",
    get: (row) => row.resourceRatios.tokens.ratio,
  },
  taskTimeRatio: {
    direction: "ascending",
    type: "number",
    get: (row) => row.resourceRatios.time.ratio,
  },
  blend: {
    direction: "ascending",
    type: "number",
    get: (row) => row.model.cost?.blended_price,
  },
  context: {
    direction: "descending",
    type: "number",
    get: (row) => contextWindowValue(row.model),
  },
  ...dashboardMetricSorters,
};

/** A header click sorts by its column in the column's own direction, and a second click on that column reverses it. */
export function toggledSort(current: SortState, key: SortKey): SortState {
  const direction = sorters[key].direction;
  if (current.key !== key || current.direction !== direction) return { key, direction };
  return { key, direction: direction === "ascending" ? "descending" : "ascending" };
}

/** Sort a copy of the visible rows, preserving source order as the final stable tie-breaker. */
export function sortedRows(rows: readonly TableRow[], sortState: SortState) {
  const sorter = sorters[sortState.key] ?? sorters.rank;
  const direction = sortState.direction === "descending" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = sorter.get(left);
    const rightValue = sorter.get(right);
    const missingCompared = compareMissingValues(sorter, leftValue, rightValue);
    if (missingCompared !== 0) {
      return missingCompared;
    }
    const compared = compareSortValues(sorter, leftValue, rightValue);
    if (compared !== 0) {
      return compared * direction;
    }
    return left.originalIndex - right.originalIndex;
  });
}

/** Measured amounts read against their column median; scores, dates, and flags keep their own cells. */
export function isAmountColumn(column: DashboardMetricColumn): boolean {
  if ("benchmark" in column) return column.format === "currency";
  return "source" in column || column.group === "costs" || column.group === "speed";
}

const amountColumns: { key: TableColumnKey; get: (model: ModelAtlasModel) => unknown }[] = [
  { key: "blend", get: (model) => model.cost?.blended_price },
  { key: "context", get: contextWindowValue },
  ...[...speedMetricColumns, ...dashboardMetricColumns].filter(isAmountColumn).map((column) => ({
    key: column.key,
    get: (model: ModelAtlasModel) => dashboardMetricValue(model, column),
  })),
];

/** One snapshot's reference medians and the two row displays measured against them, each display shaped when first read. */
type RowDisplays = {
  references: ResourceRatioReferenceSets;
  models?: TableRow[];
  variants?: TableRow[];
};

// The leaderboard and the model sheet read the same snapshot, so they share its rows instead of rebuilding both displays on every sheet open.
const rowDisplaysByPayload = new WeakMap<ModelAtlasPayload, RowDisplays>();

/**
 * Shape one variant display of the payload into leaderboard rows with their resource ratios.
 *
 * Each display is shaped once per snapshot and the same rows are returned to every reader, so a caller that reorders them must copy first.
 */
export function leaderboardRows(
  payload: ModelAtlasPayload | null,
  showVariants: boolean,
): readonly TableRow[] {
  if (payload == null) return [];
  let displays = rowDisplaysByPayload.get(payload);
  if (displays == null) {
    displays = {
      references: resourceRatioReferenceSets(
        payload.models,
        payload.metadata.scoring.benchmark_portfolio,
      ),
    };
    rowDisplaysByPayload.set(payload, displays);
  }
  const display = showVariants ? "variants" : "models";
  displays[display] ??= buildLeaderboardRows(payload, showVariants, displays.references);
  return displays[display];
}

function buildLeaderboardRows(
  payload: ModelAtlasPayload,
  showVariants: boolean,
  references: ResourceRatioReferenceSets,
): TableRow[] {
  const rows = dedupeDisplayModels(
    modelsForVariantDisplay(payload.models, showVariants, payload.benchmark_observations),
  );
  const ratios = displayResourceRatios(
    rows.map((row) => row.model),
    payload.metadata.scoring.benchmark_portfolio,
    references,
  );
  return rows.map((row, index) => ({ ...row, resourceRatios: ratios[index]! }));
}

/** Collapse duplicate routes and scale benchmark meters and amount ratios against the full incoming population before filtering or limiting rows. */
export function dedupeDisplayModels(models: ModelAtlasModel[]): DisplayRow[] {
  const ranges = new Map(
    scaledBenchmarkMetricColumns.map((column) => [
      column.key,
      minMaxRange(models.map((model) => benchmarkMetricValue(model, column))),
    ]),
  );
  const amountScales = amountColumns.map(({ key, get }) => {
    // Zero or missing amounts have no position on a ratio's log scale.
    const amounts = models.map((model) => positiveFiniteNumber(get(model)));
    const median = medianOfFinite(amounts);
    return {
      key,
      ratios: amounts.map((amount) => (amount == null || !median ? null : amount / median)),
    };
  });
  const rowsByIdentity = new Map<string, UnrankedTableRow>();
  for (const [originalIndex, model] of models.entries()) {
    const key = displayKey(model);
    const candidate = {
      model,
      originalIndex,
      aliasPriority: displayAliasPriority(model),
      benchmarkDisplayScores: Object.fromEntries(
        scaledBenchmarkMetricColumns.map((column) => {
          const value = benchmarkMetricValue(model, column);
          const normalized = linearScore(ranges.get(column.key) ?? null, value);
          return [column.key, normalized == null ? null : clampScore(normalized)];
        }),
      ),
      metricRatios: Object.fromEntries(
        amountScales.map(({ key, ratios }) => [key, ratios[originalIndex]]),
      ),
    };
    const existing = rowsByIdentity.get(key);
    if (!existing || candidate.aliasPriority < existing.aliasPriority) {
      rowsByIdentity.set(key, candidate);
    }
  }
  return attachIntelligenceRanks([...rowsByIdentity.values()]).sort(
    (left, right) => left.originalIndex - right.originalIndex,
  );
}

export function benchmarkMetricValue(model: ModelAtlasModel, column: BenchmarkMetricColumn) {
  return benchmarkValue(model, column.benchmark);
}

/** Return a benchmark's normalized display score when its source scale is not directly comparable. */
export function benchmarkDisplayValue(
  row: Pick<TableRow, "model" | "benchmarkDisplayScores">,
  column: BenchmarkMetricColumn,
) {
  return column.format === "score"
    ? row.benchmarkDisplayScores[column.key]
    : benchmarkMetricValue(row.model, column);
}

/** Return a benchmark's 0-100 meter position while preserving its formatted display value. */
export function benchmarkMeterValue(
  row: Pick<TableRow, "benchmarkDisplayScores">,
  column: BenchmarkMetricColumn,
) {
  return row.benchmarkDisplayScores[column.key] ?? null;
}

export type EffortChoice = { key: string; count: number };

/** The efforts among reasoning-variant rows and how many rows each holds, in effort order. */
export function effortChoices(rows: readonly TableRow[]): EffortChoice[] {
  const counts = new Map<string, number>();
  for (const { model } of rows) {
    if (model.reasoning_effort == null) continue;
    counts.set(model.reasoning_effort, (counts.get(model.reasoning_effort) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => reasoningEffortRank(left.key) - reasoningEffortRank(right.key));
}

export function contextWindowValue(model: ModelAtlasModel) {
  return model.context_window?.context;
}

export function dashboardMetricValue(model: ModelAtlasModel, column: DashboardMetricColumn) {
  if ("source" in column) {
    return model.task_metrics?.[column.source]?.[column.metric];
  }
  if ("benchmark" in column) {
    return benchmarkMetricValue(model, column);
  }
  if (column.group === "costs") {
    return model.cost?.[column.field];
  }
  if (column.group === "speed") {
    return model.speed?.[column.field];
  }
  if (column.group === "community") {
    // Sorts by best place; the cell shows the range.
    return model.community_indexes?.[column.field]?.best ?? null;
  }
  return profileMetricValue(model, column);
}

function profileMetricValue(model: ModelAtlasModel, column: ProfileMetricColumn) {
  if (column.field === "release") {
    return model.release_date;
  }
  if (column.field === "modalities") {
    return inputModalityRank(model);
  }
  const value = model[column.field];
  if (value == null) {
    return null;
  }
  return value ? 1 : 0;
}

function inputModalityRank(model: ModelAtlasModel) {
  const input = new Set((model.modalities?.input ?? []).map((value) => value.toLowerCase()));
  if (input.size === 0) {
    return null;
  }
  return inputModalityScores.reduce(
    (total, [modality, score]) => total + (input.has(modality) ? score : 0),
    0,
  );
}

function attachIntelligenceRanks(rows: UnrankedTableRow[]): DisplayRow[] {
  const rankedRows = [...rows].sort(compareIntelligenceRank);
  const rankByOriginalIndex = new Map<number, number>();
  for (const [rankIndex, row] of rankedRows.entries()) {
    const previousRow = rankedRows[rankIndex - 1];
    const score = intelligenceScore(row);
    const previousScore = previousRow == null ? null : intelligenceScore(previousRow);
    const previousRank =
      previousRow == null ? 0 : (rankByOriginalIndex.get(previousRow.originalIndex) ?? 0);
    const rank =
      typeof score === "number" && Number.isFinite(score) && score === previousScore
        ? previousRank
        : rankIndex + 1;
    rankByOriginalIndex.set(row.originalIndex, rank);
  }
  return rows.map((row) => ({
    ...row,
    intelligenceRank: rankByOriginalIndex.get(row.originalIndex)!,
  }));
}

function compareIntelligenceRank(left: UnrankedTableRow, right: UnrankedTableRow) {
  const leftScore = intelligenceScore(left);
  const rightScore = intelligenceScore(right);
  const missingCompared = compareMissingNumbers(leftScore, rightScore);
  if (missingCompared !== 0) {
    return missingCompared;
  }
  if (typeof leftScore === "number" && typeof rightScore === "number" && leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return left.originalIndex - right.originalIndex;
}

function intelligenceScore(row: Pick<TableRow, "model">) {
  return row.model.scores?.intelligence_score;
}

function compareMissingValues(sorter: Sorter, left: unknown, right: unknown) {
  if (sorter.type !== "number") {
    return 0;
  }
  return compareMissingNumbers(left, right);
}

function compareMissingNumbers(left: unknown, right: unknown) {
  const isLeftMissing = typeof left !== "number" || !Number.isFinite(left);
  const isRightMissing = typeof right !== "number" || !Number.isFinite(right);
  if (isLeftMissing && isRightMissing) {
    return 0;
  }
  if (isLeftMissing) {
    return 1;
  }
  if (isRightMissing) {
    return -1;
  }
  return 0;
}

function compareSortValues(sorter: Sorter, left: unknown, right: unknown) {
  if (sorter.type === "text") {
    return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
      sensitivity: "base",
    });
  }
  return Number(left) - Number(right);
}

function displayKey(model: ModelAtlasModel) {
  const id = typeof model.id === "string" ? model.id : "";
  const slashIndex = id.indexOf("/");
  if (slashIndex <= 0) {
    return `${id.toLowerCase().replace(/\./g, "-").replace(/-+/g, "-")}\u0000${model.reasoning_effort ?? ""}`;
  }
  const slug = id
    .slice(slashIndex + 1)
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/-+/g, "-")
    .replace(/-\d{8}$/, "")
    .replace(/-fast$/, "");
  const provider = canonicalProviderId(id.slice(0, slashIndex), slug);
  return `${provider}/${slug}\u0000${model.reasoning_effort ?? ""}`;
}

function canonicalProviderId(provider: string, slug: string) {
  const normalizedProvider = provider.toLowerCase().replace(/^~+/, "");
  const providerWithoutAiSuffix = normalizedProvider.replace(/ai$/, "");
  const familyToken = slug.split("-", 1)[0] ?? "";
  return providerWithoutAiSuffix.length > 0 && familyToken === providerWithoutAiSuffix
    ? providerWithoutAiSuffix
    : normalizedProvider;
}

function displayAliasPriority(model: ModelAtlasModel) {
  const id = typeof model.id === "string" ? model.id.toLowerCase() : "";
  if (id.includes("latest")) {
    return 3;
  }
  if (id.replace(/\./g, "-").endsWith("-fast")) {
    return 2;
  }
  if (/-\d{8}$/.test(id)) {
    return 1;
  }
  return 0;
}
