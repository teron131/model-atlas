/** Protect independent performance/resource axes, compatible normalization, and measured-only resource coordinates. */

import assert from "node:assert/strict";

import {
  automaticResourceKeys,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  frontierBenchmarkHoverRows,
  type FrontierBenchmarkRow,
  performanceComparisonRows,
  resourceComparisonIssue,
} from "../app/dashboard/graphs/frontier-benchmarks/analysis";
import { sharedFrontierBenchmarkComparison } from "../app/dashboard/graphs/frontier-benchmarks/common-evidence";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const base = minimalModelAtlasModel({ id: "test/model", name: "Model" });
const low = {
  ...base,
  reasoning_effort: "low",
  scores: {
    ...base.scores,
    intelligence_score: 80,
    agentic_score: 65,
    speed_score: null,
    value_score: 55,
  },
};
const high = {
  ...low,
  reasoning_effort: "high",
  scores: { ...low.scores, intelligence_score: 85, agentic_score: 75 },
};
const policy = {
  source: "benchmark",
  unit: "per_task",
  tokenMeasure: "tokens",
  qualityCoordinate: "linear",
} as const;
function row(
  model: typeof low,
  benchmarkKey: string,
  score: number,
  cost: number,
  seconds: number,
): FrontierBenchmarkRow {
  return {
    benchmarkKey,
    benchmarkLabel: benchmarkKey,
    resourcePolicy: policy,
    model,
    score,
    cost,
    seconds,
    inputTokens: null,
    outputTokens: null,
    totalTokens: 100,
  };
}
const evidence = [
  row(low, "a", 30, 10, 100),
  row(high, "a", 70, 30, 200),
  row(low, "b", 20, 1000, 20),
  row(high, "b", 80, 2000, 40),
];

assert.deepEqual(Object.keys(frontierBenchmarkAxisConfig), [
  "cost",
  "time",
  "tokens",
  "speed",
  "value",
]);
assert.deepEqual(
  performanceComparisonRows([low, high], [], "intelligence", "cost"),
  [],
  "Published quality cannot invent measured cost",
);
const scoreRows = performanceComparisonRows([low, high], [], "agentic", "value");
assert.deepEqual(
  scoreRows.map((entry) => entry.score),
  [65, 75],
);
assert.equal(
  frontierBenchmarkAxisConfig.value.get(scoreRows[0]!),
  55,
  "Published Value is independent of evidence selection",
);
assert.equal(
  frontierBenchmarkAxisConfig.speed.get(scoreRows[0]!),
  null,
  "Missing Speed does not inherit Value or become zero",
);
const zero = { ...low, scores: { ...low.scores, speed_score: 0, value_score: 0 } };
const zeroRows = performanceComparisonRows([zero], [], "intelligence", "speed");
assert.equal(frontierBenchmarkAxisConfig.speed.get(zeroRows[0]!), 0);
assert.equal(
  performanceComparisonRows([low], [evidence[0]!], "intelligence", "cost")[0]?.score,
  80,
);
assert.equal(performanceComparisonRows([low], [evidence[0]!], "intelligence", "cost")[0]?.cost, 10);
assert.equal(performanceComparisonRows([low], [evidence[0]!], "benchmarks", "cost")[0]?.score, 30);

const native = sharedFrontierBenchmarkComparison(evidence, evidence, ["a"], "cost");
assert.equal(
  native.rows[0]?.cost,
  10,
  "A single source keeps dollars rather than normalized points",
);
const combined = sharedFrontierBenchmarkComparison(evidence, evidence, ["a", "b"], "cost");
const combinedLow = combined.rows.find((entry) => entry.model.reasoning_effort === "low")!;
const combinedHigh = combined.rows.find((entry) => entry.model.reasoning_effort === "high")!;
assert.equal(combinedLow.cost, 0);
assert.equal(combinedHigh.cost, 100, "Different native scales are normalized before averaging");
const filtered = sharedFrontierBenchmarkComparison(
  evidence.filter((entry) => entry.model === low),
  evidence,
  ["a", "b"],
  "cost",
);
assert.equal(
  filtered.rows[0]?.cost,
  combinedLow.cost,
  "Filtering models cannot change reference normalization",
);
const missingReference = sharedFrontierBenchmarkComparison(
  evidence,
  evidence.filter((entry) => entry.benchmarkKey === "a"),
  ["a", "b"],
  "cost",
);
assert.deepEqual(
  missingReference.benchmarkKeys,
  ["a"],
  "Uncalibrated sources cannot be counted in the normalized basket",
);
assert.equal(missingReference.rows.find((entry) => entry.model === high)?.cost, 100);
assert.equal(resourceComparisonIssue(evidence, ["a", "b"], "cost"), null);
const mixedUnits = evidence.map((entry) =>
  entry.benchmarkKey === "b"
    ? { ...entry, resourcePolicy: { ...policy, unit: "total" as const } }
    : entry,
);
assert.match(resourceComparisonIssue(mixedUnits, ["a", "b"], "cost")!, /per-task and full-run/);
assert.equal(
  resourceComparisonIssue(mixedUnits, ["b"], "cost"),
  null,
  "Native total-run units remain usable alone",
);
const mixedTokens = evidence.map((entry) =>
  entry.benchmarkKey === "b"
    ? { ...entry, resourcePolicy: { ...policy, tokenMeasure: "output_tokens" as const } }
    : entry,
);
assert.match(
  resourceComparisonIssue(mixedTokens, ["a", "b"], "tokens")!,
  /output tokens and total tokens/,
);
assert.equal(resourceComparisonIssue(mixedTokens, ["a", "b"], "value"), null);
const hover = frontierBenchmarkHoverRows(
  { ...combinedLow, score: 80 },
  frontierBenchmarkAxisConfigFor("cost", true),
  "intelligence",
);
assert.equal(hover[0]?.[0], "Intelligence Score");
assert.match(hover[1]?.[0] as string, /Normalized Cost/);
assert.ok(hover.every(([label]) => label !== "Speed and Value Scores"));
const missingValue = { ...low, scores: { ...low.scores, value_score: null } };
const missingValueRow = { ...evidence[0]!, model: missingValue };
assert.equal(
  performanceComparisonRows([missingValue], [missingValueRow], "intelligence", "cost").length,
  1,
  "Measured cost comparisons do not require a Value score",
);
const qualityBasket = sharedFrontierBenchmarkComparison(
  [evidence[0]!, evidence[1]!, evidence[2]!],
  evidence,
  ["a", "b"],
  "value",
);
assert.deepEqual(
  qualityBasket.benchmarkKeys,
  ["a"],
  "Published X scores still compare Y on consistent evidence across efforts",
);
assert.equal(frontierBenchmarkAxisConfig.value.get(qualityBasket.rows[0]!), 55);

const automaticPortfolio = {
  a: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
    resourcePolicy: policy,
  },
  b: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
    resourcePolicy: policy,
  },
} as const;
assert.deepEqual(automaticResourceKeys(evidence, automaticPortfolio, "intelligence", "cost"), [
  "a",
]);
assert.deepEqual(automaticResourceKeys(evidence, automaticPortfolio, "agentic", "cost"), ["b"]);
assert.deepEqual(
  automaticResourceKeys(
    evidence.map((entry) => ({ ...entry, seconds: null })),
    automaticPortfolio,
    "intelligence",
    "time",
  ),
  [],
  "Automatic selection requires the requested measurement",
);
assert.deepEqual(
  automaticResourceKeys(evidence, automaticPortfolio, "intelligence", "value"),
  [],
  "Model-wide resource scores do not need a source basket",
);

console.log("Unified Pareto comparison checks passed.");
