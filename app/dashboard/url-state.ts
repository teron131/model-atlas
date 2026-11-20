/** The dashboard's URL contract: every control's state under its own name, validated so an absent or malformed value keeps its default, and the address that state is shown at, a section's path carrying that section's controls under short names beside the page-wide ones. */

import { BENCHMARK_COLUMNS } from "../../src/model-atlas/benchmarks/catalog";
import {
  FRONTIER_AXIS_KEYS,
  type FrontierBenchmarkAxisKey,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
} from "./graphs/pareto/analysis";
import {
  isStackedRegion,
  REGION_CHARTS,
  type RegionChartKey,
  RESEARCH_REGION_IDS,
  type ResearchRegionId,
  type StackedRegionId,
} from "./research-index";
import {
  type CostFilter,
  costFilterOptions,
  DEFAULT_MODEL_RANK_FILTER,
  DEFAULT_RECENCY_FILTER,
  type GlobalModelFilters,
  type ModelRankFilter,
  modelRankFilterOptions,
  type RecencyFilter,
  recencyFilterOptions,
} from "./shared/model-filters";
import { TABLE_COLUMN_PRESETS, type TableColumnPreset } from "./table/column-views";
import { sorters, type SortState } from "./table/sort";

export type DashboardUrlState = {
  view: TableColumnPreset;
  sort: SortState;
  q: string;
  provider: string[];
  "max-cost": CostFilter;
  rank: ModelRankFilter;
  days: RecencyFilter;
  "table-q": string;
  "table-variants": boolean;
  /** The reasoning efforts the leaderboard's variant rows keep; `null` keeps every effort. */
  "table-effort": string[] | null;
  "graph-variants": boolean;
  "timeline-period": "all" | "year";
  "timeline-provider": string[] | null;
  performance: PerformanceMetric;
  benchmark: string[] | null;
  axes: FrontierBenchmarkAxisKey;
  /** The model sheet's model, by short id, `claude-opus-5.5`; with `effort`, one reasoning variant, otherwise the collapsed model. */
  model: string | null;
  effort: string | null;
  /** A model pinned beside the sheet's model for comparison, named the same way as `model` and `effort`. */
  compare: string | null;
  "compare-effort": string | null;
  /** A chart's find pills, each a model's short id where the pill names one model, otherwise as typed. */
  "spectra-find": string[];
  "duels-find": string[];
  "pareto-find": string[];
  "effort-find": string[];
  "timeline-find": string[];
  "effort-measure": "intelligence" | "agentic" | "cost" | "time" | "tokens";
  /** The chart each stacked region shows; an address carries it as its path, never as a key. */
  "leaderboard-chart": RegionChartKey<"leaderboard">;
  "pareto-chart": RegionChartKey<"pareto">;
};

export type DashboardUrlKey = keyof DashboardUrlState;
export type DashboardUrlPatch = Partial<DashboardUrlState>;
export const GRAPH_VARIANTS_COOKIE = "model-atlas-graph-variants";

/** Where a link opens: a region, or a stacked region's chart, named by its path, `/duels`; the page's top has none. */
export type DashboardSection = ResearchRegionId | RegionChartKey<StackedRegionId>;

/** Every control's value under its own name, and the section the address shows. */
export type DashboardState = { params: URLSearchParams; section: DashboardSection | null };

const SECTION_REGIONS = new Map<DashboardSection, ResearchRegionId>([
  ...RESEARCH_REGION_IDS.map((id) => [id, id] as const),
  ...RESEARCH_REGION_IDS.filter(isStackedRegion).flatMap((region) =>
    REGION_CHARTS[region].map((chart) => [chart.key, region] as const),
  ),
]);
// Each section's own controls under the short names its address uses: `/duels?find=gemini-3.7-flash` holds the Duels find pill kept as "duels-find".
const SECTION_KEYS: Record<DashboardSection, Readonly<Record<string, DashboardUrlKey>>> = {
  leaderboard: {
    view: "view",
    sort: "sort",
    search: "table-q",
    variants: "table-variants",
    efforts: "table-effort",
  },
  spectra: { find: "spectra-find" },
  duels: { find: "duels-find" },
  pareto: { performance: "performance", benchmark: "benchmark", axes: "axes", find: "pareto-find" },
  effort: { measure: "effort-measure", find: "effort-find" },
  timeline: { period: "timeline-period", lab: "timeline-provider", find: "timeline-find" },
};
// Controls that act across the page keep their names on every address.
const PAGE_KEYS = [
  "q",
  "provider",
  "max-cost",
  "rank",
  "days",
  "graph-variants",
  "model",
  "effort",
  "compare",
  "compare-effort",
] as const satisfies readonly DashboardUrlKey[];
// Controls holding several values, which an address joins with commas, `find=gemini-4-argon,muse-wonder-full`; none of their values can hold a comma, which a find field takes as the end of a pill, while the free-text searches can and stay whole.
const LIST_KEYS = new Set<DashboardUrlKey>([
  "provider",
  "timeline-provider",
  "table-effort",
  "benchmark",
  "spectra-find",
  "duels-find",
  "pareto-find",
  "effort-find",
  "timeline-find",
]);
const KEY_SECTIONS = new Map<DashboardUrlKey, DashboardSection>(
  [...SECTION_REGIONS.keys()].flatMap((section) =>
    Object.values(SECTION_KEYS[section]).map((key) => [key, section] as const),
  ),
);
const dashboardKeys = new Set<DashboardUrlKey>([
  ...PAGE_KEYS,
  ...KEY_SECTIONS.keys(),
  "leaderboard-chart",
  "pareto-chart",
]);
// The region whose shown chart each chart key holds.
const CHART_KEY_REGIONS = {
  "leaderboard-chart": "leaderboard",
  "pareto-chart": "pareto",
} as const satisfies Record<`${StackedRegionId}-chart`, StackedRegionId>;
// Every name an address gives a control, which it never keeps as someone else's parameter.
const DASHBOARD_NAMES = new Set<string>([
  ...PAGE_KEYS,
  ...Object.values(SECTION_KEYS).flatMap((names) => Object.keys(names)),
]);
const benchmarkKeys = new Set(Object.keys(BENCHMARK_COLUMNS));
const tableColumnPresetKeys = TABLE_COLUMN_PRESETS.map((preset) => preset.key);
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const EFFORT_PATTERN = /^[a-z]+$/;

/** Decode one control independently so absent or malformed values retain the owning UI default. */
export function readUrlValue<K extends DashboardUrlKey>(
  params: URLSearchParams,
  key: K,
): DashboardUrlState[K] {
  const value = params.get(key);
  let result: DashboardUrlState[DashboardUrlKey];
  switch (key) {
    case "view":
      result = choice(value, tableColumnPresetKeys, "all");
      break;
    case "sort": {
      // "<key>.<asc|desc>", splitting at the last dot: "intelligence.asc" → key "intelligence", direction "asc".
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
    case "timeline-period":
      result = choice(value, ["all", "year"], "all");
      break;
    case "timeline-provider":
      result = params.has(key)
        ? [...new Set(params.getAll(key).filter((item) => PROVIDER_ID_PATTERN.test(item)))]
        : null;
      break;
    case "provider":
      result = [...new Set(params.getAll(key).filter((item) => PROVIDER_ID_PATTERN.test(item)))];
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
    case "table-variants":
    case "graph-variants":
      result = value === "1";
      break;
    case "table-effort":
      result = params.has(key)
        ? [...new Set(params.getAll(key).filter((item) => EFFORT_PATTERN.test(item)))]
        : null;
      break;
    case "performance":
      result = choice(value, PERFORMANCE_METRICS, "intelligence");
      break;
    case "benchmark": {
      const values = params.getAll(key);
      const valid = [...new Set(values.filter((item) => benchmarkKeys.has(item)))];
      result = values.includes("none") ? [] : valid.length > 0 ? valid : null;
      break;
    }
    case "axes":
      result = choice(value, FRONTIER_AXIS_KEYS, "cost");
      break;
    case "model":
    case "compare":
      result = value?.trim() || null;
      break;
    case "effort":
    case "compare-effort":
      result = value != null && EFFORT_PATTERN.test(value) ? value : null;
      break;
    case "spectra-find":
    case "duels-find":
    case "pareto-find":
    case "effort-find":
    case "timeline-find":
      result = [...new Set(params.getAll(key).map((item) => item.trim()))].filter(Boolean);
      break;
    case "effort-measure":
      result = choice(value, ["intelligence", "agentic", "cost", "time", "tokens"], "cost");
      break;
    case "leaderboard-chart":
    case "pareto-chart":
      result = chartChoice(value, key);
      break;
    default:
      result = value ?? "";
  }
  return result as DashboardUrlState[K];
}

/** The dashboard-wide model filters a URL selects, each absent or malformed field at its default. */
export function readGlobalModelFilters(params: URLSearchParams): GlobalModelFilters {
  return {
    q: readUrlValue(params, "q"),
    provider: readUrlValue(params, "provider"),
    "max-cost": readUrlValue(params, "max-cost"),
    rank: readUrlValue(params, "rank"),
    days: readUrlValue(params, "days"),
  };
}

/** The global model filters of a URL that selects none: every model released in the default recency window. */
export const DEFAULT_GLOBAL_MODEL_FILTERS = readGlobalModelFilters(new URLSearchParams());

/** `state` with `patch` applied and defaults dropped, its section moved to the one that owns a patched control: a chart choice to the chart, and a section's control to its section; a page-wide control leaves it. */
export function patchDashboardState(
  state: DashboardState,
  patch: DashboardUrlPatch,
): DashboardState {
  const params = new URLSearchParams(state.params);
  const keys = Object.keys(patch) as DashboardUrlKey[];
  for (const key of keys) {
    const value = patch[key];
    params.delete(key);
    if (key === "sort") {
      const sort = value as SortState;
      params.set(key, `${sort.key}.${sort.direction === "ascending" ? "asc" : "desc"}`);
    } else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
      if (value.length === 0) params.set(key, key === "benchmark" ? "none" : "");
    } else if (typeof value === "boolean") {
      params.set(key, value ? "1" : "0");
    } else if (key === "benchmark" && value === null) {
      params.set(key, "all");
    } else if (value != null) {
      params.set(key, String(value));
    }
  }
  // An effort choice filters reasoning-variant rows, so it leaves with them.
  if (params.get("table-variants") !== "1") params.delete("table-effort");
  const defaults = new URLSearchParams();
  for (const key of dashboardKeys) {
    // An explicit graph-variant value can override the saved cookie preference.
    if (key === "graph-variants" || !params.has(key)) continue;
    if (JSON.stringify(readUrlValue(params, key)) === JSON.stringify(readUrlValue(defaults, key)))
      params.delete(key);
  }
  const moved = keys
    .map((key) => (isChartKey(key) ? patch[key] : KEY_SECTIONS.get(key)))
    .find((section) => section != null);
  return { params, section: moved ?? state.section };
}

/** A link's state: its path's section and that section's controls, and the page-wide controls; a stacked chart's path also shows that chart in its region. */
export function readDashboardUrl(url: URL): DashboardState {
  const path = url.pathname.slice(1);
  const section = isDashboardSection(path) ? path : null;
  const params = new URLSearchParams();
  for (const [name, key] of addressNames(section)) {
    const value = url.searchParams.get(name);
    if (value == null) continue;
    for (const item of LIST_KEYS.has(key) ? value.split(",") : [value]) params.append(key, item);
  }
  if (section != null) {
    const region = sectionRegion(section);
    if (isStackedRegion(region)) params.set(`${region}-chart`, section);
  }
  return patchDashboardState({ params, section }, {});
}

/** The address `state` is shown at from `base`: its section's path, that section's controls under their short names, the page-wide controls, then `base`'s parameters the dashboard does not own; other sections' controls stay off it, so a link carries only what it points at. */
export function dashboardUrl({ params, section }: DashboardState, base: URL): URL {
  const url = new URL(section == null ? "/" : `/${section}`, base);
  const search = new URLSearchParams();
  for (const [name, key] of addressNames(section)) {
    const values = params.getAll(key);
    if (LIST_KEYS.has(key) && values.length > 0) search.append(name, values.join(","));
    else for (const value of values) search.append(name, value);
  }
  for (const [name, value] of base.searchParams) {
    if (!DASHBOARD_NAMES.has(name)) search.append(name, value);
  }
  url.search = readableSearch(search);
  return url;
}

export function isDashboardSection(value: string): value is DashboardSection {
  return SECTION_REGIONS.has(value as DashboardSection);
}

/** The region a section lies in: a stacked chart's region, or the region itself. */
export function sectionRegion(section: DashboardSection): ResearchRegionId {
  return SECTION_REGIONS.get(section)!;
}

/** The state a history entry saved, which holds every section's controls where its address holds one section's; `null` for an entry the dashboard did not write. */
export function savedDashboardState(entry: unknown): DashboardState | null {
  if (typeof entry !== "object" || entry == null || !("dashboard" in entry)) return null;
  const saved = entry.dashboard;
  if (typeof saved !== "object" || saved == null || !("search" in saved) || !("section" in saved))
    return null;
  const { search, section } = saved;
  if (typeof search !== "string") return null;
  if (section !== null && (typeof section !== "string" || !isDashboardSection(section)))
    return null;
  return { params: new URLSearchParams(search), section };
}

export function dashboardHistoryEntry({ params, section }: DashboardState) {
  return { search: params.toString(), section };
}

/** A model's name in a link, its published id without the lab, which no two labs' models share: "google/gemini-3.7-flash" → "gemini-3.7-flash". */
export function modelLinkId(id: string): string {
  return id.slice(id.indexOf("/") + 1);
}

// The names an address at `section` carries, each with the control it holds: the section's own first, then the page-wide ones.
function addressNames(section: DashboardSection | null): [string, DashboardUrlKey][] {
  return [
    ...(section == null ? [] : Object.entries(SECTION_KEYS[section])),
    ...PAGE_KEYS.map((key): [string, DashboardUrlKey] => [key, key]),
  ];
}

// Ids, names, and lists keep their slashes, colons, brackets, and commas, which a query value may carry as they are: "find=google%2Fgemini-4-argon%2Cmuse-wonder-full" → "find=google/gemini-4-argon,muse-wonder-full".
function readableSearch(params: URLSearchParams): string {
  const search = params
    .toString()
    .replace(/%2F|%3A|%28|%29|%2C/g, (escaped) => decodeURIComponent(escaped));
  return search === "" ? "" : `?${search}`;
}

function isChartKey(key: DashboardUrlKey): key is keyof typeof CHART_KEY_REGIONS {
  return Object.hasOwn(CHART_KEY_REGIONS, key);
}

// A stacked region's shown chart, its first chart unless the value names another.
function chartChoice(value: string | null, key: keyof typeof CHART_KEY_REGIONS) {
  const charts = REGION_CHARTS[CHART_KEY_REGIONS[key]];
  return choice(
    value,
    charts.map((chart) => chart.key),
    charts[0].key,
  );
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
