/** Preserve source evidence and matched model observations independently of current snapshots and scoring. */

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";

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
  const write = prepareArchiveAppend(db);
  const append = (sourceTable: string, record: unknown) => write(sourceTable, capturedAt, record);
  for (const table of tables) {
    if (!/^[a-z][a-z0-9_]*_raw_(rows|models)$/.test(table)) continue;
    for (const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
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
  for (const row of db.prepare("SELECT * FROM models").iterate()) {
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

/** Prepare append-only writes inside the caller's transaction; explicit publisher identities retain their existing archive keys. */
export function prepareArchiveAppend(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${EVIDENCE_ARCHIVE_TABLE} (content_hash, source_table, captured_at, record_gzip) VALUES (?, ?, ?, ?)`,
  );
  const exists = db.prepare(`SELECT 1 FROM ${EVIDENCE_ARCHIVE_TABLE} WHERE content_hash = ?`);
  return (sourceTable: string, capturedAt: string, record: unknown, hash?: string): void => {
    if (hash != null && exists.get(hash)) return;
    const json = stableJson(record);
    const key = hash ?? createHash("sha256").update(`${sourceTable}\n${json}`).digest("hex");
    // Unchanged checkpoints should not recompress records that are already retained.
    if (hash == null && exists.get(key)) return;
    insert.run(key, sourceTable, capturedAt, gzipSync(json));
  };
}

/** Stream publication-ordered revisions without holding every raw JSON record in memory alongside its parsed form. */
export function* iterateArchivedEvidence<T = JsonObject>(
  db: DatabaseSync,
  sourceTable: string,
): Generator<{ hash: string; capturedAt: string; record: T }> {
  const rows = db
    .prepare(
      `SELECT content_hash, captured_at, record_gzip FROM ${EVIDENCE_ARCHIVE_TABLE} WHERE source_table = ? ORDER BY captured_at, content_hash`,
    )
    .iterate(sourceTable);
  for (const row of rows)
    yield {
      hash: String(row.content_hash),
      capturedAt: String(row.captured_at),
      record: JSON.parse(gunzipSync(row.record_gzip as Uint8Array).toString("utf8")) as T,
    };
}

/** Read retained revisions after the live source row or table disappears; malformed archive records fail visibly. */
export function readArchivedEvidence(db: DatabaseSync, sourceTable: string) {
  return [...iterateArchivedEvidence(db, sourceTable)];
}

/** Restore an exact retained artifact only from its expected archive category. */
export function readArchivedRecord(
  db: DatabaseSync,
  sourceTable: string,
  hash: string,
): JsonObject | null {
  const row = db
    .prepare(
      `SELECT record_gzip FROM ${EVIDENCE_ARCHIVE_TABLE} WHERE source_table = ? AND content_hash = ?`,
    )
    .get(sourceTable, hash);
  return row
    ? (JSON.parse(gunzipSync(row.record_gzip as Uint8Array).toString("utf8")) as JsonObject)
    : null;
}

/** Count metadata without materializing archived records. */
export function archivedEvidenceCount(db: DatabaseSync): number {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${EVIDENCE_ARCHIVE_TABLE}`).get()!.count);
}

function modelObservations(
  db: DatabaseSync,
  table: "model_benchmarks" | "model_task_metrics",
  order: "benchmark_key" | "source_key",
): Map<number, JsonObject[]> {
  const grouped = new Map<number, JsonObject[]>();
  for (const row of db
    .prepare(`SELECT * FROM ${table} ORDER BY model_row_index, ${order}`)
    .iterate()) {
    const { model_row_index: index, ...record } = row;
    const rows = grouped.get(Number(index)) ?? [];
    rows.push(record);
    grouped.set(Number(index), rows);
  }
  return grouped;
}

/** Replace the old text archive atomically inside schema reconciliation, preserving exact decoded bytes and original identities. */
export function compressArchivedEvidence(db: DatabaseSync, archiveSchema: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${EVIDENCE_ARCHIVE_TABLE})`).all();
  if (!columns.some((column) => column.name === "record_json")) return false;
  const compressed = `${EVIDENCE_ARCHIVE_TABLE}_compressed`;
  db.exec(
    archiveSchema.replace(
      `CREATE TABLE IF NOT EXISTS ${EVIDENCE_ARCHIVE_TABLE} (`,
      `CREATE TABLE ${compressed} (`,
    ),
  );
  const insert = db.prepare(
    `INSERT INTO ${compressed} (content_hash, source_table, captured_at, record_gzip) VALUES (?, ?, ?, ?)`,
  );
  for (const row of db
    .prepare(
      `SELECT content_hash, source_table, captured_at, record_json FROM ${EVIDENCE_ARCHIVE_TABLE}`,
    )
    .iterate()) {
    insert.run(
      String(row.content_hash),
      String(row.source_table),
      String(row.captured_at),
      gzipSync(String(row.record_json)),
    );
  }
  db.exec(`DROP TABLE ${EVIDENCE_ARCHIVE_TABLE}`);
  db.exec(`ALTER TABLE ${compressed} RENAME TO ${EVIDENCE_ARCHIVE_TABLE}`);
  return true;
}
