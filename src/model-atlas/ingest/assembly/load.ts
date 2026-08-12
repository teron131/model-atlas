/** Source loading owns provider dispatch and produces the complete raw-row contract for stats assembly. */

import { fetchBenchmarkSourceRows } from "../../benchmarks/persistence/runtime";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../../benchmarks/registry";
import { getArtificialAnalysisBenchmarkResourceStats } from "../../benchmarks/scrapers/artificial-analysis/results";
import { benchmarkObservationSourceFetcher } from "../../benchmarks/scrapers/observation-source";
import { getArtificialAnalysisLeaderboardStats } from "../../scrapers/artificial-analysis/leaderboard";
import { getModelsDevSourceStats } from "../../scrapers/models-dev";
import { selectModelsDevRowsForArtificialAnalysis } from "./policy";
import {
  buildSourceData,
  type ModelAtlasSourceData,
  type ModelAtlasSourceRows,
} from "./source-data";

/** Fetch every external source into the raw-row contract consumed by stats assembly. */
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
        payload: await benchmarkObservationSourceFetcher(binding)(),
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

/** Fetch and normalize every configured stats source through the same assembly boundary. */
export async function fetchSourceData(): Promise<ModelAtlasSourceData> {
  return buildSourceData(await fetchSourceRows());
}
