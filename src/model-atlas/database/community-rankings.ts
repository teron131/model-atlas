/** Append-only community research records share the authoritative checkpoint with benchmark evidence. */

import type { DatabaseSync } from "node:sqlite";

import type { CommunityRanking } from "../community/rankings";
import { stableJson } from "../runtime";

export function readCommunityRankings(db: DatabaseSync): CommunityRanking[] {
  return db
    .prepare("SELECT ranking_json FROM community_rankings ORDER BY ranked_at")
    .all()
    .map((row) => JSON.parse(String(row.ranking_json)));
}

export function insertCommunityRanking(
  db: DatabaseSync,
  ranking: CommunityRanking,
): "created" | "unchanged" | "conflict" {
  const serialized = stableJson(ranking);
  const result = db
    .prepare(
      "INSERT INTO community_rankings (ranked_at, ranking_json) VALUES (?, ?) ON CONFLICT(ranked_at) DO NOTHING",
    )
    .run(ranking.ranked_at, serialized);
  if (result.changes > 0) return "created";
  const row = db
    .prepare("SELECT ranking_json FROM community_rankings WHERE ranked_at = ?")
    .get(ranking.ranked_at)!;
  return stableJson(JSON.parse(String(row.ranking_json))) === serialized ? "unchanged" : "conflict";
}
