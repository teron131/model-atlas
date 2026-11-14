/** FrontierCode keeps one raw row per model and source effort with its Main subset evidence; the cache is accepted only when every row shares one source version (`revision`) and parses completely. */

import { buildBenchmarkModelMap } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import {
  booleanFromSql,
  type DatabaseWriter,
  jsonValue,
  sqliteBooleanValue,
} from "../../sqlite-utils";
import { type BenchmarkSnapshot, defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { sourceRowKey } from "../snapshots/policy";
import {
  type RawRowsCache,
  snapshotSourceRows,
  type SourceSnapshotRequest,
  sourceSnapshotStatus,
} from "../snapshots/row-snapshot";
import {
  FRONTIER_CODE_LEADERBOARD_URL,
  type FrontierCodeModelEffortRow,
  type FrontierCodeSubsetMetrics,
  getFrontierCodeStats,
  processFrontierCodeSubsetMetrics,
} from "./leaderboard";

type FrontierCodeSnapshot = BenchmarkSnapshot<FrontierCodeModelEffortRow>;

export const frontierCodeRuntime = defineBenchmarkRuntime({
  source: "frontier_code",
  key: "frontierCode",
  fetchRows: async () => (await getFrontierCodeStats()).data,
  readCache: readFrontierCodeRawCache,
  snapshot: frontierCodeSnapshot,
  write: insertFrontierCodeRawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildBenchmarkModelMap(rows) }),
});

function readFrontierCodeRawCache(
  cache: CacheRowSource,
): RawRowsCache<FrontierCodeModelEffortRow> | null {
  const cacheRows = sourceCacheRows(
    cache,
    "SELECT * FROM frontier_code_raw_rows ORDER BY row_index",
  );
  const revision = asNonEmptyString(cacheRows[0]?.revision);
  if (
    revision == null ||
    cacheRows.some(
      (row) =>
        asNonEmptyString(row.url) !== FRONTIER_CODE_LEADERBOARD_URL ||
        asNonEmptyString(row.revision) !== revision,
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap<FrontierCodeModelEffortRow>((row) => {
    const model = asNonEmptyString(row.model);
    const baseModel = asNonEmptyString(row.base_model);
    const sourceEffort = asNonEmptyString(row.source_effort);
    const harness = asNonEmptyString(row.harness);
    const scoreEligible = booleanFromSql(row.score_eligible);
    const officialRank = asFiniteNumber(row.official_rank);
    const officialBestEffort = booleanFromSql(row.official_best_effort);
    const main = processFrontierCodeSubsetMetrics(jsonValue(row.main_json));
    if (
      model == null ||
      baseModel == null ||
      sourceEffort == null ||
      harness == null ||
      scoreEligible == null ||
      officialRank == null ||
      officialBestEffort == null ||
      main == null
    ) {
      return [];
    }
    return [
      {
        revision,
        model,
        base_model: baseModel,
        source_effort: sourceEffort,
        reasoning_effort: asNonEmptyString(row.reasoning_effort),
        harness,
        score_eligible: scoreEligible,
        official_rank: officialRank,
        official_best_effort: officialBestEffort,
        main,
        score: main.score,
        cost_per_task_usd: main.cost_per_task_usd,
        tokens_per_task: main.tokens_per_task,
      },
    ];
  });
  return rows.length !== cacheRows.length ? null : { rows, fetchedAt: firstFetchedAt(cacheRows) };
}

/** Restore Cognition's source field names inside the persisted subset evidence JSON. */
function buildFrontierCodeStoredSubset(metrics: FrontierCodeSubsetMetrics) {
  return {
    correct: metrics.pass_rate,
    new_score: metrics.score,
    cost: metrics.cost_per_task_usd,
    tokens: metrics.tokens_per_task,
    tool_calls: metrics.tool_calls_per_task,
    ote: metrics.output_token_equivalent_per_task,
  };
}

async function frontierCodeSnapshot(
  request: SourceSnapshotRequest<ReturnType<typeof readFrontierCodeRawCache>>,
): Promise<FrontierCodeSnapshot> {
  const snapshot = await snapshotSourceRows({
    ...request,
    fetchRows: getFrontierCodeStats,
    versions: { versionOf: (row) => row.revision },
    rowKey: (row) => sourceRowKey(row.base_model, row.source_effort),
    rowLabel: (row) => `${row.model}: ${row.harness}`,
  });
  return {
    rows: snapshot.rows,
    sourceStatus: sourceSnapshotStatus(request.source, snapshot),
  };
}

function insertFrontierCodeRawRows(db: DatabaseWriter, snapshot: FrontierCodeSnapshot): void {
  const statement = db.prepare(`
		INSERT INTO frontier_code_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			source_effort, reasoning_effort, harness, score_eligible,
			official_rank, official_best_effort, main_score, main_pass_rate,
			main_cost_per_task_usd, main_tokens_per_task, main_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      FRONTIER_CODE_LEADERBOARD_URL,
      row.revision,
      row.model,
      row.base_model,
      row.source_effort,
      row.reasoning_effort,
      row.harness,
      sqliteBooleanValue(row.score_eligible),
      row.official_rank,
      sqliteBooleanValue(row.official_best_effort),
      row.main.score,
      row.main.pass_rate,
      row.main.cost_per_task_usd,
      row.main.tokens_per_task,
      JSON.stringify(buildFrontierCodeStoredSubset(row.main)),
    );
  }
}
