/** Protect website contender identity, quality refresh, retired task costs, and failed-fetch cache preservation. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { loadSchemaSql } from "../src/model-atlas/database/schema";
import {
  getArenaAgentStats,
  processArenaAgentDatasetRows,
  processArenaAgentPageHtml,
} from "../src/model-atlas/sources/arena/agent";
import {
  arenaAgentRuntime,
  readArenaAgentRawCache,
} from "../src/model-atlas/sources/arena/agent-runtime";
import {
  ARENA_AGENT_DATASET_URL,
  arenaRefreshIsCurrent,
  fetchArenaDataset,
} from "../src/model-atlas/sources/arena/dataset";
import type { SourceSnapshots } from "../src/model-atlas/sources/types";

const sourceRow = {
  rank: 1,
  contenderName: "contenders/example-high-agent",
  model: "Example Model (high)",
  modelOrganization: "Test",
  avgScore: { value: 0.14 },
};
const payload = {
  arena: { slug: "agent" },
  snapshot: { rows: [sourceRow], lastUpdated: "2026-10-19T09:00:00.000Z" },
  costStats: {
    entries: [{ contenderName: sourceRow.contenderName, medianUsd: 6.19, pricedSampleCount: 100 }],
  },
};
const pageHtml = (value: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`;
const rows = processArenaAgentPageHtml(pageHtml(payload));

test("Agent website parser preserves contender identity and ignores retired task-cost telemetry", () => {
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.contender_name, sourceRow.contenderName);
  assert.equal(rows[0]?.reasoning_effort, "high");
  assert.equal(rows[0]?.score, 0.14);
  assert.equal(rows[0]?.cost_per_task_usd, null);
  assert.deepEqual(processArenaAgentPageHtml("<title>Just a moment...</title>"), []);
});

test("website cache retains quality while clearing old task costs and rejecting substituted source identities", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await loadSchemaSql());
    arenaAgentRuntime.write(db, {
      arenaAgentModelScoreRows: rows,
      fetchedAt: { arenaAgent: 1000 },
    } as unknown as SourceSnapshots);
    assert.deepEqual(readArenaAgentRawCache(db), { rows, fetchedAt: 1000 });
    db.exec("UPDATE arena_agent_raw_rows SET cost_per_task_usd = 6.19");
    assert.deepEqual(readArenaAgentRawCache(db), { rows, fetchedAt: 1000 });
    db.exec("UPDATE arena_agent_raw_rows SET url = 'https://example.com/alternate-data'");
    assert.equal(readArenaAgentRawCache(db), null);
  } finally {
    db.close();
  }
});

test("fresh website scores and ranks replace cached values, but a challenge preserves evidence and its timestamp", async (t) => {
  let response = new Response(
    pageHtml({
      ...payload,
      snapshot: {
        ...payload.snapshot,
        rows: [{ ...sourceRow, rank: 2, avgScore: { value: 0.19 } }],
      },
    }),
  );
  t.mock.method(globalThis, "fetch", async () => response);
  const status = {
    last_fetch_epoch_seconds: 1000,
    source_input_count: 1,
    cache_hit: false,
    refreshed: false,
  };
  const refreshed = await arenaAgentRuntime.snapshot(
    { rows, fetchedAt: 1000 },
    status,
    {},
    new Map(),
    2000,
  );
  assert.equal(refreshed.arenaAgentModelScoreRows[0]?.score, 0.19);
  assert.equal(refreshed.arenaAgentModelScoreRows[0]?.rank, 2);
  assert.equal(refreshed.arenaAgentModelScoreRows[0]?.cost_per_task_usd, null);
  response = new Response("<title>Just a moment...</title>", {
    status: 403,
    headers: { "cf-mitigated": "challenge" },
  });
  const failed = await arenaAgentRuntime.snapshot(
    { rows, fetchedAt: 1000 },
    status,
    {},
    new Map(),
    2000,
  );
  assert.deepEqual(failed.arenaAgentModelScoreRows, rows);
  assert.equal(failed.sourceStatus.fetchedAt, 1000);
});

const datasetRow = {
  model_name: "Example Model (High)",
  organization: "Test",
  score: 0.12,
  rank: 1,
  category: "overall",
  leaderboard_publish_date: "2026-10-16",
};
const datasetPage = (values: unknown[], offset = 0, total = values.length) => ({
  rows: values.map((row, index) => ({ row_idx: offset + index, row, truncated_cells: [] })),
  num_rows_total: total,
  partial: false,
});

test("Agent fallback preserves precision variants and rejects opaque qualifiers", () => {
  const baseModel = "NVIDIA-Nemotron-3.5-Super-VL-120B-A12B";
  const ordinary = { ...datasetRow, model_name: baseModel, organization: "NVIDIA", rank: 2 };
  const quantized = { ...ordinary, model_name: `${baseModel} (NVFP4)`, rank: 3 };
  const parsed = processArenaAgentDatasetRows([datasetRow, ordinary, quantized]);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1]?.base_model, baseModel);
  assert.equal(parsed[2]?.base_model, `${baseModel}-NVFP4`);
  assert.equal(parsed[2]?.model, quantized.model_name);
  assert.equal(parsed[2]?.reasoning_effort, null);
  assert.throws(
    () =>
      processArenaAgentDatasetRows([
        datasetRow,
        { ...ordinary, model_name: `${baseModel} (opaque configuration)` },
      ]),
    /Ambiguous Arena Agent dataset identity/,
  );
});

test("Agent tries the website first and labels fallback data with its own publication and source", async (t) => {
  const requested: string[] = [];
  let websiteWorks = true;
  let published = "2026-10-16";
  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    requested.push(String(url));
    if (String(url).startsWith("https://arena.ai/"))
      return websiteWorks
        ? new Response(pageHtml(payload))
        : new Response("challenge", { status: 403 });
    return new Response(
      JSON.stringify(datasetPage([{ ...datasetRow, leaderboard_publish_date: published }])),
    );
  });
  const site = await getArenaAgentStats();
  assert.equal(site.data[0]?.source_url, "https://arena.ai/leaderboard/agent");
  assert.equal(site.data[0]?.observed_at, "2026-10-19");
  assert.equal(requested.length, 1);
  websiteWorks = false;
  const fallback = await getArenaAgentStats();
  assert.equal(fallback.data[0]?.source_url, ARENA_AGENT_DATASET_URL);
  assert.equal(fallback.data[0]?.observed_at, "2026-10-16");
  assert.equal(fallback.data[0]?.cost_per_task_usd, null);
  assert.equal(requested.length, 3);
  const cached = { rows, fetchedAt: 1000 };
  const result = await arenaAgentRuntime.snapshot(
    cached,
    { last_fetch_epoch_seconds: 1000, source_input_count: 1, cache_hit: false, refreshed: false },
    {},
    new Map(),
    2000,
  );
  assert.deepEqual(result.arenaAgentModelScoreRows, rows);
  assert.equal(result.sourceStatus.fetchedAt, 1000);
  published = "2026-10-20";
  const newer = await arenaAgentRuntime.snapshot(
    cached,
    { last_fetch_epoch_seconds: 1000, source_input_count: 1, cache_hit: false, refreshed: false },
    {},
    new Map(),
    2000,
  );
  assert.equal(newer.arenaAgentModelScoreRows.length, 1);
  assert.equal(newer.arenaAgentModelScoreRows[0]?.source_url, ARENA_AGENT_DATASET_URL);
  assert.equal(newer.arenaAgentModelScoreRows[0]?.observed_at, "2026-10-20");
  assert.notEqual(newer.sourceStatus.fetchedAt, 1000);
});

test("publication guard prevents date downgrades and prefers the website within one day", () => {
  const site = { source_url: "https://arena.ai/leaderboard/agent", observed_at: "2026-10-19" };
  const fallback = { source_url: ARENA_AGENT_DATASET_URL, observed_at: "2026-10-19" };
  assert.equal(arenaRefreshIsCurrent([site], [fallback]), false);
  assert.equal(arenaRefreshIsCurrent([fallback], [site]), true);
  assert.equal(arenaRefreshIsCurrent([fallback], [fallback]), true);
  assert.equal(arenaRefreshIsCurrent([{ ...site, observed_at: null }], [fallback]), true);
  assert.equal(arenaRefreshIsCurrent([site], [{ ...fallback, observed_at: null }]), false);
  assert.equal(arenaRefreshIsCurrent([site], [{ ...fallback, observed_at: "2026-10-20" }]), true);
});

test("fallback pagination rejects partial and inconsistent pages", async (t) => {
  let pages: unknown[] = [
    datasetPage(
      Array.from({ length: 100 }, () => datasetRow),
      0,
      101,
    ),
    datasetPage([datasetRow], 100, 101),
  ];
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(pages.shift())));
  assert.equal((await fetchArenaDataset("agent")).length, 101);
  pages = [{ ...datasetPage([datasetRow]), partial: true }];
  await assert.rejects(fetchArenaDataset("agent"), /Incomplete/);
  pages = [
    datasetPage(
      Array.from({ length: 100 }, () => datasetRow),
      0,
      101,
    ),
    datasetPage([datasetRow], 100, 102),
  ];
  await assert.rejects(fetchArenaDataset("agent"), /Incomplete/);
});

test("Agent SQLite roundtrip preserves fallback publication and actual URL", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await loadSchemaSql());
    const fallbackRows = processArenaAgentDatasetRows([datasetRow]);
    arenaAgentRuntime.write(db, {
      arenaAgentModelScoreRows: fallbackRows,
      fetchedAt: { arenaAgent: 2000 },
    } as unknown as SourceSnapshots);
    assert.deepEqual(readArenaAgentRawCache(db), { rows: fallbackRows, fetchedAt: 2000 });
  } finally {
    db.close();
  }
});
