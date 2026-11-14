/** Arena Agent keeps the latest accepted publication in one raw table, each row tagged with the leaderboard page or dataset URL it came from; the cache keeps whichever rows still parse. */

import { buildBenchmarkModelMap } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import type { DatabaseWriter } from "../../sqlite-utils";
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
  ARENA_AGENT_LEADERBOARD_URL,
  type ArenaAgentModelScoreRow,
  getArenaAgentStats,
} from "./agent";
import { ARENA_AGENT_DATASET_URL, arenaRefreshIsCurrent } from "./dataset";

type ArenaAgentSnapshot = BenchmarkSnapshot<ArenaAgentModelScoreRow>;

export const arenaAgentRuntime = defineBenchmarkRuntime({
  source: "arena_agent",
  key: "arenaAgent",
  fetchRows: async () => (await getArenaAgentStats()).data,
  readCache: readArenaAgentRawCache,
  snapshot: arenaAgentSnapshot,
  write: insertArenaAgentRawRows,
  sourceData: (rows) => ({ rows, rowsByModelName: buildBenchmarkModelMap(rows) }),
});

export function readArenaAgentRawCache(
  cache: CacheRowSource,
): RawRowsCache<ArenaAgentModelScoreRow> | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM arena_agent_raw_rows ORDER BY row_index");
  if (
    cacheRows.length === 0 ||
    cacheRows.some(
      (row) => ![ARENA_AGENT_LEADERBOARD_URL, ARENA_AGENT_DATASET_URL].includes(String(row.url)),
    )
  ) {
    return null;
  }
  const rows = cacheRows.flatMap((row) => {
    const rank = asFiniteNumber(row.rank);
    const contenderName = asNonEmptyString(row.contender_name);
    const model = asNonEmptyString(row.model);
    const baseModel = asNonEmptyString(row.base_model);
    const reasoningEffort = asNonEmptyString(row.reasoning_effort);
    const organization = asNonEmptyString(row.organization);
    const score = asFiniteNumber(row.score);
    return rank != null &&
      contenderName != null &&
      model != null &&
      baseModel != null &&
      organization != null &&
      score != null
      ? [
          {
            source_url: String(row.url),
            observed_at: asNonEmptyString(row.observed_at),
            rank,
            contender_name: contenderName,
            model,
            base_model: baseModel,
            reasoning_effort: reasoningEffort,
            organization,
            score,
            cost_per_task_usd: null,
          },
        ]
      : [];
  });
  return rows.length === 0 ? null : { rows, fetchedAt: firstFetchedAt(cacheRows) };
}

/** Replace accepted Arena publications as a complete row set; failed or older publications retain cached evidence. */
async function arenaAgentSnapshot(
  request: SourceSnapshotRequest<ReturnType<typeof readArenaAgentRawCache>>,
): Promise<ArenaAgentSnapshot> {
  const snapshot = await snapshotSourceRows({
    ...request,
    fetchRows: getArenaAgentStats,
    acceptsRefresh: arenaRefreshIsCurrent,
    replaceRowsOnRefresh: true,
    rowKey: (row) => sourceRowKey(row.contender_name, row.reasoning_effort),
    rowLabel: (row) => row.model,
  });
  return {
    rows: snapshot.rows,
    sourceStatus: sourceSnapshotStatus(request.source, snapshot),
  };
}

/** `cost_per_task_usd` stays null because Atlas does not use Agent task costs. */
function insertArenaAgentRawRows(db: DatabaseWriter, snapshot: ArenaAgentSnapshot): void {
  const statement = db.prepare(`
		INSERT INTO arena_agent_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score, cost_per_task_usd, observed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshot.rows.entries()) {
    statement.run(
      index,
      snapshot.sourceStatus.fetchedAt,
      row.source_url,
      row.rank,
      row.contender_name,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.organization,
      row.score,
      null,
      row.observed_at,
    );
  }
}
