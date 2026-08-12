/** Benchmark-observation source dispatch maps catalog loader contracts to executable scrapers. */

import type { BenchmarkObservationLoader } from "../factory";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../registry";
import { getArcPrizeStats } from "./arc-prize";
import { getArtificialAnalysisOmniscienceStats } from "./artificial-analysis/omniscience";
import { getEpochCapabilitiesIndexStats } from "./epoch/capabilities-index";
import { getEpochBenchmarkStats } from "./epoch/results";
import { getMlsBenchStats } from "./mls-bench";
import { getPerceptionBenchStats } from "./perception-bench";
import { getSurgeIntelligenceIndexStats, getSurgeLeaderboardStats } from "./surge/results";
import { getValsSourceStats } from "./vals/results";
import { getWeirdMlStats } from "./weirdml";
import { getZeroEvalStats } from "./zeroeval";

/** Resolve the executable loader paired with one catalog-declared benchmark-observation source. */
export function benchmarkObservationSourceFetcher(
  binding: (typeof BENCHMARK_OBSERVATION_BINDINGS)[number],
) {
  const loader: BenchmarkObservationLoader = binding.loader;
  if (loader.kind === "arc_prize") {
    const benchmarkKey = binding.benchmark;
    if (benchmarkKey !== "arc_agi_2" && benchmarkKey !== "arc_agi_3") {
      throw new Error(`Invalid ARC Prize benchmark binding: ${benchmarkKey}`);
    }
    return () =>
      getArcPrizeStats({
        benchmarkKey,
        datasetId: loader.datasetId,
        sourceUrl: loader.sourceUrl,
      });
  }
  if (loader.kind === "artificial_analysis_omniscience") {
    return () =>
      getArtificialAnalysisOmniscienceStats({
        benchmarkKey: binding.benchmark,
        sourceUrl: loader.sourceUrl,
      });
  }
  if (loader.kind === "epoch_capabilities_index") {
    return () => getEpochCapabilitiesIndexStats(loader.sourceUrl);
  }
  if (loader.kind === "epoch_runs") {
    return () => getEpochBenchmarkStats(binding.benchmark, loader.task);
  }
  if (loader.kind === "mls_bench") {
    return () => getMlsBenchStats(loader.sourceUrl);
  }
  if (loader.kind === "perception_bench") {
    return () => getPerceptionBenchStats(loader.sourceUrl);
  }
  if (loader.kind === "surge") {
    if (loader.view === "index") {
      return () => getSurgeIntelligenceIndexStats(binding.benchmark, loader.sourceUrl);
    }
    return () => getSurgeLeaderboardStats(binding.benchmark, loader.sourceUrl, loader.scoreKind);
  }
  if (loader.kind === "vals") {
    return () =>
      getValsSourceStats({
        benchmarkKey: binding.benchmark,
        canonicalTask: loader.canonicalTask,
        includeReasoningEffortInModel: loader.includeReasoningEffortInModel,
        isScoreEligible:
          loader.eligibility === "exclude_aristotle"
            ? (_task, modelId) => modelId.toLowerCase() !== "aristotle/aristotle"
            : undefined,
        sourceUrl: loader.sourceUrl,
      });
  }
  if (loader.kind === "weirdml") {
    return () => getWeirdMlStats();
  }
  if (loader.kind === "zeroeval") {
    return () =>
      getZeroEvalStats({
        benchmarkKey: binding.benchmark,
        sourceUrl: loader.sourceUrl,
        rankField: loader.rankField,
        observedAtField: loader.observedAtField,
      });
  }
  loader satisfies never;
  throw new Error(`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`);
}
