/** Verify symmetric crosswalk targets, held-out gating, effort isolation, and per-task resource fusion. */

import assert from "node:assert/strict";

import { compactModelVariants } from "../app/leaderboard/model-variants";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../src/model-atlas/benchmarks/registry";
import { buildAdditiveSourceCrosswalk } from "../src/model-atlas/benchmarks/source-crosswalk";
import {
  crosswalkBenchmarkSources,
  type CrosswalkObservation,
  crosswalkThreeBenchmarkSources,
} from "../src/model-atlas/benchmarks/sources-crosswalk";
import { benchmarkQualityEvidence } from "../src/model-atlas/pipeline/scores/imputation/benchmark";
import {
  benchmarkFusionResourceEstimate,
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  separatedBenchmarkResourceEvidence,
} from "../src/model-atlas/pipeline/scores/resource-metrics";
import { observedBenchmarkCount } from "../src/model-atlas/pipeline/scores/score-builders";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import { processArtificialAnalysisBenchmarkResourceRows } from "../src/model-atlas/sources/artificial-analysis/benchmark-resources";
import { fusedBenchmarkObservations } from "../src/model-atlas/sources/assembly/source-data";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/sources/observations/cache";
import { processTerminalBench4Payload } from "../src/model-atlas/sources/terminal-bench-4/leaderboard";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const pairs = Array.from({ length: 6 }, (_, i) => ({
  name: `model-${i}`,
  a: 0.2 + i * 0.08,
  b: 0.3 + i * 0.08,
}));
const missing = { name: "missing", a: null, b: 0.7 };
const primaryOnly = { name: "primary-only", a: 0.6, b: null };
const options = {
  sourceAValue: (r: { a: number | null }) => r.a,
  sourceBValue: (r: { b: number | null }) => r.b,
  minimumEffectiveModels: 6,
  maximumMedianAbsoluteError: 0.025,
};
const original = buildAdditiveSourceCrosswalk([...pairs, missing, primaryOnly], {
  ...options,
  sourceBWeight: 0,
});
assert.ok(Math.abs(original.projectionByItem.get(missing)! - 0.6) < 1e-10);
assert.equal(original.projectionByItem.has(pairs[0]!), false);
assert.equal(original.project(0.6, null), 0.6);
const midpoint = buildAdditiveSourceCrosswalk([...pairs, missing, primaryOnly], {
  ...options,
  sourceBWeight: 0.5,
});
assert.ok(Math.abs(midpoint.projectionByItem.get(missing)! - 0.65) < 1e-10);
assert.ok(Math.abs(midpoint.projectionByItem.get(primaryOnly)! - 0.65) < 1e-10);
assert.ok(Math.abs(midpoint.projectionByItem.get(pairs[0]!)! - 0.25) < 1e-10);
// Direction must reverse when B scores lower, while the combined result stays symmetric.
const reversed = buildAdditiveSourceCrosswalk(
  pairs.map((pair) => ({ ...pair, a: pair.b, b: pair.a })),
  options,
);
assert.ok(Math.abs(reversed.diagnostic.delta! + 0.1) < 1e-10);
assert.ok(Math.abs(midpoint.diagnostic.delta! - 0.1) < 1e-10);
assert.ok(Math.abs(reversed.project(0.7, null)! - 0.65) < 1e-10);
assert.ok(Math.abs(reversed.project(null, 0.6)! - 0.65) < 1e-10);
assert.equal(reversed.project(null, null), null);
const insufficient = buildAdditiveSourceCrosswalk([pairs[0]!, missing], {
  ...options,
  sourceBWeight: 0.5,
});
assert.equal(insufficient.projectionByItem.has(missing), false);
assert.equal(insufficient.projectionByItem.get(pairs[0]!), 0.25);

function observation(name: string, value: number, effort = "max", cost = 2): CrosswalkObservation {
  return {
    benchmark_key: "terminal_bench_science",
    source_url: "https://example.test",
    model_id: null,
    model: `${name} (${effort})`,
    base_model: name,
    reasoning_effort: effort,
    model_creator: "Example",
    rank: null,
    canonical_value: value,
    cost,
    seconds_per_task: 20,
    observed_at: null,
    metadata: { time_measure: "wall" },
  };
}
const a = pairs.map((r) => observation(r.name, r.a));
const b = pairs.map((r) => observation(r.name, r.b, "max", 4));
const fused = crosswalkBenchmarkSources(
  [...a, observation("Grok", 0.4, "xhigh")],
  [...b, observation("Grok", 0.2, "high", 4), observation("Missing", 0.7)],
);
const direct = fused.find((r) => r.base_model === "model-0" && !r.metadata.fusion_collapsed)!;
assert.equal(direct.canonical_value, 0.25);
assert.equal(direct.cost, null, "six models cannot establish absolute resource comparability");
assert.equal(direct.seconds_per_task, null);
assert.equal(direct.metadata.fusion_cost_comparable, false);
assert.equal(direct.total_cost_usd, undefined, "fusion must not manufacture pooled totals");
const swapped = crosswalkBenchmarkSources(b, a).find(
  (r) => r.base_model === "model-0" && !r.metadata.fusion_collapsed,
)!;
assert.equal(
  swapped.canonical_value,
  direct.canonical_value,
  "swapping sources must preserve the midpoint",
);
assert.equal(swapped.cost, direct.cost);
const collapsed = fused.find((r) => r.base_model === "Grok" && r.metadata.fusion_collapsed)!;
assert.ok(Math.abs(collapsed.canonical_value - 0.3) < 1e-10);
assert.equal(collapsed.metadata.source_a_effort, "xhigh");
assert.equal(collapsed.metadata.source_b_effort, "high");
assert.equal(
  fused.filter((r) => r.base_model === "Grok" && !r.metadata.fusion_collapsed).length,
  2,
);
const crosswalked = fused.find((r) => r.base_model === "Missing" && !r.metadata.fusion_collapsed)!;
const candidate = {
  benchmarks: { terminal_bench_science: crosswalked.canonical_value },
  scoring_sources: { terminal_bench_science: crosswalked },
};
assert.equal(crosswalked.metadata.fusion_crosswalk_applied, true);
assert.equal(crosswalked.metadata.source_a_score, null);
assert.equal(crosswalked.metadata.source_b_score, 0.7);
assert.equal(
  benchmarkMetricValue(candidate, "terminal_bench_science"),
  crosswalked.canonical_value,
);
assert.equal(observedBenchmarkCount(candidate, ["terminal_bench_science"]), 1);
assert.deepEqual(benchmarkQualityEvidence(candidate, "terminal_bench_science"), {
  evidenceFactor: 1,
  value: crosswalked.canonical_value,
});
const unvalidated = crosswalkBenchmarkSources(a.slice(0, 5), [
  ...b.slice(0, 5),
  observation("unvalidated", 0.7),
]);
assert.equal(
  unvalidated.some((row) => row.base_model === "unvalidated"),
  false,
  "a single-source result requires an accepted quality crosswalk",
);
const resourceCandidate = {
  ...candidate,
  task_metrics: { terminal_bench_science: { cost: crosswalked.cost } },
};
assert.equal(benchmarkTaskMetrics(resourceCandidate, "terminal_bench_science"), null);
assert.equal(
  benchmarkFusionResourceEstimate(resourceCandidate, "terminal_bench_science", "cost"),
  null,
  "an incompatible source cannot fill another source's missing resource",
);
assert.equal(
  separatedBenchmarkResourceEvidence(resourceCandidate, "terminal_bench_science", "cost")?.[0]
    ?.amount,
  2,
);
assert.deepEqual(buildTaskMetrics(null, resourceCandidate.scoring_sources), {
  terminal_bench_science__source_b: {
    quality: 0.7,
    cost: 2,
    seconds: 20,
    observed_at: null,
  },
});

const agreementA = Array.from({ length: 10 }, (_, index) =>
  observation(`agreement-${index}`, 0.2 + index * 0.03, "max", 100),
);
const agreementB = agreementA.map((row, index) => ({
  ...row,
  canonical_value: row.canonical_value + 0.01,
  cost: index === 9 ? 106 : 104,
}));
const acceptedAgreement = crosswalkBenchmarkSources(agreementA, agreementB, {
  sourceLabels: { a: "Official", b: "Publisher" },
});
const acceptedResource = acceptedAgreement.find(
  (row) => row.base_model === "agreement-0" && row.metadata.fusion_collapsed === false,
)!;
assert.equal(acceptedResource.cost, 102);
assert.equal(acceptedResource.metadata.fusion_cost_paired_models, 10);
assert.equal(acceptedResource.metadata.fusion_cost_within_5_percent_share, 0.9);
assert.equal(acceptedResource.metadata.fusion_cost_comparable, true);
assert.equal(acceptedResource.metadata.source_b_label, "Publisher");
const rejectedAgreement = crosswalkBenchmarkSources(
  agreementA,
  agreementB.map((row, index) => (index >= 8 ? { ...row, cost: 106 } : row)),
);
assert.equal(
  rejectedAgreement.find(
    (row) => row.base_model === "agreement-0" && row.metadata.fusion_collapsed === false,
  )?.cost,
  null,
  "more than 10% of model-balanced pairs outside 5% must block raw fusion",
);
const display = compactModelVariants(
  [
    {
      ...minimalModelAtlasModel({ id: "provider/grok", name: "Grok" }),
      reasoning_effort: "xhigh",
      benchmarks: { terminal_bench_science: 0.4 },
    },
  ],
  { terminal_bench_science: fused },
);
assert.ok(Math.abs(display[0]!.benchmarks!.terminal_bench_science! - 0.3) < 1e-10);
assert.equal(a[0]!.canonical_value, 0.2, "raw observations stay unchanged");

const scienceA = pairs.map((row) => observation(row.name, row.a, "max", 2));
const scienceB = pairs.map((row) => observation(row.name, row.a + 0.1, "max", 4));
const scienceC = pairs.map((row) => observation(row.name, row.a + 0.2, "max", 6));
const threeSource = crosswalkThreeBenchmarkSources(
  [...scienceA, observation("official-only", 0.4)],
  [...scienceB, observation("two-source", 0.5)],
  [...scienceC, observation("two-source", 0.6)],
  { sourceLabels: { a: "Official", b: "Vals", c: "Artificial Analysis" } },
);
const measuredThree = threeSource.find(
  (row) => row.base_model === "model-0" && !row.metadata.fusion_collapsed,
)!;
assert.ok(Math.abs(measuredThree.canonical_value - 0.3) < 1e-10);
assert.equal(measuredThree.metadata.fusion_crosswalk_applied, false);
assert.equal(measuredThree.cost, null, "different source telemetry must remain separate");
assert.equal(measuredThree.metadata.source_a_cost, 2);
assert.equal(measuredThree.metadata.source_b_cost, 4);
assert.equal(measuredThree.metadata.source_c_cost, 6);
assert.equal(measuredThree.metadata.source_c_label, "Artificial Analysis");
const oneObserved = threeSource.find(
  (row) => row.base_model === "official-only" && !row.metadata.fusion_collapsed,
)!;
assert.ok(Math.abs(oneObserved.canonical_value - 0.5) < 1e-10);
assert.equal(oneObserved.metadata.fusion_crosswalk_applied, true);
assert.equal(oneObserved.metadata.source_b_score, null);
assert.equal(oneObserved.metadata.source_c_score, null);
const extrapolatedThree = crosswalkThreeBenchmarkSources(
  [...scienceA, observation("outside-overlap", 0.9)],
  scienceB,
  scienceC,
).find((row) => row.base_model === "outside-overlap" && !row.metadata.fusion_collapsed)!;
assert.equal(extrapolatedThree.metadata.fusion_extrapolated, true);
assert.equal(extrapolatedThree.metadata.fusion_confidence, 0.5);
const pairSpecificRange = crosswalkThreeBenchmarkSources(
  [...scienceA, observation("ab-only", 0.05), observation("within-union-outside-pair", 0.1)],
  [...scienceB, observation("ab-only", 0.15), observation("within-union-outside-pair", 0.2)],
  scienceC,
).find((row) => row.base_model === "within-union-outside-pair" && !row.metadata.fusion_collapsed)!;
assert.equal(
  pairSpecificRange.metadata.fusion_extrapolated,
  true,
  "the A-C and B-C predictions extrapolate even when A and B lie inside their union ranges",
);
const twoObserved = threeSource.find(
  (row) => row.base_model === "two-source" && !row.metadata.fusion_collapsed,
)!;
assert.ok(Math.abs(twoObserved.canonical_value - 0.5) < 1e-10);
assert.equal(twoObserved.metadata.source_a_score, null);
assert.equal(twoObserved.metadata.fusion_crosswalk_applied, true);
const insufficientThird = crosswalkThreeBenchmarkSources(
  [...scienceA, observation("missing-third", 0.4)],
  scienceB,
  scienceC.slice(0, 5),
);
assert.equal(
  insufficientThird.some((row) => row.base_model === "missing-third"),
  false,
  "a third-source counterpart requires a validated six-model crosswalk",
);
const unstableA = pairs.map((row) => observation(row.name, row.a));
const unstableB = pairs.map((row, index) =>
  observation(row.name, row.a + 0.1 + (index < 3 ? -0.02 : 0.02)),
);
const unstableC = pairs.map((row, index) =>
  observation(row.name, row.a + 0.2 + (index < 3 ? -0.02 : 0.02)),
);
const unstableThree = crosswalkThreeBenchmarkSources(
  [...unstableA, observation("unstable-only", 0.4)],
  [...unstableB, observation("unstable-two-observed", 0.5)],
  [...unstableC, observation("unstable-two-observed", 0.6)],
);
assert.equal(
  unstableThree.some((row) => row.base_model === "unstable-only"),
  false,
  "pairwise midpoint error below 2.5pp cannot certify a three-source mean above 2.5pp",
);
assert.equal(
  unstableThree.some((row) => row.base_model === "model-0" && !row.metadata.fusion_collapsed),
  true,
  "failed imputation validation must preserve three directly measured scores",
);
assert.equal(
  unstableThree.some(
    (row) => row.base_model === "unstable-two-observed" && !row.metadata.fusion_collapsed,
  ),
  true,
  "a passing two-observed pattern remains usable when a one-observed pattern fails",
);
const completeRouteNames = Array.from({ length: 6 }, (_, index) => `route-complete-${index}`);
const routeA = [
  ...completeRouteNames.map((name) => observation(name, 0.2)),
  ...Array.from({ length: 20 }, (_, index) => observation(`ac-only-${index}`, 0.2)),
  observation("masked-offset-only", 0.2),
];
const routeB = [
  ...completeRouteNames.map((name) => observation(name, 0.3)),
  ...Array.from({ length: 29 }, (_, index) => observation(`bc-only-${index}`, 0.3)),
  observation("masked-offset-only", 0.3),
];
const routeC = [
  ...completeRouteNames.map((name) => observation(name, 0.46)),
  ...Array.from({ length: 20 }, (_, index) =>
    observation(`ac-only-${index}`, index < 10 ? 0.52 : 0.64),
  ),
  ...Array.from({ length: 29 }, (_, index) => observation(`bc-only-${index}`, 0.34)),
];
const maskedRoute = crosswalkThreeBenchmarkSources(routeA, routeB, routeC);
assert.equal(
  maskedRoute.some((row) => row.base_model === "masked-offset-only"),
  false,
  "validation must reject a 0.28 projection when the held-out 0.32 target needs an ineligible A-C route",
);
assert.equal(
  maskedRoute.find((row) => row.base_model === "route-complete-0" && !row.metadata.fusion_collapsed)
    ?.canonical_value,
  0.32,
  "direct three-source results remain available",
);
const differentThirdEffort = crosswalkThreeBenchmarkSources(
  [...scienceA, observation("different-effort", 0.4, "xhigh")],
  scienceB,
  [...scienceC, observation("different-effort", 0.6, "high")],
);
assert.equal(
  differentThirdEffort.find(
    (row) => row.base_model === "different-effort" && row.reasoning_effort === "xhigh",
  )?.metadata.source_c_score,
  null,
  "a different effort cannot masquerade as matched direct evidence",
);
assert.equal(
  differentThirdEffort.find(
    (row) => row.base_model === "different-effort" && row.metadata.fusion_collapsed,
  )?.metadata.source_c_effort,
  "high",
);

const unavailableAa = fusedBenchmarkObservations({
  terminalBench4Rows: [],
  artificialAnalysisBenchmarkResourceRows: [],
  terminalBenchScienceRows: [
    { ...observation("science", 0.4), metadata: { source_series: "official" } },
    { ...observation("science", 0.6), metadata: { source_series: "vals" } },
  ],
  gdpPdfRows: [{ ...observation("gdp", 0.4), benchmark_key: "gdp_pdf" }],
  aleBenchConfigurationRows: [],
  weirdMlRows: [],
});
assert.equal(unavailableAa.gdp_pdf?.length, 0);
assert.equal(unavailableAa.terminal_bench_science?.length, 0);

const official = processTerminalBench4Payload({
  leaderboard: {
    package: "terminal-bench/terminal-bench",
    name: "4-0-0",
    title: "Terminal-Bench 4.0",
    dataset_version_ids: ["v4"],
  },
  rows: [
    {
      status: "display",
      metadata: {
        model_display: { label: "Model" },
        agent_display: { label: "Agent" },
        reasoning_effort: "max",
      },
      metrics: {
        accuracy: 50,
        accuracy_ci95_half_width: 2,
        n_trials: 330,
        total_cost_usd: 660,
        total_tokens: 33000,
        output_tokens: 6600,
        avg_trial_duration_sec: 120,
      },
    },
  ],
})[0]!;
assert.equal(official.cost_per_task_usd, 2);
assert.equal(official.tokens_per_task, 100);
assert.equal(official.output_tokens_per_task, 20);
assert.equal(official.seconds_per_task, 120, "average duration must not be divided again");

const sparse = processArtificialAnalysisBenchmarkResourceRows(
  [
    {
      slug: "example-model",
      name: "Example Model",
      creator: { name: "OpenAI", slug: "openai" },
      terminalbenchV40: 0.4,
    },
  ],
  {
    benchmark_key: "terminal_bench_4",
    score_key: "terminalbenchV40",
    resource_key: "terminalbenchV40",
    url: "https://artificialanalysis.ai/evaluations/terminalbench-v4-0",
    task_run_count: 198,
    full_model_coverage: true,
  },
);
assert.equal(sparse[0]?.score, 0.4);
assert.equal(
  sparse[0]?.cost_per_task_usd,
  null,
  "missing telemetry cannot discard observed quality",
);

const scienceBinding = BENCHMARK_OBSERVATION_BINDINGS.find(
  (binding) => binding.benchmark === "terminal_bench_science",
)!;
assert.ok(scienceBinding.loader.kind === "terminal_bench_science");
const officialScienceUrl = scienceBinding.loader.sourceUrl;
const cached = readBenchmarkObservationRawCache(
  ["official", "vals"].map((series, row_index) => ({
    source_key: "terminal_bench_science",
    row_index,
    fetched_at_epoch_seconds: 1,
    benchmark_key: "terminal_bench_science",
    url:
      series === "official"
        ? officialScienceUrl
        : "https://www.vals.ai/benchmarks/terminal-bench-science",
    model: "Example",
    base_model: "Example",
    reasoning_effort: "max",
    canonical_value: 0.4,
    cost: 2,
    tokens_per_task: 100,
    task_run_count: 210,
    total_cost_usd: 420,
    total_tokens: 21000,
    metadata_json: JSON.stringify({
      source_series: series,
      source_revision: "v0-1-eval",
      observation_role: series === "vals" ? "component" : null,
    }),
  })),
  scienceBinding,
);
assert.equal(cached?.rows.length, 2, "cache reconstruction must retain both source URLs");

// Identity matching must survive differing release metadata, resources, and benchmark outcomes.
const { mergeWeirdMlRows } = await import("../src/model-atlas/sources/weirdml");
const creator = pairs.map((r) => ({
  ...observation(r.name, r.a),
  benchmark_key: "weirdml",
  observed_at: "2026-08-31",
  metadata: { weirdml_origin: "creator", cost_per_run_usd: 2, code_len_p50: 100 },
}));
const epoch = pairs.map((r) => ({
  model_version: r.name,
  name: r.name,
  aliases: [r.name],
  base_model: r.name,
  reasoning_effort: "max",
  provider: null,
  accuracy: r.b,
  cost_per_run_usd: 10,
  code_len_p50: 120,
  observed_at: "2026-09-01",
}));
const reconciled = mergeWeirdMlRows(creator, epoch);
assert.equal(
  reconciled.crosswalk.matchedRowCount,
  6,
  "metadata and score differences cannot veto known identities",
);
assert.equal(reconciled.data.length, 12, "raw source values remain separate");
assert.equal(reconciled.data[0]?.canonical_value, creator[0]?.canonical_value);
const joined = crosswalkBenchmarkSources(
  reconciled.data.filter((r) => r.metadata.weirdml_origin === "creator"),
  reconciled.data.filter((r) => r.metadata.weirdml_origin === "epoch"),
);
assert.equal(joined.find((r) => r.base_model === "model-0")?.canonical_value, 0.25);
const native = crosswalkBenchmarkSources(
  [{ ...observation("ALE model", 1400), benchmark_key: "ale_bench" }],
  [{ ...observation("ALE model", 1600), benchmark_key: "ale_bench" }],
  { maximumScoreError: 0.01, normalizeScore: (value) => Math.max(0, value) },
);
assert.equal(native[0]?.canonical_value, 1500, "Performance must not be clamped to a probability");
const { readAleBenchRawCache } = await import("../src/model-atlas/sources/ale-bench/runtime");
const mirror = {
  model: "Example-high",
  model_version: "example",
  performance: 1500,
  rank: 1,
  cost: 2,
  input_tokens: 100,
  output_tokens: 200,
  total_tokens: 300,
};
const aleCache = readAleBenchRawCache([
  {
    url: "https://epoch.ai/data/external_benchmarks/ale_bench.csv",
    fetched_at_epoch_seconds: 1,
    epoch_json: JSON.stringify(mirror),
  },
]);
assert.deepEqual(aleCache?.rows, [{ model: mirror.model, epoch: mirror }]);
const { fuseAleBenchRows } = await import("../src/model-atlas/sources/ale-bench/leaderboard");
assert.deepEqual(
  fuseAleBenchRows(aleCache!.rows),
  [],
  "one source without calibration cannot manufacture a fused score",
);

const differentEffort = mergeWeirdMlRows(
  creator,
  epoch.map((row) => ({ ...row, reasoning_effort: "high" })),
);
assert.equal(
  differentEffort.crosswalk.matchedRowCount,
  0,
  "same model at a different effort is not a pair",
);
const sameNumbers = mergeWeirdMlRows(
  creator,
  epoch.map((row, i) => ({
    ...row,
    model_version: `unrelated-${i}`,
    name: `Unrelated ${i}`,
    aliases: [`unrelated-${i}`],
    base_model: `Unrelated ${i}`,
    accuracy: creator[i]!.canonical_value,
    cost_per_run_usd: 2,
    code_len_p50: 100,
  })),
);
assert.equal(
  sameNumbers.crosswalk.matchedRowCount,
  0,
  "equal measured values cannot establish model identity",
);
