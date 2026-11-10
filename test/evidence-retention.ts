/** A refresh archives only evidence its checkpoint did not already hold: cache freshness and row order add nothing, and a correction adds only the corrected record. */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { evidenceFingerprints, newEvidence } from "../src/model-atlas/database/archive";
import { openDatabase } from "../src/model-atlas/database/schema";

type EvidenceLine = { source_table: string; record: Record<string, unknown> };
const parse = (jsonl: string) =>
  jsonl
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as EvidenceLine);

await mkdir(".cache", { recursive: true });
const directory = await mkdtemp(".cache/evidence-retention-");
const path = join(directory, "checkpoint.sqlite");
const db = await openDatabase(path);
try {
  db.exec(`
    CREATE TABLE retained_raw_rows (row_index INTEGER, fetched_at_epoch_seconds INTEGER, model TEXT, value REAL);
    INSERT INTO retained_raw_rows VALUES (0, 1789000000, 'Source model', 0.6), (1, 1789000000, 'Source model', 0.6);
    INSERT INTO models (row_index, model_id, provider_id, name, reasoning_effort, release_date, intelligence_index) VALUES (0, 'lab/model', 'lab', 'Source model', 'high', '2025-01-01', 40);
    INSERT INTO model_benchmarks (model_row_index, benchmark_key, value, observed_at) VALUES (0, 'hle', 0.3, '2026-09-01');
    INSERT INTO model_task_metrics (model_row_index, source_key, cost, observed_at) VALUES (0, 'hle', 2, '2026-09-01');
  `);
  const seeded = parse(newEvidence(path, new Set()));
  assert.deepEqual(
    seeded.map((line) => line.source_table),
    ["benchmark_catalog", "retained_raw_rows", "models"],
    "Identical rows archive once, after the catalog that interprets them",
  );
  assert.deepEqual(seeded[1]!.record, { model: "Source model", value: 0.6 });
  const model = seeded[2]!.record;
  assert.equal(model.model_id, "lab/model");
  assert.equal(model.intelligence_index, 40);
  assert.deepEqual(model.benchmarks, [
    { benchmark_key: "hle", value: 0.3, observed_at: "2026-09-01" },
  ]);
  assert.equal((model.task_metrics as { cost: number }[])[0]!.cost, 2);

  const archived = evidenceFingerprints(path);
  db.exec(
    "UPDATE retained_raw_rows SET row_index = row_index + 10, fetched_at_epoch_seconds = 1789001000",
  );
  assert.deepEqual(
    parse(newEvidence(path, archived)).map((line) => line.source_table),
    ["benchmark_catalog"],
    "Cache freshness and row order do not create evidence",
  );
  db.exec("UPDATE retained_raw_rows SET value = 0.8 WHERE row_index = 10");
  assert.deepEqual(
    parse(newEvidence(path, archived)).slice(1),
    [{ source_table: "retained_raw_rows", record: { model: "Source model", value: 0.8 } }],
    "A source correction archives only the corrected record",
  );
  db.exec(
    "INSERT INTO refresh_runs (refresh_id, previous_refresh_id, methodology_changed, model_change_count, score_change_count) VALUES (1789001000, NULL, 0, 0, 0)",
  );
  assert.deepEqual(
    parse(newEvidence(path, archived))
      .slice(1)
      .filter((line) => line.source_table === "refresh_runs")
      .map((line) => line.record.refresh_id),
    [1789001000],
    "A change-log entry is archived as it is added, before the checkpoint's window drops it",
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
console.log("Evidence retention checks passed.");
