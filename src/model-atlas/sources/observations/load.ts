/** Bind each catalog loader to its source-owned fetch and cache-acceptance rules. */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import type { BenchmarkObservationBinding } from "../../benchmarks/registry";
import { arcPrizeCacheMatches, getArcPrizeStats } from "../arc-prize";
import { getArtificialAnalysisOmniscienceStats } from "../artificial-analysis/omniscience";
import { automationBenchCacheMatches, getAutomationBenchStats } from "../automation-bench";
import { getEpochCapabilitiesIndexStats } from "../epoch/capabilities-index";
import { epochBenchmarkCacheMatches, getEpochBenchmarkStats } from "../epoch/results";
import { getMlsBenchStats } from "../mls-bench";
import { getPerceptionBenchStats } from "../perception-bench";
import { getSurgeIntelligenceIndexStats, getSurgeLeaderboardStats } from "../surge/results";
import {
  getTerminalBenchScienceStats,
  terminalBenchScienceCacheMatches,
} from "../terminal-bench-science";
import { getValsSourceStats, valsBenchmarkCacheMatches } from "../vals/results";
import { getVoxelBenchStats } from "../voxelbench";
import { getWeirdMlStats } from "../weirdml";
import { getZeroEvalStats } from "../zeroeval";

type ObservationSource = {
  fetchRows: () => Promise<BenchmarkObservationPayload>;
  acceptsCache?: (rows: readonly BenchmarkObservationRow[]) => boolean;
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
    case "artificial_analysis_omniscience":
      return {
        fetchRows: () =>
          getArtificialAnalysisOmniscienceStats({
            benchmarkKey: binding.benchmark,
            sourceUrl: loader.sourceUrl,
          }),
      };
    case "epoch_capabilities_index":
      return { fetchRows: () => getEpochCapabilitiesIndexStats(loader.sourceUrl) };
    case "epoch_runs":
      return {
        fetchRows: () => getEpochBenchmarkStats(binding.benchmark, loader.task, loader.eligibility),
        acceptsCache: (rows) => epochBenchmarkCacheMatches(rows, loader.task, loader.eligibility),
      };
    case "mls_bench":
      return { fetchRows: () => getMlsBenchStats(loader.sourceUrl) };
    case "perception_bench":
      return { fetchRows: () => getPerceptionBenchStats(loader.sourceUrl) };
    case "surge":
      return {
        fetchRows:
          loader.view === "index"
            ? () => getSurgeIntelligenceIndexStats(binding.benchmark, loader.sourceUrl)
            : () => getSurgeLeaderboardStats(binding.benchmark, loader.sourceUrl, loader.scoreKind),
      };
    case "terminal_bench_science":
      return {
        fetchRows: () => getTerminalBenchScienceStats(loader.sourceUrl),
        acceptsCache: terminalBenchScienceCacheMatches,
      };
    case "vals":
      return {
        fetchRows: () =>
          getValsSourceStats({
            benchmarkKey: binding.benchmark,
            canonicalTask: loader.canonicalTask,
            includeReasoningEffortInModel: loader.includeReasoningEffortInModel,
            isScoreEligible:
              loader.eligibility === "exclude_aristotle"
                ? (_task, modelId) => modelId.toLowerCase() !== "aristotle/aristotle"
                : undefined,
            sourceUrl: loader.sourceUrl,
          }),
        acceptsCache: (rows) => valsBenchmarkCacheMatches(rows, loader.canonicalTask),
      };
    case "voxelbench":
      // Ratings and uncertainty are recalculated from an evolving voting pool, not immutable task results.
      return {
        fetchRows: () => getVoxelBenchStats(loader.sourceUrl),
        mergeRow: (_cached, fetched) => fetched,
      };
    case "weirdml":
      return { fetchRows: () => getWeirdMlStats() };
    case "automation_bench":
      return {
        fetchRows: () => getAutomationBenchStats(loader),
        acceptsCache: automationBenchCacheMatches,
      };
    case "zeroeval":
      return {
        fetchRows: () =>
          getZeroEvalStats({
            benchmarkKey: binding.benchmark,
            sourceUrl: loader.sourceUrl,
            rankField: loader.rankField,
            observedAtField: loader.observedAtField,
          }),
      };
    default:
      loader satisfies never;
      throw new Error(`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`);
  }
}
