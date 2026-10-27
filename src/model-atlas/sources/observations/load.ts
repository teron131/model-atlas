/** Bind each catalog loader to its source-owned fetch and cache-acceptance rules. */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import type { BenchmarkObservationBinding } from "../../benchmarks/registry";
import { arcPrizeCacheMatches, getArcPrizeStats } from "../arc-prize";
import { ARENA_WEBDEV_DATASET_URL, arenaRefreshIsCurrent } from "../arena/dataset";
import { getArenaWebDevStats } from "../arena/webdev";
import { getArtificialAnalysisOmniscienceStats } from "../artificial-analysis/omniscience";
import { automationBenchCacheMatches, getAutomationBenchStats } from "../automation-bench";
import { caisCacheMatches, getCaisDashboardStats } from "../cais/results";
import { getEpochCapabilitiesIndexStats } from "../epoch/capabilities-index";
import { epochBenchmarkCacheMatches, getEpochBenchmarkStats } from "../epoch/results";
import { getMercorStats, mercorCacheMatches } from "../mercor/results";
import { getPerceptionBenchStats } from "../perception-bench";
import {
  getSurgeIntelligenceIndexStats,
  getSurgeLeaderboardStats,
  surgeCacheMatches,
  withSurgeEdition,
} from "../surge/results";
import {
  getTerminalBenchScienceStats,
  TERMINAL_BENCH_SCIENCE_VALS_URL,
  terminalBenchScienceCacheMatches,
} from "../terminal-bench-science";
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

/** Resolve live and cached evidence through the same catalog binding without teaching shared persistence about source formats. */
export function benchmarkObservationSource(
  binding: BenchmarkObservationBinding,
): ObservationSource {
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
    case "artificial_analysis_omniscience":
      return {
        fetchRows: () =>
          getArtificialAnalysisOmniscienceStats({
            benchmarkKey: binding.benchmark,
            sourceUrl: loader.sourceUrl,
          }),
      };
    case "automation_bench":
      return {
        fetchRows: () => getAutomationBenchStats(loader),
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
    case "perception_bench":
      return { fetchRows: () => getPerceptionBenchStats(loader.sourceUrl) };
    case "surge": {
      const { edition } = loader;
      const fetchRows =
        loader.view === "index"
          ? () => getSurgeIntelligenceIndexStats(binding.benchmark, loader.sourceUrl)
          : () => getSurgeLeaderboardStats(binding.benchmark, loader.sourceUrl, loader.scoreKind);
      return {
        ...(edition == null
          ? { fetchRows }
          : {
              fetchRows: async () => withSurgeEdition(await fetchRows(), edition),
              acceptsCache: (rows) => surgeCacheMatches(rows, edition),
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
