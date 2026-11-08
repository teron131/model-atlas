/** Vals Index runtime owns raw-cache reconstruction, snapshot refresh, raw-row serialization, and its source-data lookup. */

import { parseBenchmarkObservationMetadata } from "../../benchmarks/observation";
import type { DatabaseWriter } from "../../database/writers/database";
import { asFiniteNumber, asNonEmptyString, asRecord, stableJson } from "../../runtime";
import { type BenchmarkSnapshotContext, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import {
  snapshotRows,
  snapshotRowsWithStates,
  sourceRowKey,
  withoutSupersededVersions,
} from "../snapshots/policy";
import { shouldUseFetchedRows, snapshotFetchedAt } from "../snapshots/row-snapshot";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshotStatus } from "../types";
import {
  buildValsIndexMap,
  getValsIndexStats,
  VALS_INDEX_LEADERBOARD_URL,
  valsIndexCacheMatches,
  type ValsIndexModelScoreRow,
  type ValsIndexTaskScoreRow,
} from "./index-benchmark";
import { valsReasoningEffort } from "./results";

type ValsIndexSnapshot = {
  rows: ValsIndexModelScoreRow[];
  taskRows: ValsIndexTaskScoreRow[];
  sourceStatus: SourceSnapshotStatus;
};

export const valsIndexRuntime = defineBenchmarkRuntime({
  source: "vals_index",
  key: "valsIndex",
  fetchRows: async () => (await getValsIndexStats()).model_scores,
  readCache: readValsIndexRawCache,
  snapshot: valsIndexSnapshot,
  write: insertValsIndexRawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildValsIndexMap(rows) }),
});

function readValsIndexRawCache(cache: CacheRowSource): {
  rows: ValsIndexTaskScoreRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM vals_index_raw_rows ORDER BY row_index");
  if (cacheRows.length === 0) {
    return null;
  }
  if (cacheRows.some((row) => asNonEmptyString(row.url) !== VALS_INDEX_LEADERBOARD_URL)) {
    return null;
  }
  const cachedRows = cacheRows.flatMap((row) => {
    const task = asNonEmptyString(row.task);
    const taskLabel = asNonEmptyString(row.task_label);
    const modelId = asNonEmptyString(row.model_id);
    const model = asNonEmptyString(row.model);
    const score = asFiniteNumber(row.score);
    const metadata = parseBenchmarkObservationMetadata(row.metadata_json);
    if (
      task == null ||
      taskLabel == null ||
      modelId == null ||
      model == null ||
      score == null ||
      metadata == null
    ) {
      return [];
    }
    // The cache keeps Vals' raw result, which carries the run's effort.
    const sourceResult = metadata.source_result_json;
    const result = typeof sourceResult === "string" ? asRecord(JSON.parse(sourceResult)) : {};
    return [
      {
        task,
        task_label: taskLabel,
        model_id: modelId,
        model,
        base_model: model,
        reasoning_effort: valsReasoningEffort(modelId, result),
        provider: asNonEmptyString(row.provider),
        score,
        observed_at: asNonEmptyString(row.observed_at),
        metadata,
      },
    ];
  });
  if (cachedRows.length !== cacheRows.length || !valsIndexCacheMatches(cachedRows)) {
    return null;
  }
  return {
    rows: cachedRows,
    fetchedAt: firstFetchedAt(cacheRows),
  };
}

/** Loads Vals Index task rows while using only overall rows for scoring health. */
async function valsIndexSnapshot(
  cached: ReturnType<typeof readValsIndexRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
  context: BenchmarkSnapshotContext,
): Promise<ValsIndexSnapshot> {
  const fetched =
    status.cache_hit && cached != null && options.replaceSourceRows !== true
      ? null
      : await getValsIndexStats();
  const fetchedRows = fetched?.task_rows ?? [];
  const hasUsableFetchedRows = shouldUseFetchedRows(
    fetched?.fetched_at_epoch_seconds ?? null,
    fetchedRows.length,
  );
  const cachedRows =
    hasUsableFetchedRows && cached != null
      ? withoutSupersededVersions(cached.rows, fetchedRows, {
          versionOf: (row) => row.metadata.benchmark_version,
        })
      : cached?.rows;
  const cachedModelScores = cachedRows?.filter(isModelScore) ?? [];
  const modelSnapshot = snapshotRowsWithStates({
    source: context.source,
    cachedRows: cachedModelScores,
    fetchedRows: fetched?.model_scores ?? [],
    fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
    options,
    rowKey: (row) => sourceRowKey(row.model_id),
    rowLabel: (row) => row.model,
    previousMissingSince,
    nowEpochSeconds,
  });
  // A model Vals has withdrawn takes its task rows with it.
  const retainedModelIds = new Set(modelSnapshot.rows.map((row) => row.model_id));
  const withdrawnModelIds = new Set(
    cachedModelScores.map((row) => row.model_id).filter((id) => !retainedModelIds.has(id)),
  );
  const taskRows = snapshotRows(
    cachedRows,
    fetchedRows,
    fetched?.fetched_at_epoch_seconds ?? null,
    options,
    (row) => sourceRowKey(row.task, row.model_id),
  ).filter((row) => !withdrawnModelIds.has(row.model_id));
  const modelScores = taskRows.filter(isModelScore);
  const fetchedAt = snapshotFetchedAt(
    hasUsableFetchedRows,
    cached?.fetchedAt,
    fetched?.fetched_at_epoch_seconds ?? null,
  );
  return {
    rows: modelScores,
    taskRows,
    sourceStatus: context.sourceStatus({
      rows: modelScores,
      fetchedAt,
      sourceRowStates: modelSnapshot.states,
    }),
  };
}

function insertValsIndexRawRows(db: DatabaseWriter, snapshot: ValsIndexSnapshot): void {
  const statement = db.prepare(`
		INSERT INTO vals_index_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, model_id, model, provider, score, observed_at, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.taskRows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      VALS_INDEX_LEADERBOARD_URL,
      row.task,
      row.task_label,
      row.task === "overall" ? "overall" : "component",
      row.model_id,
      row.model,
      row.provider,
      row.score,
      row.observed_at,
      stableJson(row.metadata),
    );
  }
}

function isModelScore(row: ValsIndexTaskScoreRow): row is ValsIndexModelScoreRow {
  return row.task === "overall";
}
