/** Verify that pairwise quality preserves shared-benchmark margins and exact-variant identities. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import type { ModelAtlasCandidate } from "../src/model-atlas/pipeline/model-types";
import {
  blendPairwiseQualityScores,
  fitPairwiseQualityScores,
} from "../src/model-atlas/pipeline/scores/pairwise-quality";
import { effortQualityKey } from "../src/model-atlas/pipeline/scores/quality-context";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const config = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["left", "right"],
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  benchmarkPortfolio: {
    left: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
    right: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
  },
} as const;
const models = [
  { id: "test/a", reasoning_effort: "high", benchmarks: { left: 100, right: 100 } },
  { id: "test/b", reasoning_effort: "high", benchmarks: { left: 60, right: 70 } },
  { id: "test/c", reasoning_effort: "high", benchmarks: { left: 10, right: 20 } },
];
const result = fitPairwiseQualityScores(models, "intelligence", config);
const score = (model: (typeof models)[number]) =>
  result.scoresByVariant.get(effortQualityKey(model, "intelligence"))!;

assert.equal(result.modelCount, 3);
assert.equal(result.benchmarkCount, 2);
assert.equal(result.comparisonCount, 6);
assert.ok(score(models[0]!) > score(models[1]!));
assert.ok(score(models[1]!) > score(models[2]!));
assert.ok(result.weightedRootMeanSquaredError != null);

// Unequal raw gaps must remain unequal in the fitted ratings.
const unequal = [100, 99, 0].map((left, index) => ({ id: `gap/${index}`, benchmarks: { left } }));
const margins = fitPairwiseQualityScores(unequal, "intelligence", config);
const rating = (index: number) =>
  margins.ratingsByVariant.get(effortQualityKey(unequal[index]!, "intelligence"))!;
assert.ok(Math.abs((rating(0) - rating(1)) / (rating(1) - rating(2)) - (100 - 99) / 99) < 1e-7);

// A validated crosswalk with one source measured contributes to ordinary and pairwise quality evidence.
const crosswalked = [
  { id: "crosswalk/a", benchmarks: { left: 25 } },
  {
    id: "crosswalk/b",
    benchmarks: { left: 50 },
    scoring_sources: {
      left: {
        canonical_value: 0.5,
        metadata: { fusion_crosswalk_applied: true, source_a_score: 0.5, source_b_score: null },
      },
    },
  },
  { id: "crosswalk/c", benchmarks: { left: 75 } },
];
const crosswalkFit = fitPairwiseQualityScores(crosswalked, "intelligence", config);
assert.equal(crosswalkFit.benchmarkCount, 1);
assert.equal(crosswalkFit.comparisonCount, 3);
assert.equal(crosswalkFit.modelCount, 3);
assert.ok(
  crosswalkFit.ratingsByVariant.get(effortQualityKey(crosswalked[2]!, "intelligence"))! >
    crosswalkFit.ratingsByVariant.get(effortQualityKey(crosswalked[1]!, "intelligence"))!,
);

// Duplicating every measured effort of one base model must not change its comparisons with other models.
const duplicated = [...models, { ...models[0]!, reasoning_effort: "low" }];
const duplicatedFit = fitPairwiseQualityScores(duplicated, "intelligence", config);
for (const model of models) {
  const key = effortQualityKey(model, "intelligence");
  assert.ok(
    Math.abs(duplicatedFit.scoresByVariant.get(key)! - result.scoresByVariant.get(key)!) < 1e-7,
  );
}
const firstKey = effortQualityKey(models[0]!, "intelligence");
for (const model of models.slice(1)) {
  const key = effortQualityKey(model, "intelligence");
  const originalGap = result.ratingsByVariant.get(firstKey)! - result.ratingsByVariant.get(key)!;
  const duplicatedGap =
    duplicatedFit.ratingsByVariant.get(firstKey)! - duplicatedFit.ratingsByVariant.get(key)!;
  assert.ok(Math.abs(originalGap - duplicatedGap) < 1e-5);
}

function candidate(id: string, score: number, left: number, right: number): ModelAtlasCandidate {
  return {
    ...minimalModelAtlasModel({ id, name: id }),
    benchmarks: { left, right },
    confidence: { intelligence: 1, agentic: 1, speed: null, value: null },
    component_scores: {
      intelligence_score: score,
      agentic_score: 50,
      speed_score: null,
    },
    scores: null,
  };
}

const blended = blendPairwiseQualityScores(
  [
    candidate("test/a", 90, 100, 100),
    candidate("test/b", 40, 60, 70),
    candidate("test/c", 80, 10, 20),
  ],
  config,
  [90, 40, 80].map((score) => ({
    frontier: score,
    baseline: score,
    indexScore: null,
    indexShare: 0,
    retention: 1,
  })),
);
assert.equal(blended[0]!.component_scores!.intelligence_score, 90);
assert.ok(Math.abs(blended[1]!.component_scores!.intelligence_score! - 48) < 1e-10);
assert.ok(Math.abs(blended[2]!.component_scores!.intelligence_score! - 72) < 1e-10);
assert.equal(blended[1]!.component_scores!.agentic_score, 50);

const retentions = [0.85, 0.925, 1];
const penalized = blendPairwiseQualityScores(
  [
    candidate("test/a", 90 * retentions[0]!, 100, 100),
    candidate("test/b", 40 * retentions[1]!, 60, 70),
    candidate("test/c", 80 * retentions[2]!, 10, 20),
  ],
  config,
  [90, 40, 80].map((score, index) => ({
    frontier: score,
    baseline: score,
    indexScore: null,
    indexShare: 0,
    retention: retentions[index]!,
  })),
);
for (const [index, model] of penalized.entries()) {
  assert.ok(
    Math.abs(
      model.component_scores!.intelligence_score! -
        blended[index]!.component_scores!.intelligence_score! * retentions[index]!,
    ) < 1e-10,
  );
}

const unsupported = {
  ...candidate("test/index-only", 75, 0, 0),
  benchmarks: {},
  intelligence: { intelligence_index: 100 },
  component_scores: { intelligence_score: null, agentic_score: 50, speed_score: null },
};
const withUnsupported = [
  candidate("test/a", 90, 100, 100),
  candidate("test/b", 40, 60, 70),
  candidate("test/c", 80, 10, 20),
  unsupported,
];
const withIndexConfig = {
  ...config,
  intelligenceBenchmarkKeys: [...config.intelligenceBenchmarkKeys, "aa_intelligence_index"],
};
const unsupportedFit = fitPairwiseQualityScores(withUnsupported, "intelligence", withIndexConfig);
assert.equal(unsupportedFit.modelCount, 3);
assert.equal(
  unsupportedFit.scoresByVariant.has(effortQualityKey(unsupported, "intelligence")),
  false,
);
assert.equal(
  blendPairwiseQualityScores(withUnsupported, withIndexConfig, [
    ...[90, 40, 80].map((score) => ({
      frontier: score,
      baseline: score,
      indexScore: null,
      indexShare: 0,
      retention: 1,
    })),
    null,
  ]).at(-1)!.component_scores!.intelligence_score,
  null,
  "an index-only model has no Intelligence score without both task groups",
);
assert.equal(
  blendPairwiseQualityScores(withUnsupported, { ...config, pairwiseIntelligenceWeight: 0 }, [
    null,
    null,
    null,
    null,
  ]),
  withUnsupported,
);

const frontierOnlyConfig = {
  ...config,
  intelligenceGroupWeights: { frontier: 1, baseline: 0 },
} as const;
const frontierOnlyFit = fitPairwiseQualityScores(models, "intelligence", frontierOnlyConfig);
assert.equal(frontierOnlyFit.benchmarkCount, 1);
const changedBaseline = models.map((model) => ({
  ...model,
  benchmarks: { ...model.benchmarks, right: 100 - model.benchmarks.right },
}));
const changedBaselineFit = fitPairwiseQualityScores(
  changedBaseline,
  "intelligence",
  frontierOnlyConfig,
);
for (const [index, model] of models.entries()) {
  const original = frontierOnlyFit.ratingsByVariant.get(effortQualityKey(model, "intelligence"));
  const changed = changedBaselineFit.ratingsByVariant.get(
    effortQualityKey(changedBaseline[index]!, "intelligence"),
  );
  assert.equal(original, changed);
}
const frontierOnlyBlended = blendPairwiseQualityScores(
  [
    candidate("test/a", 90, 100, 100),
    candidate("test/b", 40, 60, 70),
    candidate("test/c", 80, 10, 20),
  ],
  frontierOnlyConfig,
  [90, 40, 80].map((score) => ({
    frontier: score,
    baseline: null,
    indexScore: null,
    indexShare: 0,
    retention: 1,
  })),
);
assert.ok(frontierOnlyBlended.every((model) => model.component_scores?.intelligence_score != null));
