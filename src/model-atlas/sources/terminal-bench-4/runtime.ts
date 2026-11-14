/** Terminal-Bench 4.0 keeps one raw row per model, effort, and agent harness; the cache is accepted only when every row matches the pinned source version and the resource profile's task-run count, and is refetched while any row lacks seconds or output tokens per task. */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import type { DatabaseWriter } from "../../sqlite-utils";
import { type BenchmarkSnapshot, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { sourceRowKey } from "../snapshots/policy";
import {
  harnessDistinguishesRuns,
  type RawRowsCache,
  snapshotSourceRows,
  type SourceSnapshotRequest,
  sourceSnapshotStatus,
} from "../snapshots/row-snapshot";
import {
  buildTerminalBench4Map,
  getTerminalBench4Stats,
  TERMINAL_BENCH_4_LEADERBOARD_URL,
  TERMINAL_BENCH_4_SOURCE_REVISION,
  type TerminalBench4ModelHarnessRow,
} from "./leaderboard";

type TerminalBench4Snapshot = BenchmarkSnapshot<TerminalBench4ModelHarnessRow>;

export const terminalBench4Runtime = defineBenchmarkRuntime({
  source: "terminal_bench_4",
  key: "terminalBench4",
  fetchRows: async () => (await getTerminalBench4Stats()).data,
  readCache: readTerminalBench4RawCache,
  snapshot: terminalBench4Snapshot,
  write: insertTerminalBench4RawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildTerminalBench4Map(rows) }),
});

export function readTerminalBench4RawCache(
  cache: CacheRowSource,
): RawRowsCache<TerminalBench4ModelHarnessRow> | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM terminal_bench_4_raw_rows ORDER BY row_index",
  );
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) =>
        asNonEmptyString(row.url) !== TERMINAL_BENCH_4_LEADERBOARD_URL ||
        asNonEmptyString(row.revision) !== TERMINAL_BENCH_4_SOURCE_REVISION,
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap<TerminalBench4ModelHarnessRow>((row) => {
    const model = asNonEmptyString(row.model);
    const baseModel = asNonEmptyString(row.base_model);
    const harness = asNonEmptyString(row.harness);
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
      (totalCostUsd == null) !== (costPerTaskUsd == null) ||
      (totalCostUsd != null && totalCostUsd <= 0) ||
      (costPerTaskUsd != null && costPerTaskUsd <= 0) ||
      totalTokens == null ||
      totalTokens <= 0 ||
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
        reasoning_effort: asNonEmptyString(row.reasoning_effort),
        harness,
        score,
        score_ci95_half_width: scoreCi95HalfWidth,
        task_run_count: taskRunCount,
        total_cost_usd: totalCostUsd,
        total_tokens: totalTokens,
        cost_per_task_usd: costPerTaskUsd,
        tokens_per_task: tokensPerTask,
        seconds_per_task: asFiniteNumber(row.seconds_per_task),
        output_tokens_per_task: asFiniteNumber(row.output_tokens_per_task),
      },
    ];
  });
  return rows.length === cacheRows.length ? { rows, fetchedAt: firstFetchedAt(cacheRows) } : null;
}

/** Harness joins the row identity only when the board lists one model and effort under several agents. */
async function terminalBench4Snapshot(
  request: SourceSnapshotRequest<ReturnType<typeof readTerminalBench4RawCache>>,
): Promise<TerminalBench4Snapshot> {
  const snapshot = await snapshotSourceRows({
    ...request,
    status: request.cached?.rows.some(
      (row) => row.seconds_per_task == null || row.output_tokens_per_task == null,
    )
      ? { ...request.status, cache_hit: false }
      : request.status,
    fetchRows: getTerminalBench4Stats,
    rowKeyFor: (rows) => {
      const harnessIdentity = harnessDistinguishesRuns(
        rows,
        (row) => sourceRowKey(row.base_model, row.reasoning_effort),
        (row) => row.harness,
      );
      return (row) =>
        sourceRowKey(row.base_model, row.reasoning_effort, harnessIdentity ? row.harness : null);
    },
    rowLabel: (row) => `${row.model}: ${row.harness}`,
    versions: { versionOf: (row) => row.revision },
  });
  return {
    rows: snapshot.rows,
    sourceStatus: sourceSnapshotStatus(request.source, snapshot),
  };
}

function insertTerminalBench4RawRows(db: DatabaseWriter, snapshot: TerminalBench4Snapshot): void {
  const statement = db.prepare(`
		INSERT INTO terminal_bench_4_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			reasoning_effort, harness, score, score_ci95_half_width, task_run_count,
			total_cost_usd, total_tokens, cost_per_task_usd, tokens_per_task, seconds_per_task, output_tokens_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      TERMINAL_BENCH_4_LEADERBOARD_URL,
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
      row.seconds_per_task ?? null,
      row.output_tokens_per_task ?? null,
    );
  }
}
