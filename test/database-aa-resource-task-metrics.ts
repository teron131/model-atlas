/** Verifies benchmarks, task resources, change events and their history, and refresh-time benchmark health round-trip through checkpoint tables. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { readDatabasePayload } from "../src/model-atlas/database";
import {
  insertModelChangeDetails,
  insertModelScoreChanges,
  insertRefreshRuns,
} from "../src/model-atlas/database/change-log";
import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import { readDatabaseSnapshot } from "../src/model-atlas/database/sqlite-payload";
import {
  insertModelBenchmarks,
  insertModels,
  insertModelTaskMetrics,
} from "../src/model-atlas/database/writers/models";
import { finalizeBenchmarkRows } from "../src/model-atlas/pipeline/benchmark-rows/source-rows";
import {
  buildRefreshChanges,
  scoringMethodologyJson,
} from "../src/model-atlas/stats/payload/changes";
import { buildCurrentModelAtlasMetadata } from "../src/model-atlas/stats/payload/metadata";
import {
  preserveHighSignalSnapshotModels,
  SNAPSHOT_PRESERVATION_VERSION,
} from "../src/model-atlas/stats/payload/snapshot-preservation";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const databasePath = ".cache/test-database-aa-resource-task-metrics.sqlite";

await removeDatabaseFiles(databasePath);

try {
  const db = await openDatabase(databasePath);
  try {
    db.prepare("INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)").run(
      1_800_000_001,
    );
    const finalRows: ModelAtlasModel[] = [
      {
        ...minimalModelAtlasModel({ id: "example/aa-resource-model", name: "AA Resource Model" }),
        provider: "example",
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
        },
        scores: {
          intelligence_score: 90,
          agentic_score: 80,
          speed_score: 70,
          value_score: 65,
        },
      },
      {
        ...minimalModelAtlasModel({
          id: "example/sparse-resource-model",
          name: "Sparse Resource Model",
        }),
        provider: "example",
        logo: "https://example.com/logo.svg",
        confidence: { intelligence: null, agentic: null, speed: null, value: null },
        component_scores: {
          intelligence_score: 90,
          agentic_score: 80,
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

  const changeScoring = {
    ...payload.metadata.scoring,
    intelligence_benchmark_keys: ["hle", "agents_last_exam"],
    agentic_benchmark_keys: ["gdpval_normalized"],
  };
  const previousChangePayload = {
    ...payload,
    metadata: { ...payload.metadata, scoring: changeScoring },
  };
  const currentChangeModels = [
    {
      ...model,
      benchmarks: { hle: 0.95, agents_last_exam: 0.4 },
      scores: { ...model.scores, intelligence_score: 93, value_score: 66 },
    },
    { ...model, reasoning_effort: "low" },
    ...payload.models.filter((candidate) => candidate !== model),
  ];
  const {
    models: changedModels,
    refreshRunRows,
    modelScoreChangeRows,
    modelChangeDetailRows,
  } = buildRefreshChanges(
    1_800_000_100,
    1_800_000_001,
    previousChangePayload,
    scoringMethodologyJson(changeScoring),
    currentChangeModels,
    changeScoring,
  );
  // A payload read back from a checkpoint carries the current scoring, so only the stored fingerprint shows a methodology change; a checkpoint without one falls back to the payload.
  for (const [storedMethodology, changed] of [
    [scoringMethodologyJson(payload.metadata.scoring), true],
    [null, false],
  ] as const) {
    assert.equal(
      buildRefreshChanges(
        1_800_000_100,
        1_800_000_001,
        previousChangePayload,
        storedMethodology,
        currentChangeModels,
        changeScoring,
      ).refreshRunRows[0]?.methodology_changed,
      changed,
    );
  }
  const [updatedChange, entrantChange] = changedModels.map(({ latest_change }) => latest_change);
  assert.deepEqual(
    updatedChange?.scores.map(({ dimension, score_delta }) => [dimension, score_delta]),
    [
      ["intelligence", 3],
      ["value", 1],
    ],
    "An update records every score it materially moved, largest first",
  );
  assert.deepEqual(
    updatedChange?.inputs?.map(({ kind, key, before, after }) => [kind, key, before, after]),
    [
      ["result", "agents_last_exam", null, 0.4],
      ["result", "hle", 0.9, 0.95],
      ["result", "gdpval_normalized", 0.8, null],
    ],
    "Changed results list added, revised, then removed, and unchanged task resources stay out",
  );
  assert.equal(updatedChange?.entry, null);
  assert.equal(
    entrantChange?.entry,
    "variant",
    "A new effort of a listed model enters as a variant",
  );
  assert.deepEqual(entrantChange?.inputs, []);
  const changeTable = new DatabaseSync(databasePath);
  try {
    const writeChange = changeTable.prepare(
      "UPDATE models SET latest_change_json = ? WHERE model_id = ?",
    );
    writeChange.run(JSON.stringify(updatedChange), model.id);
    // Events stored before update-level fields carried only their headline move.
    writeChange.run(
      JSON.stringify({
        refresh_id: 1_799_000_000,
        dimension: "agentic",
        score_before: 70,
        score_after: 80,
        score_delta: 10,
        rank_before: 2,
        rank_after: 1,
        confidence_before: 40,
        confidence_after: 47,
        causes: [{ kind: "methodology", label: "Scoring methodology changed" }],
        rank_drivers: [],
      }),
      "example/sparse-resource-model",
    );
    // Beside the newest refresh, the log holds an update older than the window, an update logged before details, and a run the newest refresh replaced.
    const loggedMove = {
      model_id: "example/aa-resource-model",
      reasoning_effort: "xhigh",
      dimension: "agentic" as const,
      score_before: 78,
      score_after: 80,
      score_delta: 2,
      rank_before: 2,
      rank_after: 1,
      confidence_before: 47,
      confidence_after: 47,
      causes: [],
      rank_drivers: [],
    };
    const loggedRun = { methodology_changed: false, model_change_count: 1, score_change_count: 1 };
    insertRefreshRuns(changeTable, [
      { ...loggedRun, refresh_id: 1_797_000_000, previous_refresh_id: null },
      { ...loggedRun, refresh_id: 1_800_000_001, previous_refresh_id: 1_797_000_000 },
      { ...loggedRun, refresh_id: 1_800_000_050, previous_refresh_id: 1_800_000_001 },
      ...refreshRunRows,
    ]);
    insertModelScoreChanges(changeTable, [
      { ...loggedMove, refresh_id: 1_797_000_000 },
      { ...loggedMove, refresh_id: 1_800_000_001 },
      { ...loggedMove, refresh_id: 1_800_000_050, dimension: "value" },
      ...modelScoreChangeRows,
    ]);
    insertModelChangeDetails(changeTable, modelChangeDetailRows);
  } finally {
    changeTable.close();
  }
  const [storedChange, legacyChange] = readDatabasePayload(databasePath).models.map(
    ({ latest_change }) => latest_change,
  );
  assert.deepEqual(storedChange, updatedChange);
  assert.deepEqual(
    legacyChange && {
      scores: legacyChange.scores.map(({ dimension }) => dimension),
      inputs: legacyChange.inputs,
      entry: legacyChange.entry,
      methodology_changed: legacyChange.methodology_changed,
    },
    { scores: ["agentic"], inputs: null, entry: null, methodology_changed: true },
    "A legacy event reads as its headline move with its inputs unrecorded",
  );
  assert.deepEqual(
    readDatabasePayload(databasePath).models.find(({ id }) => id === model.id)?.recent_changes,
    [
      { refresh_id: 1_800_000_001, dimension: "agentic", score_delta: 2 },
      { refresh_id: 1_800_000_100, dimension: "intelligence", score_delta: 3 },
    ],
    "Recent changes follow the newest refresh's chain inside the window, leaving out a replaced run and an older update",
  );
  const [variantHistory, ...otherHistory] = readDatabaseSnapshot(databasePath).changeHistory;
  assert.deepEqual(
    otherHistory.map(({ model_id, reasoning_effort }) => [model_id, reasoning_effort]),
    [["example/sparse-resource-model", null]],
    "Only listed variants publish their history, so the unlisted low effort stays out",
  );
  assert.equal(variantHistory?.updates[0]?.inputs, null);
  assert.deepEqual(
    variantHistory?.updates[1],
    updatedChange,
    "The newest logged update reads back as the model's latest change",
  );

  const refreshed = buildCurrentModelAtlasMetadata({
    models: payload.models,
    healthModels: payload.models,
    sourceRowsByKey: finalizeBenchmarkRows([
      {
        key: "hle",
        id: "example/aa-resource-model",
        label: "AA Resource Model",
        reasoningEffort: "xhigh",
        value: 0.5,
        version: "2",
      },
    ]),
  });
  const metadataTable = new DatabaseSync(databasePath);
  try {
    metadataTable
      .prepare(
        "UPDATE snapshot_metadata SET benchmark_update_health_json = ?, benchmark_versions_json = ?",
      )
      .run(
        JSON.stringify(refreshed.benchmark_update_health),
        JSON.stringify(refreshed.benchmark_versions),
      );
  } finally {
    metadataTable.close();
  }
  const restoredMetadata = readDatabasePayload(databasePath).metadata;
  assert.equal(restoredMetadata.benchmark_update_health?.hle?.observed_count, 1);
  assert.deepEqual(
    restoredMetadata.benchmark_update_health,
    refreshed.benchmark_update_health,
    "Payload reads report the benchmark health computed from source rows at refresh",
  );
  assert.deepEqual(restoredMetadata.benchmark_versions, { hle: "2" });

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
          degraded.models,
          previous,
          STAGE_CONFIG.snapshotPreservation,
          STAGE_CONFIG.scoring,
        )[0]?.scores.intelligence_score,
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
