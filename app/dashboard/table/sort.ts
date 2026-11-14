/** Sort semantics for leaderboard rows: each column's sort direction and value, header-click toggling, and the stable row sort. */

import { modelDisplayName } from "../shared/model-display";
import {
  costMetricColumns,
  type DashboardMetricColumn,
  dashboardMetricColumns,
  type SortKey,
  speedMetricColumns,
} from "./column-registry";
import { contextWindowValue, dashboardMetricValue, type TableRow } from "./leaderboard-rows";

export type SortDirection = "ascending" | "descending";

export type SortState = {
  key: SortKey;
  direction: SortDirection;
};

type Sorter = {
  direction: SortDirection;
  type: "number" | "text";
  get: (row: TableRow) => number | string | null | undefined;
};

const dashboardMetricSorters = Object.fromEntries(
  [...costMetricColumns, ...speedMetricColumns, ...dashboardMetricColumns].map((column) => [
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
    get: (row) => -row.model.scores.intelligence_score,
  },
  model: {
    direction: "ascending",
    type: "text",
    get: (row) => modelDisplayName(row.model),
  },
  intelligence: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores.intelligence_score,
  },
  agentic: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores.agentic_score,
  },
  speed: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores.speed_score,
  },
  value: {
    direction: "descending",
    type: "number",
    get: (row) => row.model.scores.value_score,
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

function compareMissingValues(sorter: Sorter, left: unknown, right: unknown) {
  if (sorter.type !== "number") {
    return 0;
  }
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
