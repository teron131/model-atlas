/** Check statistical invariants that protect robust evidence, unit-independent comparisons, and supported resource predictions. */
import assert from "node:assert/strict";

import { buildAdditiveSourceCrosswalk } from "../src/model-atlas/benchmarks/source-crosswalk";
import {
  qualityLocalResiduals,
  weightedMedianOfFinite,
  weightedQuantile,
  weightedQuantileRank,
} from "../src/model-atlas/math-utils";
import { benchmarkResourceEfficiencyScores } from "../src/model-atlas/pipeline/scores/resource-efficiency";
import { effectiveTaskSeconds } from "../src/model-atlas/pipeline/scores/resource-metrics";

const majority = [
  { value: 0, weight: 9 },
  { value: 100, weight: 1 },
];
assert.equal(weightedMedianOfFinite(majority), 0);
assert.equal(weightedQuantile(majority, 0.25), 0);
assert.equal(weightedQuantile(majority, 0.75), 0);
assert.equal(weightedQuantile(majority, 0.95), 100);
assert.equal(weightedQuantileRank(majority, 0), 45);
assert.equal(weightedQuantileRank(majority, 50), 90);
assert.equal(weightedQuantile(majority, 0.9), 50);
assert.equal(
  weightedMedianOfFinite([
    { value: 0, weight: 1 },
    { value: 100, weight: 1 },
  ]),
  50,
);
const splitMass = [
  ...Array.from({ length: 18 }, () => ({ value: 0, weight: 0.5 })),
  { value: 100, weight: 1 },
];
for (const q of [0, 0.025, 0.25, 0.5, 0.75, 0.9, 0.975, 1]) {
  assert.equal(weightedQuantile(splitMass, q), weightedQuantile(majority, q));
}
const perturbed = splitMass.map((part, i) => ({ ...part, value: part.value + i * 1e-12 }));
assert.ok(Math.abs(weightedMedianOfFinite(perturbed)!) < 1e-9);
assert.equal(
  weightedMedianOfFinite([
    { value: 3, weight: 0 },
    { value: 4, weight: -1 },
  ]),
  null,
);
const offsetRows = Array.from({ length: 10 }, (_, i) => ({
  id: `independent-${i}`,
  primary: 0,
  fallback: i === 9 ? 100 : 0,
}));
const crosswalk = buildAdditiveSourceCrosswalk(offsetRows, {
  primaryValue: (row) => row.primary,
  fallbackValue: (row) => row.fallback,
  minimumEffectiveModels: 4,
  maximumMedianAbsoluteError: 25,
});
assert.equal(crosswalk.diagnostic.medianOffset, 0);
assert.equal(crosswalk.diagnostic.validationMedianAbsoluteError, 0);
assert.equal(crosswalk.diagnostic.imputationAllowed, true);

const speed = { speed: { throughput_tokens_per_second_median: 10 } };
assert.equal(effectiveTaskSeconds(speed, { tokens: 10000, input_tokens: 9000 }), null);
assert.equal(effectiveTaskSeconds(speed, { tokens: 10000, output_tokens: 1000 }), 100);
assert.equal(effectiveTaskSeconds(speed, { seconds: 42, tokens: 10000 }), 42);

const models = Array.from({ length: 41 }, (_, i) => ({ id: `model-${i}` }));
const qualities = models.map((_, i) => i / 100);
const resources = models.map((_, i) => Math.log(1 + i) + (i % 3) * 0.1);
const scores = benchmarkResourceEfficiencyScores(models, qualities, resources, "linear");
const converted = benchmarkResourceEfficiencyScores(
  models,
  qualities.map((q) => q * 100 + 500),
  resources,
  "linear",
);
scores.forEach((score, i) => assert.ok(Math.abs(score! - converted[i]!) < 1e-8));
const observedMask = models.map((_, i) => i < 40);
const masked = benchmarkResourceEfficiencyScores(
  models,
  qualities,
  resources,
  "linear",
  observedMask,
);
const changedEstimate = benchmarkResourceEfficiencyScores(
  models,
  qualities.map((q, i) => (i === 40 ? 1e9 : q)),
  resources,
  "linear",
  observedMask,
);
masked.slice(0, 40).forEach((score, i) => assert.equal(score, changedEstimate[i]));

const line = models.map((model, i) => ({
  group: model.id,
  quality: i,
  resource: 0.1 * i,
  weight: 1,
}));
const fitted = qualityLocalResiduals(line, 0.5, 0.35, 3);
assert.equal(fitted.residuals[20], 0);
assert.equal(fitted.supportConfidence[20], 1);
// Endpoint targets have no observations on one side, so their comparisons retain the bounded peer average.
assert.ok(fitted.residuals[0]! < 0);
assert.ok(fitted.residuals[40]! > 0);
const hidden = [
  ...line.map((point) => ({ ...point, weight: point.group === "model-20" ? 0 : point.weight })),
  { group: "model-20", quality: 20, resource: 200, weight: 0 },
];
const hiddenPrediction = qualityLocalResiduals(hidden, 0.5, 0.35, 3);
assert.ok(Math.abs(hiddenPrediction.residuals.at(-1)! - 198) < 1e-10);
const flat = qualityLocalResiduals(
  line.map((point) => ({ ...point, quality: 1 })),
  0.5,
  0,
  3,
);
assert.equal(flat.residuals[20], 0);
assert.ok(flat.residuals.every((value) => value != null && Number.isFinite(value)));
const noPeers = qualityLocalResiduals(
  line.map((point) => ({ ...point, group: "same-family" })),
  0.5,
  0.35,
  3,
);
assert.ok(noPeers.supportConfidence.every((value) => value === 0));
const sparse = qualityLocalResiduals(line.slice(0, 3), 0.5, 0.35, 3);
assert.ok(sparse.supportConfidence.every((value) => value < 1));
