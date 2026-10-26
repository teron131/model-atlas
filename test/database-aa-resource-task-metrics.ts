/** Verifies benchmarks and task resources round-trip through normalized final-model tables. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { readDatabasePayload } from "../src/model-atlas/database";
import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import {
  insertModelBenchmarks,
  insertModels,
  insertModelTaskMetrics,
} from "../src/model-atlas/database/writers/models";
import {
  preserveHighSignalSnapshotModels,
  SNAPSHOT_PRESERVATION_VERSION,
} from "../src/model-atlas/stats/payload/snapshot-preservation";

const databasePath = ".cache/test-database-aa-resource-task-metrics.sqlite";

await removeDatabaseFiles(databasePath);

try {
  const db = await openDatabase(databasePath);
  try {
    db.prepare("INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)").run(
      1_800_000_001,
    );
    const finalRows = [
      {
        id: "example/aa-resource-model",
        provider: "example",
        name: "AA Resource Model",
        reasoning_effort: "xhigh",
        logo: "https://example.com/logo.svg",
        modalities: { input: ["text", "pdf", "speech"], output: ["text", "image"] },
        benchmarks: { hle: 0.9, gdpval_normalized: 0.8 },
        benchmark_dates: { hle: "2026-07-30", gdpval_normalized: "2026-07-30" },
        task_metrics: {
          artificial_analysis: {
            cost: 9,
            seconds: 90,
            output_tokens: 900,
            observed_at: "2026-07-30",
          },
          hle: {
            cost: 0.1,
            seconds: 10,
            tokens: 100,
            input_tokens: 40,
            output_tokens: 60,
            observed_at: "2026-07-30",
          },
          gdpval_normalized: {
            cost: 0.2,
            seconds: 20,
            tokens: 200,
            input_tokens: 80,
            output_tokens: 120,
            observed_at: "2026-07-30",
          },
          arc_agi_3: {
            cost: 20_657.37,
            observed_at: "2026-07-30",
          },
          arc_agi_3__source_a: {
            quality: 0.62,
            cost: 8.63,
            observed_at: "2026-07-30",
          },
        },
        confidence: {
          intelligence: 0.83,
          agentic: 0.47,
          speed: 0.72,
          value: 0.61,
        },
        component_scores: {
          intelligence_score: 90,
          agentic_score: 80,
          speed_score: 70,
        },
        scores: {
          intelligence_score: 90,
          agentic_score: 80,
          speed_score: 70,
          value_score: 65,
        },
      },
      {
        id: "example/sparse-resource-model",
        provider: "example",
        name: "Sparse Resource Model",
        logo: "https://example.com/logo.svg",
        component_scores: {
          intelligence_score: 90,
          agentic_score: 80,
          speed_score: null,
        },
        scores: {
          intelligence_score: 90,
          agentic_score: 80,
          speed_score: null,
          value_score: null,
        },
      },
    ];
    insertModels(db, finalRows);
    insertModelBenchmarks(db, finalRows);
    insertModelTaskMetrics(db, finalRows);
    assert.equal(
      db.prepare("SELECT reasoning_effort FROM models").get()?.reasoning_effort,
      "xhigh",
    );
  } finally {
    db.close();
  }

  const payload = readDatabasePayload(databasePath);
  assert.equal(payload.models.length, 2);
  const model = payload.models.find((candidate) => candidate.id === "example/aa-resource-model");
  assert.deepEqual(
    model?.modalities,
    { input: ["text", "pdf", "speech"], output: ["text", "image"] },
    "Published models keep every source modality, including outputs",
  );
  assert.equal(
    payload.models.find((candidate) => candidate.id === "example/sparse-resource-model")
      ?.modalities,
    null,
  );
  assert.deepEqual(model?.task_metrics?.hle, {
    cost: 0.1,
    observed_cost: 0.1,
    seconds: 10,
    tokens: 100,
    input_tokens: 40,
    output_tokens: 60,
    observed_at: "2026-07-30",
    cost_price_ratio: 1,
  });
  assert.deepEqual(model?.task_metrics?.gdpval_normalized, {
    cost: 0.2,
    observed_cost: 0.2,
    seconds: 20,
    tokens: 200,
    input_tokens: 80,
    output_tokens: 120,
    observed_at: "2026-07-30",
    cost_price_ratio: 1,
  });
  assert.deepEqual(model?.task_metrics?.arc_agi_3, {
    cost: 20_657.37,
    observed_cost: 20_657.37,
    observed_at: "2026-07-30",
    cost_price_ratio: 1,
  });
  assert.deepEqual(model?.task_metrics?.arc_agi_3__source_a, {
    quality: 0.62,
    cost: 8.63,
    observed_cost: 8.63,
    observed_at: "2026-07-30",
    cost_price_ratio: 1,
  });
  assert.deepEqual(model?.confidence, {
    intelligence: 0.83,
    agentic: 0.47,
    speed: 0.72,
    value: 0.61,
  });
  assert.deepEqual(
    payload.models.find((candidate) => candidate.id === "example/sparse-resource-model")?.scores,
    {
      intelligence_score: 90,
      agentic_score: 80,
      speed_score: null,
      value_score: null,
    },
    "database payloads should preserve models without optional resource scores",
  );
  assert.ok(model);
  const degraded = {
    ...payload,
    models: [
      {
        ...model,
        benchmarks: {},
        scores: { ...model.scores, intelligence_score: 50, speed_score: null },
      },
    ],
  };
  const checkpoint = new DatabaseSync(databasePath);
  try {
    for (const version of [
      null,
      SNAPSHOT_PRESERVATION_VERSION - 1,
      SNAPSHOT_PRESERVATION_VERSION,
    ]) {
      checkpoint
        .prepare("UPDATE snapshot_metadata SET snapshot_preservation_version = ?")
        .run(version);
      const previous = readDatabasePayload(databasePath);
      assert.equal(previous.metadata.scoring.snapshot_preservation_version, version);
      assert.equal(
        preserveHighSignalSnapshotModels(
          degraded,
          previous,
          STAGE_CONFIG.snapshotPreservation,
          STAGE_CONFIG.scoring,
        ).models[0]?.scores.intelligence_score,
        version === SNAPSHOT_PRESERVATION_VERSION ? 90 : 50,
        "Only rows built under the current policy can restore a degraded model after checkpoint read",
      );
    }
    checkpoint.exec("ALTER TABLE snapshot_metadata DROP COLUMN snapshot_preservation_version");
    assert.equal(
      readDatabasePayload(databasePath).metadata.scoring.snapshot_preservation_version,
      null,
      "A checkpoint predating version storage must remain unknown before schema migration",
    );
  } finally {
    checkpoint.close();
  }
} finally {
  await removeDatabaseFiles(databasePath);
}
