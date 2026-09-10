/** Protect the independent output-only resource evidence gates and graph exclusion without losing quality-qualified table rows. */
import assert from "node:assert/strict";

import {
  frontierBenchmarkAxisConfig,
  frontierBenchmarkHoverRows,
  frontierBenchmarkRows,
} from "../app/dashboard/graphs/frontier-benchmarks/analysis";
import { priceEfficiencyRows } from "../app/dashboard/graphs/price-efficiency/rows";
import { isGraphEligible, modelsForVariantDisplay } from "../app/dashboard/shared/model-display";
import { publicJsonPayload } from "../app/leaderboard/public-json";
import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import {
  applyResourceEvidenceRequirements,
  observedResourceEvidenceCounts,
} from "../src/model-atlas/pipeline/scores/resource-metrics";
import type { ModelAtlasPayload } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

const portfolio = STAGE_CONFIG.scoring.benchmarkPortfolio;
const keys = ["hle", "scicode", "critpt", "arc_agi_2"];
const model = {
  ...minimalModelAtlasModel({ id: "test/model", name: "Test Model" }),
  reasoning_effort: "high",
  cost: { input: 1, output: 1, blended_price: 1 },
  scores: { intelligence_score: 80, agentic_score: 75, speed_score: 60, value_score: 70 },
  benchmarks: Object.fromEntries(keys.map((key) => [key, 0.5])),
  task_metrics: Object.fromEntries(keys.map((key) => [key, { cost: 1, seconds: 100 }])),
};
const eligible = applyResourceEvidenceRequirements(model, portfolio);
assert.equal(eligible, model);
assert.ok(isGraphEligible(eligible));
const sparse = {
  ...model,
  reasoning_effort: "max",
  task_metrics: {
    ...model.task_metrics,
    arc_agi_2: { seconds: 100 },
    artificial_analysis: { cost: 1 },
  },
};
const gated = applyResourceEvidenceRequirements(sparse, portfolio);
assert.equal(gated.scores.value_score, null);
assert.equal(gated.scores.intelligence_score, sparse.scores.intelligence_score);
assert.equal(gated.scores.agentic_score, sparse.scores.agentic_score);
assert.equal(gated.scores.speed_score, sparse.scores.speed_score);
assert.equal(gated.cost, sparse.cost);
assert.equal(gated.confidence, sparse.confidence);
assert.notEqual(sparse.scores.value_score, null, "Eligibility must not mutate calibration inputs");
assert.equal(isGraphEligible(gated), false);
assert.equal(
  applyResourceEvidenceRequirements(
    { ...model, benchmarks: { ...model.benchmarks, hle: null } },
    portfolio,
  ).scores.value_score,
  null,
  "A cost without an observed quality result cannot satisfy the paired-evidence gate",
);
assert.equal(
  applyResourceEvidenceRequirements({ ...sparse, preview: true }, portfolio).scores.value_score,
  null,
  "Preview status does not turn provider price into four measured task costs",
);
assert.ok(isGraphEligible({ ...model, scores: { ...model.scores, value_score: 0 } }));

const payload = minimalModelAtlasPayload({ fetchedAt: 1, models: [sparse, model] });
payload.metadata.scoring.benchmark_portfolio = portfolio;
const dashboard = publicJsonPayload(payload, "dashboard") as ModelAtlasPayload;
assert.equal(dashboard.models.length, 2, "Both quality-qualified efforts remain table rows");
assert.equal(dashboard.models[0]?.scores.value_score, null);
assert.notEqual(dashboard.models[1]?.scores.value_score, null);
const graphModels = dashboard.models.filter(isGraphEligible);
assert.equal(graphModels.length, 1);
assert.equal(graphModels[0]?.reasoning_effort, "high");
const collapsed = modelsForVariantDisplay(graphModels, false);
assert.equal(collapsed.length, 1);
assert.notEqual(
  collapsed[0]?.scores.value_score,
  null,
  "Collapse must select from eligible efforts",
);
assert.equal(payload.models[0]?.scores.value_score, sparse.scores.value_score);

const costGraph = priceEfficiencyRows(graphModels, dashboard.models, portfolio, false);
assert.equal(
  costGraph[0]?.model.reasoning_effort,
  "high",
  "Graph references cannot resurrect a hidden effort",
);

const missingTime = {
  ...model,
  task_metrics: {
    ...model.task_metrics,
    arc_agi_2: { cost: 1, output_tokens: 1000 },
    artificial_analysis: { seconds: 100 },
  },
  speed: { ...model.speed, throughput_tokens_per_second_median: 100 },
};
const timeGated = applyResourceEvidenceRequirements(missingTime, portfolio);
assert.equal(
  timeGated.scores.speed_score,
  null,
  "Three direct runtimes plus a token proxy or source average are insufficient",
);
assert.equal(
  timeGated.scores.value_score,
  70,
  "Missing runtime does not suppress independently eligible Value",
);
assert.equal(missingTime.scores.speed_score, 60, "The gate must not mutate scoring references");
assert.equal(
  applyResourceEvidenceRequirements({ ...missingTime, preview: true }, portfolio).scores
    .speed_score,
  null,
);
assert.equal(
  applyResourceEvidenceRequirements(
    { ...model, benchmarks: { ...model.benchmarks, hle: null } },
    portfolio,
  ).scores.speed_score,
  null,
  "Runtime without observed quality is not a pair",
);
const timeDashboard = publicJsonPayload(
  minimalModelAtlasPayload({ fetchedAt: 1, models: [missingTime] }),
  "dashboard",
) as ModelAtlasPayload;
assert.equal(timeDashboard.models.length, 1);
assert.equal(timeDashboard.models[0]?.scores.speed_score, null);

const [missingSpeedRow] = frontierBenchmarkRows([timeGated], portfolio);
assert.ok(missingSpeedRow);
assert.equal(frontierBenchmarkAxisConfig.speed.get(missingSpeedRow), null);
assert.equal(
  frontierBenchmarkAxisConfig.value.get(missingSpeedRow),
  70,
  "Missing Speed does not erase independently available Value",
);
assert.ok(
  frontierBenchmarkHoverRows(missingSpeedRow, frontierBenchmarkAxisConfig.cost).every(
    ([label]) => label !== "Speed and Value Scores",
  ),
);
const zeroResourceRow = {
  ...missingSpeedRow,
  model: { ...timeGated, scores: { ...timeGated.scores, speed_score: 0, value_score: 0 } },
};
assert.equal(frontierBenchmarkAxisConfig.speed.get(zeroResourceRow), 0);
assert.equal(frontierBenchmarkAxisConfig.value.get(zeroResourceRow), 0);

const completeEffort = { ...model, reasoning_effort: "max" };
const sparseEffort = {
  ...model,
  reasoning_effort: "low",
  task_metrics: { hle: { cost: 1, seconds: 100 } },
};
const peer = { ...model, id: "test/peer", reasoning_effort: "high" };
const coverageReferences = [completeEffort, sparseEffort, peer];
const coverageRows = priceEfficiencyRows(
  [completeEffort, sparseEffort],
  coverageReferences,
  portfolio,
  true,
);
assert.equal(coverageRows.length, 2);
assert.equal(
  coverageRows[0]!.costEfficiencyScore,
  coverageRows[1]!.costEfficiencyScore,
  "Identical task efficiency must not diverge solely because sibling efforts have different coverage",
);
assert.equal(
  priceEfficiencyRows([sparseEffort], coverageReferences, portfolio, true)[0]!.costEfficiencyScore,
  coverageRows.find((row) => row.model.reasoning_effort === "low")!.costEfficiencyScore,
  "Filtering the source-default effort must not alter the shared coverage reference",
);

// Observed AA resource coverage can qualify a variant without manufacturing standalone task measurements.
const aaOnly = {
  ...model,
  benchmarks: { aa_intelligence_index: 50 },
  intelligence: {},
  task_metrics: { artificial_analysis: { cost: 1, seconds: 100 } },
};
assert.equal(applyResourceEvidenceRequirements(aaOnly, portfolio), aaOnly);
assert.equal(
  applyResourceEvidenceRequirements({ ...aaOnly, preview: true }, portfolio).scores.value_score,
  70,
);
assert.equal(
  applyResourceEvidenceRequirements({ ...aaOnly, benchmarks: {} }, portfolio).scores.value_score,
  null,
);
assert.equal(
  applyResourceEvidenceRequirements(
    { ...aaOnly, task_metrics: { artificial_analysis: { cost: 1 } } },
    portfolio,
  ).scores.speed_score,
  null,
);
assert.equal(
  applyResourceEvidenceRequirements(
    { ...aaOnly, task_metrics: { artificial_analysis: { seconds: 100, output_tokens: 1000 } } },
    portfolio,
  ).scores.value_score,
  null,
);
const { aa_intelligence_index: _aa, ...withoutAA } = portfolio;
assert.equal(applyResourceEvidenceRequirements(aaOnly, withoutAA).scores.value_score, null);
assert.deepEqual(aaOnly.task_metrics, { artificial_analysis: { cost: 1, seconds: 100 } });

const aaWithTasks = {
  ...aaOnly,
  benchmarks: { ...model.benchmarks, aa_intelligence_index: 50 },
  task_metrics: { ...model.task_metrics, ...aaOnly.task_metrics },
};
assert.deepEqual(
  observedResourceEvidenceCounts(aaWithTasks, portfolio),
  { cost: 11, time: 11 },
  "Three overlapping AA components count once; the separate ARC task adds one",
);
assert.deepEqual(
  observedResourceEvidenceCounts(
    { ...aaWithTasks, task_metrics: { ...aaWithTasks.task_metrics, scicode: { cost: 1 } } },
    portfolio,
  ),
  { cost: 11, time: 11 },
  "Missing component runtime leaves that runtime covered by AA rather than subtracting it",
);
