/** Terminal-Bench 4.0 runtime owns raw model-agent rows, cache reconstruction, and refresh state. */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog/portfolio";
import { asFiniteNumber } from "../../runtime";
import {
  getTerminalBench4Stats,
  TERMINAL_BENCH_4_SOURCE_REVISION,
  type TerminalBench4ModelAgentRow,
} from "../../scrapers/benchmarks/terminal-bench-4";
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
export function readTerminalBench4RawCache(cache: CacheRowSource): {
  rows: TerminalBench4ModelAgentRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM terminal_bench_4_raw_rows ORDER BY row_index",
  );
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) =>
        stringValue(row.url) !== SOURCE_URLS.terminal_bench_4 ||
        stringValue(row.revision) !== TERMINAL_BENCH_4_SOURCE_REVISION,
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap<TerminalBench4ModelAgentRow>((row) => {
    const model = stringValue(row.model);
    const baseModel = stringValue(row.base_model);
    const harness = stringValue(row.harness);
    const score = asFiniteNumber(row.score);
    const scoreCi95HalfWidth = asFiniteNumber(row.score_ci95_half_width);
    const taskRunCount = asFiniteNumber(row.task_run_count);
    const totalCostUsd = asFiniteNumber(row.total_cost_usd);
    const totalTokens = asFiniteNumber(row.total_tokens);
    const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
    const tokensPerTask = asFiniteNumber(row.tokens_per_task);
    if (
      model == null ||
      baseModel == null ||
      harness == null ||
      score == null ||
      scoreCi95HalfWidth == null ||
      taskRunCount !== BENCHMARK_RESOURCE_PROFILES.terminal_bench_4.taskRunCount ||
      totalCostUsd == null ||
      totalCostUsd <= 0 ||
      totalTokens == null ||
      totalTokens <= 0 ||
      costPerTaskUsd == null ||
      costPerTaskUsd <= 0 ||
      tokensPerTask == null ||
      tokensPerTask <= 0
    ) {
      return [];
    }
    return [
      {
        revision: TERMINAL_BENCH_4_SOURCE_REVISION,
        model,
        base_model: baseModel,
        reasoning_effort: stringValue(row.reasoning_effort),
        harness,
        score,
        score_ci95_half_width: scoreCi95HalfWidth,
        task_run_count: taskRunCount,
        total_cost_usd: totalCostUsd,
        total_tokens: totalTokens,
        cost_per_task_usd: costPerTaskUsd,
        tokens_per_task: tokensPerTask,
      },
    ];
  });
  return rows.length === cacheRows.length ? { rows, fetchedAt: firstEpochSecond(cacheRows) } : null;
}

type TerminalBench4Snapshot = {
  terminalBench4Rows: TerminalBench4ModelAgentRow[];
  sourceStatus: SourceSnapshotStatus;
};

/** Refresh every model-agent observation while keeping effort and harness in row identity. */
async function terminalBench4Snapshot(
  cached: ReturnType<typeof readTerminalBench4RawCache>,
  status: RawSourceCacheStatus,
  options: DatabaseBuildOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<TerminalBench4Snapshot> {
  const snapshot = await snapshotSourceRows({
    source: "terminal_bench_4",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getTerminalBench4Stats,
    rowKey: (row) => sourceKey(row.base_model, row.reasoning_effort, row.harness),
    rowLabel: (row) => `${row.model}: ${row.harness}`,
  });
  return {
    terminalBench4Rows: snapshot.rows,
    sourceStatus: {
      source: "terminal_bench_4",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "terminalBench4",
    },
  };
}

function insertTerminalBench4RawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO terminal_bench_4_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			reasoning_effort, harness, score, score_ci95_half_width, task_run_count,
			total_cost_usd, total_tokens, cost_per_task_usd, tokens_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.terminalBench4Rows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.terminalBench4,
      SOURCE_URLS.terminal_bench_4,
      row.revision,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.harness,
      row.score,
      row.score_ci95_half_width,
      row.task_run_count,
      row.total_cost_usd,
      row.total_tokens,
      row.cost_per_task_usd,
      row.tokens_per_task,
    );
  }
}

export const terminalBench4Runtime = {
  cacheKey: "terminalBench4",
  source: "terminal_bench_4",
  table: SNAPSHOT_TABLES.terminal_bench_4,
  readCache: readTerminalBench4RawCache,
  snapshot: terminalBench4Snapshot,
  write: insertTerminalBench4RawRows,
} as const;
