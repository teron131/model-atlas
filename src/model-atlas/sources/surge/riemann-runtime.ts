/** Riemann-bench runtime owns raw-cache reconstruction, snapshot refresh, raw-row serialization, and its source-data lookup. */

import type { DatabaseWriter } from "../../database/writers/database";
import { parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { type BenchmarkSnapshotContext, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { sourceRowKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshotStatus } from "../types";
import {
  buildRiemannBenchMap,
  getRiemannBenchStats,
  type RiemannBenchModelScoreRow,
} from "./riemann-bench";

type RiemannBenchSnapshot = {
  rows: RiemannBenchModelScoreRow[];
  sourceUrl: string;
  sourceStatus: SourceSnapshotStatus;
};

export const riemannBenchRuntime = defineBenchmarkRuntime({
  source: "riemann_bench",
  key: "riemannBench",
  fetchRows: async () => (await getRiemannBenchStats()).data,
  readCache: readRiemannBenchRawCache,
  snapshot: riemannBenchSnapshot,
  write: insertRiemannBenchRawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildRiemannBenchMap(rows) }),
});

function readRiemannBenchRawCache(cache: CacheRowSource): {
  rows: RiemannBenchModelScoreRow[];
  fetchedAt: number | null;
  sourceUrl: string;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM riemann_bench_raw_rows ORDER BY row_index",
  );
  if (cacheRows.length === 0) {
    return null;
  }
  const sourceUrls = new Set(cacheRows.map((row) => asNonEmptyString(row.url)));
  if (sourceUrls.size !== 1 || sourceUrls.has(null)) {
    return null;
  }
  const sourceUrl = [...sourceUrls][0];
  if (sourceUrl == null) {
    return null;
  }
  const cachedRows = cacheRows.flatMap((row) => {
    const model = asNonEmptyString(row.model);
    const score = asFiniteNumber(row.score);
    return model != null && score != null
      ? [
          {
            provider: asNonEmptyString(row.provider),
            model,
            score,
            last_updated: asNonEmptyString(row.last_updated),
          },
        ]
      : [];
  });
  if (cachedRows.length === 0) {
    return null;
  }
  return {
    rows: cachedRows,
    fetchedAt: firstFetchedAt(cacheRows),
    sourceUrl,
  };
}

/** Loads Riemann-bench rows using normalized model configuration identity for cache continuity. */
async function riemannBenchSnapshot(
  cached: ReturnType<typeof readRiemannBenchRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
  context: BenchmarkSnapshotContext,
): Promise<RiemannBenchSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: context.source,
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getRiemannBenchStats,
    rowKey: (row) => {
      const parsedModel = parseModelEffort(row.model);
      return sourceRowKey(row.provider, parsedModel.baseModel, parsedModel.reasoningEffort);
    },
    rowLabel: (row) => row.model,
  });
  if (snapshot.sourceUrl == null) {
    throw new Error("Riemann-bench snapshot is missing its source URL");
  }
  return {
    rows: snapshot.rows,
    sourceUrl: snapshot.sourceUrl,
    sourceStatus: context.sourceStatus(snapshot),
  };
}

function insertRiemannBenchRawRows(db: DatabaseWriter, snapshot: RiemannBenchSnapshot): void {
  const statement = db.prepare(`
		INSERT INTO riemann_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, provider,
			model, score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      snapshot.sourceUrl,
      row.provider,
      row.model,
      row.score,
      row.last_updated,
    );
  }
}
