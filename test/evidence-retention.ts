/** Retained evidence survives source removal, corrections, schema migration, rollback, and checkpoint reopen. */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import {
  archiveCheckpoint,
  compressArchivedEvidence,
  iterateArchivedEvidence,
  prepareArchiveAppend,
  readArchivedEvidence,
  readArchivedRecord,
} from "../src/model-atlas/database/archive";
import { loadSchemaSql, openDatabase } from "../src/model-atlas/database/schema";
import { schemaStatements } from "../src/model-atlas/database/schema-reconciliation";

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
  const plan = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT record_gzip FROM historical_evidence WHERE source_table = ? ORDER BY captured_at, content_hash",
    )
    .all("index_components")
    .map((row) => String(row.detail));
  assert.ok(
    plan.some((detail) => detail.includes("historical_evidence_source_capture")),
    "Existing checkpoints acquire the source/publication index during normal schema reconciliation",
  );
  assert.ok(
    plan.every((detail) => !detail.includes("TEMP B-TREE")),
    "Archive reads must not sort large JSON records in a temporary table",
  );
  const append = prepareArchiveAppend(db);
  const artifact = { encoding: "base64", content: "aGVsbG8=", sha256: "publisher-hash" };
  db.exec("BEGIN");
  append("index_source_artifact", "2026-09-01", artifact, "artifact:publisher-hash");
  append("index_source_artifact", "2026-09-02", artifact, "artifact:publisher-hash");
  db.exec("COMMIT");
  assert.deepEqual(
    readArchivedRecord(db, "index_source_artifact", "artifact:publisher-hash"),
    artifact,
  );
  assert.equal(
    readArchivedRecord(db, "index_components", "artifact:publisher-hash"),
    null,
    "Exact lookups cannot cross archive categories",
  );
  const restored = [...iterateArchivedEvidence(db, "index_source_artifact")];
  assert.equal(
    restored.length,
    1,
    "Reimports preserve the original artifact key without duplicates",
  );
  assert.equal(restored[0]!.capturedAt, "2026-09-01", "Reimports keep the first capture timestamp");
  db.exec("BEGIN");
  append("index_components", "2026-09-03", { id: "rolled-back" }, "release:rollback");
  db.exec("ROLLBACK");
  assert.equal(readArchivedRecord(db, "index_components", "release:rollback"), null);
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
  const largeArtifact = {
    text: "Retained evidence α 中文 🧪 ".repeat(5000),
    values: [0, null, 0.75],
  };
  prepareArchiveAppend(db)("index_source_artifact", "2026-09-04", largeArtifact, "artifact:large");
  const archived = db.prepare("SELECT * FROM historical_evidence ORDER BY content_hash").all();
  // Recreate the previous on-disk contract to exercise an actual existing-checkpoint migration.
  db.exec(`
    ALTER TABLE historical_evidence RENAME TO compressed_archive_fixture;
    CREATE TABLE historical_evidence (content_hash TEXT NOT NULL PRIMARY KEY, source_table TEXT NOT NULL, captured_at TEXT NOT NULL, record_json TEXT NOT NULL);
  `);
  const restoreText = db.prepare("INSERT INTO historical_evidence VALUES (?, ?, ?, ?)");
  for (const row of archived)
    restoreText.run(
      String(row.content_hash),
      String(row.source_table),
      String(row.captured_at),
      gunzipSync(row.record_gzip as Uint8Array).toString("utf8"),
    );
  db.exec("DROP TABLE compressed_archive_fixture");
  const archiveSchema = schemaStatements(await loadSchemaSql()).find((sql) =>
    sql.startsWith("CREATE TABLE IF NOT EXISTS historical_evidence ("),
  )!;
  db.exec("BEGIN");
  assert.equal(compressArchivedEvidence(db, archiveSchema), true);
  db.exec("ROLLBACK");
  assert.ok(
    db
      .prepare("PRAGMA table_info(historical_evidence)")
      .all()
      .some((column) => column.name === "record_json"),
    "A failed migration restores the complete text archive",
  );
  db.close();
  db = await openDatabase(path);
  assert.ok(
    db
      .prepare("PRAGMA table_info(historical_evidence)")
      .all()
      .every((column) => column.name !== "record_json"),
    "The replaced text schema is removed",
  );
  assert.deepEqual(
    readArchivedRecord(db, "index_source_artifact", "artifact:large"),
    largeArtifact,
  );
  const migrated = db.prepare("SELECT * FROM historical_evidence ORDER BY content_hash").all();
  assert.deepEqual(
    migrated,
    archived,
    "Migration preserves identities, timestamps, and complete record content",
  );
  assert.ok(
    Number(
      db
        .prepare(
          "SELECT length(record_gzip) AS bytes FROM historical_evidence WHERE content_hash = 'artifact:large'",
        )
        .get()!.bytes,
    ) <
      JSON.stringify(largeArtifact).length / 10,
  );
  assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  db.exec("BEGIN");
  db.prepare(
    "UPDATE historical_evidence SET record_gzip = ? WHERE content_hash = 'artifact:large'",
  ).run(new Uint8Array([0, 1]));
  assert.throws(
    () => readArchivedRecord(db, "index_source_artifact", "artifact:large"),
    "Corrupt compressed evidence must fail visibly",
  );
  db.exec("ROLLBACK");
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
console.log("Evidence retention lifecycle checks passed.");
