/** Bulk source loading acquires shared catalog and benchmark inputs before derivation scores models and schedules per-model enrichment. */

import { getArtificialAnalysisBenchmarkResourceStats } from "../artificial-analysis/benchmark-resources";
import { getArtificialAnalysisLeaderboardStats } from "../artificial-analysis/leaderboard";
import { fetchBenchmarkSourceRows } from "../benchmarks";
import { getModelsDevSourceStats } from "../models-dev/catalog";
import { fetchBenchmarkObservationRows } from "../observations/load";
import { selectModelsDevRowsForArtificialAnalysis } from "./policy";
import { buildSourceData, type ModelAtlasSourceData } from "./source-data";

/** Fetch and normalize shared benchmark and catalog sources; OpenRouter route requests wait for derived quality scores. */
export async function fetchSourceData(): Promise<ModelAtlasSourceData> {
  // Independent bulk feeds run in parallel because model filtering requires their combined evidence.
  const [
    artificialAnalysisStats,
    artificialAnalysisBenchmarkResourceStats,
    modelsDevStats,
    benchmarkRows,
    benchmarkObservationRows,
  ] = await Promise.all([
    getArtificialAnalysisLeaderboardStats(),
    getArtificialAnalysisBenchmarkResourceStats(),
    getModelsDevSourceStats(),
    fetchBenchmarkSourceRows(),
    fetchBenchmarkObservationRows(),
  ]);
  const artificialAnalysisRows = artificialAnalysisStats.data;
  const artificialAnalysisBenchmarkResourceRows = artificialAnalysisBenchmarkResourceStats.data;
  const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
    modelsDevStats.payload,
    artificialAnalysisRows,
  );
  return buildSourceData({
    artificialAnalysisRows,
    artificialAnalysisBenchmarkResourceRows,
    modelsDevModels,
    ...benchmarkRows,
    ...benchmarkObservationRows,
  });
}
