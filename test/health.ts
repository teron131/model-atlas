/** Verifies source health, benchmark coverage, and database row reconstruction. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { buildPayloadFromRows, buildPayloadRows } from "../src/model-atlas/database/payload-rows";
import { RAW_SOURCE_NAMES, type RawSourceName } from "../src/model-atlas/ingest/source-registry";
import { buildSourceHealth } from "../src/model-atlas/ingest/source-snapshots/policy";
import type { RawSourceCacheStatus } from "../src/model-atlas/ingest/types";
import { benchmarkRowsFromDb } from "../src/model-atlas/pipeline/benchmark-rows";
import { buildBenchmarkUpdateHealth } from "../src/model-atlas/stats/payload/health";
import { buildCurrentModelAtlasMetadata } from "../src/model-atlas/stats/payload/metadata";
import { benchmarkObservationRowGroups, minimalModelAtlasModel } from "./model-atlas-fixtures";

const sparseHealth = buildBenchmarkUpdateHealth(
  [
    model("frontier/a", "Frontier A", 100, 0.98),
    model("frontier/b", "Frontier B", 95, 0.92),
    model("older/c", "Older C", 40, 0.91),
    model("older/d", "Older D", 35, 0.9),
    model("frontier/e", "Frontier E", 90, null),
    model("frontier/f", "Frontier F", 89, null),
    model("frontier/g", "Frontier G", 88, null),
    model("frontier/h", "Frontier H", 87, null),
    model("frontier/i", "Frontier I", 86, null),
    model("frontier/j", "Frontier J", 85, null),
    model("frontier/k", "Frontier K", 84, null),
    model("frontier/l", "Frontier L", 83, null),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
);

assert.deepEqual(sparseHealth.sparse_benchmark, {
  status: "current",
  observed_count: 4,
  checked_top_count: 4,
  reference_top_count: 10,
  overlap_count: 2,
  overlap_model_ids: ["frontier/a", "frontier/b"],
  top_model_ids: ["frontier/a", "frontier/b", "older/c", "older/d"],
  checked_model_ids: ["frontier/a", "frontier/b", "older/c", "older/d"],
  top_model_labels: ["Frontier A", "Frontier B", "Older C", "Older D"],
  unrepresented_top_model_labels: [],
  top_model_reference_rank: 1,
  reference_metric: "intelligence_score",
});

const staleSparseHealth = buildBenchmarkUpdateHealth(
  [
    model("frontier/a", "Frontier A", 100, null),
    model("frontier/b", "Frontier B", 95, null),
    model("frontier/c", "Frontier C", 90, null),
    model("frontier/d", "Frontier D", 89, null),
    model("frontier/e", "Frontier E", 88, null),
    model("frontier/f", "Frontier F", 87, null),
    model("frontier/g", "Frontier G", 86, null),
    model("frontier/h", "Frontier H", 85, null),
    model("frontier/i", "Frontier I", 84, null),
    model("frontier/j", "Frontier J", 83, null),
    model("older/d", "Older D", 20, 0.8),
    model("older/e", "Older E", 19, 0.7),
    model("older/f", "Older F", 18, 0.6),
    model("older/g", "Older G", 17, 0.5),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
);

assert.equal(
  staleSparseHealth.sparse_benchmark?.status,
  "stale_possible",
  "Sparse benchmarks should warn when their top rows miss the current top models entirely",
);

const intelligenceReferenceHealth = buildBenchmarkUpdateHealth(
  [
    model("intelligence/leader", "Intelligence Leader", 10, 0.9, 100),
    model("agentic/leader", "Agentic Leader", 100, 0.8, 20),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
);
assert.equal(
  intelligenceReferenceHealth.sparse_benchmark?.top_model_reference_rank,
  1,
  "Benchmark agreement should follow the public Intelligence ranking",
);

const compactReferenceHealth = buildBenchmarkUpdateHealth(
  [
    model("frontier/a", "Frontier A", 100, null, 100),
    model("frontier/a", "Frontier A", 99, null, 99),
    model("frontier/b", "Frontier B", 98, null, 98),
    model("frontier/c", "Frontier C", 97, null, 97),
    model("frontier/d", "Frontier D", 96, null, 96),
    model("frontier/e", "Frontier E", 95, null, 95),
    model("frontier/f", "Frontier F", 94, null, 94),
    model("frontier/g", "Frontier G", 93, null, 93),
    model("frontier/h", "Frontier H", 92, null, 92),
    model("frontier/i", "Frontier I", 91, null, 91),
    model("frontier/j", "Frontier J", 90, 0.9, 90),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
);
assert.equal(compactReferenceHealth.sparse_benchmark?.reference_top_count, 10);
assert.equal(
  compactReferenceHealth.sparse_benchmark?.top_model_reference_rank,
  10,
  "Reasoning variants should collapse before health selects the dashboard top ten",
);
assert.equal(compactReferenceHealth.sparse_benchmark?.status, "current");

const aaIndexModel = {
  ...minimalModelAtlasModel({
    id: "frontier/aa-index",
    name: "AA Index Model",
  }),
  intelligence: {
    intelligence_index: 60,
  },
  scores: {
    intelligence_score: 100,
    agentic_score: 100,
    speed_score: null,
    value_score: null,
  },
};
const aaIndexScoring = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["aa_intelligence_index"],
  agenticBenchmarkKeys: [],
};
const aaIndexHealth = buildBenchmarkUpdateHealth([aaIndexModel], aaIndexScoring);
assert.equal(aaIndexHealth.aa_intelligence_index?.observed_count, 1);
assert.equal(aaIndexHealth.aa_intelligence_index?.status, "current");

const aaIndexMetadata = buildCurrentModelAtlasMetadata({
  models: [aaIndexModel],
  scoringConfig: aaIndexScoring,
});
assert.deepEqual(aaIndexMetadata.scoring.missing_intelligence_benchmark_keys, []);

const synchronizedHealthMetadata = buildCurrentModelAtlasMetadata({
  models: [model("frontier/a", "Frontier A", 100, 0.98)],
  scoringConfig: {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
  benchmarkUpdateHealth: {
    removed_benchmark: sparseHealth.sparse_benchmark!,
  },
});
assert.deepEqual(Object.keys(synchronizedHealthMetadata.benchmark_update_health ?? {}), [
  "sparse_benchmark",
]);
assert.equal(
  synchronizedHealthMetadata.benchmark_update_health?.sparse_benchmark?.status,
  "current",
);

const officialRowHealth = buildBenchmarkUpdateHealth(
  [
    model("openai/gpt-5.5", "GPT-5.5", 100, 0.74),
    model("anthropic/claude-fable-5", "Claude Fable 5", 99, 0.7),
    model("google/gemini-3.1-pro-preview", "Gemini 3.1 Pro", 98.5, null),
    model("frontier/c", "Frontier C", 98, null),
    model("frontier/d", "Frontier D", 97, null),
    model("frontier/e", "Frontier E", 96, null),
    model("frontier/f", "Frontier F", 95, null),
    model("frontier/g", "Frontier G", 94, null),
    model("frontier/h", "Frontier H", 93, null),
    model("frontier/i", "Frontier I", 92, null),
    model("frontier/j", "Frontier J", 91, null),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
  {
    sparse_benchmark: [
      {
        id: "openai/gpt-5-2-codex",
        identity: "openai/gpt-5-2-codex",
        label: "GPT-5.2 Codex (xhigh)",
        provider: null,
        value: 0.76,
      },
      {
        id: null,
        identity: "anthropic/claude-mythos-preview",
        label: "Claude Mythos Preview",
        provider: "anthropic",
        value: 0.755,
      },
      {
        id: "openai/gpt-5-5-pro",
        identity: "openai/gpt-5-5-pro",
        label: "GPT-5.5 Pro",
        provider: null,
        value: 0.75,
      },
      {
        id: "openai/gpt-5-5",
        identity: "openai/gpt-5-5",
        label: "GPT-5.5 (xhigh)",
        provider: null,
        value: 0.74,
      },
      {
        id: "anthropic/claude-fable-5",
        identity: "anthropic/claude-fable-5",
        label: "Claude Fable 5",
        provider: null,
        value: 0.7,
      },
      {
        id: null,
        identity: "google/gemini-3-1-pro",
        label: "Gemini 3.1 Pro",
        provider: "google",
        value: 0.73,
      },
    ],
  },
  STAGE_CONFIG.matcher,
);

assert.deepEqual(
  officialRowHealth.sparse_benchmark?.top_model_labels,
  [
    "GPT-5.2 Codex (xhigh)",
    "Claude Mythos Preview",
    "GPT-5.5 Pro",
    "GPT-5.5 (xhigh)",
    "Gemini 3.1 Pro",
  ],
  "Health should preserve official leaderboard labels instead of reporting only normalized Atlas ids",
);
assert.deepEqual(
  officialRowHealth.sparse_benchmark?.top_model_ids,
  [
    "openai/gpt-5-2-codex",
    "anthropic/claude-mythos-preview",
    "openai/gpt-5-5-pro",
    "openai/gpt-5-5",
    "google/gemini-3-1-pro",
  ],
  "Health should report official source ids in top_model_ids",
);
assert.deepEqual(
  officialRowHealth.sparse_benchmark?.checked_model_ids,
  ["openai/gpt-5.5", "google/gemini-3.1-pro-preview", "anthropic/claude-fable-5"],
  "Health should continue past unrepresented source leaders until it checks five matched Atlas models",
);
assert.deepEqual(officialRowHealth.sparse_benchmark?.unrepresented_top_model_labels, [
  "GPT-5.2 Codex (xhigh)",
  "Claude Mythos Preview",
  "GPT-5.5 Pro",
]);
assert.equal(
  officialRowHealth.sparse_benchmark?.status,
  "current",
  "Known-unrepresented official leaders should not make a benchmark look stale when represented rows still overlap current best models",
);

const canonicalIdentityHealth = buildBenchmarkUpdateHealth(
  [
    model("anthropic/claude-fable-5", "Claude Fable 5", 100, null),
    model("frontier/b", "Frontier B", 99, null),
  ],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["sparse_benchmark"],
    agenticBenchmarkKeys: [],
  },
  {
    sparse_benchmark: [
      {
        id: "contenders/claude-fable-5-agent",
        identity: "anthropic/claude-fable-5",
        label: "Claude Fable 5 (High)",
        provider: "Anthropic",
        value: 0.9,
      },
      {
        id: "contenders/claude-fable-5-agent-alt",
        identity: "anthropic/claude-fable-5",
        label: "Claude Fable 5 (Alternative Harness)",
        provider: "Anthropic",
        value: 0.85,
      },
    ],
  },
  STAGE_CONFIG.matcher,
);
assert.deepEqual(canonicalIdentityHealth.sparse_benchmark?.checked_model_ids, [
  "anthropic/claude-fable-5",
]);
assert.deepEqual(canonicalIdentityHealth.sparse_benchmark?.top_model_ids, [
  "contenders/claude-fable-5-agent",
  "contenders/claude-fable-5-agent-alt",
]);
assert.equal(canonicalIdentityHealth.sparse_benchmark?.checked_top_count, 1);
assert.equal(canonicalIdentityHealth.sparse_benchmark?.status, "current");

const dbBenchmarkRows = benchmarkRowsFromDb({
  artificialAnalysisRows: [
    {
      model_id: "openai/gpt-5",
      name: "GPT-5",
      gpqa: 0.94,
      deep_swe: 0.2,
      not_a_benchmark: 1,
    },
  ],
  agentArenaRows: [],
  agentsLastExamRows: [
    {
      row_kind: "raw",
      model: "Raw Harness Row",
      median_score: 1,
    },
    {
      row_kind: "model_score",
      model: "Agent Score Row",
      median_score: 0.81,
      mean_score: 0.83,
    },
  ],
  aleBenchRows: [],
  blueprintBenchRows: [],
  ...benchmarkObservationRowGroups<Record<string, unknown>>({
    browseCompRows: [
      {
        benchmark_key: "browsecomp",
        model_id: null,
        model: "Browse Row",
        base_model: "Browse Row",
        reasoning_effort: null,
        model_creator: "example",
        canonical_value: 0.72,
      },
    ],
  }),
  cursorBenchRows: [
    {
      model: "Fable 5 Extra High",
      base_model: "Fable 5",
      reasoning_effort: "Extra High",
      score: 0.7,
    },
    {
      model: "Fable 5 Max",
      base_model: "Fable 5",
      reasoning_effort: "Max",
      score: 0.69,
    },
  ],
  deepSWERows: [
    {
      source_version: "v1.1",
      model: "gpt-5-6-sol",
      reasoning_effort: "xhigh",
      config: "sol-xhigh",
      pass_at_1: 0.71,
      n_tasks_attempted: 113,
      mean_cost_usd: 4,
      mean_output_tokens: 40_000,
    },
    {
      source_version: "v1.1",
      model: "gpt-5-6-sol",
      reasoning_effort: "max",
      config: "sol-max",
      pass_at_1: 0.73,
      n_tasks_attempted: 113,
      mean_cost_usd: 8,
      mean_output_tokens: 60_000,
    },
  ],
  frontierCodeRows: [],
  gdpPdfRows: [],
  harveyLabRows: [
    {
      row_kind: "overall",
      model_id: "kimi/kimi-k3",
      model: "kimi-k3",
      provider: "Moonshot AI",
      score: 0.108333,
    },
  ],
  riemannBenchRows: [
    {
      model: "GPT 5.6 Sol (Max reasoning)",
      provider: "OpenAI",
      score: 0.744,
    },
  ],
  terminalBench3Rows: [
    {
      model: "GPT-5 (max)",
      base_model: "GPT-5",
      reasoning_effort: "max",
      harness: "mini-SWE-agent",
      score: 0.4353,
      score_standard_error: 0.0165,
    },
  ],
  valsIndexRows: [
    {
      row_kind: "overall",
      model_id: "openai/gpt-5",
      model: "GPT-5",
      provider: "OpenAI",
      score: 0.67,
    },
  ],
  vendingBench2Rows: [],
});

assert.deepEqual(dbBenchmarkRows.harvey_lab, [
  {
    id: "kimi/kimi-k3",
    identity: "kimi/kimi-k3",
    label: "kimi-k3",
    provider: "Moonshot AI",
    value: 0.108333,
  },
]);

assert.deepEqual(dbBenchmarkRows.gpqa, [
  {
    id: "openai/gpt-5",
    identity: "openai/gpt-5",
    label: "GPT-5",
    provider: null,
    value: 0.94,
  },
]);
assert.deepEqual(dbBenchmarkRows.agents_last_exam, [
  {
    id: null,
    identity: "benchmark/Agent Score Row",
    label: "Agent Score Row",
    provider: null,
    value: 0.83,
  },
]);
assert.deepEqual(dbBenchmarkRows.browsecomp, [
  {
    id: null,
    identity: "Browse Row",
    label: "Browse Row",
    provider: "example",
    value: 0.72,
  },
]);
assert.deepEqual(dbBenchmarkRows.cursorbench, [
  {
    id: null,
    identity: "Claude Fable 5",
    label: "Claude Fable 5",
    provider: null,
    value: 0.69,
  },
]);
assert.deepEqual(dbBenchmarkRows.deep_swe, [
  {
    id: "gpt-5-6-sol",
    identity: "gpt-5-6-sol",
    label: "gpt-5-6-sol",
    provider: null,
    value: 0.73,
  },
]);
assert.deepEqual(dbBenchmarkRows.vals_index, [
  {
    id: "openai/gpt-5",
    identity: "openai/gpt-5",
    label: "GPT-5",
    provider: "OpenAI",
    value: 0.67,
  },
]);
assert.deepEqual(dbBenchmarkRows.terminal_bench_3, [
  {
    id: "GPT-5",
    identity: "GPT-5",
    label: "GPT-5 (max)",
    provider: null,
    value: 0.4353,
  },
]);
assert.deepEqual(dbBenchmarkRows.riemann_bench, [
  {
    id: null,
    identity: "GPT 5.6 Sol",
    label: "GPT 5.6 Sol (Max reasoning)",
    provider: "OpenAI",
    value: 0.744,
  },
]);

const sourceHealth = buildSourceHealth({
  generatedAtEpochSeconds: 1_800_000_000,
  sourceCache: sourceCache({
    gdp_pdf: {
      last_fetch_epoch_seconds: 1_799_000_000,
      source_input_count: 12,
      cache_hit: false,
      refreshed: false,
    },
  }),
  sourceRowStates: [
    {
      source: "gdp_pdf",
      row_key: "surge|example-current",
      row_label: "Example Current",
      status: "active",
      missing_from_source_since_epoch_seconds: null,
    },
    {
      source: "gdp_pdf",
      row_key: "surge|example-missing",
      row_label: "Example Missing",
      status: "quarantined_missing_from_source",
      missing_from_source_since_epoch_seconds: 1_799_500_000,
    },
  ],
});

assert.deepEqual(sourceHealth.sources.gdp_pdf, {
  status: "using_cached_rows",
  last_fetch_epoch_seconds: 1_799_000_000,
  source_input_count: 12,
  active_row_count: 1,
  quarantined_row_count: 1,
  quarantined_rows: [
    {
      row_key: "surge|example-missing",
      row_label: "Example Missing",
      missing_from_source_since_epoch_seconds: 1_799_500_000,
    },
  ],
});

const restoredSourceHealth = buildPayloadFromRows(
  buildPayloadRows(1_800_000_000, [
    [
      "sourceHealthRows",
      [
        {
          source: "gdp_pdf",
          status: "fresh",
          last_fetch_epoch_seconds: 1_799_000_000,
          source_input_count: 2,
          active_row_count: 1,
          quarantined_row_count: 1,
        },
      ],
    ],
    [
      "sourceQuarantineRows",
      [
        {
          source: "gdp_pdf",
          row_key: "surge|example-missing",
          row_label: "Example Missing",
          missing_from_source_since_epoch_seconds: 1_799_500_000,
        },
      ],
    ],
  ]),
).metadata.source_health;
assert.deepEqual(restoredSourceHealth?.sources.gdp_pdf?.quarantined_rows, [
  {
    row_key: "surge|example-missing",
    row_label: "Example Missing",
    missing_from_source_since_epoch_seconds: 1_799_500_000,
  },
]);

function model(
  id: string,
  name: string,
  agenticScore: number,
  benchmarkScore: number | null,
  intelligenceScore = agenticScore,
) {
  return {
    ...minimalModelAtlasModel({ id, name }),
    scores: {
      intelligence_score: intelligenceScore,
      agentic_score: agenticScore,
      speed_score: null,
      value_score: null,
    },
    benchmarks:
      benchmarkScore == null
        ? null
        : {
            sparse_benchmark: benchmarkScore,
          },
  };
}

function sourceCache(
  overrides: Partial<Record<RawSourceName, Partial<RawSourceCacheStatus>>>,
): Record<RawSourceName, RawSourceCacheStatus> {
  return Object.fromEntries(
    RAW_SOURCE_NAMES.map((source) => [
      source,
      {
        last_fetch_epoch_seconds: null,
        source_input_count: 0,
        cache_hit: false,
        refreshed: false,
        ...overrides[source],
      },
    ]),
  ) as Record<RawSourceName, RawSourceCacheStatus>;
}
