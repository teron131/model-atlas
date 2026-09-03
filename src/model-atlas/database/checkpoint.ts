/** Derive checkpoint rows from cached source evidence and preserve benchmark, refresh, and model-change history. */

import { BENCHMARK_VERSION_BASELINE_DATE, STAGE_CONFIG } from "../config";
import { BENCHMARK_RAW_WRITERS } from "../ingest/benchmark-runtimes/registry";
import { buildDebugTraceRows, insertDebugTraceRows } from "../ingest/debug-trace";
import { SNAPSHOT_TABLES, type SnapshotTableName } from "../ingest/source-registry";
import { buildSourceHealth } from "../ingest/source-snapshots/policy";
import { cachedSourceDataFromSnapshots } from "../ingest/source-snapshots/source-data";
import type { DatabaseBuildResult, DebugTraceRow, SourceSnapshots } from "../ingest/types";
import {
  insertArtificialAnalysisBenchmarkResourceRawRows,
  insertArtificialAnalysisRawModels,
  insertBenchmarkVersionLog,
  insertModelBenchmarks,
  insertModels,
  insertModelScoreChanges,
  insertModelsDevRawModels,
  insertModelTaskMetrics,
  insertOpenRouterRawRows,
  insertRefreshRuns,
  insertSourceHealth,
  insertSourceQuarantines,
} from "../ingest/writers";
import type { DatabaseWriter } from "../ingest/writers/database";
import { deriveModelStats } from "../pipeline/derivation";
import { isPreviewModel, rankedModels } from "../pipeline/model-types";
import { taskMetricVersionValue } from "../pipeline/selection/candidate";
import { nowEpochSeconds } from "../runtime";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import {
  buildRefreshChanges,
  type ModelScoreChangeRow,
  type RefreshRunRow,
} from "../stats/payload/changes";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import { preserveHighSignalSnapshotModels } from "../stats/payload/snapshot-preservation";
import type { ModelAtlasModel, ModelAtlasPayload, ModelAtlasPublishedModel } from "../stats/types";

type BenchmarkVersionLogRow = {
  model_id: string;
  reasoning_effort: string;
  benchmark_key: string;
  metric_kind: "score" | "task";
  version_date: string;
  change_kind: "baseline" | "added" | "changed" | "removed";
  value_json: string | null;
};

type DatabaseSnapshotRows = {
  snapshots: SourceSnapshots;
  openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined;
  finalModelRows: readonly ModelAtlasPublishedModel[];
  debugTraceRows: readonly DebugTraceRow[];
  sourceHealth: DatabaseBuildResult["source_health"];
  benchmarkVersionLogRows: readonly BenchmarkVersionLogRow[];
  refreshRunRows: readonly RefreshRunRow[];
  modelScoreChangeRows: readonly ModelScoreChangeRow[];
};

type OpenRouterLoader = (modelIds: string[]) => Promise<{
  rawPayload: OpenRouterRawScrapedPayload | null;
  cacheStatus: DatabaseBuildResult["source_cache"]["openrouter"];
}>;

type DerivedDatabaseSnapshot = {
  rows: DatabaseSnapshotRows;
  sourceCache: DatabaseBuildResult["source_cache"];
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

const SNAPSHOT_APPEND_WRITERS = [
  {
    table: SNAPSHOT_TABLES.benchmark_version_log,
    write: (db, rows) => insertBenchmarkVersionLog(db, rows.benchmarkVersionLogRows),
  },
  {
    table: SNAPSHOT_TABLES.refresh_runs,
    write: (db, rows) => insertRefreshRuns(db, rows.refreshRunRows),
  },
  {
    table: SNAPSHOT_TABLES.model_score_changes,
    write: (db, rows) => insertModelScoreChanges(db, rows.modelScoreChangeRows),
  },
] satisfies readonly SnapshotWriter[];

type DatabaseSnapshotVersioning = {
  previousPayload?: ModelAtlasPayload | null;
  baselineDate?: string;
  replaceSourceRows?: boolean;
};

type BenchmarkObservation = Omit<BenchmarkVersionLogRow, "change_kind">;

function benchmarkIdentity(observation: BenchmarkObservation): string {
  return [
    observation.model_id,
    observation.reasoning_effort,
    observation.benchmark_key,
    observation.metric_kind,
  ].join("\u0000");
}

function collectBenchmarkObservations(
  models: readonly ModelAtlasModel[],
  fallbackDate: string,
): Map<string, BenchmarkObservation> {
  const observations = new Map<string, BenchmarkObservation>();
  const addObservation = (observation: BenchmarkObservation) => {
    observations.set(benchmarkIdentity(observation), observation);
  };
  for (const model of models) {
    if (model.id == null) {
      continue;
    }
    const reasoningEffort = model.reasoning_effort ?? "";
    for (const [benchmarkKey, value] of Object.entries(model.benchmarks ?? {})) {
      if (typeof value !== "number") {
        continue;
      }
      addObservation({
        model_id: model.id,
        reasoning_effort: reasoningEffort,
        benchmark_key: benchmarkKey,
        metric_kind: "score",
        version_date: model.benchmark_dates?.[benchmarkKey] ?? fallbackDate,
        value_json: JSON.stringify(value),
      });
    }
    for (const [benchmarkKey, metrics] of Object.entries(model.task_metrics ?? {})) {
      if (metrics == null) {
        continue;
      }
      addObservation({
        model_id: model.id,
        reasoning_effort: reasoningEffort,
        benchmark_key: benchmarkKey,
        metric_kind: "task",
        version_date: metrics.observed_at ?? fallbackDate,
        value_json: taskMetricVersionValue(metrics),
      });
    }
  }
  return observations;
}

/** Build idempotent baseline, changed, and removal records from adjacent public snapshots. */
export function buildBenchmarkVersionLogRows(
  previousModels: readonly ModelAtlasModel[],
  currentModels: readonly ModelAtlasModel[],
  baselineDate: string,
  observedDate: string,
): BenchmarkVersionLogRow[] {
  const revisions = new Map<string, BenchmarkVersionLogRow>();
  const addRevision = (revision: BenchmarkVersionLogRow) => {
    const key = [
      revision.model_id,
      revision.reasoning_effort,
      revision.benchmark_key,
      revision.metric_kind,
      revision.version_date,
    ].join("\u0000");
    revisions.set(key, revision);
  };
  const previousObservations = collectBenchmarkObservations(previousModels, baselineDate);
  const currentObservations = collectBenchmarkObservations(currentModels, observedDate);
  for (const observation of previousObservations.values()) {
    addRevision({
      ...observation,
      change_kind: "baseline",
    });
  }
  for (const [identity, observation] of currentObservations) {
    const previous = previousObservations.get(identity);
    if (previous == null) {
      addRevision({
        ...observation,
        change_kind: "added",
      });
    } else if (previous.value_json !== observation.value_json) {
      addRevision({
        ...observation,
        change_kind: "changed",
      });
    }
  }
  for (const [identity, observation] of previousObservations) {
    if (currentObservations.has(identity)) {
      continue;
    }
    addRevision({
      ...observation,
      version_date: observedDate,
      change_kind: "removed",
      value_json: null,
    });
  }
  return [...revisions.values()].sort(
    (left, right) =>
      left.model_id.localeCompare(right.model_id) ||
      left.reasoning_effort.localeCompare(right.reasoning_effort) ||
      left.benchmark_key.localeCompare(right.benchmark_key) ||
      left.metric_kind.localeCompare(right.metric_kind) ||
      left.version_date.localeCompare(right.version_date),
  );
}

/** Recompute the refresh audit after snapshot-preservation policy finalizes the published model rows. */
function rebuildDatabaseSnapshotChanges(
  rows: DatabaseSnapshotRows,
  refreshId: number,
  previousPayload: ModelAtlasPayload | null | undefined,
): void {
  const currentModels = rankedModels(rows.finalModelRows);
  const currentScoring = buildCurrentModelAtlasMetadata({
    models: currentModels,
    healthModels: currentModels,
  }).scoring;
  const changes = buildRefreshChanges(refreshId, previousPayload, currentModels, currentScoring);
  rows.finalModelRows = [...changes.models, ...rows.finalModelRows.filter(isPreviewModel)];
  rows.refreshRunRows = changes.refreshRunRows;
  rows.modelScoreChangeRows = changes.modelScoreChangeRows;
}

/** Derives model stages from normalized source snapshots while the caller owns storage-specific cache loading. */
export async function deriveDatabaseSnapshot(
  startedAtEpochSeconds: number,
  snapshots: SourceSnapshots,
  sourceCache: DatabaseBuildResult["source_cache"],
  loadOpenRouter: OpenRouterLoader,
  versioning: DatabaseSnapshotVersioning = {},
): Promise<DerivedDatabaseSnapshot> {
  const observedDate = new Date(startedAtEpochSeconds * 1000).toISOString().slice(0, 10);
  const baselineDate = versioning.baselineDate ?? BENCHMARK_VERSION_BASELINE_DATE;
  const previousModels = rankedModels(versioning.previousPayload?.models ?? []);
  const sourceData = cachedSourceDataFromSnapshots(snapshots);
  const {
    matchDiagnostics,
    models: derivedModels,
    openRouterLoad,
  } = await deriveModelStats(sourceData, {
    loadOpenRouter,
    benchmarkVersioning: {
      baselineDate,
      observedDate,
      previousModels,
    },
  });
  const finalModelRows = versioning.replaceSourceRows
    ? derivedModels
    : preserveHighSignalSnapshotModels(
        {
          fetched_at_epoch_seconds: startedAtEpochSeconds,
          models: derivedModels,
          metadata: buildCurrentModelAtlasMetadata({ models: rankedModels(derivedModels) }),
        },
        versioning.previousPayload ?? null,
        STAGE_CONFIG.snapshotPreservation,
        STAGE_CONFIG.scoring,
      ).models;
  const debugTraceRows = buildDebugTraceRows(
    snapshots,
    openRouterLoad.rawPayload,
    matchDiagnostics,
    STAGE_CONFIG.matcher,
  );
  const finalSourceCache = {
    ...sourceCache,
    openrouter: openRouterLoad.cacheStatus,
  };
  const rows: DatabaseSnapshotRows = {
    snapshots,
    openRouterRawPayload: openRouterLoad.rawPayload,
    finalModelRows,
    debugTraceRows,
    sourceHealth: buildSourceHealth({
      generatedAtEpochSeconds: startedAtEpochSeconds,
      sourceCache: finalSourceCache,
      sourceRowStates: snapshots.sourceRowStates,
    }),
    benchmarkVersionLogRows: buildBenchmarkVersionLogRows(
      previousModels,
      rankedModels(finalModelRows),
      baselineDate,
      observedDate,
    ),
    refreshRunRows: [],
    modelScoreChangeRows: [],
  };
  rebuildDatabaseSnapshotChanges(rows, startedAtEpochSeconds, versioning.previousPayload);
  return {
    rows,
    sourceCache: finalSourceCache,
  };
}

/** Replace current evidence and model rows, append audit history, and update freshness inside the caller's transaction. */
export function writeCheckpoint(db: DatabaseWriter, rows: DatabaseSnapshotRows): void {
  for (const { table } of SNAPSHOT_REPLACE_WRITERS) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM snapshot_metadata").run();
  for (const { write } of [...SNAPSHOT_REPLACE_WRITERS, ...SNAPSHOT_APPEND_WRITERS]) {
    write(db, rows);
  }
  db.prepare("INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)").run(
    nowEpochSeconds(),
  );
}
