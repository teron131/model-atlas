/** Vending-Bench 2 runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
  DEFAULT_LEADERBOARD_URL,
  getVendingBench2Stats,
  type VendingBench2ModelScoreRow,
} from "./leaderboard";

type VendingBench2Snapshot = {
  vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
  vendingBench2DataUrl: string | null;
  sourceStatus: SourceSnapshotStatus;
};

export const vendingBench2Runtime = defineBenchmarkRuntime({
  cacheKey: "vendingBench2",
  source: "vending_bench_2",
  table: SNAPSHOT_TABLES.vending_bench_2,
  readCache: readVendingBench2RawCache,
  snapshot: vendingBench2Snapshot,
  write: insertVendingBench2RawRows,
  sourceRowsKey: "vendingBench2Rows",
  loadSourceRows: async () => (await getVendingBench2Stats()).data,
  sourceRowsFromSnapshots: (snapshots) => snapshots.vendingBench2ModelScoreRows,
});

export function readVendingBench2RawCache(cache: CacheRowSource): {
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
    cacheRows.some((row) => stringValue(row.url) !== DEFAULT_LEADERBOARD_URL)
  ) {
    return null;
  }
  const rows = cacheRows.flatMap((row) => {
    const rank = asFiniteNumber(row.rank);
    const model = stringValue(row.model);
    const baseModel = stringValue(row.base_model);
    const reasoningEffort = stringValue(row.reasoning_effort);
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
    fetchedAt: firstEpochSecond(cacheRows),
    sourceUrl: stringValue(cacheRows[0]?.data_url) ?? undefined,
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
): Promise<VendingBench2Snapshot> {
  const snapshot = await snapshotSourceRows({
    source: "vending_bench_2",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getVendingBench2Stats,
    rowKey: (row) => sourceKey(row.model, row.reasoning_effort),
    rowLabel: (row) => row.model,
  });
  return {
    vendingBench2ModelScoreRows: snapshot.rows,
    vendingBench2DataUrl: snapshot.sourceUrl ?? null,
    sourceStatus: {
      source: "vending_bench_2",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "vendingBench2",
    },
  };
}

/** Insert Vending-Bench 2 outcomes while retaining the official average daily balance curves. */
function insertVendingBench2RawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO vending_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, data_url, rank, model,
			base_model, reasoning_effort, run_count, final_balance_usd, daily_balance_usd_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.vendingBench2ModelScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.vendingBench2,
      DEFAULT_LEADERBOARD_URL,
      snapshots.vendingBench2DataUrl,
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
