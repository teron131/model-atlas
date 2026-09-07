import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import type { ModelAtlasCandidate } from "../src/model-atlas/pipeline/model-types";
import { prepareBenchmarkScoring } from "../src/model-atlas/pipeline/scores/imputation/benchmark";
/** Protect independent-donor resource fallback, fixed shrinkage, and scoring-only integration. */
import { imputedTaskResource } from "../src/model-atlas/pipeline/scores/imputation/resource-evidence";
import { prepareTieredResourceEstimator } from "../src/model-atlas/pipeline/scores/imputation/resource-tiers";
import { prepareEffortResourceImputation } from "../src/model-atlas/pipeline/scores/imputation/task-resource";
import { applyResourceEvidenceRequirements } from "../src/model-atlas/pipeline/scores/resource-metrics";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

function model(id: string, effort: string, costs: Record<string, number>): ModelAtlasCandidate {
  return {
    ...minimalModelAtlasModel({ id, name: id }),
    provider: "test",
    reasoning_effort: effort,
    benchmarks: { hle: 50, scicode: 50 },
    task_metrics: Object.fromEntries(Object.entries(costs).map(([key, cost]) => [key, { cost }])),
    component_scores: null,
    scores: null,
  };
}
const source = model("test/target", "high", { hle: 10, scicode: 10 });
const target = model("test/target", "low", { scicode: 2.5 });
const donors = ["a", "b", "c"].flatMap((id) => [
  model(`test/${id}`, "high", { hle: 10, scicode: 10 }),
  model(`test/${id}`, "low", { hle: 5, scicode: 5 }),
]);
const models = [target, source, ...donors];
const config = STAGE_CONFIG.scoring;
const before = structuredClone(models);
const estimate = prepareTieredResourceEstimator(models, config, "cost")(target, source, "hle");
assert.ok(estimate);
assert.ok(
  Math.abs(estimate.amount - 5 * Math.pow(0.5, 1 / 5)) < 1e-9,
  "One paired task receives 20% residual influence",
);
assert.ok(estimate.confidence > 0 && estimate.confidence < 0.5);
assert.deepEqual(models, before);
assert.equal(
  prepareTieredResourceEstimator([target, source, ...donors.slice(0, 2)], config, "cost")(
    target,
    source,
    "hle",
  ),
  null,
  "One donor model is insufficient",
);
assert.deepEqual(
  prepareTieredResourceEstimator([...models, ...donors], config, "cost")(target, source, "hle"),
  estimate,
  "Duplicate variants cannot inflate independent support",
);
assert.equal(
  prepareTieredResourceEstimator(models, config, "cost")(target, donors[0]!, "hle"),
  null,
  "The source must be the same model",
);
const unrelated = { ...source, benchmarks: { scicode: 50 } };
assert.equal(
  prepareTieredResourceEstimator(models, config, "cost")(target, unrelated, "hle"),
  null,
  "Anchor cost requires observed benchmark quality",
);
const prepared = prepareEffortResourceImputation(
  models,
  config,
  prepareBenchmarkScoring(models, config),
);
assert.deepEqual(imputedTaskResource(prepared, target, "hle", "cost"), estimate);
assert.equal(imputedTaskResource(prepared, target, "hle", "time"), null);
assert.equal(
  imputedTaskResource(prepared, target, "scicode", "cost"),
  null,
  "Observed costs remain authoritative",
);
assert.deepEqual(models, before);

const datedTarget = { ...model("test/dated-target", "low", {}), release_date: "2026-01-01" };
const datedSource = {
  ...model("test/dated-target", "high", { hle: 10, scicode: 10 }),
  release_date: "2026-01-01",
};
const datedDonors = [0, 1, 2].flatMap((index) =>
  ["low", "high"].map((effort) => ({
    ...model(`test/dated-${index}`, effort, {
      hle: effort === "high" ? 10 : index === 0 ? 8 : 4,
      scicode: effort === "high" ? 10 : index === 0 ? 8 : 4,
    }),
    release_date: index === 0 ? "2025-11-02" : "2024-01-01",
  })),
);
const datedModels = [datedTarget, datedSource, ...datedDonors];
const datedEstimate = prepareTieredResourceEstimator(datedModels, config, "cost")(
  datedTarget,
  datedSource,
  "hle",
)!;
const labCorrection = (3 / 19) * (-Math.LN2 / 2);
const gaussianWeight = Math.exp(-0.5);
const expectedDatedCost =
  4 *
  Math.exp(labCorrection + (gaussianWeight / (gaussianWeight + 4)) * (Math.LN2 - labCorrection));
assert.ok(
  Math.abs(datedEstimate.amount - expectedDatedCost) < 1e-9,
  "A donor 60 days away uses the Gaussian weight and discounted support",
);
const withoutDates = datedModels.map((m) => ({ ...m, release_date: null }));
const noDateEstimate = prepareTieredResourceEstimator(withoutDates, config, "cost")(
  withoutDates[0]!,
  withoutDates[1]!,
  "hle",
)!;
assert.ok(Math.abs(noDateEstimate.amount - 4 * Math.exp(labCorrection)) < 1e-9);
assert.ok(datedEstimate.amount > noDateEstimate.amount);
const invalidTarget = { ...datedTarget, release_date: "invalid" };
assert.deepEqual(
  prepareTieredResourceEstimator([invalidTarget, ...datedModels.slice(1)], config, "cost")(
    invalidTarget,
    datedSource,
    "hle",
  ),
  noDateEstimate,
);
const otherLab = datedModels.map((m, i) => (i >= 2 ? { ...m, provider: "other" } : m));
const otherLabNoDates = otherLab.map((m) => ({ ...m, release_date: null }));
assert.deepEqual(
  prepareTieredResourceEstimator(otherLab, config, "cost")(datedTarget, datedSource, "hle"),
  prepareTieredResourceEstimator(otherLabNoDates, config, "cost")(
    otherLabNoDates[0]!,
    otherLabNoDates[1]!,
    "hle",
  ),
  "Release proximity cannot introduce another lab's correction",
);
const shifted = datedModels.map((m) => ({
  ...m,
  release_date: new Date(Date.parse(m.release_date!) + 100 * 86400000).toISOString(),
}));
assert.deepEqual(
  prepareTieredResourceEstimator(shifted, config, "cost")(shifted[0]!, shifted[1]!, "hle"),
  datedEstimate,
  "Only distance between release dates matters",
);

// Timing ratios deliberately differ from cost ratios; the estimator must use seconds only.
const timedModels = models.map((candidate) => ({
  ...candidate,
  task_metrics: Object.fromEntries(
    Object.entries(candidate.task_metrics ?? {}).map(([key, metrics]) => [
      key,
      {
        ...metrics,
        seconds: candidate === target ? 50 : candidate.reasoning_effort === "low" ? 200 : 100,
      },
    ]),
  ),
}));
const timedTarget = timedModels[0]!;
const timedSource = timedModels[1]!;
const timedBefore = structuredClone(timedModels);
const timeEstimate = prepareTieredResourceEstimator(timedModels, config, "time")(
  timedTarget,
  timedSource,
  "hle",
);
assert.ok(timeEstimate);
assert.ok(Math.abs(timeEstimate.amount - 200 * Math.pow(0.25, 1 / 5)) < 1e-9);
assert.ok(timeEstimate.confidence > 0 && timeEstimate.confidence < 1);
const changedCosts = timedModels.map((candidate) => ({
  ...candidate,
  task_metrics: Object.fromEntries(
    Object.entries(candidate.task_metrics ?? {}).map(([key, metrics]) => [
      key,
      { ...metrics, cost: (metrics.cost ?? 1) * 1000 },
    ]),
  ),
}));
assert.deepEqual(
  prepareTieredResourceEstimator(changedCosts, config, "time")(
    changedCosts[0]!,
    changedCosts[1]!,
    "hle",
  ),
  timeEstimate,
  "Prices cannot affect timing predictions",
);
assert.equal(
  prepareTieredResourceEstimator(models, config, "time")(target, source, "hle"),
  null,
  "Cost-only observations cannot supply runtime evidence",
);
const timedPreparation = prepareEffortResourceImputation(
  timedModels,
  config,
  prepareBenchmarkScoring(timedModels, config),
);
assert.deepEqual(imputedTaskResource(timedPreparation, timedTarget, "hle", "time"), timeEstimate);
assert.deepEqual(
  imputedTaskResource(timedPreparation, timedTarget, "hle", "cost"),
  estimate,
  "Time support leaves cost estimates unchanged",
);
assert.equal(
  imputedTaskResource(timedPreparation, timedTarget, "scicode", "time"),
  null,
  "Reported timing remains authoritative",
);
assert.deepEqual(timedModels, timedBefore, "Estimates never populate observed task fields");
assert.equal(
  prepareTieredResourceEstimator(timedModels.slice(0, 4), config, "time")(
    timedTarget,
    timedSource,
    "hle",
  ),
  null,
  "Runtime requires two independent donor models too",
);

const publishedTiming = applyResourceEvidenceRequirements(
  {
    ...timedTarget,
    scores: { intelligence_score: 80, agentic_score: 80, speed_score: 75, value_score: 75 },
  },
  config.benchmarkPortfolio,
);
assert.equal(
  publishedTiming.scores.speed_score,
  null,
  "A runtime estimate cannot qualify a variant below four direct time pairs",
);

// Cost, runtime, total tokens, and output tokens share the same independently fitted hierarchy.
for (const kind of ["time", "tokens", "output_tokens"] as const) {
  const field = kind === "time" ? "seconds" : kind;
  const converted = models.map((m) => ({
    ...m,
    task_metrics: Object.fromEntries(
      Object.entries(m.task_metrics ?? {}).map(([key, value]) => [
        key,
        { [field]: value!.cost! * 100 },
      ]),
    ),
  }));
  const result = prepareTieredResourceEstimator(converted, config, kind)(
    converted[0]!,
    converted[1]!,
    "hle",
  );
  assert.ok(result);
  assert.ok(Math.abs(result.amount - estimate.amount * 100) < 1e-8);
  assert.equal(result.confidence, estimate.confidence);
  const preparation = prepareEffortResourceImputation(
    converted,
    config,
    prepareBenchmarkScoring(converted, config),
    [kind],
  );
  assert.ok(imputedTaskResource(preparation, converted[0]!, "hle", kind));
  assert.equal(imputedTaskResource(preparation, converted[0]!, "hle", "cost"), null);
  if (kind === "tokens")
    assert.equal(
      prepareTieredResourceEstimator(converted, config, "output_tokens")(
        converted[0]!,
        converted[1]!,
        "hle",
      ),
      null,
    );
  if (kind === "output_tokens")
    assert.equal(
      prepareTieredResourceEstimator(converted, config, "tokens")(
        converted[0]!,
        converted[1]!,
        "hle",
      ),
      null,
    );
}
