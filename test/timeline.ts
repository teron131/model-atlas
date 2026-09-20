/** Prove benchmark turnover, permanent units, separate dimensions, and transfer uncertainty using observed bridge configurations. */
import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import {
  anchorTimeline,
  calibrateTimeline,
  DEFAULT_TIMELINE_PARAMETERS,
  timelineTransferError,
} from "../src/model-atlas/timeline/calibration";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import {
  extendTimelineGraph,
  fitTimelineLink,
  timelineInformation,
} from "../src/model-atlas/timeline/linking";
import { historicalSourceModel } from "../src/model-atlas/timeline/model-identity";
import { prepareTimelineRelease } from "../src/model-atlas/timeline/scale";
import type {
  HistoricalBenchmark,
  HistoricalModel,
  HistoricalSourceRelease,
  TimelineAnchors,
} from "../src/model-atlas/timeline/schemas";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, actual + " != " + expected);
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const model = (name: string, date = "2020-01-01") => historicalSourceModel(name, "Lab", null, date);
const benchmark = (
  id: string,
  scale: HistoricalBenchmark["scale"],
  intelligence = 1,
): HistoricalBenchmark => ({
  id,
  key: id,
  label: id,
  kind: "task",
  scale,
  weights: { intelligence, agentic: 1 - intelligence },
});
const seeds = Array.from({ length: 8 }, (_, i) => model("Seed " + i));
const firstBridge = Array.from({ length: 12 }, (_, i) => model("First bridge " + i, "2022-01-01"));
const secondBridge = Array.from({ length: 8 }, (_, i) => model("Second bridge " + i, "2024-01-01"));
const future = model("Future", "2026-01-01");
const disconnected = model("Disconnected", "2026-01-01");
const saturated = model("Saturated", "2026-01-01");
const current = seeds.map((m, i) => ({
  model_id: m.id,
  name: m.name,
  provider_id: m.provider,
  release_date: m.releaseDate,
  intelligence_score: 10 + 5 * i,
  agentic_score: 50 - 4 * i,
  intelligence_confidence: 0.8,
  agentic_confidence: 0.8,
}));
// These synthetic complete-capability indexes isolate unit transfer; task-basket admission is tested separately below.
const old = { ...benchmark("old", "linear"), kind: "index" as const };
const middle = { ...benchmark("middle", "probability"), kind: "index" as const };
const newest = { ...benchmark("newest", "probability"), kind: "index" as const };
const agentic = { ...benchmark("agentic", "linear", 0), kind: "index" as const };
const island = benchmark("island", "linear");
const observe = (m: HistoricalModel, benchmarkId: string, value: number) => ({
  modelId: m.id,
  benchmarkId,
  value,
  observedAt: m.releaseDate!,
  source: "synthetic measurement",
});
const first: HistoricalSourceRelease = {
  id: "first-era",
  capturedAt: "2022-01-01",
  artifacts: [],
  portfolios: [],
  models: [...seeds, ...firstBridge],
  benchmarks: [old, middle, agentic],
  observations: [
    ...seeds.flatMap((m, i) => [
      observe(m, "old", (10 + 5 * i - 5) / 2),
      observe(m, "agentic", (50 - 4 * i - 3) / 4),
    ]),
    ...firstBridge.flatMap((m, i) => {
      const quality = 30 + 5 * i;
      return [
        observe(m, "old", (quality - 5) / 2),
        observe(m, "middle", logistic((quality - 60) / 12)),
      ];
    }),
  ],
};
const firstData = historicalDatasetFromReleases([first], current, 0, "2022-01-01");
const before = JSON.stringify(firstData);
const firstRelease = prepareTimelineRelease(firstData, DEFAULT_TIMELINE_PARAMETERS);
assert.equal(
  JSON.stringify(firstData),
  before,
  "Fitting must not rewrite observations or its input dataset",
);
const original = JSON.stringify(firstRelease.scale);
const initialScores = calibrateTimeline(firstRelease, "intelligence");
for (const dimension of ["intelligence", "agentic"] as const) {
  const perturbed = calibrateTimeline(
    {
      ...firstRelease,
      observations: firstRelease.observations.map((row) =>
        Object.values(firstRelease.rootBenchmarkIds).includes(row.benchmarkId)
          ? row
          : { ...row, value: row.value + 100 },
      ),
    },
    dimension,
  );
  for (const [index, seed] of seeds.entries()) {
    const estimate = perturbed.estimates.find((row) => row.modelId === seed.id)!;
    assert.equal(estimate.reference, true);
    assert.equal(
      estimate.value,
      current[index]![`${dimension}_score`],
      "External observations cannot overwrite supported references",
    );
  }
}
close(initialScores.estimates.find((e) => e.modelId === firstBridge[11]!.id)!.value!, 85);
const later: HistoricalSourceRelease = {
  id: "later-era",
  capturedAt: "2026-01-01",
  artifacts: [],
  portfolios: [],
  models: [...secondBridge, future, disconnected, saturated],
  benchmarks: [middle, newest, island],
  observations: [
    ...secondBridge.flatMap((m, i) => {
      const quality = 70 + 4 * i;
      return [
        observe(m, "middle", logistic((quality - 60) / 12)),
        observe(m, "newest", logistic((quality - 110) / 18)),
      ];
    }),
    observe(future, "newest", logistic((150 - 110) / 18)),
    observe(disconnected, "island", 200),
    observe(saturated, "newest", 1),
  ],
};
const laterData = historicalDatasetFromReleases(
  [later],
  current.map((row) => ({
    ...row,
    intelligence_score: row.intelligence_score + 900,
    agentic_score: row.agentic_score + 900,
  })),
  0,
  "2026-01-01",
);
const release = prepareTimelineRelease(laterData, DEFAULT_TIMELINE_PARAMETERS, firstRelease.scale);
assert.equal(
  JSON.stringify(firstRelease.scale),
  original,
  "Extending a scale cannot mutate its published calibration",
);
assert.equal(
  release.reference.id,
  firstData.reference.id,
  "A newer leaderboard checkpoint cannot rebase the original unit",
);
const intelligence = calibrateTimeline(release, "intelligence");
const result = intelligence.estimates.find((e) => e.modelId === future.id)!;
close(result.value!, 150);
assert.equal(result.uncertainty!.steps, 3);
assert.equal(
  calibrateTimeline(release, "intelligence", {
    ...DEFAULT_TIMELINE_PARAMETERS,
    minModels: 9,
  }).estimates.find((e) => e.modelId === future.id)!.value,
  null,
  "Stricter overlap requirements can suppress a path without refitting its published unit",
);
assert.deepEqual(result.paths[0], [
  "newest",
  "middle",
  "old",
  release.rootBenchmarkIds.intelligence,
]);
assert.equal(result.benchmarkSupport.inferred, 0);
assert.equal(
  result.evidence,
  1,
  "One measured benchmark remains one observation across three calibration links",
);
assert.equal(
  result.uncertainty!.outsideOverlap,
  true,
  "Extending beyond bridge support stays visible in backend uncertainty",
);
assert.equal(intelligence.estimates.find((e) => e.modelId === disconnected.id)!.value, null);
const saturatedScore = intelligence.estimates.find((e) => e.modelId === saturated.id)!;
assert.ok(Number.isFinite(saturatedScore.value) && saturatedScore.value! > result.value!);
assert.equal(saturatedScore.saturated, 1);
assert.equal(
  calibrateTimeline(release, "agentic").estimates.find((e) => e.modelId === future.id)!.value,
  null,
  "Intelligence-only links cannot identify Agentic capability",
);
for (const estimate of initialScores.estimates)
  close(
    intelligence.estimates.find((e) => e.modelId === estimate.modelId)!.value!,
    estimate.value!,
  );
for (const dimension of ["intelligence", "agentic"] as const)
  for (const node of firstRelease.scale!.dimensions[dimension].nodes)
    assert.deepEqual(
      release.scale!.dimensions[dimension].nodes.find((n) => n.benchmarkId === node.benchmarkId),
      node,
    );
assert.equal(
  prepareTimelineRelease(laterData, DEFAULT_TIMELINE_PARAMETERS, release.scale).scale!.id,
  release.scale!.id,
  "An unchanged refresh is idempotent",
);
const persisted = JSON.parse(JSON.stringify(release));
assert.equal(
  prepareTimelineRelease(persisted, DEFAULT_TIMELINE_PARAMETERS).scale!.id,
  release.scale!.id,
  "Reopening a prepared release reuses its embedded calibration by default",
);
assert.deepEqual(
  calibrateTimeline(persisted, "intelligence"),
  intelligence,
  "Serialized calibration preserves the same cross-era ruler",
);
const narrowedView = { ...release, models: release.models.filter((m) => m.id === future.id) };
close(calibrateTimeline(narrowedView, "intelligence").estimates[0]!.value!, result.value!);

// Evidence availability selects the basket; query values, reported errors, and route metadata cannot switch estimators.
const proxyData = structuredClone(firstRelease);
proxyData.benchmarks = proxyData.benchmarks.map((b) =>
  ["old", "middle"].includes(b.id) ? { ...b, kind: "task" } : b,
);
const originId = proxyData.rootBenchmarkIds.intelligence;
const errorTemplate = proxyData.scale!.dimensions.intelligence.nodes.find(
  (n) => n.benchmarkId === "old",
)!.errors[0]!;
proxyData.benchmarks.push({ ...benchmark("shared-index", "linear"), kind: "index" });
proxyData.scale!.dimensions.intelligence.nodes = proxyData.scale!.dimensions.intelligence.nodes.map(
  (n) => ({
    ...n,
    errors: n.errors.map((e) => ({ ...e, error: 10 })),
  }),
);
proxyData.scale!.dimensions.intelligence.nodes.push({
  benchmarkId: "shared-index",
  slope: 1,
  offset: 0,
  path: ["shared-index", originId],
  errors: [{ ...errorTemplate, linkId: "shared-index-link", error: 1 }],
  disagreement: 0,
});
proxyData.observations = proxyData.observations.filter(
  (o) => o.modelId !== firstBridge[0]!.id && o.modelId !== firstBridge[1]!.id,
);
proxyData.observations.push(
  observe(firstBridge[0]!, "old", (80 - 5) / 2),
  observe(firstBridge[0]!, "shared-index", 25),
  observe(firstBridge[1]!, "middle", logistic((35 - 60) / 12)),
  observe(firstBridge[1]!, "shared-index", 40),
);
const proxyScores = calibrateTimeline(proxyData, "intelligence");
const proxyEstimate = proxyScores.estimates.find((e) => e.modelId === firstBridge[0]!.id)!;
assert.equal(proxyEstimate.source, "blended");
assert.equal(proxyEstimate.indexOnly, false);
assert.equal(proxyEstimate.benchmarkSupport.observed, 1);
close(proxyEstimate.value!, 0.2 * 80 + 0.8 * 25);
close(
  proxyScores.estimates.find((e) => e.modelId === firstBridge[1]!.id)!.value!,
  0.2 * 35 + 0.8 * 40,
);
const weakerIndex = structuredClone(proxyData);
weakerIndex.scale!.dimensions.intelligence.nodes.find(
  (n) => n.benchmarkId === "shared-index",
)!.errors[0]!.error = 1000;
close(
  calibrateTimeline(weakerIndex, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value!,
  proxyEstimate.value!,
);
for (const id of ["direct-b", "direct-c"]) {
  proxyData.benchmarks.push(benchmark(id, "linear"));
  proxyData.observations.push(observe(firstBridge[0]!, id, 80));
  proxyData.scale!.dimensions.intelligence.nodes.push({
    benchmarkId: id,
    slope: 1,
    offset: 0,
    path: [id, originId],
    errors: [{ ...errorTemplate, linkId: id, error: 10 }],
    disagreement: 0,
  });
}
const supportedTasks = calibrateTimeline(proxyData, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
assert.equal(supportedTasks.source, "blended");
const progress = 2 / (STAGE_CONFIG.scoring.qualityBenchmarkFullCount - 1);
const threeTaskShare = 0.2 + 0.6 * progress ** 2 * (3 - 2 * progress);
close(supportedTasks.value!, threeTaskShare * 80 + (1 - threeTaskShare) * 25);
const countedIndexes = structuredClone(proxyData);
countedIndexes.benchmarks.push({
  ...benchmark("other-index", "linear"),
  kind: "index",
  representedBenchmarks: 16,
});
countedIndexes.scale!.dimensions.intelligence.nodes.push({
  benchmarkId: "other-index",
  slope: 1,
  offset: 0,
  path: ["other-index", originId],
  errors: [{ ...errorTemplate, linkId: "other-index", error: 1 }],
  disagreement: 0,
});
countedIndexes.observations = countedIndexes.observations.map((o) =>
  o.benchmarkId === "shared-index" ? { ...o, benchmarkCount: 4 } : o,
);
countedIndexes.observations.push(observe(firstBridge[0]!, "other-index", 75));
close(
  calibrateTimeline(countedIndexes, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value!,
  threeTaskShare * 80 + (1 - threeTaskShare) * 65,
);
const zeroTasks = structuredClone(countedIndexes);
const taskIds = new Set(zeroTasks.benchmarks.filter((b) => b.kind === "task").map((b) => b.id));
zeroTasks.observations = zeroTasks.observations.filter((o) => !taskIds.has(o.benchmarkId));
const indexResult = calibrateTimeline(zeroTasks, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
close(indexResult.value!, 65);
assert.equal(indexResult.indexOnly, true);
assert.equal(indexResult.benchmarkSupport.observed, 0);
zeroTasks.benchmarks.find((b) => b.id === "shared-index")!.key = "aa_quality_index";
zeroTasks.benchmarks.find((b) => b.id === "other-index")!.key = "aa_intelligence_index";
zeroTasks.observations = zeroTasks.observations.map((o) =>
  o.benchmarkId === "other-index" ? { ...o, observedAt: "2026-01-01" } : o,
);
const latestPublisher = calibrateTimeline(zeroTasks, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
close(latestPublisher.value!, 75);
assert.equal(
  latestPublisher.evidence,
  1,
  "An older AA index cannot add a second vote beside its replacement",
);
const componentFallback = structuredClone(proxyData);
componentFallback.observations = componentFallback.observations.filter(
  (o) => o.benchmarkId !== "shared-index",
);
const componentEstimate = calibrateTimeline(componentFallback, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
assert.equal(componentEstimate.source, "components");
close(componentEstimate.value!, 80);
const familyIndex = structuredClone(proxyData);
familyIndex.benchmarks.find((b) => b.id === "shared-index")!.key = "epoch_capabilities_index";
const effortVariant = { ...firstBridge[0]!, id: "effort-variant", effort: "high" };
familyIndex.models.push(effortVariant);
const grouped = calibrateTimeline(familyIndex, "intelligence").estimates.find(
  (e) => e.modelId === effortVariant.id,
)!;
assert.equal(
  grouped.value,
  null,
  "Selecting a family representative cannot fabricate index observations for an unmeasured configuration",
);
assert.equal(
  grouped.benchmarkSupport.observed,
  0,
  "Model-level ECI does not manufacture exact-effort task observations",
);
assert.equal(
  familyIndex.observations.some((o) => o.modelId === effortVariant.id),
  false,
);
const rescaledWeights = {
  ...proxyData,
  benchmarks: proxyData.benchmarks.map((b) => ({
    ...b,
    weights: { intelligence: b.weights.intelligence * 10, agentic: b.weights.agentic * 10 },
  })),
};
close(
  calibrateTimeline(rescaledWeights, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value!,
  supportedTasks.value!,
);
const unequalWeights = {
  ...proxyData,
  benchmarks: proxyData.benchmarks.map((b) =>
    ["direct-b", "direct-c"].includes(b.id)
      ? { ...b, weights: { ...b.weights, intelligence: 0.01 } }
      : b,
  ),
};
const unequal = calibrateTimeline(unequalWeights, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
close(unequal.value!, supportedTasks.value!);
assert.ok(
  unequal.benchmarkSupport.effective < supportedTasks.benchmarkSupport.effective,
  "Two tiny dimension weights cannot supply two full units of effective support",
);
close(timelineInformation({ scale: "probability" }, 0.5), 1);
close(timelineInformation({ scale: "probability" }, 0), 0);
close(timelineInformation({ scale: "probability" }, 1), 0);
close(
  timelineInformation({ scale: "probability" }, 0.02),
  timelineInformation({ scale: "probability" }, 0.98),
);
const nearCeiling = (value: number) =>
  calibrateTimeline(
    {
      ...proxyData,
      benchmarks: proxyData.benchmarks.map((b) =>
        b.id === "old" ? { ...b, scale: "probability" as const } : b,
      ),
      observations: proxyData.observations.map((o) =>
        o.modelId === firstBridge[0]!.id && o.benchmarkId === "old" ? { ...o, value } : o,
      ),
    },
    "intelligence",
  ).estimates.find((e) => e.modelId === firstBridge[0]!.id)!;
const near = nearCeiling(0.95),
  ceiling = nearCeiling(0.99);
assert.ok(
  ceiling.value! >= near.value!,
  "A higher score cannot lower capability as boundary sensitivity falls",
);
assert.ok(
  ceiling.benchmarkSupport.effective < near.benchmarkSupport.effective,
  "Ceiling results supply less discrimination without changing score weights",
);
for (const count of [1, 2, 3]) {
  const taskIds = new Set(["old", "direct-b", "direct-c"].slice(0, count));
  const taskOnly = {
    ...proxyData,
    observations: proxyData.observations.filter(
      (o) => o.modelId !== firstBridge[0]!.id || taskIds.has(o.benchmarkId),
    ),
  };
  const estimate = calibrateTimeline(taskOnly, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!;
  assert.equal(estimate.benchmarkSupport.observed, count);
  if (count < 3)
    assert.equal(
      estimate.value,
      null,
      "One or two tasks without a broad index cannot establish an overall score",
    );
  else close(estimate.value!, 80);
}
const equivalentRoute = structuredClone(proxyData);
for (const node of equivalentRoute.scale!.dimensions.intelligence.nodes) {
  if (!node.errors.length) continue;
  node.path.splice(1, 0, "exact-intermediate");
  node.errors.push({
    ...node.errors[0]!,
    linkId: "exact-intermediate",
    error: 0,
    normalizedError: 0,
  });
}
close(
  calibrateTimeline(equivalentRoute, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value!,
  supportedTasks.value!,
);
const indexOnly = {
  ...proxyData,
  observations: proxyData.observations.filter(
    (o) => o.modelId !== firstBridge[0]!.id || o.benchmarkId === "shared-index",
  ),
};
const fallback = calibrateTimeline(indexOnly, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
assert.equal(fallback.source, "index");
close(fallback.value!, 25);

for (const parameters of [
  DEFAULT_TIMELINE_PARAMETERS,
  { ...DEFAULT_TIMELINE_PARAMETERS, saturationLow: 0, saturationHigh: 100 },
]) {
  let previous = -Infinity;
  for (const value of [0, 0.01, 0.02, 0.5, 0.97, 0.98, 0.99, 1]) {
    const query = {
      ...proxyData,
      observations: proxyData.observations.map((o) =>
        o.modelId === firstBridge[1]!.id && o.benchmarkId === "middle" ? { ...o, value } : o,
      ),
    };
    const estimate = calibrateTimeline(query, "intelligence", parameters).estimates.find(
      (e) => e.modelId === firstBridge[1]!.id,
    )!;
    assert.ok(
      Number.isFinite(estimate.value) && estimate.value! >= previous,
      "Improving a probability measurement through either saturation boundary cannot lower or remove its score",
    );
    previous = estimate.value!;
  }
}

// Deliberately wrong sparse checkpoint labels remain archived but cannot override measured evidence or define units.
const weakSeeds = new Set(seeds.slice(0, 4).map((m) => m.id));
const supportedData = {
  ...firstData,
  observations: firstData.observations.map((o) =>
    o.benchmarkId !== firstData.rootBenchmarkIds.intelligence
      ? o
      : {
          ...o,
          value: weakSeeds.has(o.modelId) ? o.value + 1000 : o.value,
          referenceConfidence: weakSeeds.has(o.modelId) ? 0.59 : 0.6,
        },
  ),
};
const supported = prepareTimelineRelease(supportedData, DEFAULT_TIMELINE_PARAMETERS);
const supportedScores = calibrateTimeline(supported, "intelligence");
close(supportedScores.estimates.find((e) => e.modelId === firstBridge[11]!.id)!.value!, 85);
close(supportedScores.estimates.find((e) => e.modelId === seeds[0]!.id)!.value!, 10);
assert.equal(supportedScores.estimates.find((e) => e.modelId === seeds[0]!.id)!.reference, false);
assert.equal(
  supported.scale!.observations.find(
    (o) => o.modelId === seeds[0]!.id && o.benchmarkId === supported.rootBenchmarkIds.intelligence,
  )!.value,
  1010,
);
const noEvidence = {
  ...supported,
  observations: supported.observations.filter(
    (o) => o.modelId !== seeds[0]!.id || o.benchmarkId === supported.rootBenchmarkIds.intelligence,
  ),
};
assert.equal(
  calibrateTimeline(noEvidence, "intelligence").estimates.find((e) => e.modelId === seeds[0]!.id)!
    .value,
  null,
  "A weak label without usable evidence must remain unplaced",
);
assert.equal(supported.scale!.minimumReferenceConfidence, 0.6);
for (const dimension of ["intelligence", "agentic"] as const) {
  const root = supported.rootBenchmarkIds[dimension];
  const rootLinks = supported.scale!.dimensions[dimension].links.filter(
    (link) => link.left === root || link.right === root,
  );
  assert.ok(rootLinks.length > 0);
  assert.ok(rootLinks.every((link) => link.models === (dimension === "intelligence" ? 4 : 8)));
}
const insufficient = prepareTimelineRelease(
  {
    ...supportedData,
    observations: supportedData.observations.map((o) =>
      o.benchmarkId === firstData.rootBenchmarkIds.intelligence && o.modelId === seeds[4]!.id
        ? { ...o, referenceConfidence: 0.5999 }
        : o,
    ),
  },
  DEFAULT_TIMELINE_PARAMETERS,
);
assert.equal(
  calibrateTimeline(insufficient, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[11]!.id,
  )!.value,
  null,
  "Insufficient supported anchors must not fall back to unreliable labels",
);
assert.throws(
  () =>
    prepareTimelineRelease(firstData, DEFAULT_TIMELINE_PARAMETERS, {
      ...firstRelease.scale!,
      minimumReferenceConfidence: 0.5,
    }),
  /separate scale file/,
);
assert.ok(!("version" in firstRelease) && !("version" in firstRelease.scale!));

const pairs = Array.from({ length: 12 }, (_, i) => ({
  family: "Family " + i,
  left: i + (i % 2 ? 0.2 : -0.2),
  right: 3 + 2 * i,
}));
const link = fitTimelineLink("a", "b", pairs, DEFAULT_TIMELINE_PARAMETERS)!;
assert.ok(link && link.leftError > 0);
const duplicated = fitTimelineLink(
  "a",
  "b",
  [...pairs, ...Array.from({ length: 10 }, () => pairs[0]!)],
  DEFAULT_TIMELINE_PARAMETERS,
)!;
close(duplicated.leftMean, link.leftMean);
close(duplicated.rightDeviation, link.rightDeviation);
close(duplicated.error, link.error);
assert.equal(
  duplicated.models,
  12,
  "Repeated efforts cannot manufacture independent calibration models",
);
assert.equal(
  fitTimelineLink(
    "a",
    "b",
    pairs.map((p) => ({ ...p, right: 5 })),
    DEFAULT_TIMELINE_PARAMETERS,
  ),
  null,
  "A flat overlap cannot identify a benchmark unit",
);
assert.equal(
  fitTimelineLink(
    "a",
    "b",
    pairs.map((p) => ({ ...p, right: -p.right })),
    DEFAULT_TIMELINE_PARAMETERS,
  ),
  null,
  "Opposite ordering cannot silently reverse a capability axis",
);
const exact = pairs.map((p, i) => ({ family: p.family, left: i, right: 2 * i + 3 }));
const ab = fitTimelineLink("a", "b", exact, DEFAULT_TIMELINE_PARAMETERS)!;
const ac = fitTimelineLink(
  "a",
  "c",
  exact.map((p) => ({ ...p, right: 4 * p.left - 8 })),
  DEFAULT_TIMELINE_PARAMETERS,
)!;
const bc = fitTimelineLink(
  "b",
  "c",
  exact.map((p) => ({ ...p, left: p.right, right: 4 * p.left - 8 })),
  DEFAULT_TIMELINE_PARAMETERS,
)!;
const origin = { benchmarkId: "a", slope: 1, offset: 0, path: ["a"], errors: [], disagreement: 0 };
const network = extendTimelineGraph([ab, ac, bc], [origin]);
close(network.find((n) => n.benchmarkId === "c")!.slope, 0.25);
close(network.find((n) => n.benchmarkId === "c")!.offset, 2);
const inconsistent = extendTimelineGraph(
  [ab, { ...ac, rightMean: ac.rightMean + 8 }, bc],
  [origin],
);
assert.ok(
  inconsistent.some((n) => n.disagreement > 0.1),
  "Conflicting overlap routes must remain visible in the error budget",
);
const node = {
  benchmarkId: "b",
  slope: 1,
  offset: 0,
  path: ["b", "a"],
  disagreement: 0,
  errors: [
    {
      linkId: link.id,
      center: link.rightMean,
      deviation: link.rightDeviation,
      min: link.rightMin,
      max: link.rightMax,
      error: link.rightError,
      models: link.models,
      normalizedError: link.error,
    },
  ],
};
const central = timelineTransferError(node, link.rightMean).error;
assert.ok(
  timelineTransferError(node, link.rightMax + 30).error > central,
  "Distance beyond the shared range increases transfer uncertainty",
);
assert.ok(
  timelineTransferError(
    { ...node, errors: node.errors.map((e) => ({ ...e, models: 4 })) },
    link.rightMean,
  ).error > central,
  "Less independent overlap increases uncertainty at equal residual error",
);
assert.ok(
  timelineTransferError({ ...node, errors: [...node.errors, ...node.errors] }, link.rightMean)
    .error > central,
  "Longer routes retain accumulated error rather than treating links as independent votes",
);

const display = anchorTimeline(
  intelligence,
  release,
  {
    mode: "models",
    lowModelId: seeds[0]!.id,
    highModelId: seeds[7]!.id,
    lowScore: 50,
    highScore: 80,
    pointsPerDeviation: 20,
  },
  "intelligence",
);
close(display.get(seeds[0]!.id)!, 50);
close(display.get(seeds[7]!.id)!, 80);
assert.ok(
  display.get(future.id)! > 100,
  "New capabilities can extend past the initial reference range",
);
const historicalAnchors: TimelineAnchors = {
  mode: "models",
  lowModelId: firstBridge[0]!.id,
  highModelId: seeds[7]!.id,
  lowScore: 5,
  highScore: 80,
  pointsPerDeviation: 20,
  frozenReferences: [
    {
      modelId: firstBridge[0]!.id,
      referenceId: release.reference.id,
      scaleId: release.scale!.id,
      values: { intelligence: 30, agentic: 20 },
    },
  ],
};
const historicalDisplay = anchorTimeline(intelligence, release, historicalAnchors, "intelligence");
close(historicalDisplay.get(firstBridge[0]!.id)!, 5);
close(historicalDisplay.get(seeds[7]!.id)!, 80);
const revised = {
  ...intelligence,
  estimates: intelligence.estimates.map((e) =>
    e.modelId === firstBridge[0]!.id ? { ...e, value: e.value! + 7 } : e,
  ),
};
close(
  anchorTimeline(revised, release, historicalAnchors, "intelligence").get(future.id)!,
  historicalDisplay.get(future.id)!,
);
close(
  anchorTimeline(revised, release, historicalAnchors, "intelligence").get(firstBridge[0]!.id)!,
  40,
);
assert.equal(
  historicalAnchors.frozenReferences![0]!.values.intelligence,
  30,
  "The saved ruler stays fixed while its model's revised estimate moves on that ruler",
);
assert.equal(
  intelligence.estimates.find((e) => e.modelId === firstBridge[0]!.id)!.reference,
  false,
  "A saved display anchor does not turn an estimate into an observed calibration reference",
);
assert.throws(
  () =>
    anchorTimeline(
      intelligence,
      release,
      { ...historicalAnchors, frozenReferences: undefined },
      "intelligence",
    ),
  /saved historical display reference/,
);
assert.throws(
  () =>
    anchorTimeline(
      intelligence,
      { ...release, reference: { ...release.reference, id: "different origin" } },
      historicalAnchors,
      "intelligence",
    ),
  /different coordinate/,
);
// Benchmark names do not establish specialist status or change admission, persisted mappings, or inference.
const specialistData = {
  ...firstData,
  benchmarks: firstData.benchmarks.map((b) =>
    b.id === "old" ? { ...b, key: "epoch:ExploitBench" } : b,
  ),
};
const specialistScale = { ...firstRelease.scale!, benchmarks: specialistData.benchmarks };
const specialistBefore = JSON.stringify(specialistScale);
const withdrawn = prepareTimelineRelease(
  specialistData,
  DEFAULT_TIMELINE_PARAMETERS,
  specialistScale,
);
assert.equal(
  JSON.stringify(specialistScale),
  specialistBefore,
  "Reusing a benchmark under another label preserves its prior archive",
);
assert.deepEqual(
  withdrawn.observations,
  firstRelease.observations,
  "A benchmark label does not erase observed results",
);
assert.deepEqual(withdrawn.reference, firstRelease.reference);
assert.deepEqual(
  withdrawn.models,
  firstRelease.models,
  "A benchmark label must not merge or hide model identities",
);
assert.deepEqual(withdrawn.scale!.dimensions, firstRelease.scale!.dimensions);
assert.equal(
  calibrateTimeline(withdrawn, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value,
  initialScores.estimates.find((e) => e.modelId === firstBridge[0]!.id)!.value,
  "An unreviewed benchmark label cannot withdraw a validated transfer",
);
assert.equal(
  calibrateTimeline({ ...specialistData, scale: specialistScale }, "intelligence").estimates.find(
    (e) => e.modelId === firstBridge[0]!.id,
  )!.value,
  initialScores.estimates.find((e) => e.modelId === firstBridge[0]!.id)!.value,
  "Query projection applies the same evidence rule to every benchmark name",
);
assert.deepEqual(withdrawn.scale!.dimensions.agentic, firstRelease.scale!.dimensions.agentic);
const freshSpecialist = prepareTimelineRelease(specialistData, DEFAULT_TIMELINE_PARAMETERS);
assert.ok(freshSpecialist.scale!.dimensions.intelligence.nodes.some((n) => n.path.includes("old")));
assert.equal(
  prepareTimelineRelease(withdrawn, DEFAULT_TIMELINE_PARAMETERS).scale!.id,
  withdrawn.scale!.id,
);

const alternate = benchmark("alternate", "linear");
const alternateData = {
  ...specialistData,
  benchmarks: [...specialistData.benchmarks, alternate],
  observations: [
    ...specialistData.observations,
    ...seeds.map((m, i) => observe(m, alternate.id, 10 + 5 * i)),
    ...firstBridge.map((m, i) => observe(m, alternate.id, 30 + 5 * i)),
  ],
};
const reconnected = prepareTimelineRelease(
  alternateData,
  DEFAULT_TIMELINE_PARAMETERS,
  withdrawn.scale,
);
const reconnectedEstimate = calibrateTimeline(reconnected, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[11]!.id,
)!;
close(reconnectedEstimate.value!, 85);
assert.ok(reconnectedEstimate.paths.some((path) => path.includes("old")));
assert.ok(reconnected.scale!.dimensions.intelligence.nodes.find((n) => n.benchmarkId === "middle"));
console.log(
  "Permanent cross-era turnover, dimension, uncertainty, bridge admission, and continuation checks passed.",
);

// Reconcile supported family versions without manufacturing measurements or crossing effort/provider boundaries.
const versioned = structuredClone(proxyData);
const january = {
  ...firstBridge[0]!,
  id: "dated-january",
  name: "Versioned model (Jan 2024)",
  family: "dated-january",
  releaseDate: "2024-01-10",
};
const february = {
  ...january,
  id: "dated-february",
  name: "Versioned model (Feb 2024)",
  family: "dated-february",
  releaseDate: "2024-02-10",
};
const missingMarch = {
  ...january,
  id: "dated-march",
  name: "Versioned model (Mar 2024)",
  family: "dated-march",
  releaseDate: "2024-03-10",
};
const genericVersion = { ...january, id: "generic-version", name: "Versioned model" };
const highVersion = { ...january, id: "high-version", effort: "high" };
const otherProvider = { ...january, id: "other-provider", provider: "Other lab" };
versioned.models.push(january, february, missingMarch, genericVersion, highVersion, otherProvider);
versioned.observations.push(
  observe(january, "shared-index", 80),
  { ...observe(february, "shared-index", 25), benchmarkCount: 9 },
  { ...observe(genericVersion, "shared-index", 100), benchmarkCount: 4 },
  observe(highVersion, "shared-index", 100),
  observe(otherProvider, "shared-index", 100),
);
const untouchedVersions = JSON.stringify(versioned);
const versionScores = calibrateTimeline(
  { ...versioned, models: versioned.models.filter((m) => m.id !== genericVersion.id) },
  "intelligence",
);
const februaryScore = versionScores.estimates.find((e) => e.modelId === february.id)!;
close(februaryScore.value!, 80);
assert.deepEqual(februaryScore.versionAdjustment, {
  kind: "successor",
  modelIds: [january.id],
  unadjustedValue: 25,
});
assert.equal(februaryScore.benchmarkSupport.observed, 0);
assert.equal(februaryScore.evidence, 1);
assert.equal(versionScores.estimates.find((e) => e.modelId === missingMarch.id)!.value, null);
assert.equal(JSON.stringify(versioned), untouchedVersions);
console.log("Confirmed successors retain earlier capability without manufacturing measurements.");

const reconciledVersions = calibrateTimeline(versioned, "intelligence");
close(reconciledVersions.estimates.find((e) => e.modelId === february.id)!.value!, 80);
close(reconciledVersions.estimates.find((e) => e.modelId === genericVersion.id)!.value!, 100);
assert.equal(
  reconciledVersions.estimates.find((e) => e.modelId === genericVersion.id)!.versionAdjustment,
  undefined,
);
assert.equal(JSON.stringify(versioned), untouchedVersions);
console.log("Unresolved generic records cannot pool or change dated estimates.");

// A partial retained basket stays index-led even when it contains several individual measurements.
const partialBasket = structuredClone(proxyData);
for (let i = 0; i < 20; i++) {
  const id = `unobserved-task-${i}`;
  partialBasket.benchmarks.push(benchmark(id, "linear"));
  partialBasket.scale!.dimensions.intelligence.nodes.push({
    benchmarkId: id,
    slope: 1,
    offset: 0,
    path: [id, originId],
    errors: [],
    disagreement: 0,
  });
}
const partialEstimate = calibrateTimeline(partialBasket, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
assert.equal(partialEstimate.benchmarkSupport.observed, 3);
assert.ok(
  partialEstimate.value! < supportedTasks.value!,
  "Three results cannot receive the same influence in a much larger retained portfolio",
);
assert.ok(partialEstimate.value! >= 25 && partialEstimate.value! <= 80);
const overlappingIndex = structuredClone(proxyData);
for (const b of overlappingIndex.benchmarks) {
  if (b.id === "shared-index") b.key = "cais_capabilities_index";
  if (b.id === "old") b.key = "enigmaeval";
  if (b.id === "direct-b") b.key = "erqa";
  if (b.id === "direct-c") b.key = "hle";
}
for (const o of overlappingIndex.observations)
  if (o.benchmarkId === "shared-index") o.benchmarkCount = 3;
const overlapEstimate = calibrateTimeline(overlappingIndex, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
close(overlapEstimate.value!, 80);
assert.equal(overlapEstimate.source, "components");
assert.ok(
  overlapEstimate.paths.every((path) => path[0] !== "shared-index"),
  "A fully represented CAIS basket cannot vote again as an independent index",
);
const variantIndexes = structuredClone(countedIndexes);
variantIndexes.models.find((m) => m.id === firstBridge[0]!.id)!.effort = "high";
variantIndexes.benchmarks.find((b) => b.id === "shared-index")!.key = "epoch_capabilities_index";
variantIndexes.benchmarks.find((b) => b.id === "other-index")!.key = "aa_intelligence_index";
variantIndexes.observations = variantIndexes.observations.filter(
  (o) =>
    o.modelId !== firstBridge[0]!.id || ["shared-index", "other-index"].includes(o.benchmarkId),
);
const variantEstimate = calibrateTimeline(variantIndexes, "intelligence").estimates.find(
  (e) => e.modelId === firstBridge[0]!.id,
)!;
close(variantEstimate.value!, 75);
assert.deepEqual(
  variantEstimate.paths.map((p) => p[0]),
  ["other-index"],
);
assert.equal(
  variantIndexes.observations.filter((o) => o.modelId === firstBridge[0]!.id).length,
  2,
  "An ineligible family index remains retained metadata",
);
