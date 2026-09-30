/** Checks descriptive resource normalization against effort duplication, sparse source slots, costly tails, and incomplete or estimated telemetry. */

import assert from "node:assert/strict";

import type { BenchmarkPortfolio } from "../src/model-atlas/benchmarks/factory";
import type { ModelAtlasModel } from "../src/model-atlas/pipeline/model-types";
import {
  resourceRatioObservations,
  resourceRatioReferences,
  summarizeResourceRatios,
} from "../src/model-atlas/stats/resource-ratios";

const entry = {
  group: "frontier",
  benchmarkImportance: 1,
  dimensionLoadings: { intelligence: 1, agentic: 0 },
  resourcePolicy: { source: "benchmark", unit: "per_task", tokenMeasure: "tokens" },
} as const;
const portfolio: BenchmarkPortfolio = { hle: entry, gdp_pdf: entry, terminal_bench_science: entry };

function model(
  name: string,
  task_metrics: Record<string, unknown>,
  benchmarks: Record<string, number> = { hle: 0, gdp_pdf: 0, terminal_bench_science: 0 },
  extra: Record<string, unknown> = {},
): ModelAtlasModel {
  return { id: name, name, task_metrics, benchmarks, ...extra } as unknown as ModelAtlasModel;
}

// A many-effort model has the same reference weight as a single-effort model.
const balanced = resourceRatioObservations(
  [
    model("Cheap", { hle: { cost: 1 } }),
    model("Cheap", { hle: { cost: 1 } }, undefined, { reasoning_effort: "high" }),
    model("Expensive", { hle: { cost: 9 } }),
  ],
  portfolio,
  "cost",
);
assert.equal(resourceRatioReferences(balanced).get("hle"), 5);
assert.equal(balanced[0]?.quality, 0);
assert.equal(resourceRatioReferences(balanced.slice(0, 2)).size, 0);

// Missing declared slots reserve their weight, and arbitrary published source rows retain provenance.
const sources = resourceRatioObservations(
  [
    model("Sources", {
      terminal_bench_science__source_a: { cost: 2, quality: 0 },
      terminal_bench_science__source_c: { cost: 4, quality: 0.7 },
      gdp_pdf__source_b: { cost: 6, quality: 0.2 },
    }),
  ],
  portfolio,
  "cost",
);
assert.equal(
  sources.find((row) => row.benchmarkKey === "terminal_bench_science__source_c")?.weight,
  1 / 3,
);
assert.equal(sources.find((row) => row.benchmarkKey === "gdp_pdf__source_b")?.weight, 1 / 2);
const preferred = resourceRatioObservations(
  [model("Direct", { hle: { cost: 3 }, hle__source_a: { cost: 8, quality: 0.1 } })],
  portfolio,
  "cost",
);
assert.equal(preferred.length, 1);
assert.equal(preferred[0]?.benchmarkKey, "hle");

// Expenditure estimates never enter observed ratios, and generated tokens alone are not total tokens.
const incomplete = model("Incomplete", {
  hle: { output_tokens: 50 },
  gdp_pdf: { input_tokens: 0, output_tokens: 70 },
  terminal_bench_science: { tokens: 90 },
});
const tokens = resourceRatioObservations([incomplete], portfolio, "tokens");
assert.deepEqual(
  tokens.map((row) => row.amount),
  [70, 90],
);
const estimated = model(
  "Estimated",
  { hle: { cost: 9, tokens: 100, input_tokens: 20, output_tokens: 80 } },
  undefined,
  {
    scoring_sources: {
      hle: {
        metadata: {
          fusion_cost_estimated: true,
          fusion_tokens_per_task_estimated: true,
          fusion_output_tokens_per_task_estimated: true,
        },
      },
    },
  },
);
assert.equal(resourceRatioObservations([estimated], portfolio, "cost").length, 0);
assert.equal(resourceRatioObservations([estimated], portfolio, "tokens").length, 0);
const timed = model("Timed", { hle: { output_tokens: 50 }, gdp_pdf: { seconds: 3 } }, undefined, {
  speed: { throughput_tokens_per_second_median: 10 },
});
assert.deepEqual(
  resourceRatioObservations([timed], portfolio, "time").map((row) => row.amount),
  [3],
);

// Median aggregation resists an arbitrarily expensive minority tail and ignores unavailable references.
const rows = resourceRatioObservations(
  [
    model("Tail", {
      hle: { cost: 2 },
      gdp_pdf: { cost: 2 },
      terminal_bench_science: { cost: 10000 },
    }),
  ],
  portfolio,
  "cost",
);
assert.deepEqual(summarizeResourceRatios(rows, new Map(rows.map((row) => [row.benchmarkKey, 1]))), {
  ratio: 2,
  benchmarkCount: 3,
  sourceCount: 3,
});
assert.deepEqual(summarizeResourceRatios(rows, new Map()), {
  ratio: null,
  benchmarkCount: 0,
  sourceCount: 0,
});

// Index telemetry supplies only residual observed breadth, with no output-only substitution for totals.
const indexPortfolio: BenchmarkPortfolio = {
  hle: entry,
  aa_intelligence_index: { ...entry, resourcePolicy: undefined },
};
const indexModel = model(
  "Index",
  { hle: { cost: 2, tokens: 40 }, artificial_analysis: { cost: 10, output_tokens: 500 } },
  { hle: 0.5, aa_intelligence_index: 50 },
);
const indexed = resourceRatioObservations([indexModel], indexPortfolio, "cost");
assert.equal(indexed.find((row) => row.benchmarkKey === "artificial_analysis")?.weight, 1);
assert.equal(resourceRatioObservations([indexModel], indexPortfolio, "tokens").length, 1);
assert.deepEqual(summarizeResourceRatios(indexed, new Map([["artificial_analysis", 1]])), {
  ratio: 10,
  benchmarkCount: 1,
  sourceCount: 1,
});
assert.deepEqual(
  summarizeResourceRatios(
    indexed.filter((row) => row.benchmarkKey === "artificial_analysis"),
    new Map([["artificial_analysis", 1]]),
  ),
  { ratio: 10, benchmarkCount: 1, sourceCount: 1 },
);

// A fully overlapping index stays extractable for index-only graph selections and contributes no duplicate coverage in the complete basket.
const components = [
  "briefcase",
  "gdpval_normalized",
  "automation_bench",
  "terminal_bench_4",
  "scicode",
  "hle",
  "gdp_pdf",
  "critpt",
  "omniscience_accuracy",
  "aa_lcr",
];
const completePortfolio: BenchmarkPortfolio = {
  ...Object.fromEntries(components.map((key) => [key, entry])),
  aa_intelligence_index: { ...entry, resourcePolicy: undefined },
};
const completeModel = model(
  "Complete",
  {
    ...Object.fromEntries(components.map((key) => [key, { cost: 2 }])),
    artificial_analysis: { cost: 10 },
  },
  { ...Object.fromEntries(components.map((key) => [key, 0.5])), aa_intelligence_index: 50 },
);
const completeRows = resourceRatioObservations([completeModel], completePortfolio, "cost");
assert.equal(completeRows.length, 11);
const completeReferences = new Map(completeRows.map((row) => [row.benchmarkKey, 1]));
assert.deepEqual(summarizeResourceRatios(completeRows, completeReferences), {
  ratio: 2,
  benchmarkCount: 10,
  sourceCount: 10,
});
assert.deepEqual(
  summarizeResourceRatios(
    completeRows.filter((row) => row.baseBenchmarkKey === "aa_intelligence_index"),
    completeReferences,
  ),
  { ratio: 10, benchmarkCount: 1, sourceCount: 1 },
);
completeReferences.delete("hle");
assert.equal(summarizeResourceRatios(completeRows, completeReferences).sourceCount, 10);

console.log("Resource ratio checks passed");
