/** Arena Agent runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import { SNAPSHOT_TABLES } from "../../database/tables";
import type { DatabaseWriter } from "../../database/writers/database";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstFetchedAt, sourceCacheRows } from "../cache/rows";
import { sourceRowKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import {
  ARENA_AGENT_LEADERBOARD_URL,
  type ArenaAgentModelScoreRow,
  getArenaAgentStats,
} from "./agent";
import { ARENA_AGENT_DATASET_URL, arenaRefreshIsCurrent } from "./dataset";

type ArenaAgentSnapshot = {
  arenaAgentModelScoreRows: ArenaAgentModelScoreRow[];
  sourceStatus: SourceSnapshotStatus;
};

export const arenaAgentRuntime = defineBenchmarkRuntime({
  cacheKey: "arenaAgent",
  source: "arena_agent",
  table: SNAPSHOT_TABLES.arena_agent,
  readCache: readArenaAgentRawCache,
  snapshot: arenaAgentSnapshot,
  write: insertArenaAgentRawRows,
  sourceRowsKey: "arenaAgentRows",
  fetchSourceRows: async () => (await getArenaAgentStats()).data,
  sourceRowsFromSnapshots: (snapshots) => snapshots.arenaAgentModelScoreRows,
});

export function readArenaAgentRawCache(cache: CacheRowSource): {
  rows: ArenaAgentModelScoreRow[];
  fetchedAt: number | null;
} | null {
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
  cached: ReturnType<typeof readArenaAgentRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<ArenaAgentSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: "arena_agent",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getArenaAgentStats,
    acceptsRefresh: arenaRefreshIsCurrent,
    replaceRowsOnRefresh: true,
    rowKey: (row) => sourceRowKey(row.contender_name, row.reasoning_effort),
    rowLabel: (row) => row.model,
    // Net Improvement and rank belong to the current publication; unavailable costs stay missing.
    mergeRow: (_cachedRow, fetchedRow) => fetchedRow,
  });
  return {
    arenaAgentModelScoreRows: snapshot.rows,
    sourceStatus: {
      source: "arena_agent",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "arenaAgent",
    },
  };
}

/** Persist each row's actual source and publication date without the retired Agent task-cost measurements. */
function insertArenaAgentRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO arena_agent_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score, cost_per_task_usd, observed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.arenaAgentModelScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.arenaAgent,
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
