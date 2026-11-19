/** The data of the charts that read the leaderboard model by model, such as Spectra and Duels: the dashboard's filtered models reduced to what they draw, their results as the leaderboard prints them, each benchmark's model-assigned shares across the domains it is labelled with and its range across the whole leaderboard, and the find field's search over those rows. */

import {
  BENCHMARK_DOMAINS,
  type BenchmarkDomain,
  benchmarkDomainShares,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { BenchmarkGroup } from "../../../src/model-atlas/benchmarks/factory";
import { BASELINE_BENCHMARKS } from "../../../src/model-atlas/benchmarks/registry";
import { type MinMaxRange, minMaxRange } from "../../../src/model-atlas/math-utils";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { benchmarkLabels, compareBenchmarkDisplayKeys } from "../shared/benchmark-display";
import { shortLabel } from "../shared/model-display";
import type { ModelSuggestionRow } from "../shared/ModelSuggestions";
import { providerLogo } from "../shared/provider-theme";
import type { SearchDocument } from "../shared/search";
import { type BenchmarkMetricColumn, benchmarkMetricColumns } from "../table/column-registry";
import { displayedNumber, formatDashboardMetric } from "../table/format";
import { benchmarkDisplayValue, leaderboardRows, type TableRow } from "../table/leaderboard-rows";

/** One leaderboard row per model, with each benchmark result as the leaderboard prints it, so two models' results differ as the model sheet's Compare shows. */
export type ChartRow = {
  /** The variant the row shows: its family's id and its effort. */
  key: string;
  family: string;
  name: string;
  provider: string;
  intelligence: number;
  benchmarks: Record<string, number>;
};

export type ChartBenchmark = {
  key: string;
  label: string;
  /** The table column's short name, which a weights map's tile carries. */
  columnLabel: string;
  group: BenchmarkGroup;
  /** Model-assigned share of each domain the benchmark is labelled with, from 0 to 1, summing to 1; a domain it is not labelled with is absent. */
  shares: Partial<Record<BenchmarkDomain, number>>;
  /** Whether the benchmark feeds the Intelligence score. */
  intelligence: boolean;
  /** The results' range across every leaderboard row, whatever the filters, which a result's place is measured on; null where they hold fewer than two distinct results. */
  range: MinMaxRange | null;
};

export type ChartDomain = { key: BenchmarkDomain; name: string; definition: string };

export type ChartData = {
  rows: ChartRow[];
  /** Scored and baseline benchmarks that carry label shares, composite indexes left out. */
  benchmarks: ChartBenchmark[];
  /** Domains holding a share of at least one benchmark, the one with the most share summed across benchmarks first. */
  domains: ChartDomain[];
};

/** `payload` is the whole snapshot, whose leaderboard gives each result and range; `models` holds one row per model, already through the dashboard's filters. */
export function chartData(
  payload: ModelAtlasPayload,
  models: readonly ModelAtlasModel[],
): ChartData {
  const { intelligence_benchmark_keys } = payload.metadata.scoring;
  const baseline = new Set<string>(BASELINE_BENCHMARKS);
  const columns = new Map<string, BenchmarkMetricColumn>(
    benchmarkMetricColumns.map((column) => [column.benchmark, column]),
  );
  const charted = [
    ...new Set([...payload.metadata.scoring.selected_benchmark_keys, ...BASELINE_BENCHMARKS]),
  ]
    .sort(compareBenchmarkDisplayKeys)
    .flatMap((key) => {
      // Composite indexes carry no domain shares, so these charts leave them out, as they do a benchmark the leaderboard has no column for.
      const percents = Object.entries(benchmarkDomainShares(key) ?? {});
      const column = columns.get(key);
      if (percents.length === 0 || column == null) return [];
      const total = percents.reduce((sum, [, percent]) => sum + percent, 0);
      return [{ key, column, percents, total }];
    });
  // The leaderboard's rows hold every model whatever the filters, with variants collapsed as these charts show them.
  const results = new Map(
    leaderboardRows(payload, false).map((row) => [
      familyOf(row.model),
      Object.fromEntries(
        charted.flatMap(({ key, column }) => {
          const value = printedResult(row, column);
          return value == null ? [] : [[key, value]];
        }),
      ),
    ]),
  );
  const benchmarks = charted.map(({ key, column, percents, total }): ChartBenchmark => {
    const range = minMaxRange([...results.values()].map((row) => row[key] ?? null));
    return {
      key,
      label: benchmarkLabels[key] ?? key,
      columnLabel: column.label,
      // The scored keys are the frontier benchmarks once the indexes, which carry no shares, are gone.
      group: baseline.has(key) ? "baseline" : "frontier",
      shares: Object.fromEntries(percents.map(([domain, percent]) => [domain, percent / total])),
      intelligence: intelligence_benchmark_keys.includes(key),
      range: range != null && range.max > range.min ? range : null,
    };
  });
  const held = (domain: BenchmarkDomain) =>
    benchmarks.reduce((sum, benchmark) => sum + (benchmark.shares[domain] ?? 0), 0);
  const domains = BENCHMARK_DOMAINS.filter((domain) => held(domain.key) > 0)
    .sort((a, b) => held(b.key) - held(a.key))
    .map(({ key, name, definition }) => ({ key, name, definition }));
  return {
    // While a new snapshot's filtered models catch up with it, a model it dropped has no results.
    rows: models.map((model): ChartRow => {
      const family = familyOf(model);
      return {
        key: `${family}::${model.reasoning_effort ?? ""}`,
        family,
        name: shortLabel({ ...model, reasoning_effort: null }),
        provider: model.provider ?? "",
        intelligence: model.scores.intelligence_score,
        benchmarks: results.get(family) ?? {},
      };
    }),
    benchmarks,
    domains,
  };
}

// A result as its leaderboard cell prints it, a percent in points and every result to the cell's decimal, so equal-looking results are level and a gap is the one Compare shows.
function printedResult(row: TableRow, column: BenchmarkMetricColumn): number | null {
  const value = benchmarkDisplayValue(row, column);
  return typeof value === "number" && Number.isFinite(value)
    ? displayedNumber(formatDashboardMetric(value, column))
    : null;
}

function familyOf(model: ModelAtlasModel): string {
  return model.id ?? model.name ?? "";
}

export function topByIntelligence<T extends { intelligence: number }>(
  models: readonly T[],
  count: number,
): T[] {
  return [...models].sort((a, b) => b.intelligence - a.intelligence).slice(0, count);
}

/** The rows a find field searches, by name, model id, and lab. */
export function findDocuments(rows: readonly ChartRow[]): SearchDocument<ChartRow>[] {
  return rows.map((row) => ({ value: row, primary: [row.name, row.family, row.provider] }));
}

export function findSuggestion(row: ChartRow): ModelSuggestionRow {
  return {
    key: row.key,
    name: row.name,
    provider: row.provider,
    logo: providerLogo(row.provider),
    intelligence: row.intelligence,
  };
}

/** A row's published model id, which a find pill naming it keeps in the URL. */
export function findId(row: ChartRow): string {
  return row.family;
}

// The find field searches only the rows the dashboard's filters admit.
export const NOTHING_FOUND = "No model matches the dashboard's filters.";
