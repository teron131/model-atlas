/** Derive checkpoint rows from cached source evidence, replacing current state and appending to the windowed change log. */

import type { DatabaseSync } from "node:sqlite";

import { BENCHMARK_VERSION_BASELINE_DATE, STAGE_CONFIG } from "../config";
import { deriveModelStats } from "../pipeline/derivation";
import { asNonEmptyString, nowEpochSeconds } from "../runtime";
import {
  insertArtificialAnalysisBenchmarkResourceRawRows,
  insertArtificialAnalysisRawModels,
} from "../sources/artificial-analysis/write";
import { sourceDataFromSnapshots } from "../sources/assembly";
import { BENCHMARK_RAW_WRITERS } from "../sources/benchmarks";
import { insertModelsDevRawModels } from "../sources/models-dev/write";
import type { OpenRouterSourcePayload } from "../sources/openrouter";
import { insertOpenRouterRawRows } from "../sources/openrouter/write";
import type { RawSourceName } from "../sources/registry";
import {
  buildSourceHealth,
  insertSourceHealth,
  insertSourceQuarantines,
} from "../sources/snapshots/health";
import type {
  ModelAtlasSourceHealth,
  RawSourceCacheStatus,
  SourceSnapshots,
} from "../sources/types";
import type { DatabaseWriter } from "../sqlite-utils";
import {
  buildRefreshChanges,
  type ModelChangeDetailRow,
  type ModelScoreChangeRow,
  type RefreshRunRow,
  scoringMethodologyJson,
} from "../stats/payload/changes";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import {
  preserveHighSignalSnapshotModels,
  SNAPSHOT_PRESERVATION_VERSION,
} from "../stats/payload/snapshot-preservation";
import type { ModelAtlasMetadata, ModelAtlasModel, ModelAtlasPayload } from "../stats/types";
import type { CapabilityState } from "../timeline/capability";
import {
  insertModelChangeDetails,
  insertModelScoreChanges,
  insertRefreshRuns,
  pruneChangeLog,
} from "./change-log";
import { buildDebugTraceRows, type DebugTraceRow, insertDebugTraceRows } from "./debug-trace";
import { insertModelBenchmarks, insertModels, insertModelTaskMetrics } from "./model-rows";
import { SNAPSHOT_TABLES, type SnapshotTableName } from "./tables";

type DatabaseSnapshotRows = {
  capabilityState?: CapabilityState;
  snapshots: SourceSnapshots;
  openRouterRawPayload: OpenRouterSourcePayload | null | undefined;
  finalModelRows: readonly ModelAtlasModel[];
  debugTraceRows: readonly DebugTraceRow[];
  sourceHealth: ModelAtlasSourceHealth;
  benchmarkUpdateHealth: ModelAtlasMetadata["benchmark_update_health"];
  benchmarkVersions: ModelAtlasMetadata["benchmark_versions"];
  scoringMethodology: string;
  refreshRunRows: readonly RefreshRunRow[];
  modelScoreChangeRows: readonly ModelScoreChangeRow[];
  modelChangeDetailRows: readonly ModelChangeDetailRow[];
};

type OpenRouterLoader = (modelIds: string[]) => Promise<{
  rawPayload: OpenRouterSourcePayload | null;
  cacheStatus: RawSourceCacheStatus;
}>;

type DerivedDatabaseSnapshot = {
  rows: DatabaseSnapshotRows;
  sourceCacheStatuses: Record<RawSourceName, RawSourceCacheStatus>;
};

type SnapshotWriter = {
  table: SnapshotTableName;
  write: (db: DatabaseWriter, rows: DatabaseSnapshotRows) => void;
};

const SNAPSHOT_REPLACE_WRITERS = [
  {
    table: SNAPSHOT_TABLES.artificial_analysis,
    write: (db, rows) => insertArtificialAnalysisRawModels(db, rows.snapshots),
  },
  {
    table: SNAPSHOT_TABLES.artificial_analysis_benchmark_resources,
    write: (db, rows) => insertArtificialAnalysisBenchmarkResourceRawRows(db, rows.snapshots),
  },
  {
    table: SNAPSHOT_TABLES.models_dev,
    write: (db, rows) => insertModelsDevRawModels(db, rows.snapshots),
  },
  {
    table: SNAPSHOT_TABLES.openrouter,
    write: (db, rows) => insertOpenRouterRawRows(db, rows.openRouterRawPayload),
  },
  ...BENCHMARK_RAW_WRITERS.map(({ table, write }) => ({
    table,
    write: (db: DatabaseWriter, rows: DatabaseSnapshotRows) => write(db, rows.snapshots),
  })),
  {
    table: SNAPSHOT_TABLES.source_quarantines,
    write: (db, rows) => insertSourceQuarantines(db, rows.snapshots),
  },
  {
    table: SNAPSHOT_TABLES.source_health,
    write: (db, rows) => insertSourceHealth(db, rows.sourceHealth),
  },
  {
    table: SNAPSHOT_TABLES.models,
    write: (db, rows) => insertModels(db, rows.finalModelRows),
  },
  {
    table: SNAPSHOT_TABLES.model_benchmarks,
    write: (db, rows) => insertModelBenchmarks(db, rows.finalModelRows),
  },
  {
    table: SNAPSHOT_TABLES.model_task_metrics,
    write: (db, rows) => insertModelTaskMetrics(db, rows.finalModelRows),
  },
  {
    table: SNAPSHOT_TABLES.model_match_debug,
    write: (db, rows) => insertDebugTraceRows(db, rows.debugTraceRows),
  },
] satisfies readonly SnapshotWriter[];

const CHANGE_LOG_WRITERS = [
  {
    table: SNAPSHOT_TABLES.refresh_runs,
    write: (db, rows) => insertRefreshRuns(db, rows.refreshRunRows),
  },
  {
    table: SNAPSHOT_TABLES.model_score_changes,
    write: (db, rows) => insertModelScoreChanges(db, rows.modelScoreChangeRows),
  },
  {
    table: SNAPSHOT_TABLES.model_change_details,
    write: (db, rows) => insertModelChangeDetails(db, rows.modelChangeDetailRows),
  },
] satisfies readonly SnapshotWriter[];

type DatabaseSnapshotVersioning = {
  capabilityState?: CapabilityState;
  previousPayload?: ModelAtlasPayload | null;
  previousScoringMethodology: string | null;
  previousRefreshId: number | null;
  replaceSourceRows?: boolean;
};

/** Derives model stages from normalized source snapshots while the caller owns storage-specific cache loading. */
export async function deriveDatabaseSnapshot(
  startedAtEpochSeconds: number,
  snapshots: SourceSnapshots,
  sourceCacheStatuses: Record<RawSourceName, RawSourceCacheStatus>,
  loadOpenRouter: OpenRouterLoader,
  versioning: DatabaseSnapshotVersioning,
): Promise<DerivedDatabaseSnapshot> {
  const observedDate = new Date(startedAtEpochSeconds * 1000).toISOString().slice(0, 10);
  const previousModels = versioning.previousPayload?.models ?? [];
  const sourceData = sourceDataFromSnapshots(snapshots);
  const {
    capabilityState,
    matchDiagnostics,
    models: derivedModels,
    benchmarkRows,
    openRouterLoad,
  } = await deriveModelStats(sourceData, {
    capabilityState: versioning.capabilityState,
    loadOpenRouter,
    observationUpdates: {
      baselineDate: BENCHMARK_VERSION_BASELINE_DATE,
      observedDate,
      observedAt: new Date(startedAtEpochSeconds * 1000).toISOString(),
      previousModels,
    },
  });
  const preservedModels = versioning.replaceSourceRows
    ? derivedModels
    : preserveHighSignalSnapshotModels(
        derivedModels,
        versioning.previousPayload ?? null,
        STAGE_CONFIG.snapshotPreservation,
        STAGE_CONFIG.scoring,
      );
  const debugTraceRows = buildDebugTraceRows(
    snapshots,
    openRouterLoad.rawPayload,
    matchDiagnostics,
    STAGE_CONFIG.matcher,
  );
  const finalSourceCacheStatuses = {
    ...sourceCacheStatuses,
    openrouter: openRouterLoad.cacheStatus,
  };
  const sourceHealth = buildSourceHealth({
    generatedAtEpochSeconds: startedAtEpochSeconds,
    sourceCacheStatuses: finalSourceCacheStatuses,
    sourceRowStates: snapshots.sourceRowStates,
  });
  // The refresh audit and benchmark health describe the published rows, so both follow snapshot preservation.
  const metadata = buildCurrentModelAtlasMetadata({
    models: preservedModels,
    sourceRowsByKey: benchmarkRows,
    healthRefresh: {
      atEpochSeconds: startedAtEpochSeconds,
      previous: versioning.previousPayload?.metadata?.benchmark_update_health,
      sourceHealth,
    },
  });
  const changes = buildRefreshChanges(
    startedAtEpochSeconds,
    versioning.previousRefreshId,
    versioning.previousPayload,
    versioning.previousScoringMethodology,
    preservedModels,
    metadata.scoring,
  );
  const rows: DatabaseSnapshotRows = {
    capabilityState,
    snapshots,
    openRouterRawPayload: openRouterLoad.rawPayload,
    finalModelRows: changes.models,
    debugTraceRows,
    sourceHealth,
    benchmarkUpdateHealth: metadata.benchmark_update_health,
    benchmarkVersions: metadata.benchmark_versions,
    scoringMethodology: scoringMethodologyJson(metadata.scoring),
    refreshRunRows: changes.refreshRunRows,
    modelScoreChangeRows: changes.modelScoreChangeRows,
    modelChangeDetailRows: changes.modelChangeDetailRows,
  };
  return {
    rows,
    sourceCacheStatuses: finalSourceCacheStatuses,
  };
}

/** Replace current evidence and model rows, append this refresh to the windowed change log, and update freshness inside the caller's transaction. */
export function writeCheckpoint(db: DatabaseWriter, rows: DatabaseSnapshotRows): void {
  for (const { table } of SNAPSHOT_REPLACE_WRITERS) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM snapshot_metadata").run();
  for (const { write } of [...SNAPSHOT_REPLACE_WRITERS, ...CHANGE_LOG_WRITERS]) {
    write(db, rows);
  }
  pruneChangeLog(db);
  db.prepare(
    "INSERT INTO snapshot_metadata (updated_at_epoch_seconds, snapshot_preservation_version, benchmark_update_health_json, benchmark_versions_json, scoring_methodology_json) VALUES (?, ?, ?, ?, ?)",
  ).run(
    nowEpochSeconds(),
    SNAPSHOT_PRESERVATION_VERSION,
    rows.benchmarkUpdateHealth == null ? null : JSON.stringify(rows.benchmarkUpdateHealth),
    rows.benchmarkVersions == null ? null : JSON.stringify(rows.benchmarkVersions),
    rows.scoringMethodology,
  );
}

/** The scoring fingerprint the last refresh wrote; null for a new checkpoint or one written before the fingerprint was stored. */
export function readScoringMethodology(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT scoring_methodology_json FROM snapshot_metadata LIMIT 1").get();
  return asNonEmptyString(row?.scoring_methodology_json);
}
