import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import type { ModelAtlasCandidate } from "../src/model-atlas/pipeline/model-types";
/** Verify that missing hard tasks do not reward a variant, while estimates preserve observations and direct-evidence gates. */
import { prepareSiblingQualityScoringContext } from "../src/model-atlas/pipeline/scores/imputation/sibling-quality";
import { buildQualityScoringContext } from "../src/model-atlas/pipeline/scores/quality-context";
import {
  buildComponentScoreResult,
  buildPreviewComponentScoreResult,
} from "../src/model-atlas/pipeline/scores/score-builders";
function modelCandidate({ id, name = id }: { id: string; name?: string }): ModelAtlasCandidate {
  return {
    id,
    name,
    provider: "test",
    logo: "",
    reasoning: null,
    reasoning_effort: null,
    release_date: null,
    modalities: null,
    open_weights: null,
    cost: null,
    context_window: null,
    speed: {
      throughput_tokens_per_second_median: null,
      latency_seconds_median: null,
      e2e_latency_seconds_median: null,
    },
    intelligence: null,
    task_metrics: null,
    benchmarks: null,
    benchmark_dates: null,
    confidence: { intelligence: null, agentic: null, speed: null, value: null },
    component_scores: null,
    scores: null,
  };
}
const tasks = Array.from({ length: 9 }, (_, i) => `task_${i}`);
const keys = [...tasks, "aa_intelligence_index"];
const config = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: keys,
  agenticBenchmarkKeys: [],
  previewAdditionalIntelligenceBenchmarkKeys: [],
  qualityCoverage: { intelligence: { floor: 0, full: 1 }, agentic: { floor: 0, full: 1 } },
  benchmarkPortfolio: Object.fromEntries(
    keys.map((key) => [
      key,
      {
        group: "baseline" as const,
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 1, agentic: 0 },
      },
    ]),
  ),
};
const speed = {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
};
const references = [0, 100].map((v, i) => ({
  ...modelCandidate({ id: `test/reference-${i}` }),
  benchmarks: Object.fromEntries(keys.map((key) => [key, v])),
}));
const broad = {
  ...modelCandidate({ id: "test/coverage", name: "Coverage" }),
  reasoning_effort: "max",
  intelligence: null,
  benchmarks: Object.fromEntries(
    keys.map((key) => [key, key === "task_8" ? 10 : key === "aa_intelligence_index" ? 100 : 90]),
  ),
};
const partial = {
  ...broad,
  reasoning_effort: "high",
  benchmarks: Object.fromEntries(
    keys
      .filter((key) => key !== "task_8")
      .map((key) => [key, key === "aa_intelligence_index" ? 100 : 80]),
  ),
};
const population = [...references, broad, partial];
const base = buildQualityScoringContext(population, config);
const context = prepareSiblingQualityScoringContext(population, config, base);
const score = (model: typeof broad, ctx = context) =>
  buildComponentScoreResult(model, speed, [], config, ctx);
const close = (a: number | null | undefined, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);
// Both have at least eight direct tasks. The missing hard task must still influence the narrower basket.
close(score(partial).componentScores?.intelligence_score, 0.8 * ((8 * 80) / 9) + 0.2 * 100);
close(
  score(broad).componentScores?.intelligence_score,
  score(broad, base).componentScores!.intelligence_score!,
);
assert.deepEqual(score(partial).confidence, score(partial, base).confidence);
assert.equal(partial.benchmarks.task_8, undefined);
close(
  buildPreviewComponentScoreResult(partial, config, context).componentScores?.intelligence_score,
  score(partial).componentScores!.intelligence_score!,
);
// Newly observed evidence takes precedence even if an estimate was already prepared.
const observed = { ...partial, benchmarks: { ...partial.benchmarks, task_8: 50 } };
close(score(observed).componentScores?.intelligence_score, 0.8 * ((8 * 80 + 50) / 9) + 0.2 * 100);
const sparse = {
  ...partial,
  reasoning_effort: "low",
  benchmarks: { task_0: 80, task_1: 80, task_2: 80, aa_intelligence_index: 100 },
};
const sparseContext = prepareSiblingQualityScoringContext(
  [...references, broad, sparse],
  config,
  base,
);
const p = 2 / 7,
  share = 0.2 + 0.6 * p * p * (3 - 2 * p);
close(
  score(sparse, sparseContext).componentScores?.intelligence_score,
  share * ((8 * 80) / 9) + (1 - share) * 100,
);
assert.deepEqual(score(sparse, sparseContext).confidence, score(sparse, base).confidence);
// Two shared tasks cannot create an estimate, and estimates cannot serve as observations on a second pass.
const insufficient = {
  ...sparse,
  benchmarks: { task_0: 80, task_1: 80, aa_intelligence_index: 100 },
};
const insufficientContext = prepareSiblingQualityScoringContext(
  [...references, broad, insufficient],
  config,
  base,
);
assert.deepEqual(score(insufficient, insufficientContext), score(insufficient, base));
const repeat = prepareSiblingQualityScoringContext(
  [...references, broad, sparse],
  config,
  sparseContext,
);
assert.deepEqual([...repeat.siblingQualityEstimates!], [...sparseContext.siblingQualityEstimates!]);
const reversed = prepareSiblingQualityScoringContext([...population].reverse(), config, base);
close(
  score(partial, reversed).componentScores?.intelligence_score,
  score(partial).componentScores!.intelligence_score!,
);
