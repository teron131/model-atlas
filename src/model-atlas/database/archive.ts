/** Preserve source evidence and matched model observations independently of current snapshots and scoring. */

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { BENCHMARK_CATALOG } from "../benchmarks/registry";
import { type JsonObject, stableJson } from "../runtime";

export const EVIDENCE_ARCHIVE_TABLE = "historical_evidence";

/** Append distinct evidence inside the caller's transaction; cache timestamps and row positions do not create new observations. */
export function archiveCheckpoint(db: DatabaseSync): void {
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name)),
  );
  if (!tables.has(EVIDENCE_ARCHIVE_TABLE) || !tables.has("snapshot_metadata")) return;
  const timestamp = Number(
    db.prepare("SELECT updated_at_epoch_seconds FROM snapshot_metadata LIMIT 1").get()
      ?.updated_at_epoch_seconds ?? 0,
  );
  if (!timestamp) return;
  const capturedAt = new Date(timestamp * 1000).toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${EVIDENCE_ARCHIVE_TABLE} (content_hash, source_table, captured_at, record_json) VALUES (?, ?, ?, ?)`,
  );
  const append = (sourceTable: string, record: unknown) => {
    const json = stableJson(record);
    const hash = createHash("sha256").update(`${sourceTable}\n${json}`).digest("hex");
    insert.run(hash, sourceTable, capturedAt, json);
  };
  for (const table of tables) {
    if (!/^[a-z][a-z0-9_]*_raw_(rows|models)$/.test(table)) continue;
    for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
      const { row_index: _index, fetched_at_epoch_seconds: _fetched, ...record } = row;
      append(table, record);
    }
  }
  // Store the catalog once per distinct policy, rather than duplicating definitions in every model record.
  append("benchmark_catalog", BENCHMARK_CATALOG);
  if (!tables.has("models") || !tables.has("model_benchmarks")) return;
  const benchmarks = modelObservations(db, "model_benchmarks", "benchmark_key");
  const taskMetrics = tables.has("model_task_metrics")
    ? modelObservations(db, "model_task_metrics", "source_key")
    : new Map<number, JsonObject[]>();
  for (const row of db.prepare("SELECT * FROM models").all()) {
    append("models", {
      model_id: row.model_id,
      provider_id: row.provider_id,
      name: row.name,
      reasoning_effort: row.reasoning_effort,
      release_date: row.release_date,
      intelligence_index: row.intelligence_index,
      agentic_index: row.agentic_index,
      coding_index: row.coding_index,
      omniscience_index: row.omniscience_index,
      omniscience_accuracy: row.omniscience_accuracy,
      benchmarks: benchmarks.get(Number(row.row_index)) ?? [],
      task_metrics: taskMetrics.get(Number(row.row_index)) ?? [],
    });
  }
}

/** Read retained revisions after the live source row or table disappears; malformed archive records fail visibly. */
export function readArchivedEvidence(
  db: DatabaseSync,
  sourceTable: string,
): { hash: string; capturedAt: string; record: JsonObject }[] {
  return db
    .prepare(
      `SELECT content_hash, captured_at, record_json FROM ${EVIDENCE_ARCHIVE_TABLE} WHERE source_table = ? ORDER BY captured_at, content_hash`,
    )
    .all(sourceTable)
    .map((row) => ({
      hash: String(row.content_hash),
      capturedAt: String(row.captured_at),
      record: JSON.parse(String(row.record_json)) as JsonObject,
    }));
}

function modelObservations(
  db: DatabaseSync,
  table: "model_benchmarks" | "model_task_metrics",
  order: "benchmark_key" | "source_key",
): Map<number, JsonObject[]> {
  const grouped = new Map<number, JsonObject[]>();
  for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY model_row_index, ${order}`).all()) {
    const { model_row_index: index, ...record } = row;
    const rows = grouped.get(Number(index)) ?? [];
    rows.push(record);
    grouped.set(Number(index), rows);
  }
  return grouped;
}
