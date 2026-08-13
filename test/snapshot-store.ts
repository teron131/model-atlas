/** Verifies D1-only runtime reads, standalone publication guards, and batched database access. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { publishD1Snapshot } from "../src/model-atlas/database/d1";
import { createD1Usage, queryD1Batch, readD1Payload } from "../src/model-atlas/database/d1/client";
import { buildRawRowWritePlan } from "../src/model-atlas/database/d1/writes";
import {
  readDisplaySnapshotPayload,
  snapshotRuntime,
} from "../src/model-atlas/database/runtime-snapshot";

const differentialDb = new DatabaseSync(":memory:");
try {
  differentialDb.exec(`
    CREATE TABLE raw_rows (
      row_index INTEGER PRIMARY KEY,
      fetched_at_epoch_seconds INTEGER,
      value TEXT
    );
    INSERT INTO raw_rows VALUES (0, 100, 'same'), (1, 100, 'old'), (2, 100, 'gone');
  `);
  const plan = buildRawRowWritePlan(
    "raw_rows",
    {
      columns: ["row_index", "fetched_at_epoch_seconds", "value"],
      rows: [
        [0, 200, "same"],
        [1, 200, "new"],
        [3, 200, "added"],
      ],
    },
    [
      { row_index: 0, fetched_at_epoch_seconds: 100, value: "same" },
      { row_index: 1, fetched_at_epoch_seconds: 100, value: "old" },
      { row_index: 2, fetched_at_epoch_seconds: 100, value: "gone" },
    ],
  );
  assert.equal(
    plan.fitsAtomicBatch,
    true,
    "small raw D1 diffs should fit one atomic publication batch",
  );
  differentialDb.exec(plan.statements.join("\n"));
  assert.deepEqual(
    differentialDb
      .prepare("SELECT * FROM raw_rows ORDER BY row_index")
      .all()
      .map((row) => ({ ...row })),
    [
      { row_index: 0, fetched_at_epoch_seconds: 100, value: "same" },
      { row_index: 1, fetched_at_epoch_seconds: 200, value: "new" },
      { row_index: 3, fetched_at_epoch_seconds: 200, value: "added" },
    ],
    "raw D1 differential writes should leave identical rows untouched",
  );
  const oversizedPlan = buildRawRowWritePlan(
    "raw_rows",
    {
      columns: ["row_index", "fetched_at_epoch_seconds", "value"],
      rows: Array.from({ length: 2_100 }, (_, rowIndex) => [rowIndex, 300, `row-${rowIndex}`]),
    },
    [],
  );
  assert.equal(
    oversizedPlan.fitsAtomicBatch,
    false,
    "large raw-source churn should retain staged replacement instead of partial row writes",
  );
} finally {
  differentialDb.close();
}

const originalDatabasePath = process.env.MODEL_ATLAS_DATABASE_PATH;
const originalVercel = process.env.VERCEL;
const originalD1AccountId = process.env.D1_ACCOUNT_ID;
const originalD1DatabaseId = process.env.D1_DATABASE_ID;
const originalD1ApiToken = process.env.D1_API_TOKEN;
const originalSnapshotUrl = process.env.MODEL_ATLAS_SNAPSHOT_URL;
const originalFetch = globalThis.fetch;
try {
  delete process.env.MODEL_ATLAS_DATABASE_PATH;
  delete process.env.VERCEL;
  process.env.VERCEL = "1";
  delete process.env.D1_ACCOUNT_ID;
  delete process.env.D1_DATABASE_ID;
  delete process.env.D1_API_TOKEN;
  assert.equal(
    snapshotRuntime().hasD1SnapshotStore,
    false,
    "runtime D1 storage should be disabled when required Cloudflare settings are absent",
  );
  assert.equal(
    snapshotRuntime().requiresD1,
    true,
    "Vercel runtime should reject non-D1 snapshot fallbacks",
  );
  assert.deepEqual(
    snapshotRuntime().missingD1Environment,
    ["D1_ACCOUNT_ID", "D1_DATABASE_ID", "D1_API_TOKEN"],
    "missing D1 environment should report the canonical variable names",
  );
  process.env.MODEL_ATLAS_SNAPSHOT_URL = "https://example.com/snapshot.json";
  await assert.rejects(
    readDisplaySnapshotPayload,
    /Cloudflare D1 is required by the runtime/,
    "Vercel display reads must not fall back when D1 is unavailable",
  );
  await assert.rejects(
    publishD1Snapshot,
    /Cloudflare D1 is not configured/,
    "the standalone publisher must reject missing D1 configuration",
  );
  process.env.D1_ACCOUNT_ID = "account";
  process.env.D1_DATABASE_ID = "database";
  process.env.D1_API_TOKEN = "token";
  assert.equal(
    snapshotRuntime().hasD1SnapshotStore,
    true,
    "runtime D1 storage should accept canonical D1 variable names",
  );
  const requestBodies: unknown[] = [];
  let completedRunVisible = false;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      sql?: string;
      batch?: { sql?: string }[];
    };
    requestBodies.push(body);
    return Response.json({
      success: true,
      result:
        body.batch == null
          ? [
              {
                success: true,
                results: completedRunVisible
                  ? [
                      {
                        payload_json: JSON.stringify({
                          fetched_at_epoch_seconds: 1_800_000_000,
                          models: [],
                          metadata: {},
                        }),
                      },
                    ]
                  : [],
              },
            ]
          : body.batch.map((_, index) => ({
              success: true,
              results: [],
              meta: {
                rows_read: index + 1,
                rows_written: (index + 1) * 2,
                ...(index === 0 ? { timings: { sql_duration_ms: 0.25 } } : { duration: 0.5 }),
              },
            })),
    });
  };
  assert.equal(
    await readDisplaySnapshotPayload(),
    null,
    "production reads should return an empty D1 snapshot without starting a refresh",
  );
  assert.equal(
    requestBodies.length,
    1,
    "production display reads should issue only the completed-run query",
  );
  completedRunVisible = true;
  assert.deepEqual(
    (await readD1Payload())?.models,
    [],
    "D1 payload reads should assemble an empty completed snapshot",
  );
  assert.deepEqual(
    requestBodies[1],
    {
      sql: "SELECT payload_json FROM snapshot_payloads WHERE snapshot_key = 'public' LIMIT 1",
      params: [],
    },
    "D1 payload reads should fetch the completed materialized snapshot in one statement",
  );
  const usage = createD1Usage();
  await queryD1Batch([{ sql: "DELETE FROM example" }, { sql: "INSERT example" }], usage);
  assert.deepEqual(
    requestBodies[2],
    {
      batch: [
        { sql: "DELETE FROM example", params: [] },
        { sql: "INSERT example", params: [] },
      ],
    },
    "D1 publications should use one transactional REST batch",
  );
  assert.deepEqual(
    usage,
    {
      request_count: 1,
      statement_count: 2,
      rows_read: 3,
      rows_written: 6,
      sql_duration_ms: 0.75,
    },
    "D1 publication usage should aggregate Cloudflare billing and duration metadata",
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalDatabasePath == null) {
    delete process.env.MODEL_ATLAS_DATABASE_PATH;
  } else {
    process.env.MODEL_ATLAS_DATABASE_PATH = originalDatabasePath;
  }
  if (originalVercel == null) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
  restoreEnv("D1_ACCOUNT_ID", originalD1AccountId);
  restoreEnv("D1_DATABASE_ID", originalD1DatabaseId);
  restoreEnv("D1_API_TOKEN", originalD1ApiToken);
  restoreEnv("MODEL_ATLAS_SNAPSHOT_URL", originalSnapshotUrl);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value == null) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
