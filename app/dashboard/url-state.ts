/** Dashboard URL contract validates explicit selections without materializing absent defaults. */

import { BENCHMARK_COLUMNS } from "../../src/model-atlas/benchmarks/catalog";
import type {
  FrontierBenchmarkAxisKey,
  PerformanceMetric,
} from "./graphs/frontier-benchmarks/analysis";
import { RESEARCH_REGION_IDS, type ResearchRegionId } from "./graphs/research-index";
import {
  type CostFilter,
  costFilterOptions,
  DEFAULT_MODEL_RANK_FILTER,
  DEFAULT_RECENCY_FILTER,
  type ModelRankFilter,
  modelRankFilterOptions,
  type RecencyFilter,
  recencyFilterOptions,
} from "./shared/model-display";
import type { TableColumnPreset } from "./table/column-views";
import { type BenchmarkColumnOrder, sorters, type SortState } from "./table/models";

export type DashboardUrlState = {
  view: TableColumnPreset;
  sort: SortState;
  q: string;
  provider: string[];
  "max-cost": CostFilter;
  rank: ModelRankFilter;
  days: RecencyFilter;
  "table-q": string;
  columns: string;
  "column-order": BenchmarkColumnOrder;
  "table-variants": boolean;
  "graph-variants": boolean;
  performance: PerformanceMetric;
  benchmark: string[] | null;
  axes: FrontierBenchmarkAxisKey;
};

export type DashboardUrlKey = keyof DashboardUrlState;
export type DashboardUrlPatch = Partial<DashboardUrlState>;

const tableKeys = new Set<DashboardUrlKey>([
  "view",
  "sort",
  "table-q",
  "columns",
  "column-order",
  "table-variants",
]);
const paretoKeys = new Set<DashboardUrlKey>(["performance", "benchmark", "axes"]);
const benchmarkKeys = new Set(Object.keys(BENCHMARK_COLUMNS));

/** Decode one control independently so absent or malformed values retain the owning UI default. */
export function readUrlValue<K extends DashboardUrlKey>(
  params: URLSearchParams,
  key: K,
): DashboardUrlState[K] {
  const value = params.get(key);
  let result: DashboardUrlState[DashboardUrlKey];
  switch (key) {
    case "view":
      result = choice(value, ["scores", "cost", "time", "all"], "all");
      break;
    case "sort": {
      const match = /^(.*)\.(asc|desc)$/.exec(value ?? "");
      result =
        match?.[1] && Object.hasOwn(sorters, match[1])
          ? {
              key: match[1] as SortState["key"],
              direction: match[2] === "asc" ? "ascending" : "descending",
            }
          : { key: "intelligence", direction: "descending" };
      break;
    }
    case "provider":
      result = [
        ...new Set(params.getAll(key).filter((item) => /^[a-z0-9][a-z0-9._-]*$/.test(item))),
      ];
      break;
    case "max-cost":
      result = numericChoice(value, costFilterOptions, "all");
      break;
    case "rank":
      result = numericChoice(value, modelRankFilterOptions, DEFAULT_MODEL_RANK_FILTER);
      break;
    case "days":
      result = numericChoice(value, recencyFilterOptions, DEFAULT_RECENCY_FILTER);
      break;
    case "column-order":
      result = choice(value, ["portfolio", "coverage"], "portfolio");
      break;
    case "table-variants":
    case "graph-variants":
      result = value === "1";
      break;
    case "performance":
      result = choice(value, ["intelligence", "agentic", "benchmarks"], "intelligence");
      break;
    case "benchmark": {
      const values = params.getAll(key);
      const valid = [...new Set(values.filter((item) => benchmarkKeys.has(item)))];
      result = values.includes("none") ? [] : valid.length > 0 ? valid : null;
      break;
    }
    case "axes":
      result = choice(value, ["cost", "time", "tokens", "speed", "value"], "cost");
      break;
    default:
      result = value ?? "";
  }
  return result as DashboardUrlState[K];
}

/** Apply only explicitly supplied controls, retaining unrelated parameters and explicit default values. */
export function patchDashboardUrl(url: URL, patch: DashboardUrlPatch): URL {
  const next = new URL(url);
  const keys = Object.keys(patch) as DashboardUrlKey[];
  for (const key of keys) {
    const value = patch[key];
    next.searchParams.delete(key);
    if (key === "sort") {
      const sort = value as SortState;
      next.searchParams.set(key, `${sort.key}.${sort.direction === "ascending" ? "asc" : "desc"}`);
    } else if (Array.isArray(value)) {
      for (const item of value) next.searchParams.append(key, item);
      if (value.length === 0) next.searchParams.set(key, key === "benchmark" ? "none" : "");
    } else if (typeof value === "boolean") {
      next.searchParams.set(key, value ? "1" : "0");
    } else if (key === "benchmark" && value === null) {
      next.searchParams.set(key, "all");
    } else if (value != null) {
      next.searchParams.set(key, String(value));
    }
  }
  if (keys.some((key) => tableKeys.has(key))) next.hash = "leaderboard";
  else if (keys.some((key) => paretoKeys.has(key))) next.hash = "pareto-analysis";
  return next;
}

/** Explicit section anchors win; otherwise panel-specific selections identify the deep-link destination. */
export function dashboardUrlSection(url: URL): ResearchRegionId | null {
  const hash = url.hash.slice(1);
  if (RESEARCH_REGION_IDS.some((id) => id === hash)) return hash as ResearchRegionId;
  if ([...paretoKeys].some((key) => url.searchParams.has(key))) return "pareto-analysis";
  if ([...tableKeys].some((key) => url.searchParams.has(key))) return "leaderboard";
  return null;
}

function choice<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function numericChoice<T extends number | "all">(
  value: string | null,
  values: readonly T[],
  fallback: T,
): T {
  if (value == null || value.trim() === "") return fallback;
  const parsed = value === "all" ? "all" : Number(value);
  return values.includes(parsed as T) ? (parsed as T) : fallback;
}
