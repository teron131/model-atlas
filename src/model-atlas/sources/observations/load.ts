/** Bind each catalog loader to its source-owned fetch and cache-acceptance rules. */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationBinding,
  type BenchmarkObservationRowsKey,
} from "../../benchmarks/registry";
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
import { fetchRowsOrNone, mergeBenchmarkObservationRow } from "../snapshots/row-snapshot";
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
  mergeRow?: (
    cached: BenchmarkObservationRow,
    fetched: BenchmarkObservationRow,
  ) => BenchmarkObservationRow;
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
  return { ...source, fetchRows: () => fetchRowsOrNone(source.fetchRows) };
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
        replaceRowsOnRefresh: true,
        // Preference ratings, vote counts, and intervals describe the current voting pool.
        mergeRow: (_cached, fetched) => fetched,
      };
    case "artificial_analysis_3d":
      // Ratings are refitted as votes accumulate, so each refresh replaces a model's cached rating.
      return {
        fetchRows: () => getAa3dStats(loader.sourceUrl),
        mergeRow: (_cached, fetched) => fetched,
      };
    case "automation_bench":
      return {
        fetchRows: () => getAutomationBenchStats(loader.sourceUrl),
        acceptsCache: automationBenchCacheMatches,
        // Zapier re-scores rows in place, such as preliminary results it marks for re-evaluation.
        mergeRow: (_cached, fetched) => fetched,
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
        // Epoch republishes the source's current scores, which the source revises in place.
        mergeRow: (_cached, fetched) => fetched,
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
      return {
        ...(version == null
          ? { fetchRows }
          : {
              fetchRows: async () => withSurgeVersion(await fetchRows(), version),
              acceptsCache: (rows) => surgeCacheMatches(rows, version),
            }),
        // Surge revises published results under the same model-effort row identity.
        mergeRow: (_cached, fetched) => fetched,
      };
    }
    case "terminal_bench_science":
      return {
        sourceUrls: [loader.sourceUrl, TERMINAL_BENCH_SCIENCE_VALS_URL],
        fetchRows: () => getTerminalBenchScienceStats(loader.sourceUrl),
        acceptsCache: terminalBenchScienceCacheMatches,
        // Vals revises its run for each model and effort in place, as on its other benchmarks.
        mergeRow: (cached, fetched) =>
          fetched.source_url === TERMINAL_BENCH_SCIENCE_VALS_URL
            ? fetched
            : mergeBenchmarkObservationRow(cached, fetched),
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
        // Vals revises scores and run metadata under stable model-effort identities.
        mergeRow: (_cached, fetched) => fetched,
      };
    case "vals_rsi":
      return {
        fetchRows: () => getValsRsiStats(loader.sourceUrl),
        acceptsCache: valsRsiCacheMatches,
      };
    case "voxelbench":
      // Ratings and uncertainty are recalculated from an evolving voting pool, not immutable task results.
      return {
        fetchRows: () => getVoxelBenchStats(loader.sourceUrl),
        mergeRow: (_cached, fetched) => fetched,
      };
    case "weirdml":
      return {
        sourceUrls: [loader.sourceUrl, loader.crosswalkSourceUrl],
        fetchRows: () => getWeirdMlStats(loader.sourceUrl, loader.crosswalkSourceUrl),
        acceptsCache: (rows) =>
          weirdMlSourceCacheMatches(rows, loader.sourceUrl, loader.crosswalkSourceUrl),
        // Published means and uncertainty must update with their current run cohort.
        mergeRow: (_cached, fetched) => fetched,
      };
    default:
      loader satisfies never;
      throw new Error(`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`);
  }
}
