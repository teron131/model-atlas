/** Bulk source loading acquires shared catalog and benchmark inputs before derivation scores models and schedules per-model enrichment. */

import { BENCHMARK_OBSERVATION_BINDINGS } from "../../benchmarks/registry";
import { getArtificialAnalysisBenchmarkResourceStats } from "../artificial-analysis/benchmark-resources";
import { getArtificialAnalysisLeaderboardStats } from "../artificial-analysis/leaderboard";
import { fetchBenchmarkSourceRows } from "../benchmarks";
import { getModelsDevSourceStats } from "../models-dev/catalog";
import { benchmarkObservationSource } from "../observations/load";
import { selectModelsDevRowsForArtificialAnalysis } from "./policy";
import {
  buildSourceData,
  type ModelAtlasSourceData,
  type ModelAtlasSourceRows,
} from "./source-data";

/** Fetch and normalize shared benchmark and catalog sources; OpenRouter route requests wait for derived quality scores. */
export async function fetchSourceData(): Promise<ModelAtlasSourceData> {
  return buildSourceData(await fetchSourceRows());
}

/** Independent bulk feeds run in parallel because model filtering requires their combined evidence. */
async function fetchSourceRows(): Promise<ModelAtlasSourceRows> {
  const [
    artificialAnalysisStats,
    artificialAnalysisBenchmarkResourceStats,
    modelsDevStats,
    benchmarkRows,
    benchmarkObservationStats,
  ] = await Promise.all([
    getArtificialAnalysisLeaderboardStats(),
    getArtificialAnalysisBenchmarkResourceStats(),
    getModelsDevSourceStats(),
    fetchBenchmarkSourceRows(),
    Promise.all(
      BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => ({
        binding,
        payload: await benchmarkObservationSource(binding).fetchRows(),
      })),
    ),
  ]);
  const artificialAnalysisRows = artificialAnalysisStats.data;
  const artificialAnalysisBenchmarkResourceRows = artificialAnalysisBenchmarkResourceStats.data;
  type BenchmarkObservationRowsKey =
    (typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
  const benchmarkObservationRows = Object.fromEntries(
    benchmarkObservationStats.map(({ binding, payload }) => [binding.sourceRowsKey, payload.data]),
  ) as Pick<ModelAtlasSourceRows, BenchmarkObservationRowsKey>;
  const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
    modelsDevStats.payload,
    artificialAnalysisRows,
  );
  return {
    artificialAnalysisRows,
    artificialAnalysisBenchmarkResourceRows,
    modelsDevModels,
    ...benchmarkRows,
    ...benchmarkObservationRows,
  };
}
