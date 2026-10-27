/** Vals Index runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import { parseBenchmarkObservationMetadata } from "../../benchmarks/observation";
import { SNAPSHOT_TABLES } from "../../database/tables";
import type { DatabaseWriter } from "../../database/writers/database";
import { asFiniteNumber, asNonEmptyString, stableJson } from "../../runtime";
import { defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import {
  snapshotRows,
  snapshotRowsWithStates,
  sourceRowKey,
  withoutSupersededEditions,
} from "../snapshots/policy";
import { shouldUseFetchedRows, snapshotFetchedAt } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import {
  getValsIndexStats,
  VALS_INDEX_LEADERBOARD_URL,
  valsIndexCacheMatches,
  type ValsIndexModelScoreRow,
  type ValsIndexTaskScoreRow,
} from "./index-benchmark";

type ValsIndexSnapshot = {
  valsIndexTaskScoreRows: ValsIndexTaskScoreRow[];
  valsIndexModelScoreRows: ValsIndexModelScoreRow[];
  sourceStatus: SourceSnapshotStatus;
};

export const valsIndexRuntime = defineBenchmarkRuntime({
  cacheKey: "valsIndex",
  source: "vals_index",
  table: SNAPSHOT_TABLES.vals_index,
  readCache: readValsIndexRawCache,
  snapshot: valsIndexSnapshot,
  write: insertValsIndexRawRows,
  sourceRowsKey: "valsIndexTaskScoreRows",
  fetchSourceRows: async () => (await getValsIndexStats()).model_scores,
  sourceRowsFromSnapshots: (snapshots) => snapshots.valsIndexModelScoreRows,
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
    return [
      {
        task,
        task_label: taskLabel,
        model_id: modelId,
        model,
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
      ? withoutSupersededEditions(cached.rows, fetchedRows, {
          editionOf: (row) => row.metadata.benchmark_version,
        })
      : cached?.rows;
  const rows = snapshotRows(
    cachedRows,
    fetchedRows,
    fetched?.fetched_at_epoch_seconds ?? null,
    options,
    (row) => sourceRowKey(row.task, row.model_id),
    // Vals revises published index scores under the same model identity.
    (_cached, fetchedRow) => fetchedRow,
  );
  const modelScores = rows.filter(isModelScore);
  const states = snapshotRowsWithStates({
    source: "vals_index",
    cachedRows: cachedRows?.filter(isModelScore),
    fetchedRows: fetched?.model_scores ?? [],
    fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
    options,
    rowKey: (row) => sourceRowKey(row.model_id),
    rowLabel: (row) => row.model,
    previousMissingSince,
    nowEpochSeconds,
  }).states;
  const fetchedAt = snapshotFetchedAt(
    hasUsableFetchedRows,
    cached?.fetchedAt,
    fetched?.fetched_at_epoch_seconds ?? null,
  );
  return {
    valsIndexTaskScoreRows: rows,
    valsIndexModelScoreRows: modelScores,
    sourceStatus: {
      source: "vals_index",
      fetchedAt,
      sourceInputCount: modelScores.length,
      sourceRowStates: states,
      fetchedAtKey: "valsIndex",
    },
  };
}

function insertValsIndexRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO vals_index_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, model_id, model, provider, score, observed_at, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.valsIndexTaskScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.valsIndex,
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
