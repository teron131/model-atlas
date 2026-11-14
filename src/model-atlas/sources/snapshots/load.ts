/** Checkpoint-wide snapshot loading, shared by local builds and production refreshes: here a snapshot is every source's rows for one build, each source reusing its rows in the SQLite checkpoint when they are a cache hit and refetching otherwise, plus each source's updated cache status and row states. OpenRouter is not part of it; `openrouter/snapshot.ts` refreshes it per requested model. */

import type { DatabaseSync } from "node:sqlite";

import { BENCHMARK_OBSERVATION_BINDINGS } from "../../benchmarks/registry";
import {
  readArtificialAnalysisBenchmarkResourceRawCache,
  readArtificialAnalysisRawCache,
} from "../artificial-analysis/cache";
import {
  artificialAnalysisBenchmarkResourceSnapshot,
  artificialAnalysisSnapshot,
} from "../artificial-analysis/snapshot";
import { selectModelsDevRowsForArtificialAnalysis } from "../assembly/policy";
import {
  type BenchmarkSnapshotCaches,
  readBenchmarkSnapshotCaches,
  refreshBenchmarkSnapshots,
} from "../benchmarks";
import { readRawSourceCacheStatus } from "../cache/status";
import { readModelsDevRawCache } from "../models-dev/cache";
import { modelsDevSnapshot } from "../models-dev/snapshot";
import {
  benchmarkObservationSnapshots,
  readBenchmarkObservationRawCache,
} from "../observations/cache";
import { RAW_SOURCE_NAMES, type RawSourceName } from "../registry";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import { missingSinceBySource, persistedSourceRowStates } from "./health";

type LoadedSourceSnapshots = {
  snapshots: SourceSnapshots;
  sourceCacheStatuses: Record<RawSourceName, RawSourceCacheStatus>;
};

type SourceSnapshotCaches = {
  benchmarks: BenchmarkSnapshotCaches;
  artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
  artificialAnalysisBenchmarkResources: ReturnType<
    typeof readArtificialAnalysisBenchmarkResourceRawCache
  >;
  modelsDev: ReturnType<typeof readModelsDevRawCache>;
  benchmarkObservations: Readonly<
    Record<string, ReturnType<typeof readBenchmarkObservationRawCache> | undefined>
  >;
};

export async function loadSourceSnapshots(
  db: DatabaseSync,
  nowEpochSeconds: number,
  options: SourceRefreshOptions = {},
): Promise<LoadedSourceSnapshots> {
  const caches = readSqliteSourceCaches(db);
  const sourceCacheStatuses = readSourceCacheStatuses(db, nowEpochSeconds);
  const previousMissingSince = missingSinceBySource(persistedSourceRowStates(db));
  const [
    artificialAnalysis,
    artificialAnalysisBenchmarkResources,
    modelsDev,
    benchmarks,
    benchmarkObservations,
  ] = await Promise.all([
    artificialAnalysisSnapshot(
      caches.artificialAnalysis,
      sourceCacheStatuses.artificial_analysis,
      options,
      previousMissingSince.artificial_analysis,
      nowEpochSeconds,
    ),
    artificialAnalysisBenchmarkResourceSnapshot(
      caches.artificialAnalysisBenchmarkResources,
      sourceCacheStatuses.artificial_analysis_benchmark_resources,
      options,
      previousMissingSince.artificial_analysis_benchmark_resources,
      nowEpochSeconds,
    ),
    modelsDevSnapshot(
      caches.modelsDev,
      sourceCacheStatuses.models_dev,
      options,
      previousMissingSince.models_dev,
      nowEpochSeconds,
    ),
    refreshBenchmarkSnapshots(
      caches.benchmarks,
      sourceCacheStatuses,
      options,
      previousMissingSince,
      nowEpochSeconds,
    ),
    benchmarkObservationSnapshots(
      caches.benchmarkObservations,
      sourceCacheStatuses,
      options,
      previousMissingSince,
      nowEpochSeconds,
    ),
  ]);
  const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
    modelsDev.modelsDevPayload,
    artificialAnalysis.artificialAnalysisSelectedRows,
  );
  const sourceStatuses: SourceSnapshotStatus[] = [
    artificialAnalysis.sourceStatus,
    artificialAnalysisBenchmarkResources.sourceStatus,
    modelsDev.sourceStatus,
    ...Object.values(benchmarks).map((snapshot) => snapshot.sourceStatus),
    ...benchmarkObservations.sourceStatuses,
  ];
  updateSourceCacheStatuses(sourceCacheStatuses, sourceStatuses);
  const snapshots = {
    artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
    artificialAnalysisSelectedRows: artificialAnalysis.artificialAnalysisSelectedRows,
    artificialAnalysisBenchmarkResourceRows:
      artificialAnalysisBenchmarkResources.artificialAnalysisBenchmarkResourceRows,
    modelsDevPayload: modelsDev.modelsDevPayload,
    modelsDevModels,
    modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
    modelsDevStatusCode: modelsDev.modelsDevStatusCode,
    benchmarks,
    ...benchmarkObservations.rows,
    sourceRowStates: sourceStatuses.flatMap((sourceStatus) => sourceStatus.sourceRowStates),
    fetchedAt: fetchedAtFromStatuses(sourceStatuses),
  } satisfies SourceSnapshots;
  return {
    snapshots,
    sourceCacheStatuses,
  };
}

function readSqliteSourceCaches(db: DatabaseSync): SourceSnapshotCaches {
  const benchmarkObservations = Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
      binding.sourceDataKey,
      readBenchmarkObservationRawCache(db, binding),
    ]),
  );
  return {
    benchmarks: readBenchmarkSnapshotCaches(db),
    artificialAnalysis: readArtificialAnalysisRawCache(db),
    artificialAnalysisBenchmarkResources: readArtificialAnalysisBenchmarkResourceRawCache(db),
    modelsDev: readModelsDevRawCache(db),
    benchmarkObservations,
  };
}

function readSourceCacheStatuses(
  db: DatabaseSync,
  nowEpochSeconds: number,
): Record<RawSourceName, RawSourceCacheStatus> {
  return Object.fromEntries(
    RAW_SOURCE_NAMES.map((source) => [
      source,
      readRawSourceCacheStatus(db, source, nowEpochSeconds),
    ]),
  ) as Record<RawSourceName, RawSourceCacheStatus>;
}

function updateSourceCacheStatuses(
  sourceCacheStatuses: Record<RawSourceName, RawSourceCacheStatus>,
  sourceStatuses: SourceSnapshotStatus[],
): void {
  for (const sourceStatus of sourceStatuses) {
    sourceCacheStatuses[sourceStatus.source] = updatedSourceCacheStatus(
      sourceCacheStatuses[sourceStatus.source],
      sourceStatus.fetchedAt,
      sourceStatus.sourceInputCount,
    );
  }
}

function updatedSourceCacheStatus(
  status: RawSourceCacheStatus,
  lastFetchEpochSeconds: number | null,
  sourceInputCount: number,
): RawSourceCacheStatus {
  return {
    ...status,
    refreshed: !status.cache_hit && lastFetchEpochSeconds !== status.last_fetch_epoch_seconds,
    last_fetch_epoch_seconds: lastFetchEpochSeconds,
    source_input_count: sourceInputCount,
  };
}

function fetchedAtFromStatuses(
  sourceStatuses: SourceSnapshotStatus[],
): SourceSnapshots["fetchedAt"] {
  return Object.fromEntries(
    sourceStatuses.flatMap((sourceStatus) =>
      sourceStatus.fetchedAtKey == null
        ? []
        : [[sourceStatus.fetchedAtKey, sourceStatus.fetchedAt]],
    ),
  ) as SourceSnapshots["fetchedAt"];
}
