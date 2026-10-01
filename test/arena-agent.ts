/** Protect contender-matched median costs, persistence, and rolling-window refreshes without adding token telemetry. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { benchmarkMetricColumns, taskMetricColumns } from "../app/dashboard/table/models";
import { BENCHMARK_CATALOG } from "../src/model-atlas/benchmarks/registry";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import { PAYLOAD_ROW_GROUPS } from "../src/model-atlas/database/payload-rows";
import { loadSchemaSql } from "../src/model-atlas/database/schema";
import { observedResourceEvidenceCounts } from "../src/model-atlas/pipeline/scores/resource-metrics";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import { processArenaAgentPageHtml } from "../src/model-atlas/sources/arena/agent";
import {
  arenaAgentRuntime,
  readArenaAgentRawCache,
} from "../src/model-atlas/sources/arena/agent-runtime";
import {
  rawSourceCacheStatusFromRows,
  readRawSourceCacheStatus,
} from "../src/model-atlas/sources/cache/status";
import type { SourceSnapshots } from "../src/model-atlas/sources/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const row = (effort: string, rank: number) => ({
  rank,
  contenderName: `contenders/example-${effort}-agent`,
  model: `Example Model (${effort})`,
  modelOrganization: "Test",
  avgScore: { value: 0.14 / rank },
});
const highCost = {
  contenderName: "contenders/example-high-agent",
  medianUsd: 1.57,
  p25Usd: 0.45,
  p95Usd: 19.96,
  meanUsd: 1.1,
  totalSampleCount: 4510,
  pricedSampleCount: 4433,
  outputMtokPerTask: { medianMtok: 0.025948 },
};
const payload = {
  arena: { slug: "agent" },
  snapshot: { rows: [row("high", 1), row("low", 2), row("max", 3)] },
  costStats: {
    costWindowDays: 14,
    entries: [
      { ...highCost, contenderName: "contenders/example-low-agent", medianUsd: 0 },
      highCost,
    ],
  },
};
const pageHtml = (value: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`;
const rows = processArenaAgentPageHtml(pageHtml(payload));

test("Agent table headers stay compact and sort by their visible names", () => {
  const column = benchmarkMetricColumns.find((value) => value.benchmark === "arena_agent");
  const costColumn = taskMetricColumns.find((value) => value.key === "arenaAgentCost");
  assert.equal(column?.label, "Agent");
  assert.equal(costColumn?.label, "Agent$");
  assert.equal(costColumn?.tooltip?.title, "Arena Agent cost ↓");
  const qualityKeys = benchmarkMetricColumns.map((value) => value.benchmark);
  const costKeys = taskMetricColumns.map((value) => value.key);
  assert.ok(qualityKeys.indexOf("arena_agent") < qualityKeys.indexOf("agents_last_exam"));
  assert.ok(costKeys.indexOf("arenaAgentCost") < costKeys.indexOf("agentsLastExamCost"));
});

test("task cost uses the matched contender's median and never substitutes mean or output tokens", () => {
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.reasoning_effort, "high");
  assert.equal(rows[0]?.cost_per_task_usd, 1.57);
  assert.equal(rows[1]?.cost_per_task_usd, 0);
  assert.equal(rows[2]?.cost_per_task_usd, null);
  assert.deepEqual(buildTaskMetrics(null, { arena_agent: rows[0] }), {
    arena_agent: { cost: 1.57 },
  });
  assert.equal(
    buildTaskMetrics(null, { arena_agent: { ...rows[0], cost_per_task_usd: null } }),
    null,
  );
  const missingCosts = processArenaAgentPageHtml(
    pageHtml({ arena: payload.arena, snapshot: payload.snapshot }),
  );
  assert.equal(missingCosts.length, 3);
  assert.ok(missingCosts.every((value) => value.cost_per_task_usd === null));
  const invalid = processArenaAgentPageHtml(
    pageHtml({
      ...payload,
      costStats: {
        costWindowDays: 14,
        entries: [{ ...highCost, medianUsd: -1, pricedSampleCount: 0 }],
      },
    }),
  );
  assert.equal(invalid[0]?.cost_per_task_usd, null);
  const model = {
    ...minimalModelAtlasModel({ id: "test/example", name: "Example Model" }),
    benchmarks: { arena_agent: 0.14 },
    task_metrics: buildTaskMetrics(null, { arena_agent: rows[0] }),
  };
  assert.deepEqual(observedResourceEvidenceCounts(model, STAGE_CONFIG.scoring.benchmarkPortfolio), {
    cost: 1,
    time: 0,
  });
  assert.equal(BENCHMARK_CATALOG.arena_agent.presentation.taskMetricColumns?.[0]?.metric, "cost");
});

test("SQLite and payload source rows retain median task costs", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await loadSchemaSql());
    arenaAgentRuntime.write(db, {
      arenaAgentModelScoreRows: rows,
      fetchedAt: { arenaAgent: 1000 },
    } as unknown as SourceSnapshots);
    assert.deepEqual(readArenaAgentRawCache(db), { rows, fetchedAt: 1000 });
    assert.equal(readRawSourceCacheStatus(db, "arena_agent", 1001).cache_hit, true);
    const query = PAYLOAD_ROW_GROUPS.find((group) => group.key === "arenaAgentRows");
    assert.ok(query);
    const restored = db.prepare(query.sql).get();
    assert.equal(restored?.cost_per_task_usd, 1.57);
    assert.equal(Object.hasOwn(restored!, "cost_mean_usd"), false);
    db.exec("UPDATE arena_agent_raw_rows SET cost_per_task_usd = NULL");
    assert.equal(readRawSourceCacheStatus(db, "arena_agent", 1001).cache_hit, true);
    assert.equal(
      rawSourceCacheStatusFromRows("arena_agent", [{ fetched_at_epoch_seconds: 1000 }], 1001)
        .cache_hit,
      false,
    );
  } finally {
    db.close();
  }
});

test("new cost windows replace old telemetry while a failed fetch preserves the last measurement", async (t) => {
  let response = new Response(
    pageHtml({
      ...payload,
      costStats: {
        costWindowDays: 14,
        entries: [{ ...highCost, medianUsd: 2, totalSampleCount: 5000 }],
      },
    }),
  );
  t.mock.method(globalThis, "fetch", async () => response);
  const status = {
    last_fetch_epoch_seconds: 1000,
    source_input_count: 3,
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
  assert.equal(refreshed.arenaAgentModelScoreRows[0]?.cost_per_task_usd, 2);
  assert.equal(refreshed.arenaAgentModelScoreRows[0]?.score, rows[0]?.score);
  response = new Response("unavailable", { status: 503 });
  const failed = await arenaAgentRuntime.snapshot(
    { rows, fetchedAt: 1000 },
    status,
    {},
    new Map(),
    2000,
  );
  assert.equal(failed.arenaAgentModelScoreRows[0]?.cost_per_task_usd, 1.57);
  assert.equal(failed.sourceStatus.fetchedAt, 1000);
});
