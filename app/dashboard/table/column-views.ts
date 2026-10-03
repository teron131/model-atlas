/** Table column views own preset membership, canonical order, and full-metadata search matching. */

import type { ModelAtlasColumnTooltips } from "../../../src/model-atlas/config/tooltips";
import { benchmarkLabels } from "../shared/constants";
import { filterSearchDocuments, hasSearchQuery, type SearchDocument } from "../shared/search";
import { staticSortableColumns } from "./Columns";
import { dashboardMetricColumns, type SortKey, type TableColumnKey } from "./models";
import { tableColumnTooltip } from "./tooltips";

export const TABLE_COLUMN_PRESETS = [
  { key: "scores", label: "Scores" },
  { key: "cost", label: "Cost" },
  { key: "time", label: "Time" },
  { key: "all", label: "All" },
] as const;

export type TableColumnPreset = (typeof TABLE_COLUMN_PRESETS)[number]["key"];

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
const staticColumnSearchText = new Map<TableColumnKey, string>(
  staticSortableColumns.map((column) => [column.key, column.searchText]),
);
const scoreColumnKeys = new Set<TableColumnKey>(
  dashboardMetricColumns
    .filter((column) => column.group === "benchmarks")
    .map((column) => column.key),
);
const costColumnKeys = new Set<TableColumnKey>([
  "taskCostRatio",
  "totalTokenRatio",
  "blend",
  "effectiveInputPrice",
  "effectiveOutputPrice",
  ...dashboardMetricColumns
    .filter((column) => column.group === "tasks" && column.metric === "cost")
    .map((column) => column.key),
]);
const timeColumnKeys = new Set<TableColumnKey>([
  "taskTimeRatio",
  "totalTokenRatio",
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

/** Resolve search feedback and visible columns together, retaining the preset when only model names match. */
export function tableColumnView(
  preset: TableColumnPreset,
  query: string,
  columnTooltips: ModelAtlasColumnTooltips,
) {
  const searchMatches = hasSearchQuery(query)
    ? filterSearchDocuments(
        query,
        ALL_TABLE_COLUMN_KEYS.map((key) => columnSearchDocument(key, columnTooltips)),
      )
    : [];
  const searchMatchCount = searchMatches.length;
  const searchQuery = searchMatchCount > 0 ? query : "";
  // Reuse the full-column ranking so the visible set and match count cannot promote different fuzzy matches.
  const matchingKeys = searchMatchCount > 0 ? new Set(searchMatches) : presetColumnKeys[preset];
  const keys: TableColumnKey[] = [
    ...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
    ...optionalColumnKeys.filter((key) => matchingKeys.has(key)),
    "change",
  ];
  return { searchQuery, searchMatchCount, keys };
}

/** Keep sorting visible when a preset or search removes the active sort column. */
export function tableColumnSortKey(
  preset: TableColumnPreset,
  query: string,
  visibleColumnKeys: readonly TableColumnKey[],
): SortKey {
  const preferredKey = hasSearchQuery(query) ? null : presetDefaultSortKeys[preset];
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

function columnSearchDocument(
  key: TableColumnKey,
  columnTooltips: ModelAtlasColumnTooltips,
): SearchDocument<TableColumnKey> {
  const column = metricColumnsByKey.get(key);
  const tooltip = tableColumnTooltip(key, columnTooltips);
  return {
    value: key,
    primary: [
      key,
      staticColumnSearchText.get(key),
      column?.label,
      column?.group === "benchmarks" ? benchmarkLabels[column.benchmark] : undefined,
      column?.group === "tasks" ? benchmarkLabels[column.source] : undefined,
      column?.group === "tasks" ? column.metric.replaceAll("_", " ") : undefined,
    ],
    context: tooltip,
  };
}
