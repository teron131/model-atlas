/** Verifies ARC Prize parsing, eligibility, identity, and catalog registration. */

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
        modelId: "hidden",
        modelDisplayName: "Hidden model",
        modelType: "CoT",
        providerId: "OpenAI",
        providerDisplayName: "OpenAI",
        score: 0.99,
        display: false,
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
        costPerTask: 0.2,
        display: true,
      },
      {
        datasetId: "v2_Semi_Private",
        modelId: "openai-gpt-5-6-sol-max",
        modelDisplayName: "GPT-5.6 Sol (Max)",
        modelType: "CoT",
        modelReleaseDate: "2026-07-01T00:00:00.000Z",
        providerId: "OpenAI",
        providerDisplayName: "OpenAI",
        score: 0.9,
        costPerTask: 1.44,
        resultsUrl: "/results/openai-gpt-5-6-sol",
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
    ],
  },
  {
    benchmarkKey: "arc_agi_2",
    datasetId: "v2_Semi_Private",
    sourceUrl: v2SourceUrl,
  },
);

assert.equal(v2Rows.length, 2);
assert.deepEqual(
  v2Rows.map((row) => [row.model, row.rank]),
  [
    ["GPT-5.6 Sol (Max)", 1],
    ["Anthropic Opus 4.6 (Max)", 2],
  ],
);
const sol = v2Rows[0];
assert.ok(sol);
assert.deepEqual(sol, {
  benchmark_key: "arc_agi_2",
  source_url: v2SourceUrl,
  model_id: "openai-gpt-5-6-sol-max",
  model: "GPT-5.6 Sol (Max)",
  base_model: "GPT-5.6 Sol",
  reasoning_effort: "max",
  model_creator: "OpenAI",
  rank: 1,
  canonical_value: 0.9,
  cost: 1.44,
  observed_at: "2026-08-07T20:07:24.014Z",
  metadata: {},
});
assert.equal(v2Rows[1]?.base_model, "Claude Opus 4.6");
assert.equal(v2Rows[1]?.reasoning_effort, "max");
const v2Lookup = buildBenchmarkObservationLookup(v2Rows);
assert.equal(findBenchmarkObservation(["Custom solver"], null, v2Lookup), null);
assert.equal(findBenchmarkObservation(["GPT-5.6 Sol"], "max", v2Lookup)?.canonical_value, 0.9);
assert.equal(findBenchmarkObservation(["Claude Opus 4.6"], "max", v2Lookup)?.canonical_value, 0.75);

const v3Rows = processArcPrizeLeaderboardJson(
  {
    generatedAt: "2026-08-07T20:07:24.014Z",
    evaluations: [
      {
        datasetId: "v3_Semi_Private",
        modelId: "anthropic-claude-opus-5-high",
        modelDisplayName: "Claude Opus 5 (High)",
        modelType: "CoT",
        providerId: "Anthropic",
        providerDisplayName: "Anthropic",
        score: 0.3016,
        cost: 20657.37,
        display: true,
      },
    ],
  },
  {
    benchmarkKey: "arc_agi_3",
    datasetId: "v3_Semi_Private",
    sourceUrl: "https://arcprize.org/media/data/leaderboard/v3.json",
  },
);
const opus = v3Rows[0];
assert.ok(opus);
assert.equal(opus.base_model, "Claude Opus 5");
assert.equal(opus.reasoning_effort, "high");
assert.equal(opus.observed_at, "2026-08-07T20:07:24.014Z");
assert.equal(opus.cost, 375.588545);
assert.equal(opus.task_run_count, 55);
assert.equal(opus.total_cost_usd, 20657.37);
assert.deepEqual(opus.metadata, {});
assert.deepEqual(buildTaskMetrics(null, { arc_agi_2: sol, arc_agi_3: opus }), {
  arc_agi_2: { cost: 1.44 },
  arc_agi_3: { cost: 375.588545 },
});

const bindings = Object.fromEntries(
  BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.benchmark, binding]),
);
assert.equal(bindings.arc_agi_2?.loader.kind, "arc_prize");
assert.equal(bindings.arc_agi_3?.loader.kind, "arc_prize");
assert.ok(bindings.arc_agi_3);
const cachedArcAgi3Row = {
  source_key: "arc_agi_3",
  fetched_at_epoch_seconds: 1_788_000_000,
  benchmark_key: opus.benchmark_key,
  url: opus.source_url,
  model_id: opus.model_id,
  model: opus.model,
  base_model: opus.base_model,
  reasoning_effort: opus.reasoning_effort,
  model_creator: opus.model_creator,
  rank: opus.rank,
  canonical_value: opus.canonical_value,
  cost: opus.cost,
  tokens_per_task: null,
  task_run_count: opus.task_run_count,
  total_cost_usd: opus.total_cost_usd,
  total_tokens: null,
  observed_at: opus.observed_at,
  metadata_json: JSON.stringify(opus.metadata),
};
assert.deepEqual(readBenchmarkObservationRawCache([cachedArcAgi3Row], bindings.arc_agi_3), {
  rows: [opus],
  fetchedAt: 1_788_000_000,
});
assert.equal(
  readBenchmarkObservationRawCache(
    [
      {
        ...cachedArcAgi3Row,
        cost: 20657.37,
        metadata_json: "{}",
      },
    ],
    bindings.arc_agi_3,
  ),
  null,
  "ARC-AGI-3 cache rows with total cost should refetch",
);
assert.equal(
  readBenchmarkObservationRawCache(
    [
      {
        ...cachedArcAgi3Row,
        cost: 826.2948,
        task_run_count: 25,
      },
    ],
    bindings.arc_agi_3,
  ),
  null,
  "ARC-AGI-3 cache rows normalized against the public-demo count should refetch",
);
assert.deepEqual(BENCHMARK_PORTFOLIO.arc_agi_2.dimensionLoadings, {
  intelligence: 1,
  agentic: 0,
});
assert.deepEqual(BENCHMARK_PORTFOLIO.arc_agi_3.dimensionLoadings, {
  intelligence: 0.75,
  agentic: 0.25,
});
assert.equal(BENCHMARK_PORTFOLIO.arc_agi_2.benchmarkImportance, 1);
assert.equal(BENCHMARK_PORTFOLIO.arc_agi_3.benchmarkImportance, 1);
assert.equal(BENCHMARK_CATALOG.arc_agi_2.scoring.group, "frontier");
assert.equal(BENCHMARK_CATALOG.arc_agi_3.scoring.group, "frontier");
assert.equal(BENCHMARK_CATALOG.arc_agi_2.presentation.column.key, "arcAgi2");
assert.equal(BENCHMARK_CATALOG.arc_agi_3.presentation.column.key, "arcAgi3");
