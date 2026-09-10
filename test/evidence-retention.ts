/** Retained evidence survives source removal, corrections, schema migration, rollback, and checkpoint reopen. */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { archiveCheckpoint, readArchivedEvidence } from "../src/model-atlas/database/archive";
import { loadSchemaSql, openDatabase } from "../src/model-atlas/database/schema";

await mkdir(".cache", { recursive: true });
const directory = await mkdtemp(".cache/evidence-retention-");
const path = join(directory, "checkpoint.sqlite");
let db = new DatabaseSync(path);
try {
  db.exec(await loadSchemaSql());
  // Model an existing production checkpoint without the newly introduced archive.
  db.exec(`
    DROP TABLE historical_evidence;
    INSERT INTO snapshot_metadata VALUES (1789000000);
    CREATE TABLE retired_raw_rows (row_index INTEGER, fetched_at_epoch_seconds INTEGER, model TEXT, value REAL);
    INSERT INTO retired_raw_rows VALUES (0, 1789000000, 'Removed upstream', 0.5);
    INSERT INTO model_atlas_schema_manifest VALUES ('table', 'retired_raw_rows');
  `);
  db.close();
  db = await openDatabase(path);
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE name = 'retired_raw_rows'").get(),
    undefined,
  );
  assert.equal(
    readArchivedEvidence(db, "retired_raw_rows")[0]!.record.model,
    "Removed upstream",
    "First migration must archive before dropping a retired source table",
  );

  db.exec(`
    CREATE TABLE retained_v2_raw_rows (row_index INTEGER, fetched_at_epoch_seconds INTEGER, model TEXT, value REAL);
    INSERT INTO retained_v2_raw_rows VALUES (0, 1789000000, 'Source model', 0.6);
    INSERT INTO models (row_index, model_id, provider_id, name, reasoning_effort, release_date, intelligence_index) VALUES (0, 'lab/model', 'lab', 'Source model', 'high', '2025-01-01', 40);
    INSERT INTO model_benchmarks (model_row_index, benchmark_key, value, observed_at) VALUES (0, 'hle', 0.3, '2026-09-01');
    INSERT INTO model_task_metrics (model_row_index, source_key, cost, observed_at) VALUES (0, 'hle', 2, '2026-09-01');
  `);
  archiveCheckpoint(db);
  const original = readArchivedEvidence(db, "retained_v2_raw_rows");
  db.exec(
    "UPDATE retained_v2_raw_rows SET row_index = 99, fetched_at_epoch_seconds = 1789001000; UPDATE snapshot_metadata SET updated_at_epoch_seconds = 1789001000",
  );
  archiveCheckpoint(db);
  assert.deepEqual(
    readArchivedEvidence(db, "retained_v2_raw_rows"),
    original,
    "Cache freshness and ordering must not duplicate unchanged evidence",
  );
  assert.equal(readArchivedEvidence(db, "models").length, 1);
  assert.equal(readArchivedEvidence(db, "benchmark_catalog").length, 1);

  db.exec("UPDATE retained_v2_raw_rows SET value = 0.8");
  archiveCheckpoint(db);
  assert.deepEqual(
    readArchivedEvidence(db, "retained_v2_raw_rows").map((row) => row.record.value),
    [0.6, 0.8],
    "A source correction appends instead of overwriting earlier evidence",
  );
  db.exec("BEGIN; UPDATE retained_v2_raw_rows SET value = 0.9");
  archiveCheckpoint(db);
  db.exec("ROLLBACK");
  assert.equal(
    readArchivedEvidence(db, "retained_v2_raw_rows").length,
    2,
    "A failed checkpoint transaction cannot leak partial archive revisions",
  );

  db.exec(
    "DELETE FROM retained_v2_raw_rows; DELETE FROM model_benchmarks; DELETE FROM model_task_metrics; DELETE FROM models",
  );
  archiveCheckpoint(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM models").get()?.count,
    0,
    "Archived models must not repopulate the current snapshot",
  );
  const preserved = readArchivedEvidence(db, "models")[0]!.record;
  assert.equal(preserved.model_id, "lab/model");
  assert.equal(preserved.reasoning_effort, "high");
  assert.equal(preserved.intelligence_index, 40);
  assert.deepEqual(preserved.benchmarks, [
    { benchmark_key: "hle", value: 0.3, observed_at: "2026-09-01" },
  ]);
  assert.equal((preserved.task_metrics as { cost: number }[])[0]!.cost, 2);
  db.close();
  db = await openDatabase(path);
  assert.equal(
    readArchivedEvidence(db, "retained_v2_raw_rows").length,
    2,
    "Disappeared evidence remains readable after checkpoint persistence and reopen",
  );
  assert.equal(readArchivedEvidence(db, "retired_raw_rows").length, 1);
  assert.deepEqual(readArchivedEvidence(db, "not-a-source"), []);
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
console.log("Evidence retention lifecycle checks passed.");
