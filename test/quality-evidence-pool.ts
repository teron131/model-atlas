/** Verify that direct benchmarks and breadth-scaled indexes share one deduplicated quality-evidence pool. */

import assert from "node:assert/strict";

import {
  qualityIndexBreadths,
  residualIndexBreadth,
} from "../src/model-atlas/benchmarks/index-policy";
import { type ScoringConfig, STAGE_CONFIG } from "../src/model-atlas/config/stage";
import { buildQualityScoringContext } from "../src/model-atlas/pipeline/scores/quality-context";
import { buildComponentScoreResult } from "../src/model-atlas/pipeline/scores/score-builders";

const indexKeys = [
  "aa_intelligence_index",
  "epoch_capabilities_index",
  "surge_intelligence_index",
  "vals_index",
];
const nullSpeed = {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
};

function fixture(taskCount: number, indexCount: number, indexImportance = 1) {
  const tasks = Array.from({ length: taskCount }, (_, index) => `task_${index}`);
  const indexes = indexKeys.slice(0, indexCount);
  const keys = [...tasks, ...indexes];
  const config: ScoringConfig = {
    ...STAGE_CONFIG.scoring,
    intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
    qualityCoverageMinimumRetention: 1,
    intelligenceBenchmarkKeys: keys,
    agenticBenchmarkKeys: keys,
    benchmarkPortfolio: Object.fromEntries(
      keys.map((key, index) => [
        key,
        {
          group: indexes.includes(key) || index % 2 === 1 ? "baseline" : "frontier",
          benchmarkImportance: indexes.includes(key) ? indexImportance : 1,
          dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
        },
      ]),
    ),
    qualityCoverage: { intelligence: { floor: 0, full: 1 }, agentic: { floor: 0, full: 1 } },
  };
  const context = buildQualityScoringContext(
    [0, 100].map((value) => ({ benchmarks: Object.fromEntries(keys.map((key) => [key, value])) })),
    config,
  );
  const model = (observedTasks = taskCount, taskValue = 60, observedIndexes = indexes) => ({
    benchmarks: Object.fromEntries([
      ...tasks.slice(0, observedTasks).map((key) => [key, taskValue]),
      ...observedIndexes.map((key) => [key, 100]),
    ]),
  });
  const score = (value: ReturnType<typeof model>) =>
    buildComponentScoreResult(value, nullSpeed, [], config, context);
  return { tasks, indexes, config, context, model, score };
}

function expectedScore(
  taskCount: number,
  indexKeys: readonly string[],
  indexImportance: number,
  directBenchmarkWeightMultiplier = STAGE_CONFIG.scoring.directBenchmarkWeightMultiplier,
) {
  const indexBreadth = [...qualityIndexBreadths(indexKeys.map((key) => ({ key }))).values()].reduce(
    (sum, breadth) => sum + breadth,
    0,
  );
  return (
    (directBenchmarkWeightMultiplier * taskCount * 60 + indexImportance * indexBreadth * 100) /
    (directBenchmarkWeightMultiplier * taskCount + indexImportance * indexBreadth)
  );
}

for (const taskCount of [4, 40]) {
  for (const indexCount of [1, 4]) {
    for (const importance of [0.05, 0.5, 1, 5]) {
      const test = fixture(taskCount, indexCount, importance);
      const score = test.score(test.model()).componentScores!;
      const expected = expectedScore(taskCount, test.indexes, importance);
      assert.ok(Math.abs(score.intelligence_score! - expected) < 1e-10);
      assert.ok(Math.abs(score.agentic_score! - expected) < 1e-10);
    }
  }
}

const multiplierFixture = fixture(4, 1);
// Coverage discounts the entire score at both sides of 50, even when AA supplies index evidence.
const coverageFixture = fixture(19, 1, 0.05);
for (const [observedTasks, multiplier] of [
  [0, 0.85],
  [1, 0.925],
  [2, 1],
] as const) {
  for (const value of [40, 80]) {
    const model = coverageFixture.model(observedTasks, value);
    model.benchmarks.aa_intelligence_index = value;
    const result = buildComponentScoreResult(
      model,
      nullSpeed,
      [],
      {
        ...coverageFixture.config,
        qualityCoverageMinimumRetention: 0.85,
        qualityRetention: { floor: 0.25, full: 1.75 },
      },
      coverageFixture.context,
    );
    if (observedTasks < 2) {
      assert.equal(result.componentScores!.intelligence_score, null);
    } else {
      assert.ok(Math.abs(result.componentScores!.intelligence_score! - value * multiplier) < 1e-10);
    }
    assert.ok(
      Math.abs(result.confidence.intelligence! - (observedTasks * 0.5 + 0.025) / 9.525) < 1e-10,
    );
  }
}

const directCoverage = fixture(40, 1);
const fullDirectCoverage = buildComponentScoreResult(
  directCoverage.model(16, 60, []),
  nullSpeed,
  [],
  { ...directCoverage.config, qualityCoverageMinimumRetention: 0.85 },
  directCoverage.context,
);
assert.ok(Math.abs(fullDirectCoverage.componentScores!.intelligence_score! - 60) < 1e-10);
assert.ok(fullDirectCoverage.confidence.intelligence! < 0.6);
const sparseDirectCoverage = buildComponentScoreResult(
  directCoverage.model(15, 60, []),
  nullSpeed,
  [],
  { ...directCoverage.config, qualityCoverageMinimumRetention: 0.85 },
  directCoverage.context,
);
assert.ok(sparseDirectCoverage.componentScores!.intelligence_score! < 60);

const indexCoverage = fixture(40, 4);
const fullIndexCoverage = buildComponentScoreResult(
  indexCoverage.model(0, 60),
  nullSpeed,
  [],
  { ...indexCoverage.config, qualityCoverageMinimumRetention: 0.85 },
  indexCoverage.context,
);
assert.equal(fullIndexCoverage.componentScores!.intelligence_score, null);
assert.ok(fullIndexCoverage.confidence.intelligence! < 0.1);

for (const multiplier of [1.5, 2]) {
  const score = buildComponentScoreResult(
    multiplierFixture.model(),
    nullSpeed,
    [],
    { ...multiplierFixture.config, directBenchmarkWeightMultiplier: multiplier },
    multiplierFixture.context,
  ).componentScores!.intelligence_score!;
  assert.ok(Math.abs(score - (multiplier * 4 * 60 + 10 * 100) / (multiplier * 4 + 10)) < 1e-10);
}

const convergence = fixture(8, 4);
let previous = 100;
for (let count = 0; count <= 8; count++) {
  const score = convergence.score(convergence.model(count, 0)).componentScores!.agentic_score!;
  assert.ok(score <= previous + 1e-10);
  previous = score;
}
assert.ok(
  Math.abs(convergence.score(convergence.model(8, 60, [])).componentScores!.agentic_score! - 60) <
    1e-10,
);

const partial = convergence.model(3);
const direct = convergence.score(partial);
const imputed = buildComponentScoreResult(
  partial,
  nullSpeed,
  [],
  convergence.config,
  convergence.context,
  new Map(convergence.tasks.slice(3).map((key) => [key, 100])),
  new Map(convergence.tasks.slice(3).map((key) => [key, 1])),
);
assert.equal(imputed.componentScores!.agentic_score, direct.componentScores!.agentic_score);
assert.ok(imputed.confidence.agentic! > direct.confidence.agentic!);

assert.equal(residualIndexBreadth("epoch_capabilities_index", [], 4), 7.5);
assert.equal(residualIndexBreadth("epoch_capabilities_index", [], 40), 7.5);
assert.equal(residualIndexBreadth("aa_intelligence_index", ["terminal_bench_4"]), 9);
const sharedIndexBreadths = qualityIndexBreadths([
  { key: "aa_intelligence_index" },
  { key: "cais_capabilities_index" },
]);
assert.equal(sharedIndexBreadths.get("aa_intelligence_index"), 9.5);
assert.equal(sharedIndexBreadths.get("cais_capabilities_index"), 6.5);
const directlyObservedSharedIndexBreadths = qualityIndexBreadths(
  [{ key: "aa_intelligence_index" }, { key: "cais_capabilities_index" }],
  ["hle"],
);
assert.equal(directlyObservedSharedIndexBreadths.get("aa_intelligence_index"), 9);
assert.equal(directlyObservedSharedIndexBreadths.get("cais_capabilities_index"), 6);

const indexOnly = fixture(0, 4);
assert.equal(indexOnly.score(indexOnly.model()).componentScores!.agentic_score, 100);
assert.equal(indexOnly.score(indexOnly.model(0, 60, [])).componentScores, null);

const variantFixture = fixture(8, 4);
const labelled = { ...variantFixture.model(), reasoning_effort: "max" };
labelled.benchmarks.epoch_capabilities_index = 0;
labelled.benchmarks.vals_index = 0;
labelled.benchmarks.surge_intelligence_index = 0;
const sameTasks = {
  ...labelled,
  reasoning_effort: "xhigh",
  benchmarks: {
    ...labelled.benchmarks,
    epoch_capabilities_index: 100,
    vals_index: 100,
    surge_intelligence_index: 100,
  },
};
assert.equal(
  variantFixture.score(labelled).componentScores!.intelligence_score,
  variantFixture.score(sameTasks).componentScores!.intelligence_score,
);
const unlabelled = { ...labelled, reasoning_effort: null };
assert.ok(
  variantFixture.score(unlabelled).componentScores!.intelligence_score! <
    variantFixture.score(labelled).componentScores!.intelligence_score!,
);
const noEffortIndex = {
  ...variantFixture.model(8, 60, ["epoch_capabilities_index"]),
  reasoning_effort: "high",
};
assert.ok(
  Math.abs(variantFixture.score(noEffortIndex).componentScores!.intelligence_score! - 60) < 1e-10,
);
