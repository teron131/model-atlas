/** Real SQLite persistence keeps complete community research immutable across retries and schema reconciliation. */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  insertCommunityRanking,
  readCommunityRankings,
} from "../src/model-atlas/database/community-rankings";
import { loadSchemaSql, openDatabase } from "../src/model-atlas/database/schema";

const ranking = {
  ranked_at: "2026-10-19T05:00:00Z",
  indexes: {
    tmb: [
      [{ model_id: "a" }, { model_id: "b", relation: ">" as const, rationale: "Task evidence" }],
    ],
    slop: [],
  },
  research: {
    sources: [{ url: "https://example.com/research", quotes: ["Full retained log"] }],
    decisions: [{ accepted: true, details: null }],
  },
  chain_log: [{ step: 1, evidence: ["a", "b"] }],
};
const earlier = { ...ranking, ranked_at: "2026-10-18T05:00:00Z" };
const db = new DatabaseSync(":memory:");
try {
  db.exec(await loadSchemaSql());
  assert.deepEqual(readCommunityRankings(db), []);
  assert.equal(insertCommunityRanking(db, ranking), "created");
  assert.deepEqual(readCommunityRankings(db), [ranking]);
  const reordered = {
    chain_log: ranking.chain_log,
    research: { decisions: ranking.research.decisions, sources: ranking.research.sources },
    indexes: { slop: ranking.indexes.slop, tmb: ranking.indexes.tmb },
    ranked_at: ranking.ranked_at,
  };
  assert.equal(insertCommunityRanking(db, reordered), "unchanged");
  const changed = { ...ranking, research: { sources: [] } };
  assert.equal(insertCommunityRanking(db, changed), "conflict");
  assert.deepEqual(readCommunityRankings(db), [ranking]);
  assert.equal(insertCommunityRanking(db, earlier), "created");
  assert.deepEqual(readCommunityRankings(db), [earlier, ranking]);
  assert.throws(() =>
    db
      .prepare("INSERT INTO community_rankings (ranked_at, ranking_json) VALUES (?, ?)")
      .run("2026-10-20T05:00:00Z", JSON.stringify(ranking)),
  );
  db.exec("BEGIN");
  assert.equal(
    insertCommunityRanking(db, { ...ranking, ranked_at: "2026-10-20T05:00:00Z" }),
    "created",
  );
  db.exec("ROLLBACK");
  assert.deepEqual(readCommunityRankings(db), [earlier, ranking]);
} finally {
  db.close();
}

await mkdir(".cache", { recursive: true });
const directory = await mkdtemp(".cache/community-storage-");
const path = join(directory, "checkpoint.sqlite");
try {
  const checkpoint = await openDatabase(path);
  try {
    assert.equal(insertCommunityRanking(checkpoint, ranking), "created");
    checkpoint.exec("ALTER TABLE community_rankings ADD COLUMN obsolete TEXT");
  } finally {
    checkpoint.close();
  }
  const reopened = await openDatabase(path);
  try {
    assert.deepEqual(readCommunityRankings(reopened), [ranking]);
    assert.deepEqual(
      reopened
        .prepare("PRAGMA table_info(community_rankings)")
        .all()
        .map((row) => row.name),
      ["ranked_at", "ranking_json"],
    );
  } finally {
    reopened.close();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
