/** Binds each benchmark-observation catalog entry to its source's scraper and cache-acceptance rules, and defines the row key that follows those rows across refreshes; "load" here is fetching, shared by live assembly and the snapshot path. */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  excludeAmbiguousConfigurations,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationBinding,
  type BenchmarkObservationRowsKey,
} from "../../benchmarks/registry";
import { parseModelEffort } from "../../identity/normalization";
import { arcPrizeCacheMatches, getArcPrizeStats } from "../arc-prize";
import { ARENA_WEBDEV_DATASET_URL, arenaRefreshIsCurrent } from "../arena/dataset";
import { getArenaWebDevStats } from "../arena/webdev";
import { getAa3dStats } from "../artificial-analysis/aa-3d";
import type { ModelAtlasSourceRows } from "../assembly/source-data";
import { automationBenchCacheMatches, getAutomationBenchStats } from "../automation-bench";
import { caisCacheMatches, getCaisDashboardStats } from "../cais/results";
import { getEpochCapabilitiesIndexStats } from "../epoch/capabilities-index";
import {
  epochBenchmarkCacheMatches,
  getEpochBenchmarkStats,
  getEpochExternalBenchmarkStats,
} from "../epoch/results";
import { getMercorStats, mercorCacheMatches } from "../mercor/results";
import { sourceRowKey } from "../snapshots/policy";
import { fetchRowsOrNone, harnessDistinguishesRuns } from "../snapshots/row-snapshot";
import {
  getSurgeIntelligenceIndexStats,
  getSurgeLeaderboardStats,
  surgeCacheMatches,
  withSurgeVersion,
} from "../surge/results";
import {
  getTerminalBenchScienceStats,
  TERMINAL_BENCH_SCIENCE_VALS_URL,
  terminalBenchScienceCacheMatches,
} from "../terminal-bench-science";
import type { SourceSnapshots } from "../types";
import { getValsBenchmarkStats, valsBenchmarkCacheMatches } from "../vals/results";
import { getValsRsiStats, valsRsiCacheMatches } from "../vals/rsi";
import { getVoxelBenchStats } from "../voxelbench";
import { getWeirdMlStats, weirdMlSourceCacheMatches } from "../weirdml";

type ObservationSource = {
  sourceUrls?: readonly string[];
  fetchRows: () => Promise<BenchmarkObservationPayload>;
  acceptsCache?: (rows: readonly BenchmarkObservationRow[]) => boolean;
  acceptsRefresh?: (
    cachedRows: readonly BenchmarkObservationRow[],
    fetchedRows: readonly BenchmarkObservationRow[],
  ) => boolean;
  replaceRowsOnRefresh?: boolean;
};

type BenchmarkObservationRows = Pick<ModelAtlasSourceRows, BenchmarkObservationRowsKey>;

export async function fetchBenchmarkObservationRows(): Promise<BenchmarkObservationRows> {
  const entries = await Promise.all(
    BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => [
      binding.sourceRowsKey,
      (await benchmarkObservationSource(binding).fetchRows()).data,
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkObservationRows;
}

export function benchmarkObservationRowsFromSnapshots(
  snapshots: Pick<SourceSnapshots, BenchmarkObservationRowsKey>,
): BenchmarkObservationRows {
  return Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
      binding.sourceRowsKey,
      snapshots[binding.sourceRowsKey],
    ]),
  ) as BenchmarkObservationRows;
}

/** Resolve live and cached evidence through the same catalog binding without teaching shared persistence about source formats. */
export function benchmarkObservationSource(
  binding: BenchmarkObservationBinding,
): ObservationSource {
  const source = loaderSource(binding);
  return {
    ...source,
    fetchRows: async () => {
      const payload = await fetchRowsOrNone(source.fetchRows);
      // Rows a source publishes under one stored identity are separate configurations of one model and effort.
      return {
        ...payload,
        data: excludeAmbiguousConfigurations(
          payload.data,
          benchmarkObservationRowKeyFor(payload.data),
        ),
      };
    },
  };
}

function loaderSource(binding: BenchmarkObservationBinding): ObservationSource {
  const loader: BenchmarkObservationLoader = binding.loader;
  switch (loader.kind) {
    case "arc_prize": {
      const benchmarkKey = binding.benchmark;
      if (benchmarkKey !== "arc_agi_2" && benchmarkKey !== "arc_agi_3") {
        throw new Error(`Invalid ARC Prize benchmark binding: ${benchmarkKey}`);
      }
      return {
        fetchRows: () =>
          getArcPrizeStats({
            benchmarkKey,
            datasetId: loader.datasetId,
            sourceUrl: loader.sourceUrl,
          }),
        acceptsCache: (rows) => arcPrizeCacheMatches(rows, benchmarkKey),
      };
    }
    case "arena_webdev":
      return {
        sourceUrls: [loader.sourceUrl, ARENA_WEBDEV_DATASET_URL],
        fetchRows: () => getArenaWebDevStats(loader.sourceUrl),
        acceptsRefresh: arenaRefreshIsCurrent,
        // Preference ratings, vote counts, and intervals describe the current voting pool.
        replaceRowsOnRefresh: true,
      };
    case "artificial_analysis_3d":
      return { fetchRows: () => getAa3dStats(loader.sourceUrl) };
    case "automation_bench":
      return {
        fetchRows: () => getAutomationBenchStats(loader.sourceUrl),
        acceptsCache: automationBenchCacheMatches,
      };
    case "cais_dashboard":
      return {
        fetchRows: () => getCaisDashboardStats(binding.benchmark, loader),
        acceptsCache: (rows) => caisCacheMatches(rows, loader),
      };
    case "epoch_capabilities_index":
      return {
        fetchRows: () => getEpochCapabilitiesIndexStats(loader.sourceUrl),
        acceptsCache: (rows) => rows.every((row) => Object.hasOwn(row.metadata, "benchmark_count")),
      };
    case "epoch_external":
      return {
        fetchRows: () => getEpochExternalBenchmarkStats(binding.benchmark, loader.sourceUrl),
      };
    case "epoch_runs":
      return {
        fetchRows: () => getEpochBenchmarkStats(binding.benchmark, loader.task, loader.eligibility),
        acceptsCache: (rows) => epochBenchmarkCacheMatches(rows, loader.task, loader.eligibility),
      };
    case "mercor":
      return {
        fetchRows: () => getMercorStats(binding.benchmark, loader),
        acceptsCache: (rows) => mercorCacheMatches(rows, loader),
      };
    case "surge": {
      const { version } = loader;
      const fetchRows =
        loader.view === "index"
          ? () => getSurgeIntelligenceIndexStats(binding.benchmark, loader.sourceUrl)
          : () => getSurgeLeaderboardStats(binding.benchmark, loader.sourceUrl, loader.scoreKind);
      return version == null
        ? { fetchRows }
        : {
            fetchRows: async () => withSurgeVersion(await fetchRows(), version),
            acceptsCache: (rows) => surgeCacheMatches(rows, version),
          };
    }
    case "terminal_bench_science":
      return {
        sourceUrls: [loader.sourceUrl, TERMINAL_BENCH_SCIENCE_VALS_URL],
        fetchRows: () => getTerminalBenchScienceStats(loader.sourceUrl),
        acceptsCache: terminalBenchScienceCacheMatches,
      };
    case "vals":
      return {
        fetchRows: () =>
          getValsBenchmarkStats({
            benchmarkKey: binding.benchmark,
            canonicalTask: loader.canonicalTask,
            sourceUrl: loader.sourceUrl,
          }),
        acceptsCache: (rows) => valsBenchmarkCacheMatches(rows, loader.canonicalTask),
      };
    case "vals_rsi":
      return {
        fetchRows: () => getValsRsiStats(loader.sourceUrl),
        acceptsCache: valsRsiCacheMatches,
      };
    case "voxelbench":
      return { fetchRows: () => getVoxelBenchStats(loader.sourceUrl) };
    case "weirdml":
      return {
        sourceUrls: [loader.sourceUrl, loader.crosswalkSourceUrl],
        fetchRows: () => getWeirdMlStats(loader.sourceUrl, loader.crosswalkSourceUrl),
        acceptsCache: (rows) =>
          weirdMlSourceCacheMatches(rows, loader.sourceUrl, loader.crosswalkSourceUrl),
      };
    default:
      loader satisfies never;
      throw new Error(`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`);
  }
}

/** Applies the harness rule per source series, since one benchmark can combine sources with different harness practices. The rule reads only the current rows, so a partial fetch that omits a multi-harness model merges that model's cached harness rows until a full fetch restores them. */
export function benchmarkObservationRowKeyFor(
  rows: readonly BenchmarkObservationRow[],
): (row: BenchmarkObservationRow) => string {
  const harnessSeries = new Set(
    [...new Set(rows.map((row) => row.source_url))].filter((sourceUrl) =>
      harnessDistinguishesRuns(
        rows.filter((row) => row.source_url === sourceUrl),
        (row) => benchmarkObservationRowKey(row, { harness: false }),
        (row) => row.metadata.harness,
      ),
    ),
  );
  return (row) => benchmarkObservationRowKey(row, { harness: harnessSeries.has(row.source_url) });
}

/** Uses stable model identity rather than mutable source labels across benchmark row variants. */
export function benchmarkObservationRowKey(
  row: BenchmarkObservationRow,
  { harness = true }: { harness?: boolean } = {},
): string {
  const parsedModel = parseModelEffort(row.model);
  const baseModel = row.base_model === row.model ? parsedModel.baseModel : row.base_model;
  const metadataIdentity = (key: string): string | number | null => {
    const value = row.metadata[key];
    return typeof value === "string" || typeof value === "number" ? value : null;
  };
  return sourceRowKey(
    row.benchmark_key,
    metadataIdentity("task"),
    metadataIdentity("track"),
    harness ? metadataIdentity("harness") : null,
    metadataIdentity("source_model_id") ??
      metadataIdentity("source_model") ??
      metadataIdentity("internal_model_name"),
    metadataIdentity("run_id"),
    row.model_id ?? baseModel,
    row.model_creator,
    row.reasoning_effort ?? parsedModel.reasoningEffort,
  );
}
