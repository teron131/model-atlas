/** Verifies ARC Prize eligibility, explicit harness aggregation, resources, matching, and catalog policy. */

import assert from "node:assert/strict";

import {
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_PORTFOLIO,
} from "../src/model-atlas/benchmarks/registry";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/ingest/benchmark-runtimes/observation";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import { processArcPrizeLeaderboardJson } from "../src/model-atlas/scrapers/benchmarks/arc-prize";

const v2SourceUrl = "https://arcprize.org/media/data/leaderboard/v2.json";
const v2Rows = processArcPrizeLeaderboardJson(
  {
    generatedAt: "2026-08-07T20:07:24.014Z",
    evaluations: [
      {
        datasetId: "v2_Semi_Private",
        modelId: "human",
        modelDisplayName: "Human Panel",
        modelGroup: "Human",
        providerId: "Human",
        providerDisplayName: "Human",
        score: 1,
        display: true,
      },
      {
        datasetId: "v2_Semi_Private",
        modelId: "openai-gpt-5-6-sol-max",
        modelDisplayName: "GPT-5.6 Sol (Max)",
        modelType: "CoT",
        providerId: "OpenAI",
        providerDisplayName: "OpenAI",
        score: 0.9,
        costPerTask: 1.44,
        display: true,
      },
      {
        datasetId: "v2_Semi_Private",
        modelId: "anthropic-opus-4-6-max",
        modelDisplayName: "Anthropic Opus 4.6 (Max)",
        modelType: "CoT",
        providerId: "Anthropic",
        providerDisplayName: "Anthropic",
        score: 0.75,
        costPerTask: 2.4,
        display: true,
      },
      {
        datasetId: "v2_Public",
        modelId: "public-demo",
        modelDisplayName: "Public demo model",
        modelType: "CoT",
        providerId: "OpenAI",
        providerDisplayName: "OpenAI",
        score: 0.95,
        display: true,
      },
      {
        datasetId: "v2_Semi_Private",
        modelId: "custom",
        modelDisplayName: "Custom solver",
        modelType: "Custom",
        providerId: "ARC Prize 2025",
        providerDisplayName: "ARC Prize 2025",
        score: 0.9,
        display: true,
      },
    ],
  },
  { benchmarkKey: "arc_agi_2", datasetId: "v2_Semi_Private", sourceUrl: v2SourceUrl },
);

assert.deepEqual(
  v2Rows.map((row) => [row.model, row.rank]),
  [
    ["GPT-5.6 Sol (Max)", 1],
    ["Anthropic Opus 4.6 (Max)", 2],
  ],
);
assert.equal(v2Rows[0]?.base_model, "GPT-5.6 Sol");
assert.equal(v2Rows[0]?.cost, 1.44);
assert.equal(v2Rows[1]?.base_model, "Claude Opus 4.6");
assert.equal(
  findBenchmarkObservation(["Claude Opus 4.6"], "max", buildBenchmarkObservationLookup(v2Rows))
    ?.canonical_value,
  0.75,
);

const v3SourceUrl = "https://arcprize.org/media/data/leaderboard/v3.json";
const v3Rows = processArcPrizeLeaderboardJson(
  {
    generatedAt: "2026-08-07T20:07:24.014Z",
    evaluations: [
      {
        datasetId: "v3_Semi_Private",
        modelId: "openai-gpt-6-astra-max",
        modelGroup: "openai-gpt-6-astra-max",
        modelDisplayName: "GPT-6 Astra (Max)",
        modelType: "CoT",
        providerDisplayName: "OpenAI",
        score: 0.6,
        cost: 1_100,
        display: true,
      },
      {
        datasetId: "v3_Semi_Private",
        modelId: "openai-gpt-6-astra-max-provider-adapter",
        modelGroup: "openai-gpt-6-astra-max-provider-adapter",
        modelDisplayName: "GPT-6 Astra - Provider Adapter (Max)",
        modelType: "CoT",
        providerDisplayName: "OpenAI",
        score: 0.9,
        cost: 2_200,
        display: true,
      },
      {
        datasetId: "v3_Semi_Private",
        modelId: "openai-gpt-6-astra-high",
        modelGroup: "openai-gpt-6-astra-high",
        modelDisplayName: "GPT-6 Astra (High)",
        modelType: "CoT",
        providerDisplayName: "OpenAI",
        score: 0.5,
        cost: 550,
        display: true,
      },
      {
        datasetId: "v3_Semi_Private",
        modelId: "openai-gpt-6-astra-high-provider-adapter",
        modelGroup: "openai-gpt-6-astra-high-provider-adapter",
        modelDisplayName: "GPT-6 Astra - Provider Adapter (High)",
        modelType: "CoT",
        providerDisplayName: "OpenAI",
        score: 0.7,
        cost: 1_100,
        display: true,
      },
      {
        datasetId: "v3_Semi_Private",
        modelId: "anthropic-claude-opus-5-high",
        modelGroup: "anthropic-claude-opus-5-high",
        modelDisplayName: "Claude Opus 5 (High)",
        modelType: "CoT",
        providerDisplayName: "Anthropic",
        score: 0.3,
        cost: 550,
        display: true,
      },
      {
        datasetId: "v3_Semi_Private",
        modelId: "openai-gpt-6-astra-max-provider-adapter",
        modelGroup: "openai-gpt-6-astra-max-provider-adapter",
        modelDisplayName: "GPT-6 Astra Adapter Experiment (Max)",
        modelType: "CoT",
        providerDisplayName: "OpenAI",
        score: 0.99,
        cost: 100,
        display: true,
      },
    ],
  },
  { benchmarkKey: "arc_agi_3", datasetId: "v3_Semi_Private", sourceUrl: v3SourceUrl },
);

const canonicalRows = v3Rows.filter((row) => row.metadata.observation_role === "canonical");
const componentRows = v3Rows.filter((row) => row.metadata.observation_role === "component");
assert.equal(canonicalRows.length, 3);
assert.equal(componentRows.length, 5);
const astraMax = canonicalRows.find((row) => row.reasoning_effort === "max");
const astraHigh = canonicalRows.find(
  (row) => row.base_model === "GPT-6 Astra" && row.reasoning_effort === "high",
);
const opusHigh = canonicalRows.find((row) => row.base_model === "Claude Opus 5");
assert.ok(astraMax);
assert.equal(astraMax.canonical_value, 0.75);
assert.equal(astraMax.task_run_count, 110);
assert.equal(astraMax.total_cost_usd, 3_300);
assert.equal(astraMax.cost, 30);
assert.deepEqual(astraMax.metadata.harnesses, ["standard", "provider_adapter"]);
assert.equal(astraHigh?.canonical_value, 0.6, "reasoning efforts must remain separate");
assert.equal(opusHigh?.canonical_value, 0.3);
assert.equal(opusHigh?.task_run_count, 55);
assert.equal(opusHigh?.metadata.aggregation, "single_harness");
assert.deepEqual(componentRows.map((row) => row.metadata.harness).sort(), [
  "provider_adapter",
  "provider_adapter",
  "standard",
  "standard",
  "standard",
]);
const v3Lookup = buildBenchmarkObservationLookup(v3Rows);
assert.equal(
  findBenchmarkObservation(["GPT-6 Astra"], "max", v3Lookup)?.canonical_value,
  0.75,
  "component observations must not overwrite the canonical harness blend",
);
assert.deepEqual(buildTaskMetrics(null, { arc_agi_3: astraMax }), {
  arc_agi_3: { cost: 30 },
});

const bindings = Object.fromEntries(
  BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.benchmark, binding]),
);
assert.equal(bindings.arc_agi_2?.loader.kind, "arc_prize");
assert.equal(bindings.arc_agi_3?.loader.kind, "arc_prize");
assert.ok(bindings.arc_agi_3);
const cachedRows = v3Rows.map((row, index) => ({
  source_key: "arc_agi_3",
  row_index: index,
  fetched_at_epoch_seconds: 1_788_000_000,
  benchmark_key: row.benchmark_key,
  url: row.source_url,
  model_id: row.model_id,
  model: row.model,
  base_model: row.base_model,
  reasoning_effort: row.reasoning_effort,
  model_creator: row.model_creator,
  rank: row.rank,
  canonical_value: row.canonical_value,
  cost: row.cost ?? null,
  tokens_per_task: row.tokens_per_task ?? null,
  task_run_count: row.task_run_count ?? null,
  total_cost_usd: row.total_cost_usd ?? null,
  total_tokens: row.total_tokens ?? null,
  observed_at: row.observed_at,
  metadata_json: JSON.stringify(row.metadata),
}));
assert.equal(readBenchmarkObservationRawCache(cachedRows, bindings.arc_agi_3)?.rows.length, 8);
assert.equal(
  readBenchmarkObservationRawCache(
    cachedRows.map((row) => ({ ...row, metadata_json: "{}" })),
    bindings.arc_agi_3,
  ),
  null,
  "pre-aggregation ARC-AGI-3 cache rows must refetch",
);
assert.equal(
  readBenchmarkObservationRawCache(
    cachedRows.map((row) =>
      JSON.parse(row.metadata_json).observation_role === "canonical"
        ? { ...row, task_run_count: 55 }
        : row,
    ),
    bindings.arc_agi_3,
  ),
  null,
  "canonical cache rows must account for every included harness run",
);

assert.deepEqual(BENCHMARK_PORTFOLIO.arc_agi_3.dimensionLoadings, {
  intelligence: 0.5,
  agentic: 0.5,
});
assert.equal(BENCHMARK_PORTFOLIO.arc_agi_3.benchmarkImportance, 1);
assert.equal(BENCHMARK_CATALOG.arc_agi_3.scoring.group, "frontier");
assert.equal(BENCHMARK_CATALOG.arc_agi_3.presentation.column.key, "arcAgi3");
