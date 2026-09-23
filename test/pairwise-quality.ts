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
  benchmarkPortfolio: {
    left: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
    right: {
      group: "frontier",
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
assert.ok(Math.abs((rating(0) - rating(1)) / (rating(1) - rating(2)) - 1 / 99) < 1e-7);

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
  [1, 1, 1],
);
assert.equal(blended[0]!.component_scores!.intelligence_score, 90);
assert.equal(blended[1]!.component_scores!.intelligence_score, 48);
assert.equal(blended[2]!.component_scores!.intelligence_score, 72);
assert.equal(blended[1]!.component_scores!.agentic_score, 50);

const retentions = [0.85, 0.925, 1];
const penalized = blendPairwiseQualityScores(
  [
    candidate("test/a", 90 * retentions[0]!, 100, 100),
    candidate("test/b", 40 * retentions[1]!, 60, 70),
    candidate("test/c", 80 * retentions[2]!, 10, 20),
  ],
  config,
  retentions,
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
  blendPairwiseQualityScores(withUnsupported, withIndexConfig, [1, 1, 1, 1]).at(-1)!
    .component_scores!.intelligence_score,
  75,
  "an index-only model must retain its ordinary score",
);
assert.equal(
  blendPairwiseQualityScores(
    withUnsupported,
    { ...config, pairwiseIntelligenceWeight: 0 },
    [1, 1, 1, 1],
  ),
  withUnsupported,
);
