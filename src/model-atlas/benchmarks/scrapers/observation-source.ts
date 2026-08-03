/** Benchmark-observation source dispatch maps catalog loader contracts to executable scrapers. */

import type { BenchmarkObservationLoader } from "../factory";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../registry";
import { getEpochCapabilitiesIndexStats } from "./epoch/capabilities-index";
import { getEpochBenchmarkStats } from "./epoch/results";
import { getSurgeLeaderboardStats } from "./surge/results";
import { getValsSourceStats } from "./vals/results";
import { getWeirdMlStats } from "./weirdml";
import { getZeroEvalStats } from "./zeroeval";

const BENCHMARK_OBSERVATION_SOURCE_FETCHERS = {
  epochCapabilitiesIndex: getEpochCapabilitiesIndexStats,
  weirdMl: getWeirdMlStats,
} as const;

/** Resolve the executable loader paired with one catalog-declared benchmark-observation source. */
export function benchmarkObservationSourceFetcher(
  binding: (typeof BENCHMARK_OBSERVATION_BINDINGS)[number],
) {
  const loader: BenchmarkObservationLoader = binding.loader;
  if (loader.kind === "surge") {
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
  if (loader.kind === "epoch_runs") {
    return () => getEpochBenchmarkStats(binding.benchmark, loader.task);
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
  const fetcher =
    BENCHMARK_OBSERVATION_SOURCE_FETCHERS[
      binding.sourceDataKey as keyof typeof BENCHMARK_OBSERVATION_SOURCE_FETCHERS
    ];
  if (fetcher != null) return fetcher;
  throw new Error(`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`);
}
