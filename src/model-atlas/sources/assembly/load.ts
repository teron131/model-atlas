/** Produces `ModelAtlasSourceData` from one of two inputs: a live fetch of every bulk source that bypasses the SQLite cache, or the snapshots a checkpoint build already loaded (the cache-aware loading lives in `snapshots/load.ts`). */

import { getArtificialAnalysisBenchmarkResourceStats } from "../artificial-analysis/benchmark-resources";
import { getArtificialAnalysisLeaderboardStats } from "../artificial-analysis/leaderboard";
import { benchmarkSourceRowsFromSnapshots, fetchBenchmarkSourceRows } from "../benchmarks";
import { getModelsDevSourceStats } from "../models-dev/catalog";
import {
  benchmarkObservationRowsFromSnapshots,
  fetchBenchmarkObservationRows,
} from "../observations/load";
import type { SourceSnapshots } from "../types";
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

/** Adapt restored checkpoint rows into normalized source lookups without fetching external pages. */
export function sourceDataFromSnapshots(snapshots: SourceSnapshots): ModelAtlasSourceData {
  return buildSourceData({
    artificialAnalysisRows: snapshots.artificialAnalysisSelectedRows,
    artificialAnalysisBenchmarkResourceRows: snapshots.artificialAnalysisBenchmarkResourceRows,
    modelsDevModels: snapshots.modelsDevModels,
    ...benchmarkSourceRowsFromSnapshots(snapshots.benchmarks),
    ...benchmarkObservationRowsFromSnapshots(snapshots),
  });
}
