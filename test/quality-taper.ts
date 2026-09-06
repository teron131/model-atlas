/** Verify that direct task coverage hands capability weight from aggregate indexes to a stable 70/30 endpoint. */

import assert from "node:assert/strict";

import { type ScoringConfig, STAGE_CONFIG } from "../src/model-atlas/config/stage";
import { buildQualityScoringContext } from "../src/model-atlas/pipeline/scores/imputation/benchmark";
import {
  buildComponentScoreResult,
  buildPreviewComponentScoreResult,
} from "../src/model-atlas/pipeline/scores/score-builders";

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

/** Use frozen 0–100 anchors and constant task/index results so the observed score directly identifies each group's weight. */
function fixture(taskCount: number, indexCount: number, indexImportance = 0.5) {
  const tasks = Array.from({ length: taskCount }, (_, index) => `task_${index}`);
  const indexes = indexKeys.slice(0, indexCount);
  const keys = [...tasks, ...indexes];
  const config: ScoringConfig = {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: keys,
    agenticBenchmarkKeys: keys,
    previewAdditionalIntelligenceBenchmarkKeys: [],
    benchmarkPortfolio: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          group: "baseline",
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

for (const taskCount of [4, 40]) {
  for (const indexCount of [1, 4]) {
    for (const importance of [0.05, 0.5, 5]) {
      const test = fixture(taskCount, indexCount, importance);
      const score = test.score(test.model()).componentScores!;
      assert.ok(Math.abs(score.intelligence_score! - 72) < 1e-10);
      assert.ok(Math.abs(score.agentic_score! - 72) < 1e-10);
      const preview = buildPreviewComponentScoreResult(test.model(), test.config, test.context);
      assert.ok(Math.abs(preview.componentScores!.intelligence_score! - 72) < 1e-10);
      assert.ok(Math.abs(preview.componentScores!.agentic_score! - 72) < 1e-10);
    }
  }
}

const convergence = fixture(8, 4);
let previous = 100;
for (let count = 0; count <= 8; count++) {
  const score = convergence.score(convergence.model(count, 0)).componentScores!.agentic_score!;
  assert.ok(score <= previous + 1e-10);
  assert.ok(score >= 30 - 1e-10);
  previous = score;
}
assert.ok(Math.abs(previous - 30) < 1e-10);
assert.ok(
  Math.abs(
    convergence.score(convergence.model(8, 60, ["aa_intelligence_index"])).componentScores!
      .agentic_score! - 72,
  ) < 1e-10,
);
assert.equal(convergence.score(convergence.model(8, 60, [])).componentScores!.agentic_score, 60);

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

const unequal = fixture(8, 2);
const unequalConfig: ScoringConfig = {
  ...unequal.config,
  benchmarkPortfolio: {
    ...unequal.config.benchmarkPortfolio,
    aa_intelligence_index: {
      ...unequal.config.benchmarkPortfolio.aa_intelligence_index!,
      benchmarkImportance: 1,
    },
  },
};
const unequalModel = unequal.model();
unequalModel.benchmarks.aa_intelligence_index = 0;
// The 30% index group divides 2:1; its mean is 100/3, while the task mean stays 60.
assert.ok(
  Math.abs(
    buildComponentScoreResult(unequalModel, nullSpeed, [], unequalConfig, unequal.context)
      .componentScores!.agentic_score! - 52,
  ) < 1e-10,
);

const indexOnly = fixture(0, 4);
assert.equal(indexOnly.score(indexOnly.model()).componentScores!.agentic_score, 100);
assert.equal(indexOnly.score(indexOnly.model(0, 60, [])).componentScores, null);
