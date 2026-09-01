/** Behavior checks for the Frontier Benchmarks chart data model. */

import assert from "node:assert/strict";

import {
  frontierAxisDescription,
  frontierAxisMetricLabel,
  frontierBenchmarkAxisConfigFor,
  frontierBenchmarkAxisOptions,
  frontierBenchmarkHoverRows,
  frontierBenchmarkRows,
  normalizedFrontierBenchmarkRows,
  normalizedFrontierBenchmarkScoreRows,
  selectedFrontierBenchmarkAxisKey,
  selectedFrontierBenchmarkRows,
  speedValueBlendScore,
} from "../app/dashboard/graphs/frontier-benchmarks/analysis";
import { transformBenchmarkSourceValue } from "../src/model-atlas/benchmarks/registry";
import type { BenchmarkPortfolio, ModelAtlasModel } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const portfolio = {
  deep_swe: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
    resourcePolicy: {
      source: "benchmark",
      unit: "per_task",
      tokenMeasure: "tokens",
      qualityCoordinate: "logit",
    },
  },
  gpqa: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
} satisfies BenchmarkPortfolio;

const efficient = frontierModel({
  id: "provider/efficient",
  name: "Efficient",
  score: 0.82,
  cost: 2,
  seconds: 30,
  inputTokens: 1_000,
  outputTokens: 200,
  valueScore: 95,
  speedScore: 80,
  intelligenceScore: 72,
});
const expensive = frontierModel({
  id: "provider/expensive",
  name: "Expensive",
  score: 0.9,
  cost: 8,
  seconds: 120,
  inputTokens: 2_000,
  outputTokens: 1_000,
  valueScore: 40,
  speedScore: 20,
  intelligenceScore: 91,
});

const rows = frontierBenchmarkRows([efficient, expensive], portfolio);
const topRow = rows[0];
const secondRow = rows[1];
assert.ok(topRow);
assert.ok(secondRow);

const referenceFloor = frontierModel({
  id: "provider/reference-floor",
  name: "Reference floor",
  score: 0.5,
  cost: 1,
  seconds: 10,
  inputTokens: 500,
  outputTokens: 100,
  valueScore: 50,
  speedScore: 50,
  intelligenceScore: 50,
});
const referenceModels = [efficient, expensive, referenceFloor];
const referenceRows = frontierBenchmarkRows(referenceModels, portfolio);
assert.deepEqual(
  normalizedFrontierBenchmarkRows(rows, referenceRows).map((row) => [row.model.id, row.score]),
  [
    ["provider/expensive", 100],
    ["provider/efficient", 80],
  ],
  "filtered chart rows should retain normalization from the full reference cohort",
);
const cursorRows = rows.map((row) => ({
  ...row,
  benchmarkKey: "cursorbench",
  benchmarkLabel: "CursorBench",
}));
const cursorReferenceRows = referenceRows.map((row) => ({
  ...row,
  benchmarkKey: "cursorbench",
  benchmarkLabel: "CursorBench",
}));
assert.deepEqual(
  selectedFrontierBenchmarkRows(
    [...rows, ...cursorRows],
    [...referenceRows, ...cursorReferenceRows],
    ["deep_swe", "cursorbench"],
  ).map((row) => [row.model.id, row.score]),
  [
    ["provider/expensive", 100],
    ["provider/efficient", 80],
  ],
  "multiple selected benchmarks should produce one normalized aggregate row per model",
);
assert.deepEqual(
  selectedFrontierBenchmarkRows(rows, referenceRows, ["deep_swe"]).map((row) => row.score),
  [90, 82],
  "one selected benchmark should preserve its native score scale",
);
assert.deepEqual(
  selectedFrontierBenchmarkRows(rows, referenceRows, []),
  [],
  "an empty benchmark selection should remain empty",
);
assert.deepEqual(
  normalizedFrontierBenchmarkScoreRows(
    [
      { ...topRow, benchmarkKey: "ale_bench", score: 1_403 },
      { ...secondRow, benchmarkKey: "ale_bench", score: 900 },
    ],
    [
      { ...topRow, benchmarkKey: "ale_bench", score: 1_403 },
      { ...secondRow, benchmarkKey: "ale_bench", score: 397 },
    ],
  ).map((row) => row.score),
  [100, 50],
  "benchmark-native scores should normalize against the reference cohort without being treated as percentages",
);
assert.deepEqual(
  rows.map((row) => [row.model.id, row.score, row.cost, row.totalTokens]),
  [
    ["provider/expensive", 90, 8, 3_000],
    ["provider/efficient", 82, 2, 1_200],
  ],
  "frontier rows should normalize percentages and attach resource metrics",
);
const gdpvalPortfolio = {
  gdpval_normalized: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
  },
} satisfies BenchmarkPortfolio;
const gdpvalModel = {
  ...minimalModelAtlasModel({ id: "anthropic/claude-opus-5", name: "Claude Opus 5" }),
  benchmarks: {
    gdpval_normalized: transformBenchmarkSourceValue("gdpval_normalized", 1_823.94),
  },
} satisfies ModelAtlasModel;
const gdpvalRow = frontierBenchmarkRows([gdpvalModel], gdpvalPortfolio)[0];
assert.ok(gdpvalRow);
assert.ok(
  Math.abs(gdpvalRow.score - 66.197) < 1e-12,
  "GDPval page Elo should reach the frontier graph on the normalized percent scale",
);
const scoreOnlyPortfolio = {
  deep_swe: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
} satisfies BenchmarkPortfolio;
const scoreOnlyRow = frontierBenchmarkRows([efficient], scoreOnlyPortfolio)[0];
assert.ok(scoreOnlyRow);
assert.equal(
  scoreOnlyRow.cost,
  null,
  "resource telemetry should require the policy supplied by the active portfolio",
);

const costAxis = frontierBenchmarkAxisConfigFor("cost", false);
assert.deepEqual(
  frontierBenchmarkHoverRows(topRow, costAxis),
  [
    ["Benchmark Score", "90%"],
    ["DeepSWE cost per task", "$8.0"],
    ["Speed and Value Scores", "30.0"],
  ],
  "hover rows should describe selected benchmark score, resource axis, and Efficiency score",
);

assert.equal(
  speedValueBlendScore(topRow),
  30,
  "bubble size should use a 50/50 blend of Value and Speed",
);
const axisOptions = frontierBenchmarkAxisOptions(rows, false);
assert.deepEqual(
  axisOptions.map((option) => [option.key, option.label]),
  [
    ["speedValue", "Efficiency ↑"],
    ["cost", "Cost ↓"],
    ["time", "Time ↓"],
    ["tokens", "Tokens ↓"],
  ],
  "axis options should separate the combined score from raw resource units",
);
assert.equal(
  frontierAxisDescription("cost", true),
  "Cost is normalized within each benchmark before averaging, while preserving whether the source reports resources per task or for the full run.",
  "aggregate raw resource axes should explain that they are normalized amounts, not efficiency scores",
);
assert.equal(
  frontierAxisDescription("time", true),
  "Runtime is normalized within each benchmark before averaging, while preserving whether the source reports resources per task or for the full run.",
  "aggregate time axis should use title-case metric wording",
);
assert.equal(
  frontierAxisDescription("tokens", false, topRow),
  "The axis shows observed token use per task; lower is better.",
  "benchmark token axes should describe the selected benchmark's resource basis",
);
assert.equal(
  frontierAxisDescription("speedValue", true),
  "Speed and Value Scores are averaged with equal weight; higher is better.",
  "combined score should describe speed and value separately from raw cost",
);
const allCostAxis = frontierBenchmarkAxisConfigFor("cost", true);
assert.equal(
  frontierAxisMetricLabel(allCostAxis, true, rows),
  "Mean Normalized Cost ↓",
  "aggregate resource axes should omit raw units after benchmark normalization",
);
assert.equal(
  frontierAxisMetricLabel(costAxis, false, rows),
  "DeepSWE cost per task",
  "benchmark resource axes should name the selected benchmark resource",
);

const totalPortfolio = {
  agents_last_exam: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
    resourcePolicy: {
      source: "benchmark",
      unit: "total",
      tokenMeasure: "tokens",
      qualityCoordinate: "linear",
    },
  },
} satisfies BenchmarkPortfolio;
const totalModel = {
  ...minimalModelAtlasModel({ id: "provider/total", name: "Total" }),
  benchmarks: {
    agents_last_exam: 0.7,
  },
  task_metrics: {
    agents_last_exam: {
      cost: 99,
      seconds: 3_600,
      input_tokens: 10_000,
      output_tokens: 2_000,
    },
  },
  scores: {
    intelligence_score: 70,
    agentic_score: 0,
    speed_score: 60,
    value_score: 40,
  },
} satisfies ModelAtlasModel;
const totalRow = frontierBenchmarkRows([totalModel], totalPortfolio)[0];
assert.ok(totalRow);
assert.deepEqual(
  frontierBenchmarkHoverRows(totalRow, costAxis),
  [
    ["Benchmark Score", "70%"],
    ["Agents' Last Exam total cost", "$99"],
    ["Speed and Value Scores", "50.0"],
  ],
  "total-resource benchmarks should say total instead of per task",
);
assert.equal(
  frontierAxisDescription("cost", false, totalRow),
  "Cost is the observed dollars for the full run; lower is better.",
  "total-resource benchmark descriptions should say total instead of per task",
);
assert.equal(
  selectedFrontierBenchmarkAxisKey("tokens", axisOptions),
  "tokens",
  "available requested axes should remain selected",
);
assert.equal(
  selectedFrontierBenchmarkAxisKey(
    "time",
    axisOptions.map((option) => (option.key === "time" ? { ...option, disabled: true } : option)),
  ),
  "speedValue",
  "disabled axes should fall back to the default available efficiency axis",
);

/** Build a minimal model with one Frontier Benchmarks observation. */
function frontierModel({
  id,
  name,
  score,
  cost,
  seconds,
  inputTokens,
  outputTokens,
  valueScore,
  speedScore,
  intelligenceScore,
}: {
  id: string;
  name: string;
  score: number;
  cost: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  valueScore: number;
  speedScore: number;
  intelligenceScore: number;
}): ModelAtlasModel {
  return {
    ...minimalModelAtlasModel({ id, name }),
    benchmarks: {
      deep_swe: score,
      gpqa: 0.9,
    },
    task_metrics: {
      deep_swe: {
        cost,
        seconds,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    },
    scores: {
      intelligence_score: intelligenceScore,
      agentic_score: 0,
      speed_score: speedScore,
      value_score: valueScore,
    },
  };
}
