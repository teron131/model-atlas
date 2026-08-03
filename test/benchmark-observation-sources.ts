/** Exercises benchmark CSV, Astro, HTML, matching, eligibility, and domain-owned persistence. */

import assert from "node:assert/strict";

import {
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/benchmarks/persistence/observation";
import { insertBenchmarkRawRows } from "../src/model-atlas/benchmarks/persistence/runtime";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../src/model-atlas/benchmarks/registry";
import { processEpochCapabilitiesIndexCsv } from "../src/model-atlas/benchmarks/scrapers/epoch/capabilities-index";
import { epochBenchmarkObservationRows } from "../src/model-atlas/benchmarks/scrapers/epoch/results";
import { processSurgeBenchmarkPageHtml } from "../src/model-atlas/benchmarks/scrapers/surge/results";
import { processValsBenchmarkPageHtml } from "../src/model-atlas/benchmarks/scrapers/vals/results";
import { processWeirdMlCsv } from "../src/model-atlas/benchmarks/scrapers/weirdml";
import { mergeCachedSourceRows } from "../src/model-atlas/ingest/source-snapshots/policy";
import {
  benchmarkObservationRowKey,
  mergeBenchmarkObservationRow,
} from "../src/model-atlas/ingest/source-snapshots/row-snapshot";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import { SnapshotRowCollector } from "../src/model-atlas/ingest/writers";
import { parseCsvRecords } from "../src/model-atlas/scrapers/parsing";

assert.deepEqual(parseCsvRecords('name,note\r\n"A, B","line 1\nline ""2"""\r\n'), [
  { name: "A, B", note: 'line 1\nline "2"' },
]);

const eci = processEpochCapabilitiesIndexCsv(
  "Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Country (of organization),Model accessibility,Accessibility group,model_versions\n" +
    "gpt-5.6-sol,GPT-5.6 Sol,161.77,159.26,166.01,2026-07-09,OpenAI,US,API,Hosted,v1\n",
);
assert.equal(eci[0]?.canonical_value, 161.77);
assert.equal(eci[0]?.confidence_low, 159.26);

const epochRuns = parseCsvRecords(
  "id_runs,task,model,Best score (across scorers),started_at,Status,task version,id_model_version,Display name,Unique display name,Organization,mean_score,stderr,best_score,original_task_name,Scores\n" +
    "new,FrontierMath-Tier-4-v2-Private,gpt,0.56,2026-07-01T00:00:00Z,Success,2.0.0,gpt-5.6,GPT-5.6 Sol,GPT-5.6 Sol (max),OpenAI,0.561,0.02,0.56,frontiermath,[]\n" +
    "old,FrontierMath-Tier-4-2025-07-01-Private,gpt,0.31,2025-07-01T00:00:00Z,Success,1.0.0,gpt-5.6,GPT-5.6 Sol,GPT-5.6 Sol (max),OpenAI,0.3125,0.02,0.31,frontiermath,[]\n",
);
const frontierMath = epochBenchmarkObservationRows(
  epochRuns,
  "frontiermath_tier_4",
  "FrontierMath-Tier-4-v2-Private",
);
assert.equal(frontierMath.length, 1);
assert.equal(frontierMath[0]?.canonical_value, 0.561);
assert.equal(frontierMath[0]?.metadata.task_version, "2.0.0");

const weirdMl = processWeirdMlCsv(
  "internal_model_name,display_name,model_slug,shapes_easy_acc,shapes_hard_acc,digits_unsup_acc,chess_winners_acc,kolmo_shuffle_acc,classify_sentences_acc,classify_shuffled_acc,insert_patches_acc,blunders_easy_acc,blunders_hard_acc,digits_generalize_acc,shapes_variable_acc,xor_easy_acc,xor_hard_acc,splash_easy_acc,splash_hard_acc,number_patterns_acc,avg_acc,avg_acc_standard_error,cost_per_run_usd,mean_total_output_tokens,code_len_p10,code_len_p50,code_len_p90,exec_time_median_s,release_date,API source\n" +
    "claude,Claude Fable 5 (max),claude-fable-5,0.95,0.94,0.93,0.92,0.91,0.90,0.89,0.88,0.87,0.86,0.85,0.84,0.83,0.82,0.81,0.80,0.79,0.91,0.01,1.2,1000,10,20,30,4.5,2026-06-09,Anthropic\n",
);
assert.equal(weirdMl[0]?.reasoning_effort, "max");
assert.equal(weirdMl[0]?.metadata.shapes_easy_acc, 0.95);
assert.notEqual(
  benchmarkObservationRowKey({
    ...weirdMl[0]!,
    model_id: "example/shared-model",
    metadata: { ...weirdMl[0]!.metadata, internal_model_name: "example:thinking" },
  }),
  benchmarkObservationRowKey({
    ...weirdMl[0]!,
    model_id: "example/shared-model",
    metadata: { ...weirdMl[0]!.metadata, internal_model_name: "example:no-thinking" },
  }),
  "Source configurations sharing one model ID should retain distinct cache identities",
);

function astro(value: unknown): unknown[] {
  return [0, value];
}

function benchmarkObservationBinding(sourceDataKey: string) {
  const binding = BENCHMARK_OBSERVATION_BINDINGS.find(
    (candidate) => candidate.sourceDataKey === sourceDataKey,
  );
  assert.ok(binding);
  return binding;
}

const proofHtml = `<astro-island component-url="/_astro/BenchmarkView.hash.js" props="${JSON.stringify(
  {
    benchmarkView: astro({
      default: astro({
        metadata: astro({ updated: astro("2026-07-17"), version: astro("1") }),
        tasks: astro({
          overall: astro({
            "openai/gpt-5.6-sol": astro({
              accuracy: astro(77),
              provider: astro("OpenAI"),
              reasoning_effort: astro("max"),
              stderr: astro(4.2),
            }),
            "aristotle/aristotle": astro({
              accuracy: astro(71),
              provider: astro("Aristotle"),
            }),
          }),
        }),
      }),
    }),
  },
).replace(/"/g, "&quot;")}"></astro-island>`;
const proofBinding = benchmarkObservationBinding("proofBench");
assert.equal(proofBinding.loader.kind, "vals");
if (proofBinding.loader.kind !== "vals") throw new Error("Expected VALS loader");
const proof = processValsBenchmarkPageHtml(proofHtml, {
  benchmarkKey: proofBinding.benchmark,
  canonicalTask: proofBinding.loader.canonicalTask,
  includeReasoningEffortInModel:
    "includeReasoningEffortInModel" in proofBinding.loader
      ? proofBinding.loader.includeReasoningEffortInModel
      : undefined,
  isScoreEligible: (_task, modelId) => modelId.toLowerCase() !== "aristotle/aristotle",
  sourceUrl: proofBinding.loader.sourceUrl,
});
assert.equal(proof.length, 2);
assert.equal(proof.find((row) => row.model_id === "aristotle/aristotle")?.score_eligible, false);

const surge = processSurgeBenchmarkPageHtml(
  `
	<div>Model Rankings</div>
	<div role="listitem" data-score="45"><div data-leaderboard-rank>1</div><img alt="OpenAI Logo"><div class="head-rank-table-brand">GPT</div><div class="head-rank-table-name">5.6 Sol (Max reasoning)</div></div>
	<div role="listitem" data-score="45"><div data-leaderboard-rank>1</div><img alt="Anthropic Logo"><div class="head-rank-table-brand">Claude</div><div class="head-rank-table-name">Fable 5 (Adaptive Max)</div></div>
	<div role="listitem" data-score="44"><div data-leaderboard-rank>1</div><img alt="Google Logo"><div class="head-rank-table-brand">Gemini</div><div class="head-rank-table-name">3 Pro</div></div>
	<div role="listitem" data-score="43"><div data-leaderboard-rank>1</div><img alt="Kimi Logo"><div class="head-rank-table-brand">Kimi</div><div class="head-rank-table-name">K3 (Max reasoning)</div></div>
	<section></section>
`,
  "chartography",
  "https://surgehq.ai/benchmarks/chartography",
);
const [gptMax, claudeMax, gemini, kimiMax] = surge;
assert.ok(gptMax);
assert.ok(claudeMax);
assert.ok(gemini);
assert.ok(kimiMax);
assert.equal(gptMax.reasoning_effort, "max");
assert.equal(gptMax.canonical_value, 0.45);
assert.equal(gptMax.reported_value, 45);
assert.equal(gptMax.rank, 1);
assert.equal(claudeMax.base_model, "Claude Fable 5");
assert.equal(claudeMax.reasoning_effort, "max");
assert.equal(claudeMax.canonical_value, 0.45);
assert.equal(claudeMax.rank, 1);
assert.equal(gemini.rank, 3);
assert.equal(kimiMax.model, "Kimi K3 (Max reasoning)");
assert.equal(kimiMax.base_model, "K3");
assert.equal(kimiMax.reasoning_effort, "max");
assert.equal(kimiMax.model_creator, "Kimi");
assert.equal(
  benchmarkObservationRowKey({ ...kimiMax, model: "K3 (Max reasoning)" }),
  benchmarkObservationRowKey(kimiMax),
  "Adding the source brand should not manufacture a new persisted row identity",
);
const surgeLookup = buildBenchmarkObservationLookup(surge);
assert.equal(
  surgeLookup.has("max--max"),
  false,
  "Effort-label slashes should not create cross-model lookup aliases",
);

const legacySurgeMaxRow = {
  ...gptMax,
  model: "GPT 5.6 Sol (Max reasoning)",
};
const currentSurgeMaxRow = {
  ...surge[0]!,
  model: "GPT 5.6 Sol (Adaptive/Max)",
};
assert.equal(
  benchmarkObservationRowKey(legacySurgeMaxRow),
  benchmarkObservationRowKey(currentSurgeMaxRow),
  "Source display-label changes should preserve the model-effort cache identity",
);

const legacySurgeDefaultRow = {
  ...surge[0]!,
  model: "GPT 5.6 Sol",
  reasoning_effort: null,
};
const currentSurgeDefaultRow = {
  ...legacySurgeDefaultRow,
  model: "GPT 5.6 Sol (default)",
};
assert.equal(
  benchmarkObservationRowKey(legacySurgeDefaultRow),
  benchmarkObservationRowKey(currentSurgeDefaultRow),
  "Explicit default labels should not manufacture quarantined source rows",
);
assert.notEqual(
  benchmarkObservationRowKey(currentSurgeDefaultRow),
  benchmarkObservationRowKey(currentSurgeMaxRow),
  "Default and explicit max-effort rows should retain distinct source identities",
);

const legacySurgeEffortRow = {
  ...surge[0]!,
  model: "Inkling (Max effort)",
  base_model: "Inkling (Max effort)",
  reasoning_effort: null,
};
const currentSurgeEffortRow = {
  ...legacySurgeEffortRow,
  model: "Inkling (Max reasoning)",
  base_model: "Inkling",
  reasoning_effort: "max",
};
assert.equal(
  benchmarkObservationRowKey(legacySurgeEffortRow),
  benchmarkObservationRowKey(currentSurgeEffortRow),
  "Renamed effort labels should repair historical base-model identities",
);
assert.deepEqual(
  mergeBenchmarkObservationRow(legacySurgeEffortRow, currentSurgeEffortRow),
  {
    ...legacySurgeEffortRow,
    model: "Inkling (Max reasoning)",
    base_model: "Inkling",
    reasoning_effort: "max",
  },
  "Reconciled rows should adopt current normalized identity without rewriting cached evidence",
);

const frontierMathLookup = buildBenchmarkObservationLookup(frontierMath);
assert.equal(
  findBenchmarkObservation(["GPT-5.6 Sol"], "max", frontierMathLookup)?.canonical_value,
  0.561,
);
assert.equal(findBenchmarkObservation(["GPT-5.6 Sol"], "high", frontierMathLookup), null);
assert.equal(buildBenchmarkObservationLookup(proof).has("aristotle"), false);

const frontierMathRow = frontierMath[0];
assert.ok(frontierMathRow);

const sharedModelRows = [
  {
    ...frontierMathRow,
    model_id: null,
    model: "Shared Model",
    base_model: "Shared Model",
    model_creator_id: "provider-a",
    model_creator: "provider-a",
  },
  {
    ...frontierMathRow,
    model_id: null,
    model: "Shared Model",
    base_model: "Shared Model",
    model_creator_id: "provider-b",
    model_creator: "provider-b",
  },
];
assert.equal(
  mergeCachedSourceRows([], sharedModelRows, benchmarkObservationRowKey).length,
  2,
  "Benchmark refreshes should preserve same-named models from distinct providers",
);

const collector = new SnapshotRowCollector();
const chess = frontierMath.map((row) => ({
  ...row,
  benchmark_key: "chess_puzzles",
}));
const ebr = frontierMath.map((row) => ({
  ...row,
  benchmark_key: "ebr_bench",
}));
const handbook = surge.map((row) => ({
  ...row,
  benchmark_key: "handbook_md",
  source_url: "https://surgehq.ai/benchmarks/handbook",
}));
const coreCraft = surge.map((row) => ({
  ...row,
  benchmark_key: "enterprisebench_corecraft",
  source_url: "https://surgehq.ai/benchmarks/enterprisebench-corecraft",
}));
const snapshots = {
  ...Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.sourceRowsKey, []]),
  ),
  chartographyRows: surge,
  chessPuzzleRows: chess,
  ebrBenchRows: ebr,
  enterpriseBenchCoreCraftRows: coreCraft,
  epochCapabilitiesIndexRows: eci,
  frontierMathTier4Rows: frontierMath,
  handbookMdRows: handbook,
  proofBenchRows: proof,
  weirdMlRows: weirdMl,
  fetchedAt: {
    ...Object.fromEntries(
      BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.sourceDataKey, null]),
    ),
    chartography: 1_784_000_004,
    chessPuzzles: 1_784_000_002,
    ebrBench: 1_784_000_003,
    enterpriseBenchCoreCraft: 1_784_000_006,
    epochCapabilitiesIndex: 1_784_000_000,
    frontierMathTier4: 1_784_000_001,
    handbookMd: 1_784_000_005,
    proofBench: 1_784_000_007,
    weirdMl: 1_784_000_008,
  },
} as unknown as SourceSnapshots;
const expectedBySourceDataKey = {
  chartography: { rows: surge, fetchedAt: 1_784_000_004 },
  chessPuzzles: { rows: chess, fetchedAt: 1_784_000_002 },
  ebrBench: { rows: ebr, fetchedAt: 1_784_000_003 },
  enterpriseBenchCoreCraft: { rows: coreCraft, fetchedAt: 1_784_000_006 },
  epochCapabilitiesIndex: { rows: eci, fetchedAt: 1_784_000_000 },
  frontierMathTier4: { rows: frontierMath, fetchedAt: 1_784_000_001 },
  handbookMd: { rows: handbook, fetchedAt: 1_784_000_005 },
  proofBench: { rows: proof, fetchedAt: 1_784_000_007 },
  weirdMl: { rows: weirdMl, fetchedAt: 1_784_000_008 },
};
insertBenchmarkRawRows(collector, snapshots, BENCHMARK_OBSERVATION_RAW_TABLE);
for (const [sourceDataKey, expected] of Object.entries(expectedBySourceDataKey)) {
  const binding = benchmarkObservationBinding(sourceDataKey);
  assert.deepEqual(
    readBenchmarkObservationRawCache(collector.records(BENCHMARK_OBSERVATION_RAW_TABLE), binding),
    expected,
  );
  const expectedUrl = "sourceUrl" in binding.loader ? binding.loader.sourceUrl : null;
  if (expectedUrl != null) {
    assert.equal(
      readBenchmarkObservationRawCache(
        collector
          .records(BENCHMARK_OBSERVATION_RAW_TABLE)
          .map((row) =>
            row.source_key === binding.benchmark ? { ...row, url: `${expectedUrl}?stale=1` } : row,
          ),
        binding,
      ),
      null,
      `${binding.benchmark} should invalidate rows from an obsolete source URL`,
    );
  }
}
