/** Protect independent performance/resource axes, per-source normalization, and measured-only resource coordinates. */

import assert from "node:assert/strict";

import {
  automaticResourceKeys,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  frontierBenchmarkHoverRows,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  frontierXAxisScale,
  performanceComparisonRows,
} from "../app/dashboard/graphs/frontier-benchmarks/analysis";
import { sharedFrontierBenchmarkComparison } from "../app/dashboard/graphs/frontier-benchmarks/common-evidence";
import {
  resourceRatioObservations,
  resourceRatioReferences,
  summarizeResourceRatios,
} from "../src/model-atlas/stats/resource-ratios";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

function close(actual: number | null | undefined, expected: number) {
  assert.ok(
    actual != null && Math.abs(actual - expected) < 1e-12,
    `${actual} differs from ${expected}`,
  );
}

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
    baseBenchmarkKey: benchmarkKey,
    benchmarkLabel: benchmarkKey,
    weight: 1,
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

const reference = { ...low, id: "test/reference", name: "Reference" };
const referenceEvidence = [
  ...evidence,
  row(reference, "a", 50, 20, 150),
  row(reference, "b", 50, 1500, 30),
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

const native = sharedFrontierBenchmarkComparison(evidence, referenceEvidence, ["a"], "cost");
assert.equal(
  native.rows[0]?.cost,
  10,
  "A single source keeps dollars rather than normalized points",
);
const combined = sharedFrontierBenchmarkComparison(evidence, referenceEvidence, ["a", "b"], "cost");
const combinedLow = combined.rows.find((entry) => entry.model.reasoning_effort === "low")!;
const combinedHigh = combined.rows.find((entry) => entry.model.reasoning_effort === "high")!;
close(combinedLow.cost, 7 / 12);
close(combinedHigh.cost, 17 / 12);
const filtered = sharedFrontierBenchmarkComparison(
  evidence.filter((entry) => entry.model === low),
  referenceEvidence,
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
  referenceEvidence.filter((entry) => entry.benchmarkKey === "a"),
  ["a", "b"],
  "cost",
);
assert.deepEqual(
  missingReference.benchmarkKeys,
  ["a"],
  "Uncalibrated sources cannot be counted in the normalized basket",
);
assert.equal(missingReference.rows.find((entry) => entry.model === high)?.cost, 1.5);
// Each source keeps its own denominator, and tokens describe actual total consumption.
const mixedUnits = evidence.map((entry) =>
  entry.benchmarkKey === "b"
    ? { ...entry, resourcePolicy: { ...policy, unit: "total" as const } }
    : entry,
);
const unitComparison = sharedFrontierBenchmarkComparison(
  mixedUnits,
  referenceEvidence,
  ["a", "b"],
  "cost",
);
close(unitComparison.rows.find((entry) => entry.model === low)?.cost, 7 / 12);
close(unitComparison.rows.find((entry) => entry.model === high)?.cost, 17 / 12);
const mixedTokens = evidence.map((entry) => ({
  ...entry,
  resourcePolicy: {
    ...policy,
    tokenMeasure: entry.benchmarkKey === "a" ? ("tokens" as const) : ("output_tokens" as const),
  },
  totalTokens:
    entry.benchmarkKey === "a"
      ? entry.model === low
        ? 10
        : 30
      : entry.model === low
        ? 3000
        : 1000,
}));
const tokenReferences = [
  ...mixedTokens,
  { ...row(reference, "a", 50, 20, 150), totalTokens: 20 },
  { ...row(reference, "b", 50, 1500, 30), totalTokens: 2000 },
];

const tokenComparison = sharedFrontierBenchmarkComparison(
  mixedTokens,
  tokenReferences,
  ["a", "b"],
  "tokens",
);
assert.equal(tokenComparison.rows.length, 2);
assert(
  tokenComparison.rows.every((entry) => entry.totalTokens === 1),
  "Each source uses its own median before ratios are combined",
);
const filteredTokens = sharedFrontierBenchmarkComparison(
  mixedTokens.filter((entry) => entry.model === low),
  tokenReferences,
  ["a", "b"],
  "tokens",
);
assert.equal(filteredTokens.rows[0]?.totalTokens, 1, "Filtering does not redefine source ranges");
assert.equal(
  sharedFrontierBenchmarkComparison(mixedTokens, mixedTokens, ["b"], "tokens").rows.find(
    (entry) => entry.model === low,
  )?.totalTokens,
  3000,
  "Single-source views retain native token values",
);
const hover = frontierBenchmarkHoverRows(
  { ...combinedLow, score: 80 },
  frontierBenchmarkAxisConfigFor("cost", true),
  "intelligence",
);
assert.equal(hover[0]?.[0], "Intelligence Score");
assert.match(hover[1]?.[0] as string, /Relative Cost/);
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
  referenceEvidence,
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
assert.deepEqual(automaticResourceKeys(evidence, "cost"), ["a", "b"]);
assert.deepEqual(
  automaticResourceKeys(
    evidence.map((entry) => ({ ...entry, seconds: null })),
    "time",
  ),
  [],
  "Automatic selection requires the requested measurement",
);
assert.deepEqual(
  automaticResourceKeys(evidence, "value"),
  [],
  "Model-wide resource scores do not need a source basket",
);

// Table and default graph consume the same observed basket and fixed reference medians.
const displayedA = {
  ...minimalModelAtlasModel({ id: "test/a", name: "Displayed A" }),
  benchmarks: { hle: 0.4, scicode: 0.6 },
  task_metrics: {
    hle: { cost: 2, seconds: 2, tokens: 100, output_tokens: 20 },
    scicode: { cost: 8, seconds: 10, tokens: 500, output_tokens: 40 },
  },
};
const displayedB = {
  ...minimalModelAtlasModel({ id: "test/b", name: "Displayed B" }),
  benchmarks: { hle: 0.8, scicode: 0.7 },
  task_metrics: {
    hle: { cost: 6, seconds: 6, tokens: 300, output_tokens: 60 },
    scicode: { cost: 24, seconds: 30, tokens: 1500, output_tokens: 120 },
  },
};
const displayPortfolio = { hle: { ...automaticPortfolio.a }, scicode: { ...automaticPortfolio.b } };
for (const kind of ["cost", "time", "tokens"] as const) {
  const observations = resourceRatioObservations([displayedA, displayedB], displayPortfolio, kind);
  const references = resourceRatioReferences(observations);
  const graphRows = frontierBenchmarkRows([displayedA, displayedB], displayPortfolio, kind);
  const keys = automaticResourceKeys(graphRows, kind);
  const graph = sharedFrontierBenchmarkComparison(graphRows, graphRows, keys, kind);
  const table = summarizeResourceRatios(
    observations.filter((entry) => entry.model === displayedA),
    references,
  );
  close(
    frontierBenchmarkAxisConfig[kind].get(graph.rows.find((entry) => entry.model === displayedA)!),
    table.ratio!,
  );
}
const outputOnly = { ...displayedA, task_metrics: { hle: { output_tokens: 50 } } };
assert.equal(
  frontierBenchmarkRows([outputOnly], displayPortfolio, "tokens").find(
    (entry) => entry.baseBenchmarkKey === "hle",
  )?.totalTokens,
  null,
  "Graph total tokens never inherit output-only telemetry",
);
assert.equal(
  frontierBenchmarkRows([outputOnly], displayPortfolio, "tokens").find(
    (entry) => entry.baseBenchmarkKey === "hle",
  )?.outputTokens,
  50,
);
assert.match(frontierBenchmarkAxisConfigFor("cost", true).format(0.5), /0.50×/);

assert.match(frontierBenchmarkAxisConfigFor("time", true).format(0.5), /0.50×/);
assert.ok(
  frontierXAxisScale([0.5, 1.5], "time", frontierBenchmarkAxisConfigFor("time", true)).domain[1] <
    10,
  "Relative Time uses a ratio axis instead of a 0–100 score axis",
);

console.log("Unified Pareto comparison checks passed.");
