/** Verify current WebDev ratings, configuration identity, baseline display, and quality-only persistence. */

import assert from "node:assert/strict";

import {
  benchmarkDisplayValue,
  benchmarkMetricColumns,
  dedupeDisplayModels,
} from "../app/dashboard/table/models";
import {
  type BenchmarkObservationRow,
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
  isCanonicalBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../src/model-atlas/benchmarks/registry";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import { processArenaWebDevPageHtml } from "../src/model-atlas/sources/arena/webdev";
import {
  insertBenchmarkObservationRows,
  readBenchmarkObservationRawCache,
} from "../src/model-atlas/sources/observations/cache";
import { benchmarkObservationSource } from "../src/model-atlas/sources/observations/load";
import {
  benchmarkObservationRowKey,
  snapshotSourceRows,
} from "../src/model-atlas/sources/snapshots/row-snapshot";
import type { SourceSnapshots } from "../src/model-atlas/sources/types";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";
import { SnapshotRowCollector } from "./model-atlas-fixtures";

const entry = {
  rank: 1,
  modelKey: "gpt-6-astra-max-code-codex-harness",
  modelDisplayName: "gpt-6-astra-max",
  modelOrganization: "OpenAI",
  rating: 1789.1,
  ratingLower: 1778.7,
  ratingUpper: 1799.5,
  rankLower: 2,
  rankUpper: 2,
  votes: 5918,
  inputPricePerMillion: 10,
  outputPricePerMillion: 50,
  releaseType: null,
};
const page = (entries: unknown[], category = "overall", routeSlug = "code/webdev") => {
  const payload = {
    arena: { slug: "code", routeSlug },
    leaderboard: {
      leaderboardSlug: category,
      params: { category },
      voteCutoffISOString: "2026-09-30T14:00:00.000Z",
      entries,
    },
  };
  return `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(payload))}])</script>`;
};
const rows = processArenaWebDevPageHtml(
  page([
    entry,
    {
      ...entry,
      modelKey: "gpt-6-astra-high-webdev",
      modelDisplayName: "gpt-6-astra-high (codex-harness)",
      rank: 2,
      rating: 1700,
    },
    {
      ...entry,
      modelKey: "qwen-public-id",
      modelDisplayName: "qwen3.8-max",
      modelOrganization: "Alibaba",
      rank: 3,
      rating: 1600,
    },
    {
      ...entry,
      modelKey: "gpt-codex-a",
      modelDisplayName: "gpt-5.3-codex (codex-harness)",
      rank: 4,
    },
    {
      ...entry,
      modelKey: "gpt-codex-b",
      modelDisplayName: "gpt-5.3-codex (codex-harness)",
      rank: 5,
      rating: 1400,
    },
    { ...entry, rank: null, votes: 0 },
    { ...entry, rating: null },
    entry,
  ]),
);
assert.equal(rows.length, 5, "Duplicate Flight copies must not duplicate source configurations");
assert.equal(rows[0]?.base_model, "gpt-6-astra");
assert.equal(rows[0]?.reasoning_effort, "max");
assert.equal(
  rows[0]?.metadata.harness,
  "codex-harness",
  "Hidden source-ID harness labels must survive parsing",
);
assert.equal(rows[0]?.metadata.rating_lower, 1778.7);
assert.equal(rows[0]?.observed_at, "2026-09-30");
assert.equal(rows[0]?.canonical_value, 1789.1);
assert.equal(rows[0]?.cost, undefined);
assert.equal(rows[0]?.tokens_per_task, undefined);
assert.equal(
  buildTaskMetrics(null, { arena_webdev: rows[0] }),
  null,
  "Token list prices must never become task resources",
);
assert.equal(
  rows[2]?.base_model,
  "qwen3.8-max",
  "Max is a Qwen product tier rather than an inferred effort",
);
assert.equal(rows[2]?.reasoning_effort, null);
assert.equal(rows[3]?.metadata.assignment_eligible, false);
assert.equal(rows[4]?.metadata.assignment_eligible, false);
const lookup = buildBenchmarkObservationLookup(rows);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "max", lookup)?.canonical_value, 1789.1);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "high", lookup)?.canonical_value, 1700);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "low", lookup), null);
assert.equal(
  findBenchmarkObservation(["gpt-5.3-codex"], null, lookup),
  null,
  "Ambiguous configurations must not be picked by score or row order",
);
assert.deepEqual(processArenaWebDevPageHtml(page([entry], "fullstack")), []);
assert.deepEqual(processArenaWebDevPageHtml(page([entry], "overall", "code/webdev-legacy")), []);
const identityRows = processArenaWebDevPageHtml(
  page([
    {
      ...entry,
      modelKey: "qwen-dated",
      modelDisplayName: "qwen3.8-max-0902",
      modelOrganization: "Alibaba",
    },
    {
      ...entry,
      modelKey: "claude-budget",
      modelDisplayName: "claude-opus-4-5-20251101-high-32k",
      modelOrganization: "Anthropic",
    },
    {
      ...entry,
      modelKey: "gemini-minimal",
      modelDisplayName: "gemini-3-flash (thinking-minimal)",
      modelOrganization: "Google",
    },
  ]),
);
assert.equal(identityRows[0]?.base_model, "qwen3.8-max-0902");
assert.equal(identityRows[1]?.base_model, "claude-opus-4-5-20251101");
assert.equal(identityRows[1]?.reasoning_effort, "high");
assert.equal(identityRows[1]?.metadata.effort_token_budget, "32k");
assert.equal(identityRows[2]?.base_model, "gemini-3-flash");
assert.equal(identityRows[2]?.reasoning_effort, "minimal");

const definition = BENCHMARK_CATALOG.arena_webdev;
assert.equal(definition.scoring.group, "baseline");
assert.equal(definition.scoring.benchmarkImportance, 1);
assert.deepEqual(definition.scoring.dimensionLoadings, { intelligence: 0, agentic: 1 });
assert.equal("resources" in definition, false);
assert.equal(STAGE_CONFIG.scoring.agenticBenchmarkKeys.includes("arena_webdev"), false);
assert.ok(STAGE_CONFIG.scoring.agenticBenchmarkDisplayKeys.includes("arena_webdev"));
const column = benchmarkMetricColumns.find((value) => value.benchmark === "arena_webdev");
assert.ok(column);
assert.equal(column.label, "WebDev");
const tableKeys = benchmarkMetricColumns.map((value) => value.benchmark);
assert.ok(tableKeys.indexOf("voxelbench") < tableKeys.indexOf("arena_webdev"));
assert.ok(tableKeys.indexOf("weirdml_v3") < tableKeys.indexOf("arena_webdev"));
const displayRows = dedupeDisplayModels(
  [1000, 1500, 2000].map((rating, index) => ({
    id: `webdev-example-${index}`,
    name: `WebDev Example ${index}`,
    benchmarks: { arena_webdev: rating },
  })) as unknown as ModelAtlasModel[],
);
assert.deepEqual(
  displayRows.map((row) => benchmarkDisplayValue(row, column)),
  [0, 50, 100],
);

const binding = BENCHMARK_OBSERVATION_BINDINGS.find((value) => value.benchmark === "arena_webdev");
assert.ok(binding);
const refreshed = {
  ...rows[0]!,
  canonical_value: 1700,
  metadata: { ...rows[0]!.metadata, votes: 6500 },
};
const refreshConfig = {
  source: "arena_webdev" as const,
  cached: { rows: [rows[0]!], fetchedAt: 100 },
  status: {
    cache_hit: false,
    refreshed: false,
    last_fetch_epoch_seconds: 100,
    source_input_count: 1,
  },
  options: {},
  previousMissingSince: new Map<string, number>(),
  nowEpochSeconds: 200,
  rowKey: benchmarkObservationRowKey,
  rowLabel: (row: BenchmarkObservationRow) => row.model,
  mergeRow: benchmarkObservationSource(binding).mergeRow,
};
const updated = await snapshotSourceRows({
  ...refreshConfig,
  fetchRows: async () => ({ fetched_at_epoch_seconds: 200, data: [refreshed] }),
});
assert.deepEqual(
  updated.rows,
  [refreshed],
  "Rating decreases and their evidence must replace the previous voting snapshot together",
);
const failed = await snapshotSourceRows({
  ...refreshConfig,
  fetchRows: async () => ({ fetched_at_epoch_seconds: null, data: [] }),
});
assert.deepEqual(failed.rows, [rows[0]]);
const collector = new SnapshotRowCollector();
insertBenchmarkObservationRows(collector, {
  ...Object.fromEntries(BENCHMARK_OBSERVATION_BINDINGS.map((value) => [value.sourceRowsKey, []])),
  arenaWebDevRows: rows,
  fetchedAt: { arenaWebDev: 1_790_804_400 },
} as unknown as SourceSnapshots);
const restored = readBenchmarkObservationRawCache(
  collector.records(BENCHMARK_OBSERVATION_RAW_TABLE),
  binding,
);
assert.deepEqual(restored?.rows, rows);
assert.equal(restored?.rows.filter(isCanonicalBenchmarkObservation).length, 3);
console.log("Arena WebDev checks passed");
