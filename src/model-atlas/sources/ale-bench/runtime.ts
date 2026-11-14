/** ALE-Bench keeps every self-refinement checkpoint from Sakana's leaderboard and Epoch's ALE-Bench rows in one raw table, told apart by URL; a cache with an unknown URL or any unparseable row is rejected whole, and one without Epoch rows is refetched. */

import { buildBenchmarkModelMap, parseSlugEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { type DatabaseWriter, jsonValue } from "../../sqlite-utils";
import { type BenchmarkSnapshot, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { ALE_BENCH_EPOCH_RESULTS_URL, type AleBenchEpochRow } from "../epoch/ale-bench";
import { sourceRowKey } from "../snapshots/policy";
import {
  type RawRowsCache,
  snapshotSourceRows,
  type SourceSnapshotRequest,
  sourceSnapshotStatus,
} from "../snapshots/row-snapshot";
import {
  ALE_BENCH_LEADERBOARD_URL,
  type AleBenchSourceRow,
  getAleBenchStats,
  processAleBenchConfigurationRow,
  summarizeAleBenchSourceDefaultRows,
} from "./leaderboard";

type AleBenchSnapshot = BenchmarkSnapshot<AleBenchSourceRow>;

export const aleBenchRuntime = defineBenchmarkRuntime({
  source: "ale_bench",
  key: "aleBench",
  fetchRows: async () => (await getAleBenchStats()).data,
  readCache: readAleBenchRawCache,
  snapshot: aleBenchSnapshot,
  write: insertAleBenchRawRows,
  sourceData: aleBenchSourceData,
});

export function readAleBenchRawCache(
  cache: CacheRowSource,
): RawRowsCache<AleBenchSourceRow> | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM ale_bench_raw_rows ORDER BY row_index");
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) =>
        ![ALE_BENCH_LEADERBOARD_URL, ALE_BENCH_EPOCH_RESULTS_URL].includes(
          asNonEmptyString(row.url) ?? "",
        ),
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap((row): AleBenchSourceRow[] => {
    if (row.url === ALE_BENCH_EPOCH_RESULTS_URL) {
      const epoch = jsonValue(row.epoch_json) as AleBenchEpochRow | null;
      return epoch == null ? [] : [{ model: epoch.model, epoch }];
    }
    const model = asNonEmptyString(row.model);
    const detailPath = asNonEmptyString(row.detail_path);
    const numSelfRefine = asFiniteNumber(row.num_self_refine);
    if (model == null || detailPath == null || numSelfRefine == null) return [];
    const parsed = processAleBenchConfigurationRow(model, detailPath, {
      num_self_refine: numSelfRefine,
      rank: jsonValue(row.rank_json),
      performance: jsonValue(row.performance_json),
      input_tokens: jsonValue(row.input_tokens_json),
      output_tokens: jsonValue(row.output_tokens_json),
      total_tokens: jsonValue(row.total_tokens_json),
      cost: jsonValue(row.cost_json),
      results: jsonValue(row.results_json),
    });
    return parsed == null ? [] : [parsed];
  });
  return rows.length !== cacheRows.length ? null : { rows, fetchedAt: firstFetchedAt(cacheRows) };
}

async function aleBenchSnapshot(
  request: SourceSnapshotRequest<ReturnType<typeof readAleBenchRawCache>>,
): Promise<AleBenchSnapshot> {
  const snapshot = await snapshotSourceRows({
    ...request,
    status: request.cached?.rows.some((row) => "epoch" in row)
      ? request.status
      : { ...request.status, cache_hit: false },
    fetchRows: getAleBenchStats,
    rowKey: (row) => sourceRowKey(row.model, "epoch" in row ? "epoch" : row.num_self_refine),
    rowLabel: (row) =>
      "epoch" in row ? `${row.model} (Epoch)` : `${row.model} x${row.num_self_refine}`,
    seriesOf: (row) => ("epoch" in row ? "epoch" : "sakana"),
  });
  return {
    rows: snapshot.rows,
    sourceStatus: sourceSnapshotStatus(request.source, snapshot),
  };
}

/** Every refinement checkpoint stays as evidence, while matching reads only the source-default rows. */
function aleBenchSourceData(rows: AleBenchSourceRow[]) {
  const sourceDefaultRows = summarizeAleBenchSourceDefaultRows(rows);
  return { rows, sourceDefaultRows, rowsByModelName: buildBenchmarkModelMap(sourceDefaultRows) };
}

function insertAleBenchRawRows(db: DatabaseWriter, snapshot: AleBenchSnapshot): void {
  const statement = db.prepare(`
		INSERT INTO ale_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, base_model,
			reasoning_effort, detail_path, num_self_refine, performance_mean,
			performance_median, cost_per_task_usd, tokens_per_task,
			input_tokens_per_task, output_tokens_per_task, rank_json,
			performance_json, input_tokens_json, output_tokens_json,
			total_tokens_json, cost_json, results_json, epoch_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    const parsedModel = parseSlugEffort(row.model);
    if ("epoch" in row) {
      statement.run(
        index,
        snapshot.sourceStatus.fetchedAt,
        ALE_BENCH_EPOCH_RESULTS_URL,
        row.model,
        parsedModel.baseModel,
        parsedModel.reasoningEffort,
        null,
        null,
        row.epoch.performance,
        null,
        row.epoch.cost,
        row.epoch.total_tokens,
        row.epoch.input_tokens,
        row.epoch.output_tokens,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify(row.epoch),
      );
      continue;
    }
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      ALE_BENCH_LEADERBOARD_URL,
      row.model,
      parsedModel.baseModel,
      parsedModel.reasoningEffort,
      row.detail_path,
      row.num_self_refine,
      row.performance.all.mean,
      row.performance.all.median,
      row.cost.all.mean,
      row.total_tokens.all.mean,
      row.input_tokens.all.mean,
      row.output_tokens.all.mean,
      JSON.stringify(row.rank),
      JSON.stringify(row.performance),
      JSON.stringify(row.input_tokens),
      JSON.stringify(row.output_tokens),
      JSON.stringify(row.total_tokens),
      JSON.stringify(row.cost),
      JSON.stringify(row.results),
      null,
    );
  }
}
