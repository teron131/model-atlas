/** Blueprint-Bench 2 runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import { SNAPSHOT_TABLES } from "../../database/tables";
import type { DatabaseWriter } from "../../database/writers/database";
import { asFiniteNumber } from "../../runtime";
import { defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstEpochSecond, sourceCacheRows, stringValue } from "../cache/rows";
import { sourceKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import {
  type BlueprintBenchModelScoreRow,
  DEFAULT_LEADERBOARD_URL,
  getBlueprintBenchStats,
} from "./leaderboard";

type BlueprintBenchSnapshot = {
  blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
  sourceStatus: SourceSnapshotStatus;
};

export const blueprintBenchRuntime = defineBenchmarkRuntime({
  cacheKey: "blueprintBench",
  source: "blueprint_bench_2",
  table: SNAPSHOT_TABLES.blueprint_bench_2,
  readCache: readBlueprintBenchRawCache,
  snapshot: blueprintBenchSnapshot,
  write: insertBlueprintBenchRawRows,
  sourceRowsKey: "blueprintBenchRows",
  loadSourceRows: async () => (await getBlueprintBenchStats()).data,
  sourceRowsFromSnapshots: (snapshots) => snapshots.blueprintBenchModelScoreRows,
});

function readBlueprintBenchRawCache(cache: CacheRowSource): {
  rows: BlueprintBenchModelScoreRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM blueprint_bench_2_raw_rows ORDER BY row_index",
  );
  if (cacheRows.length === 0) {
    return null;
  }
  if (cacheRows.some((row) => stringValue(row.url) !== DEFAULT_LEADERBOARD_URL)) {
    return null;
  }
  const cachedRows = cacheRows.flatMap((row) => {
    const model = stringValue(row.model);
    const score = asFiniteNumber(row.score);
    return model != null && score != null
      ? [
          {
            model,
            score,
          },
        ]
      : [];
  });
  if (cachedRows.length === 0) {
    return null;
  }
  return {
    rows: cachedRows,
    fetchedAt: firstEpochSecond(cacheRows),
  };
}

/** Loads Blueprint-Bench 2 rows keyed by model name for cache and missing-row tracking. */
async function blueprintBenchSnapshot(
  cached: ReturnType<typeof readBlueprintBenchRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<BlueprintBenchSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: "blueprint_bench_2",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getBlueprintBenchStats,
    rowKey: (row) => sourceKey(row.model),
    rowLabel: (row) => row.model,
  });
  return {
    blueprintBenchModelScoreRows: snapshot.rows,
    sourceStatus: {
      source: "blueprint_bench_2",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "blueprintBench",
    },
  };
}

function insertBlueprintBenchRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO blueprint_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, score
		) VALUES (?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.blueprintBenchModelScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.blueprintBench,
      DEFAULT_LEADERBOARD_URL,
      row.model,
      row.score,
    );
  }
}
