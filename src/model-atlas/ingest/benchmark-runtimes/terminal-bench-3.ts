/** Terminal-Bench 3.0 runtime owns raw model-agent rows, cache reconstruction, and refresh state. */

import { asFiniteNumber } from "../../runtime";
import {
  getTerminalBench3Stats,
  TERMINAL_BENCH_3_SOURCE_REVISION,
  type TerminalBench3ModelAgentRow,
} from "../../scrapers/benchmarks/terminal-bench-3";
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
export function readTerminalBench3RawCache(cache: CacheRowSource): {
  rows: TerminalBench3ModelAgentRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM terminal_bench_3_raw_rows ORDER BY row_index",
  );
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) =>
        stringValue(row.url) !== SOURCE_URLS.terminal_bench_3 ||
        stringValue(row.revision) !== TERMINAL_BENCH_3_SOURCE_REVISION,
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap<TerminalBench3ModelAgentRow>((row) => {
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
        revision: TERMINAL_BENCH_3_SOURCE_REVISION,
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

type TerminalBench3Snapshot = {
  terminalBench3Rows: TerminalBench3ModelAgentRow[];
  sourceStatus: SourceSnapshotStatus;
};

/** Refresh every model-agent observation while keeping effort and harness in row identity. */
async function terminalBench3Snapshot(
  cached: ReturnType<typeof readTerminalBench3RawCache>,
  status: RawSourceCacheStatus,
  options: DatabaseBuildOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<TerminalBench3Snapshot> {
  const snapshot = await snapshotSourceRows({
    source: "terminal_bench_3",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getTerminalBench3Stats,
    rowKey: (row) => sourceKey(row.base_model, row.reasoning_effort, row.harness),
    rowLabel: (row) => `${row.model}: ${row.harness}`,
  });
  return {
    terminalBench3Rows: snapshot.rows,
    sourceStatus: {
      source: "terminal_bench_3",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "terminalBench3",
    },
  };
}

function insertTerminalBench3RawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO terminal_bench_3_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			reasoning_effort, harness, score, score_standard_error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.terminalBench3Rows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.terminalBench3,
      SOURCE_URLS.terminal_bench_3,
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

export const terminalBench3Runtime = {
  cacheKey: "terminalBench3",
  source: "terminal_bench_3",
  table: SNAPSHOT_TABLES.terminal_bench_3,
  readCache: readTerminalBench3RawCache,
  snapshot: terminalBench3Snapshot,
  write: insertTerminalBench3RawRows,
} as const;
