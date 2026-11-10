/** Preserve source evidence and matched model observations outside the checkpoint: every refresh restores the checkpoint into memory, so retained history lives in append-only storage objects and each publication adds only the records it newly observed. */

import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { BENCHMARK_CATALOG } from "../benchmarks/registry";
import { type JsonObject, stableJson } from "../runtime";

type Evidence = { sourceTable: string; json: string; key: string };

/** Fingerprint the evidence a checkpoint already holds, before a refresh replaces it. */
export function evidenceFingerprints(databasePath: string): Set<string> {
  const fingerprints = new Set<string>();
  for (const { key } of checkpointEvidence(databasePath)) fingerprints.add(key);
  return fingerprints;
}

/** JSON lines of the refreshed checkpoint's evidence missing from `archived`, led by the benchmark catalog that interprets them; cache timestamps and row positions are not evidence. */
export function newEvidence(databasePath: string, archived: ReadonlySet<string>): string {
  const lines = [evidenceLine("benchmark_catalog", stableJson(BENCHMARK_CATALOG))];
  const added = new Set<string>();
  for (const { sourceTable, json, key } of checkpointEvidence(databasePath)) {
    if (archived.has(key) || added.has(key)) continue;
    added.add(key);
    lines.push(evidenceLine(sourceTable, json));
  }
  return `${lines.join("\n")}\n`;
}

function* checkpointEvidence(databasePath: string): Generator<Evidence> {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    for (const table of tables) {
      if (!/^[a-z][a-z0-9_]*_raw_(rows|models)$/.test(table)) continue;
      for (const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
        const { row_index: _index, fetched_at_epoch_seconds: _fetched, ...record } = row;
        yield evidence(table, record);
      }
    }
    if (!tables.has("models") || !tables.has("model_benchmarks")) return;
    const benchmarks = modelObservations(db, "model_benchmarks", "benchmark_key");
    const taskMetrics = tables.has("model_task_metrics")
      ? modelObservations(db, "model_task_metrics", "source_key")
      : new Map<number, JsonObject[]>();
    for (const row of db.prepare("SELECT * FROM models").iterate()) {
      yield evidence("models", {
        model_id: row.model_id,
        provider_id: row.provider_id,
        name: row.name,
        reasoning_effort: row.reasoning_effort,
        release_date: row.release_date,
        intelligence_index: row.intelligence_index,
        omniscience_index: row.omniscience_index,
        omniscience_accuracy: row.omniscience_accuracy,
        benchmarks: benchmarks.get(Number(row.row_index)) ?? [],
        task_metrics: taskMetrics.get(Number(row.row_index)) ?? [],
      });
    }
  } finally {
    db.close();
  }
}

function evidence(sourceTable: string, record: unknown): Evidence {
  const json = stableJson(record);
  const key = createHash("sha256").update(`${sourceTable}\n${json}`).digest("hex");
  return { sourceTable, json, key };
}

function evidenceLine(sourceTable: string, json: string): string {
  return `{"source_table":${JSON.stringify(sourceTable)},"record":${json}}`;
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
