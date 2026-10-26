/** Verify cached source preservation merges equivalent live rows without duplicating model identities. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  type ArtificialAnalysisBenchmarkResourceRow,
} from "../src/model-atlas/sources/artificial-analysis/benchmark-resources";
import {
  ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
  artificialAnalysisModelId,
  processArtificialAnalysisLeaderboardRows,
} from "../src/model-atlas/sources/artificial-analysis/leaderboard";
import {
  artificialAnalysisBenchmarkResourceSnapshot,
  artificialAnalysisBenchmarkResourceSourceKey,
  mergeArtificialAnalysisRow,
} from "../src/model-atlas/sources/artificial-analysis/snapshot";
import {
  type DeepSWERawLeaderboardRow,
  preferredDeepSWELeaderboardRows,
} from "../src/model-atlas/sources/deep-swe/leaderboard";
import { processFrontierCodePayload } from "../src/model-atlas/sources/frontier-code/leaderboard";
import {
  mergeCachedSourceRows,
  snapshotRows,
  snapshotRowsWithStates,
  withoutSupersededEditions,
} from "../src/model-atlas/sources/snapshots/policy";
import { snapshotSourceRows } from "../src/model-atlas/sources/snapshots/row-snapshot";

type ArtificialAnalysisFixtureRow = {
  model_id: string;
  name: string;
  intelligenceIndex?: number;
  deprecated?: boolean;
};

const cachedRows: ArtificialAnalysisFixtureRow[] = [
  {
    model_id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    intelligenceIndex: 64.9,
  },
  {
    model_id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    intelligenceIndex: 61.4,
  },
];

const fetchedRows: ArtificialAnalysisFixtureRow[] = [
  {
    model_id: "anthropic/claude-fable-5",
    name: "Claude Fable 5 (not currently available)",
    deprecated: true,
  },
  {
    model_id: "openai/gpt-5-5",
    name: "GPT-5.5 (xHigh)",
    intelligenceIndex: 60.2,
  },
];

const rowKey = (row: ArtificialAnalysisFixtureRow) => row.model_id;
const mergeArtificialAnalysisFixtureRow = (
  cachedRow: ArtificialAnalysisFixtureRow,
  fetchedRow: ArtificialAnalysisFixtureRow,
) =>
  mergeArtificialAnalysisRow(
    cachedRow as Record<string, unknown>,
    fetchedRow as Record<string, unknown>,
    STAGE_CONFIG.scoring,
  ) as ArtificialAnalysisFixtureRow;

const cachedArtificialAnalysisRow = {
  model_id: "openai/gpt-5-6-sol",
  name: "GPT-5.6 Sol",
  intelligence_index: 58.8,
};
const liveArtificialAnalysisRow = {
  id: "live-page-uuid",
  slug: "gpt-5-6-sol",
  modelCreatorSlug: "openai",
  name: "GPT-5.6 Sol (Adaptive Reasoning, Max Effort)",
  intelligenceIndex: 58.9,
};
const mergedArtificialAnalysisShapes = mergeCachedSourceRows(
  [cachedArtificialAnalysisRow],
  [liveArtificialAnalysisRow],
  artificialAnalysisModelId,
);
assert.equal(
  mergedArtificialAnalysisShapes.length,
  1,
  "Persisted and live Artificial Analysis shapes for one model must merge into one source row",
);

// Cached rows can carry projected fields as well as raw aliases; a refresh must replace both together.
const refreshedIndex = mergeArtificialAnalysisRow(
  {
    model_id: "openai/gpt-5-5-high",
    name: "GPT-5.5 (high)",
    intelligenceIndex: 54.67,
    intelligence_index: 54.67,
    intelligence: { intelligence_index: 54.67 },
    cost_per_task: 0.82,
    output_tokens_per_task: 10_717,
    intelligence_index_cost: { cost_per_task: 0.82, output_tokens_per_task: 10_717 },
  },
  {
    slug: "gpt-5-5-high",
    deprecated: true,
    modelCreatorSlug: "openai",
    shortName: "GPT-5.5 (high)",
    intelligenceIndex: 37.29,
    intelligenceIndexCostPerTask: { cost: { total: 1.54 } },
    intelligenceIndexOutputTokensPerTask: null,
  },
  STAGE_CONFIG.scoring,
);
const refreshedIndexProjection = processArtificialAnalysisLeaderboardRows([refreshedIndex], {
  selectedColumns: [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
})[0]!;
assert.deepEqual(
  refreshedIndexProjection.intelligence,
  {
    intelligence_index: 37.29,
    agentic_index: null,
    coding_index: null,
    omniscience_index: null,
  },
  "An AA refresh must adopt a revised index even when it decreases",
);
const refreshedCost = refreshedIndexProjection.intelligence_index_cost as Record<string, unknown>;
assert.equal(refreshedCost.cost_per_task, 1.54);
assert.equal(
  refreshedCost.output_tokens_per_task,
  null,
  "Missing current telemetry must not reuse measurements from the superseded index",
);

const refreshedArtificialAnalysisIdentity = mergeArtificialAnalysisRow(
  {
    model_id: "google/gemini-3-5-flash",
    name: "Gemini 3.5 Flash",
    shortName: "Gemini 3.5 Flash",
    short_name: "Gemini 3.5 Flash (medium)",
    intelligenceIndex: 51.9,
  },
  {
    model_id: "google/gemini-3-5-flash",
    name: "Gemini 3.5 Flash (high)",
    shortName: "Gemini 3.5 Flash",
  },
  STAGE_CONFIG.scoring,
);
assert.equal(
  refreshedArtificialAnalysisIdentity.name,
  "Gemini 3.5 Flash (high)",
  "AA refreshes should adopt current full names so newly exposed effort labels reach the parser",
);
assert.equal(refreshedArtificialAnalysisIdentity.shortName, "Gemini 3.5 Flash");
assert.equal(refreshedArtificialAnalysisIdentity.short_name, undefined);
assert.equal(
  refreshedArtificialAnalysisIdentity.intelligenceIndex,
  undefined,
  "Available rows must not retain withdrawn scores",
);

const mergedRows = mergeCachedSourceRows(
  cachedRows,
  fetchedRows,
  rowKey,
  mergeArtificialAnalysisFixtureRow,
);

assert.deepEqual(
  mergedRows.map((row) => row.model_id),
  ["anthropic/claude-fable-5", "anthropic/claude-opus-4-6", "openai/gpt-5-5"],
  "Fetched rows should fill matching rows, append new rows, and preserve cached rows missing from the fetch",
);
assert.equal(
  mergedRows[0]?.name,
  "Claude Fable 5",
  "AA unavailable shell rows should not overwrite cached score-bearing rows with the same model id",
);
assert.equal(mergedRows[0]?.deprecated, undefined);
assert.equal(mergedRows[0]?.intelligenceIndex, 64.9);
assert.equal(
  mergedRows[1]?.name,
  "Claude Opus 4.6",
  "Rows missing from a refreshed source should remain cached by default",
);

assert.deepEqual(
  snapshotRows(cachedRows, [], null, {}, rowKey),
  cachedRows,
  "Unavailable sources with no usable fetched rows should keep cached rows",
);
assert.deepEqual(
  snapshotRows(
    cachedRows,
    fetchedRows,
    1_800_000_000,
    {},
    rowKey,
    mergeArtificialAnalysisFixtureRow,
  ).map((row) => row.model_id),
  ["anthropic/claude-fable-5", "anthropic/claude-opus-4-6", "openai/gpt-5-5"],
  "Normal refreshes should not remove cached rows absent from the fetch",
);
assert.deepEqual(
  snapshotRows(cachedRows, fetchedRows, 1_800_000_000, { replaceSourceRows: true }, rowKey).map(
    (row) => row.model_id,
  ),
  ["anthropic/claude-fable-5", "openai/gpt-5-5"],
  "Manual replace mode should allow pruning rows absent from the source",
);

const quarantinedSnapshot = snapshotRowsWithStates({
  source: "artificial_analysis",
  cachedRows,
  fetchedRows,
  fetchedAtEpochSeconds: 1_800_000_000,
  options: {},
  rowKey,
  rowLabel: (row) => row.name,
  mergeRow: mergeArtificialAnalysisFixtureRow,
  previousMissingSince: new Map(),
  nowEpochSeconds: 1_800_000_123,
});

assert.deepEqual(
  quarantinedSnapshot.states.map((row) => ({
    key: row.row_key,
    status: row.status,
    missingSince: row.missing_from_source_since_epoch_seconds,
  })),
  [
    {
      key: "anthropic/claude-fable-5",
      status: "active",
      missingSince: null,
    },
    {
      key: "anthropic/claude-opus-4-6",
      status: "quarantined_missing_from_source",
      missingSince: 1_800_000_123,
    },
    {
      key: "openai/gpt-5-5",
      status: "active",
      missingSince: null,
    },
  ],
);

const continuedQuarantineSnapshot = snapshotRowsWithStates({
  source: "artificial_analysis",
  cachedRows,
  fetchedRows: [],
  fetchedAtEpochSeconds: null,
  options: {},
  rowKey,
  rowLabel: (row) => row.name,
  previousMissingSince: new Map([["anthropic/claude-opus-4-6", 1_800_000_123]]),
  nowEpochSeconds: 1_800_000_999,
});

assert.equal(
  continuedQuarantineSnapshot.states.find((row) => row.row_key === "anthropic/claude-opus-4-6")
    ?.missing_from_source_since_epoch_seconds,
  1_800_000_123,
  "Existing quarantine timestamps should survive source outages",
);

const effortResourceRow = (
  reasoningEffort: string,
  secondsPerTask: number,
): ArtificialAnalysisBenchmarkResourceRow => ({
  benchmark_key: "hle",
  source_url: "https://example.com/hle",
  benchmark_version: null,
  model_id: "openai/gpt-test",
  model: `GPT Test (${reasoningEffort})`,
  provider: "OpenAI",
  provider_id: "openai",
  reasoning_effort: reasoningEffort,
  score: 0.8,
  task_run_count: 10,
  cost_per_task_usd: 1,
  seconds_per_task: secondsPerTask,
  tokens_per_task: 1_000,
  input_tokens_per_task: 500,
  output_tokens_per_task: 500,
  answer_tokens_per_task: null,
  reasoning_tokens_per_task: null,
});
const cachedEffortResources = [effortResourceRow("high", 100), effortResourceRow("low", 50)];
const refreshedEffortResources = [effortResourceRow("high", 90)];
const preservedEffortResources = mergeCachedSourceRows(
  cachedEffortResources,
  refreshedEffortResources,
  artificialAnalysisBenchmarkResourceSourceKey,
);
assert.deepEqual(
  preservedEffortResources.map((row) => [row.reasoning_effort, row.seconds_per_task]),
  [
    ["high", 100],
    ["low", 50],
  ],
  "AA resource refreshes should preserve known telemetry and sibling effort rows",
);

const activeResourceRows = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.map((page) => ({
  ...effortResourceRow("high", 100),
  benchmark_key: page.benchmark_key,
  source_url: page.url,
  task_run_count: page.task_run_count,
}));
const retiredResourceRow = { ...effortResourceRow("high", 100), benchmark_key: "tau_banking" };
const cachedResourceRows = [...activeResourceRows, retiredResourceRow];
const previousPageRow = {
  ...activeResourceRows[0]!,
  reasoning_effort: "low",
  source_url: `${activeResourceRows[0]!.source_url}-previous-edition`,
};
const activeResourceKey = artificialAnalysisBenchmarkResourceSourceKey(activeResourceRows[0]!);
const retiredResourceKey = artificialAnalysisBenchmarkResourceSourceKey(retiredResourceRow);
const resourceSnapshot = await artificialAnalysisBenchmarkResourceSnapshot(
  { rows: [...cachedResourceRows, previousPageRow], fetchedAt: 1_800_000_000 },
  {
    last_fetch_epoch_seconds: 1_800_000_000,
    source_input_count: cachedResourceRows.length,
    cache_hit: true,
    refreshed: false,
  },
  {},
  new Map([
    [activeResourceKey, 1_800_000_001],
    [retiredResourceKey, 1_800_000_001],
  ]),
  1_800_000_999,
);
assert.deepEqual(
  resourceSnapshot.artificialAnalysisBenchmarkResourceRows,
  cachedResourceRows,
  "Rows from a benchmark's earlier evaluation page leave the cache when its page changes",
);
assert.equal(resourceSnapshot.sourceStatus.sourceInputCount, activeResourceRows.length);
assert.deepEqual(
  resourceSnapshot.sourceStatus.sourceRowStates
    .filter((state) => state.status === "quarantined_missing_from_source")
    .map((state) => state.row_key),
  [activeResourceKey],
  "Retired AA benchmark resource rows remain cached but leave public source health",
);

const editionRows = (edition: string | null, model: string) => ({ model, edition });
const byEdition = { editionOf: (row: { edition: string | null }) => row.edition };
assert.deepEqual(
  withoutSupersededEditions(
    [editionRows("1", "a"), editionRows("1", "b")],
    [editionRows("1.1", "a")],
    byEdition,
  ),
  [],
  "A source that publishes another edition replaces its cached rows",
);
assert.deepEqual(
  withoutSupersededEditions([editionRows("1", "a")], [editionRows("1", "a")], byEdition),
  [editionRows("1", "a")],
);
assert.deepEqual(
  withoutSupersededEditions(
    [editionRows(null, "mirror"), editionRows("3", "creator")],
    [editionRows("3", "creator")],
    byEdition,
  ),
  [editionRows(null, "mirror"), editionRows("3", "creator")],
  "Rows without an edition, such as another source's mirror, take no part",
);
assert.deepEqual(
  withoutSupersededEditions(
    [editionRows("v1", "a"), editionRows("v1.1", "a")],
    [editionRows("v1", "a")],
    byEdition,
  ),
  [editionRows("v1", "a"), editionRows("v1.1", "a")],
  "A partial refresh of a multi-artifact source still shares an edition, so it merges",
);

const seriesRow = (series: string, edition: string, model: string) => ({ series, edition, model });
const seriesSnapshot = await snapshotSourceRows({
  source: "artificial_analysis_benchmark_resources",
  cached: {
    rows: [seriesRow("a", "1", "x"), seriesRow("a", "1", "y"), seriesRow("b", "1", "z")],
    fetchedAt: 1_800_000_000,
  },
  status: {
    last_fetch_epoch_seconds: 1_800_000_000,
    source_input_count: 3,
    cache_hit: false,
    refreshed: false,
  },
  options: {},
  previousMissingSince: new Map(),
  nowEpochSeconds: 1_800_000_999,
  fetchRows: async () => ({
    fetched_at_epoch_seconds: 1_800_000_999,
    data: [seriesRow("a", "2", "x"), seriesRow("b", "1", "w")],
  }),
  rowKey: (row) => `${row.series}|${row.model}`,
  rowLabel: (row) => row.model,
  editions: { editionOf: (row) => row.edition, seriesOf: (row) => row.series },
});
assert.deepEqual(
  seriesSnapshot.rows.map((row) => `${row.series}${row.edition}:${row.model}`).sort(),
  ["a2:x", "b1:w", "b1:z"],
  "A benchmark that publishes a new version replaces its own cached rows while the source's other benchmarks still merge",
);
assert.deepEqual(
  seriesSnapshot.sourceRowStates
    .filter((state) => state.status === "quarantined_missing_from_source")
    .map((state) => state.row_key),
  ["b|z"],
);
const throwingSnapshot = await snapshotSourceRows({
  source: "artificial_analysis_benchmark_resources",
  cached: { rows: [seriesRow("a", "1", "x")], fetchedAt: 1_800_000_000 },
  status: {
    last_fetch_epoch_seconds: 1_800_000_000,
    source_input_count: 1,
    cache_hit: false,
    refreshed: false,
  },
  options: {},
  previousMissingSince: new Map(),
  nowEpochSeconds: 1_800_000_999,
  fetchRows: async () => {
    throw new Error("scrape failed");
  },
  rowKey: (row) => `${row.series}|${row.model}`,
  rowLabel: (row) => row.model,
});
assert.deepEqual(
  [throwingSnapshot.rows, throwingSnapshot.fetchedAt],
  [[seriesRow("a", "1", "x")], 1_800_000_000],
  "A scraper that throws keeps its cached rows and fetch time instead of failing the refresh",
);

const frontierCodeRevision = (score: number) => ({
  models: ["GPT-6 Astra"],
  harness: { "GPT-6 Astra": "codex" },
  efforts: { "GPT-6 Astra": ["max"] },
  subsets: { main: 100, extended: 150 },
  data: {
    "GPT-6 Astra": {
      max: {
        main: { correct: score, new_score: score },
        extended: { correct: score, new_score: score },
      },
    },
  },
});
assert.deepEqual(
  processFrontierCodePayload({
    v1: frontierCodeRevision(0.4),
    v1_1: frontierCodeRevision(0.5),
    v1_10: frontierCodeRevision(0.6),
  }).map((row) => [row.revision, row.score]),
  [["v1_10", 0.6]],
  "FrontierCode follows the newest revision in its shared artifact",
);
assert.deepEqual(
  processFrontierCodePayload({
    v1_1: frontierCodeRevision(0.5),
    v1_2: { ...frontierCodeRevision(0.6), subsets: { main: 120, extended: 150 } },
  }),
  [],
  "A newest revision with another subset layout yields no rows",
);

const deepSweRow = (
  source_version: DeepSWERawLeaderboardRow["source_version"],
  model: string,
): DeepSWERawLeaderboardRow => ({
  model,
  reasoning_effort: "max",
  config: null,
  pass_at_1: 0.7,
  ci_lo: null,
  ci_hi: null,
  ci_half: null,
  n_tasks_attempted: 113,
  mean_cost_usd: 2,
  mean_duration_seconds: null,
  mean_output_tokens: 1_000,
  source_version,
});
assert.deepEqual(
  preferredDeepSWELeaderboardRows([
    deepSweRow("v1", "shared-model"),
    deepSweRow("v1.1", "shared-model"),
    deepSweRow("v1", "older-only-model"),
  ]).map((row) => row.model),
  ["shared-model"],
  "DeepSWE scores only its newest artifact instead of filling gaps from the previous edition",
);
