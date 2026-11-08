/** Vending-Bench 2 runtime owns raw-cache reconstruction, snapshot refresh, raw-row serialization, and its source-data lookup. */

import type { DatabaseWriter } from "../../database/writers/database";
import { buildBenchmarkModelMap } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { type BenchmarkSnapshotContext, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { sourceRowKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshotStatus } from "../types";
import {
  getVendingBench2Stats,
  VENDING_BENCH_2_LEADERBOARD_URL,
  type VendingBench2ModelScoreRow,
} from "./leaderboard";

type VendingBench2Snapshot = {
  rows: VendingBench2ModelScoreRow[];
  dataUrl: string | null;
  sourceStatus: SourceSnapshotStatus;
};

export const vendingBench2Runtime = defineBenchmarkRuntime({
  source: "vending_bench_2",
  key: "vendingBench2",
  fetchRows: async () => (await getVendingBench2Stats()).data,
  readCache: readVendingBench2RawCache,
  snapshot: vendingBench2Snapshot,
  write: insertVendingBench2RawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildBenchmarkModelMap(rows) }),
});

function readVendingBench2RawCache(cache: CacheRowSource): {
  rows: VendingBench2ModelScoreRow[];
  fetchedAt: number | null;
  sourceUrl?: string;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM vending_bench_2_raw_rows ORDER BY row_index",
  );
  if (
    cacheRows.length === 0 ||
    cacheRows.some((row) => asNonEmptyString(row.url) !== VENDING_BENCH_2_LEADERBOARD_URL)
  ) {
    return null;
  }
  const rows = cacheRows.flatMap((row) => {
    const rank = asFiniteNumber(row.rank);
    const model = asNonEmptyString(row.model);
    const baseModel = asNonEmptyString(row.base_model);
    const reasoningEffort = asNonEmptyString(row.reasoning_effort);
    const runCount = asFiniteNumber(row.run_count);
    const finalBalanceUsd = asFiniteNumber(row.final_balance_usd);
    const dailyBalanceUsd = numberArray(row.daily_balance_usd_json);
    return rank != null &&
      model != null &&
      baseModel != null &&
      runCount != null &&
      finalBalanceUsd != null &&
      dailyBalanceUsd != null
      ? [
          {
            rank,
            model,
            base_model: baseModel,
            reasoning_effort: reasoningEffort,
            run_count: runCount,
            final_balance_usd: finalBalanceUsd,
            daily_balance_usd: dailyBalanceUsd,
          },
        ]
      : [];
  });
  if (rows.length === 0) {
    return null;
  }
  return {
    rows,
    fetchedAt: firstFetchedAt(cacheRows),
    sourceUrl: asNonEmptyString(cacheRows[0]?.data_url) ?? undefined,
  };
}

function numberArray(value: unknown): number[] | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((item) => typeof item === "number" && Number.isFinite(item))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Loads Vending-Bench 2 model curves and records the versioned official data-module URL. */
async function vendingBench2Snapshot(
  cached: ReturnType<typeof readVendingBench2RawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
  context: BenchmarkSnapshotContext,
): Promise<VendingBench2Snapshot> {
  const snapshot = await snapshotSourceRows({
    source: context.source,
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getVendingBench2Stats,
    rowKey: (row) => sourceRowKey(row.model, row.reasoning_effort),
    rowLabel: (row) => row.model,
  });
  return {
    rows: snapshot.rows,
    dataUrl: snapshot.sourceUrl ?? null,
    sourceStatus: context.sourceStatus(snapshot),
  };
}

/** Insert Vending-Bench 2 outcomes while retaining the official average daily balance curves. */
function insertVendingBench2RawRows(db: DatabaseWriter, snapshot: VendingBench2Snapshot): void {
  const statement = db.prepare(`
		INSERT INTO vending_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, data_url, rank, model,
			base_model, reasoning_effort, run_count, final_balance_usd, daily_balance_usd_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      VENDING_BENCH_2_LEADERBOARD_URL,
      snapshot.dataUrl,
      row.rank,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.run_count,
      row.final_balance_usd,
      JSON.stringify(row.daily_balance_usd),
    );
  }
}
