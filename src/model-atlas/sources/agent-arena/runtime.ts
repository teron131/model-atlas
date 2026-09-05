/** Agent Arena runtime owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
  type AgentArenaModelScoreRow,
  DEFAULT_LEADERBOARD_URL,
  getAgentArenaStats,
} from "./leaderboard";

type AgentArenaSnapshot = {
  agentArenaModelScoreRows: AgentArenaModelScoreRow[];
  sourceStatus: SourceSnapshotStatus;
};

export const agentArenaRuntime = defineBenchmarkRuntime({
  cacheKey: "agentArena",
  source: "agent_arena",
  table: SNAPSHOT_TABLES.agent_arena,
  readCache: readAgentArenaRawCache,
  snapshot: agentArenaSnapshot,
  write: insertAgentArenaRawRows,
  sourceRowsKey: "agentArenaRows",
  loadSourceRows: async () => (await getAgentArenaStats()).data,
  sourceRowsFromSnapshots: (snapshots) => snapshots.agentArenaModelScoreRows,
});

export function readAgentArenaRawCache(cache: CacheRowSource): {
  rows: AgentArenaModelScoreRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM agent_arena_raw_rows ORDER BY row_index");
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
          },
        ]
      : [];
  });
  return rows.length === 0 ? null : { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

/** Loads Agent Arena rows keyed by contender identity so renamed display labels remain auditable. */
async function agentArenaSnapshot(
  cached: ReturnType<typeof readAgentArenaRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<AgentArenaSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: "agent_arena",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getAgentArenaStats,
    rowKey: (row) => sourceKey(row.contender_name, row.reasoning_effort),
    rowLabel: (row) => row.model,
  });
  return {
    agentArenaModelScoreRows: snapshot.rows,
    sourceStatus: {
      source: "agent_arena",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "agentArena",
    },
  };
}

/** Insert Agent Arena's source identity and headline causal effect. */
function insertAgentArenaRawRows(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO agent_arena_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.agentArenaModelScoreRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.agentArena,
      DEFAULT_LEADERBOARD_URL,
      row.rank,
      row.contender_name,
      row.model,
      row.base_model,
      row.reasoning_effort,
      row.organization,
      row.score,
    );
  }
}
