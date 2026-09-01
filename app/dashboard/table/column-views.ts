/** Table column views own preset membership, canonical order, and full-metadata search matching. */

import type { ModelAtlasColumnTooltips } from "../../../src/model-atlas/config/tooltips";
import { benchmarkLabels } from "../shared/constants";
import { staticSortableColumns } from "./Columns";
import {
  type BenchmarkColumnOrder,
  benchmarkMetricColumns,
  benchmarkMetricValue,
  dashboardMetricColumns,
  type SortKey,
  type TableColumnKey,
  type TableRow,
} from "./models";
import { tableColumnTooltip } from "./tooltips";

export const TABLE_COLUMN_PRESETS = [
  { key: "scores", label: "Scores" },
  { key: "cost", label: "Cost" },
  { key: "time", label: "Time" },
  { key: "all", label: "All" },
] as const;

export type TableColumnPreset = (typeof TABLE_COLUMN_PRESETS)[number]["key"];

export const BENCHMARK_COLUMN_ORDERS = [
  { key: "portfolio", label: "Portfolio" },
  { key: "coverage", label: "Coverage" },
] as const satisfies readonly { key: BenchmarkColumnOrder; label: string }[];

export const ALWAYS_VISIBLE_TABLE_COLUMN_KEYS = [
  "rank",
  "model",
  "intelligence",
  "agentic",
  "speed",
  "value",
] as const satisfies readonly TableColumnKey[];

export const ALL_TABLE_COLUMN_KEYS: readonly TableColumnKey[] = [
  ...staticSortableColumns.map((column) => column.key),
  ...dashboardMetricColumns.map((column) => column.key),
  "confidence",
  "change",
] satisfies readonly TableColumnKey[];

const optionalColumnKeys = ALL_TABLE_COLUMN_KEYS.filter(
  (key) =>
    key !== "change" &&
    !ALWAYS_VISIBLE_TABLE_COLUMN_KEYS.includes(
      key as (typeof ALWAYS_VISIBLE_TABLE_COLUMN_KEYS)[number],
    ),
);
const metricColumnsByKey = new Map<TableColumnKey, (typeof dashboardMetricColumns)[number]>(
  dashboardMetricColumns.map((column) => [column.key, column]),
);
const benchmarkColumnsByKey = new Map<TableColumnKey, (typeof benchmarkMetricColumns)[number]>(
  benchmarkMetricColumns.map((column) => [column.key, column]),
);
const staticColumnSearchText = new Map<TableColumnKey, string>(
  staticSortableColumns.map((column) => [column.key, column.searchText]),
);
const scoreColumnKeys = new Set<TableColumnKey>(
  dashboardMetricColumns
    .filter((column) => column.group === "benchmarks")
    .map((column) => column.key),
);
const costColumnKeys = new Set<TableColumnKey>([
  "blend",
  "effectiveInputPrice",
  "effectiveOutputPrice",
  ...dashboardMetricColumns
    .filter((column) => column.group === "tasks" && column.metric === "cost")
    .map((column) => column.key),
]);
const timeColumnKeys = new Set<TableColumnKey>([
  "throughput",
  "latency",
  "e2eLatency",
  ...dashboardMetricColumns
    .filter((column) => column.group === "tasks" && column.metric === "seconds")
    .map((column) => column.key),
]);
const presetColumnKeys: Record<TableColumnPreset, ReadonlySet<TableColumnKey>> = {
  scores: scoreColumnKeys,
  cost: costColumnKeys,
  time: timeColumnKeys,
  all: new Set(optionalColumnKeys),
};
const presetDefaultSortKeys: Record<TableColumnPreset, SortKey> = {
  scores: "intelligence",
  cost: "value",
  time: "speed",
  all: "intelligence",
};

/** Resolve fixed and optional columns for a preset or temporary full-catalog search. */
export function tableColumnKeysForView(
  preset: TableColumnPreset,
  query: string,
  columnTooltips: ModelAtlasColumnTooltips,
): TableColumnKey[] {
  const normalizedQuery = normalizeSearchText(query);
  const matchingKeys =
    normalizedQuery.length === 0
      ? presetColumnKeys[preset]
      : new Set(
          optionalColumnKeys.filter((key) =>
            columnMatchesQuery(key, normalizedQuery, columnTooltips),
          ),
        );
  return [
    ...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
    ...optionalColumnKeys.filter((key) => matchingKeys.has(key)),
    "change",
  ];
}

/** Count search matches across the complete table-column catalog. */
export function tableColumnSearchMatchCount(
  query: string,
  columnTooltips: ModelAtlasColumnTooltips,
): number {
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery.length === 0
    ? 0
    : ALL_TABLE_COLUMN_KEYS.filter((key) =>
        columnMatchesQuery(key, normalizedQuery, columnTooltips),
      ).length;
}

/** Keep sorting visible when a preset or search removes the active sort column. */
export function tableColumnSortKey(
  preset: TableColumnPreset,
  query: string,
  visibleColumnKeys: readonly TableColumnKey[],
): SortKey {
  const preferredKey = query.trim().length === 0 ? presetDefaultSortKeys[preset] : null;
  if (preferredKey != null && visibleColumnKeys.includes(preferredKey)) {
    return preferredKey;
  }
  return (
    visibleColumnKeys.find(
      (key): key is SortKey =>
        key !== "rank" && key !== "model" && key !== "confidence" && key !== "change",
    ) ?? "rank"
  );
}

/** Order visible benchmark columns by observed cells in the active table rows while preserving canonical ties and fixed-column positions. */
export function tableColumnKeysByCoverage(
  columnKeys: readonly TableColumnKey[],
  rows: readonly TableRow[],
): TableColumnKey[] {
  const canonicalOrder = new Map(columnKeys.map((key, index) => [key, index]));
  const observedByKey = new Map<TableColumnKey, number>();
  for (const key of columnKeys) {
    const column = benchmarkColumnsByKey.get(key);
    if (column == null) {
      continue;
    }
    observedByKey.set(
      key,
      rows.filter((row) => benchmarkMetricValue(row.model, column) != null).length,
    );
  }
  const orderedBenchmarkKeys = [...observedByKey.keys()].sort((left, right) => {
    const coverageDifference = (observedByKey.get(right) ?? 0) - (observedByKey.get(left) ?? 0);
    return coverageDifference !== 0
      ? coverageDifference
      : (canonicalOrder.get(left) ?? 0) - (canonicalOrder.get(right) ?? 0);
  });
  let benchmarkIndex = 0;
  return columnKeys.map((key) =>
    observedByKey.has(key) ? (orderedBenchmarkKeys[benchmarkIndex++] ?? key) : key,
  );
}

function columnMatchesQuery(
  key: TableColumnKey,
  normalizedQuery: string,
  columnTooltips: ModelAtlasColumnTooltips,
): boolean {
  const column = metricColumnsByKey.get(key);
  const tooltip = tableColumnTooltip(key, columnTooltips);
  const searchText = normalizeSearchText(
    [
      key,
      staticColumnSearchText.get(key),
      column?.label,
      column?.group === "benchmarks" ? benchmarkLabels[column.benchmark] : undefined,
      column?.group === "tasks" ? benchmarkLabels[column.source] : undefined,
      column?.group === "tasks" ? column.metric.replaceAll("_", " ") : undefined,
      ...collectTextValues(tooltip),
    ]
      .filter((value) => value != null)
      .join(" "),
  );
  return normalizedQuery.split(" ").every((term) => searchText.includes(term));
}

function collectTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectTextValues);
  }
  if (value != null && typeof value === "object") {
    return Object.values(value).flatMap(collectTextValues);
  }
  return [];
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}
