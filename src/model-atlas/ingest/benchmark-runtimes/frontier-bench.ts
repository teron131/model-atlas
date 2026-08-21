/** Frontier-Bench runtime owns raw model-agent rows, cache reconstruction, and refresh state. */

import { asFiniteNumber } from "../../runtime";
import {
  FRONTIER_BENCH_SOURCE_REVISION,
  type FrontierBenchModelAgentRow,
  getFrontierBenchStats,
} from "../../scrapers/benchmarks/frontier-bench";
import { type CacheRowSource, firstEpochSecond, sourceCacheRows, stringValue } from "../cache/rows";
import { SNAPSHOT_TABLES, SOURCE_URLS } from "../source-registry";
import { sourceKey } from "../source-snapshots/policy";
import { snapshotSourceRows } from "../source-snapshots/row-snapshot";
import type {
  DatabaseBuildOptions,
  RawSourceCacheStatus,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import type { DatabaseWriter } from "../writers/database";

/** Reconstruct the cache only when every persisted row matches the current source revision. */
export function readFrontierBenchRawCache(cache: CacheRowSource): {
  rows: FrontierBenchModelAgentRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM frontier_bench_raw_rows ORDER BY row_index",
  );
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) =>
        stringValue(row.url) !== SOURCE_URLS.frontier_bench ||
        stringValue(row.revision) !== FRONTIER_BENCH_SOURCE_REVISION,
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap<FrontierBenchModelAgentRow>((row) => {
    const model = stringValue(row.model);
    const baseModel = stringValue(row.base_model);
    const harness = stringValue(row.harness);
    const score = asFiniteNumber(row.score);
    const scoreStandardError = asFiniteNumber(row.score_standard_error);
    if (
      model == null ||
      baseModel == null ||
      harness == null ||
      score == null ||
      scoreStandardError == null
    ) {
      return [];
    }
    return [
      {
        revision: FRONTIER_BENCH_SOURCE_REVISION,
        model,
        base_model: baseModel,
        reasoning_effort: stringValue(row.reasoning_effort),
        harness,
        score,
        score_standard_error: scoreStandardError,
      },
    ];
  });
  return rows.length === cacheRows.length ? { rows, fetchedAt: firstEpochSecond(cacheRows) } : null;
}

type FrontierBenchSnapshot = {
  frontierBenchRows: FrontierBenchModelAgentRow[];
  sourceStatus: SourceSnapshotStatus;
};

/** Refresh every model-agent observation while keeping effort and harness in row identity. */
async function frontierBenchSnapshot(
  cached: ReturnType<typeof readFrontierBenchRawCache>,
  status: RawSourceCacheStatus,
  options: DatabaseBuildOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<FrontierBenchSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: "frontier_bench",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getFrontierBenchStats,
    rowKey: (row) => sourceKey(row.base_model, row.reasoning_effort, row.harness),
    rowLabel: (row) => `${row.model}: ${row.harness}`,
  });
  return {
    frontierBenchRows: snapshot.rows,
    sourceStatus: {
      source: "frontier_bench",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "frontierBench",
    },
  };
}

function insertFrontierBenchRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO frontier_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			reasoning_effort, harness, score, score_standard_error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.frontierBenchRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.frontierBench,
      SOURCE_URLS.frontier_bench,
      row.revision,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.harness,
      row.score,
      row.score_standard_error,
    );
  }
}

export const frontierBenchRuntime = {
  cacheKey: "frontierBench",
  source: "frontier_bench",
  table: SNAPSHOT_TABLES.frontier_bench,
  readCache: readFrontierBenchRawCache,
  snapshot: frontierBenchSnapshot,
  write: insertFrontierBenchRawRows,
} as const;
