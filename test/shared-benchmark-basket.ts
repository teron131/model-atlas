/** Protect fixed-basket resource curves against task-mixture reversals and unequal quality coverage. */

import assert from "node:assert/strict";

import {
  frontierBenchmarkAxisConfigFor,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  frontierEvidenceWeight,
  frontierXAxisScale,
  meanFrontierBenchmarkRows,
} from "../app/dashboard/graphs/frontier-benchmarks/analysis";
import { sharedFrontierBenchmarkComparison } from "../app/dashboard/graphs/frontier-benchmarks/common-evidence";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const low = {
  ...minimalModelAtlasModel({ id: "test/model", name: "Model" }),
  reasoning_effort: "low",
};
const high = { ...low, reasoning_effort: "high" };
function row(
  model: typeof low,
  key: string,
  score: number,
  cost: number | null,
  seconds: number | null = null,
): FrontierBenchmarkRow {
  return {
    model,
    benchmarkKey: key,
    benchmarkLabel: key,
    resourcePolicy: null,
    score,
    cost,
    seconds,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
}
const observed = [
  row(low, "a", 50, 10, 5),
  row(low, "b", 100, null, 10),
  row(high, "a", 70, 20, null),
  row(high, "b", 5, 1, 20),
];
const references = [
  ...observed,
  row({ ...low, id: "test/reference", name: "Reference" }, "a", 0, 1),
  row({ ...low, id: "test/reference", name: "Reference" }, "b", 0, 50),
];
const cost = sharedFrontierBenchmarkComparison(observed, references, ["a", "b"], "cost");
assert.deepEqual(cost.benchmarkKeys, ["a"]);
assert.equal(cost.rows.length, 2);
assert.ok(
  cost.rows.find((r) => r.model.reasoning_effort === "high")!.cost! >
    cost.rows.find((r) => r.model.reasoning_effort === "low")!.cost!,
);
assert.ok(
  cost.rows.find((r) => r.model.reasoning_effort === "high")!.score >
    cost.rows.find((r) => r.model.reasoning_effort === "low")!.score,
  "Unpaired quality on another benchmark cannot distort the y-axis",
);
const time = sharedFrontierBenchmarkComparison(observed, references, ["a", "b"], "time");
assert.deepEqual(time.benchmarkKeys, ["b"], "Time uses its own shared observations");
assert.equal(
  time.rows.find((r) => r.model.reasoning_effort === "low")!.seconds,
  0,
  "A normalized zero is a valid measured endpoint",
);
const disjoint = sharedFrontierBenchmarkComparison(
  [observed[0]!, observed[3]!],
  references,
  ["a", "b"],
  "cost",
);
assert.deepEqual(disjoint.rows, []);
assert.deepEqual(disjoint.benchmarkKeys, []);
assert.deepEqual(
  sharedFrontierBenchmarkComparison(observed, references, ["a"], "cost").rows,
  [observed[0], observed[2]],
  "Single-benchmark views retain native values",
);
const crossModel = sharedFrontierBenchmarkComparison(
  [...observed, row({ ...low, id: "test/another", name: "Another" }, "b", 40, 4)],
  references,
  ["a", "b"],
  "cost",
);
assert.equal(
  crossModel.rows.length,
  3,
  "Another model cannot erase the first model's common basket",
);
assert.deepEqual(
  crossModel.groups.map((group) => group.benchmarkKeys),
  [["a"], ["b"]],
);

// Adding sparse tasks must preserve the index baseline's variants and common measurements.
const indexKey = "aa_intelligence_index";
const proxies = [row(low, indexKey, 40, 2, 10), row(high, indexKey, 50, 4, 20)];
const augmented = [
  ...proxies,
  ...observed,
  row({ ...low, name: "Task only", id: "test/task-only" }, "b", 30, 1),
];
const mixed = sharedFrontierBenchmarkComparison(augmented, augmented, [indexKey, "a", "b"], "cost");
assert.deepEqual(mixed.groups[0]?.benchmarkKeys, [indexKey, "a"]);
assert.equal(mixed.rows.length, proxies.length + 1);
assert.equal(mixed.indexVariantCount, 2);
assert.equal(mixed.excludedVariantCount, 0);
const indexFallback = sharedFrontierBenchmarkComparison(
  [...proxies, observed[0]!],
  augmented,
  [indexKey, "a"],
  "time",
);
assert.deepEqual(indexFallback.benchmarkKeys, [indexKey]);
assert.equal(
  indexFallback.rows.length,
  2,
  "Missing task coverage cannot erase the index comparison",
);
const proxyModel = {
  ...low,
  intelligence: { intelligence_index: 0.5 },
  benchmarks: { arc_agi_2: 0.6, epoch_capabilities_index: 30 },
  task_metrics: { artificial_analysis: { cost: 2, seconds: 20, output_tokens: 100 } },
};
const policy = {
  group: "baseline",
  benchmarkImportance: 0.5,
  dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
} as const;
const proxyRows = frontierBenchmarkRows([proxyModel], {
  aa_intelligence_index: policy,
  epoch_capabilities_index: policy,
  arc_agi_2: { ...policy, group: "frontier" },
});
assert.equal(
  proxyRows.find((r) => r.benchmarkKey === indexKey)?.score,
  0.5,
  "Native index points are not percentages",
);
assert.equal(proxyRows.find((r) => r.benchmarkKey === indexKey)?.cost, 2);
assert.equal(
  proxyRows.find((r) => r.benchmarkKey === "epoch_capabilities_index"),
  undefined,
  "An index without effort coverage is excluded from variant comparisons",
);
assert.equal(
  proxyRows.find((r) => r.benchmarkKey === "arc_agi_2")?.cost,
  null,
  "Individual tasks cannot borrow index telemetry",
);

const breadthMean = meanFrontierBenchmarkRows([
  row(low, "aa_intelligence_index", 100, 10, 20),
  row(low, "a", 0, 1, 2),
])[0]!;
assert.equal(
  breadthMean.score,
  1000 / 11,
  "AA carries ten tasks of represented breadth, not one row",
);
assert.equal(breadthMean.cost, 101 / 11);
assert.equal(breadthMean.seconds, 202 / 11, "Both coordinates use the same breadth weights");

const normalizedCostAxis = frontierXAxisScale(
  [0, 13, 40, 100],
  "cost",
  frontierBenchmarkAxisConfigFor("cost", true),
  true,
);
assert.equal(
  normalizedCostAxis.domain[1],
  100,
  "Normalized endpoints must not inflate the cost axis to 200",
);
const outlierCostAxis = frontierXAxisScale(
  [0, 150],
  "cost",
  frontierBenchmarkAxisConfigFor("cost", true),
  true,
);
assert.ok(
  outlierCostAxis.domain[1] >= 150,
  "An actual resource observation beyond the reference maximum stays visible",
);

const graphKeys = [
  "arc_agi_2",
  "frontier_code",
  "automation_bench",
  "deep_swe",
  "cursorbench",
  "arc_agi_3",
  "aa_intelligence_index",
  "epoch_capabilities_index",
  "surge_intelligence_index",
  "vals_index",
  "briefcase",
  "gdpval_normalized",
  "tau_banking",
  "scicode",
  "hle",
  "gdp_pdf",
  "critpt",
];
const allEvidenceKeys = [...graphKeys, "agent_arena", "vending_bench_2"];
const restrictedRows = frontierBenchmarkRows(
  [{ ...low, benchmarks: Object.fromEntries(allEvidenceKeys.map((key) => [key, 0.5])) }],
  Object.fromEntries(allEvidenceKeys.map((key) => [key, { ...policy, group: "frontier" }])),
);
assert.deepEqual(
  restrictedRows.map((row) => row.benchmarkKey).sort(),
  graphKeys
    .filter(
      (key) =>
        !["epoch_capabilities_index", "surge_intelligence_index", "vals_index"].includes(key),
    )
    .sort(),
  "The effort graph includes the approved task benchmarks, standalone AA components, and index proxies",
);

assert.equal(frontierEvidenceWeight("aa_intelligence_index", ["scicode"]), 9);
assert.equal(
  frontierEvidenceWeight("aa_intelligence_index", ["scicode", "hle", "scicode"]),
  8,
  "Each separately included component reduces AA breadth once",
);
assert.equal(
  frontierEvidenceWeight("aa_intelligence_index", ["arc_agi_2", "terminal_bench_4"]),
  10,
  "A distinct benchmark or version is not an AA component",
);
const residualMean = meanFrontierBenchmarkRows([
  row(low, "aa_intelligence_index", 100, 10, 20),
  row(low, "scicode", 0, 0, 0),
])[0]!;
assert.equal(residualMean.score, 90);
assert.equal(residualMean.cost, 9);
assert.equal(residualMean.seconds, 18);
const incompleteComponent = sharedFrontierBenchmarkComparison(
  [
    row(low, "aa_intelligence_index", 40, 2),
    row(high, "aa_intelligence_index", 50, 4),
    row(low, "scicode", 70, 1),
    row(high, "scicode", 80, null),
  ],
  [
    row(low, "aa_intelligence_index", 40, 2),
    row(high, "aa_intelligence_index", 50, 4),
    row(low, "scicode", 70, 1),
    row(high, "scicode", 80, null),
  ],
  ["aa_intelligence_index", "scicode"],
  "cost",
);
assert.deepEqual(incompleteComponent.groups[0]?.benchmarkKeys, ["aa_intelligence_index"]);
assert.equal(
  incompleteComponent.groups[0]?.indexShare,
  1,
  "An excluded component leaves AA's residual representation intact",
);

// Cost, time, and tokens independently require common paired evidence and preserve the index baseline.
for (const axis of ["cost", "time", "tokens"] as const) {
  const telemetry =
    axis === "cost" ? { cost: 2 } : axis === "time" ? { seconds: 20 } : { output_tokens: 100 };
  const variantModels = [low, high].map((model) => ({
    ...model,
    intelligence: { intelligence_index: 50 },
    task_metrics: { artificial_analysis: telemetry },
  }));
  const projected = frontierBenchmarkRows(variantModels, { aa_intelligence_index: policy });
  const result = sharedFrontierBenchmarkComparison(projected, projected, [indexKey, "a"], axis);
  assert.equal(result.rows.length, 2, `${axis} preserves observed AA variants`);
  assert.deepEqual(result.benchmarkKeys, [indexKey]);
  for (const other of ["cost", "time", "tokens"] as const)
    if (other !== axis) {
      assert.equal(
        sharedFrontierBenchmarkComparison(projected, projected, [indexKey, "a"], other).rows.length,
        0,
        `${axis} evidence cannot fill ${other}`,
      );
    }
}
const totalTokenPolicy = {
  ...policy,
  resourcePolicy: {
    source: "benchmark" as const,
    unit: "per_task" as const,
    tokenMeasure: "tokens" as const,
    qualityCoordinate: "linear" as const,
  },
};
const tokensFor = (metrics: Record<string, number>) =>
  frontierBenchmarkRows(
    [{ ...low, benchmarks: { arc_agi_2: 0.5 }, task_metrics: { arc_agi_2: metrics } }],
    { arc_agi_2: totalTokenPolicy },
  )[0]!.totalTokens;
assert.equal(
  tokensFor({ tokens: 120 }),
  120,
  "Reported total tokens survive even without an input/output breakdown",
);
assert.equal(tokensFor({ input_tokens: 20, output_tokens: 100 }), 120);
assert.equal(
  tokensFor({ input_tokens: 20 }),
  null,
  "Input-only telemetry is not a total-token observation",
);
assert.equal(
  tokensFor({ output_tokens: 100 }),
  null,
  "Output-only telemetry is not a total-token observation",
);
