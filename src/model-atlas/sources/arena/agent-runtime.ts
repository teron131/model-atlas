/** Arena Agent runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import { SNAPSHOT_TABLES } from "../../database/tables";
import type { DatabaseWriter } from "../../database/writers/database";
import { asFiniteNumber } from "../../runtime";
import { defineBenchmarkRuntime } from "../benchmark-runtime";
import { type CacheRowSource, firstEpochSecond, sourceCacheRows, stringValue } from "../cache/rows";
import { mergeSourceEvidence, sourceKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import { type ArenaAgentModelScoreRow, DEFAULT_LEADERBOARD_URL, getArenaAgentStats } from "./agent";

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
  loadSourceRows: async () => (await getArenaAgentStats()).data,
  sourceRowsFromSnapshots: (snapshots) => snapshots.arenaAgentModelScoreRows,
});

export function readArenaAgentRawCache(cache: CacheRowSource): {
  rows: ArenaAgentModelScoreRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM arena_agent_raw_rows ORDER BY row_index");
  if (
    cacheRows.length === 0 ||
    cacheRows.some((row) => stringValue(row.url) !== DEFAULT_LEADERBOARD_URL)
  ) {
    return null;
  }
  const rows = cacheRows.flatMap((row) => {
    const rank = asFiniteNumber(row.rank);
    const contenderName = stringValue(row.contender_name);
    const model = stringValue(row.model);
    const baseModel = stringValue(row.base_model);
    const reasoningEffort = stringValue(row.reasoning_effort);
    const organization = stringValue(row.organization);
    const score = asFiniteNumber(row.score);
    return rank != null &&
      contenderName != null &&
      model != null &&
      baseModel != null &&
      organization != null &&
      score != null
      ? [
          {
            rank,
            contender_name: contenderName,
            model,
            base_model: baseModel,
            reasoning_effort: reasoningEffort,
            organization,
            score,
            cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
          },
        ]
      : [];
  });
  return rows.length === 0 ? null : { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

/** Loads Arena Agent rows keyed by contender identity so renamed display labels remain auditable. */
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
    rowKey: (row) => sourceKey(row.contender_name, row.reasoning_effort),
    rowLabel: (row) => row.model,
    mergeRow: (cachedRow, fetchedRow) => ({
      ...mergeSourceEvidence(cachedRow, fetchedRow),
      // The current rolling-window median replaces the earlier measurement.
      cost_per_task_usd: fetchedRow.cost_per_task_usd,
    }),
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

/** Persist Arena Agent's causal effect and median task cost for the same contender and effort. */
function insertArenaAgentRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO arena_agent_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score, cost_per_task_usd
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.arenaAgentModelScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.arenaAgent,
      DEFAULT_LEADERBOARD_URL,
      row.rank,
      row.contender_name,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.organization,
      row.score,
      row.cost_per_task_usd,
    );
  }
}
