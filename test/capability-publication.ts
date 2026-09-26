/** Prove fixed capability publication survives persistence, new configurations, corrections, and portfolio turnover. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import {
  readCapabilityState,
  writeCapabilityState,
} from "../src/model-atlas/database/capability-state";
import {
  buildFinalModels,
  prepareModelSelection,
} from "../src/model-atlas/pipeline/selection/builder";
import { DEFAULT_TIMELINE_PARAMETERS } from "../src/model-atlas/timeline/calibration";
import {
  advanceCapabilities,
  capabilityDataset,
  capabilityIndex,
  capabilityModelId,
  type CapabilityState,
} from "../src/model-atlas/timeline/capability";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import { parseEpochTimeline } from "../src/model-atlas/timeline/index-sources";
import { historicalSourceModel } from "../src/model-atlas/timeline/model-identity";
import { prepareTimelineRelease } from "../src/model-atlas/timeline/scale";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const capturedAt = "2026-09-15T01:00:00.000Z";
const models = Array.from({ length: 8 }, (_, i) => {
  const name = i === 7 ? "Claude Opus 4.5" : `Reference ${i}`;
  const score = 20 + i * 5;
  return {
    ...minimalModelAtlasModel({ id: `lab/${name}`, name }),
    provider: i === 7 ? "Anthropic" : "Lab",
    intelligence: { intelligence_index: score },
    benchmarks: { browsecomp: 0.2 + i * 0.07, critpt: 0.2 + i * 0.07 },
    component_scores: { intelligence_score: score, agentic_score: score, speed_score: 42 },
    scores: { intelligence_score: score, agentic_score: score, speed_score: 42, value_score: 43 },
  };
});
const historical = models.map((m) => historicalSourceModel(m.name!, m.provider, null, null));
historical.push(historicalSourceModel("GPT-4 (Mar 2023)", "OpenAI", null, "2023-03-14"));
const retained = historicalDatasetFromReleases(
  [
    {
      id: "fixture",
      capturedAt,
      artifacts: [],
      models: historical,
      benchmarks: [
        {
          id: "external",
          key: "external",
          label: "Published index",
          kind: "index",
          scale: "linear",
          weights: { intelligence: 1, agentic: 1 },
        },
      ],
      observations: historical.map((m, i) => ({
        modelId: m.id,
        benchmarkId: "external",
        value: i === 8 ? -20 : 20 + 5 * i,
        observedAt: capturedAt,
        source: "fixture",
      })),
      portfolios: [],
    },
  ],
  models.map((m) => ({
    model_id: m.id,
    name: m.name,
    provider_id: m.provider,
    intelligence_score: m.component_scores.intelligence_score,
    agentic_score: m.component_scores.agentic_score,
    intelligence_confidence: 1,
    agentic_confidence: 1,
  })),
  0,
  capturedAt,
);
const aliases = new Map(
  historical.slice(0, 8).map((m, i) => [m.id, capabilityModelId(models[i]!)]),
);
retained.models = retained.models.map((m) => ({ ...m, id: aliases.get(m.id) ?? m.id }));
retained.observations = retained.observations.map((o) => ({
  ...o,
  modelId: aliases.get(o.modelId) ?? o.modelId,
}));
const dataset = prepareTimelineRelease(retained, DEFAULT_TIMELINE_PARAMETERS);
const anchorIds = [historical[8]!.id, capabilityModelId(models[7]!)] as const;
const seed: CapabilityState = {
  version: 1,
  initializedAt: capturedAt,
  dataset,
  anchors: {
    mode: "models",
    lowModelId: anchorIds[0],
    highModelId: anchorIds[1],
    lowScore: 100,
    highScore: 150,
    pointsPerDeviation: 1,
    frozenReferences: anchorIds.map((modelId, i) => ({
      modelId,
      referenceId: dataset.reference.id,
      scaleId: dataset.scale!.id,
      values: { intelligence: i ? 55 : -20, agentic: i ? 55 : -20 },
    })),
  },
  positions: Object.fromEntries(
    [
      ...models.map((m) => ({
        modelId: capabilityModelId(m),
        coordinates: {
          intelligence: m.component_scores.intelligence_score,
          agentic: m.component_scores.agentic_score,
        },
        publishedAt: capturedAt,
        policyId: "fixture",
      })),
      {
        modelId: anchorIds[0],
        coordinates: { intelligence: -20, agentic: -20 },
        publishedAt: capturedAt,
        policyId: "fixture",
      },
    ].map((p) => [p.modelId, p]),
  ),
  policies: {
    fixture: { benchmarkIds: ["external"], weights: { external: { intelligence: 1, agentic: 1 } } },
  },
};
const initial = advanceCapabilities(seed, models, capturedAt);
const relativeRows = models.map((m) => ({
  ...m,
  id: m.id!.replaceAll(" ", "-"),
  modalities: { output: ["text"] },
}));
const versioning = {
  baselineDate: "2026-09-15",
  observedDate: "2026-09-15",
  observedAt: capturedAt,
};
const relativeSelection = prepareModelSelection(relativeRows, STAGE_CONFIG.scoring, versioning);
const indexedSelection = prepareModelSelection(
  relativeRows,
  STAGE_CONFIG.scoring,
  versioning,
  [],
  initial,
);
assert.deepEqual(
  indexedSelection.candidates.map((m) => m.component_scores),
  relativeSelection.candidates.map((m) => m.component_scores),
  "The separate index cannot overwrite relative scores or their resource-comparison coordinates",
);
const resourceInputs = {
  modelRows: relativeRows,
  speedByModelId: new Map(),
  pricingByModelId: new Map(),
  outputTokenAnchors: [200, 500, 1000, 2000, 8000],
};
const relativeModels = await buildFinalModels(
  relativeSelection,
  resourceInputs,
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
const indexedModels = await buildFinalModels(
  indexedSelection,
  resourceInputs,
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.ok(relativeModels.length > 0);
assert.deepEqual(
  indexedModels,
  relativeModels,
  "Publishing an Intelligence Index cannot change leaderboard scores, resources, or admission",
);
assert.equal(capabilityDataset(initial).prepared!.calibrations.agentic, undefined);
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE capability_state (singleton INTEGER PRIMARY KEY, state_gzip BLOB NOT NULL)");
writeCapabilityState(db, initial);
const stored = readCapabilityState(db)!;
assert.deepEqual(stored.positions, initial.positions);
assert.deepEqual(
  stored.dataset,
  JSON.parse(JSON.stringify(initial.dataset)),
  "Packed persistence must preserve every evidence row and prepared estimate",
);
assert.equal(stored.dataset.models, stored.dataset.scale!.models);
assert.equal(stored.dataset.observations, stored.dataset.scale!.observations);
const packed = JSON.parse(
  gunzipSync(
    db.prepare("SELECT state_gzip FROM capability_state").get()!.state_gzip as Uint8Array,
  ).toString(),
);
assert.equal(
  packed.dataset.scale.observations,
  undefined,
  "The checkpoint must not store a second copy of retained evidence",
);
assert.equal(
  capabilityDataset(initial),
  initial.dataset,
  "Persistence reuses the already prepared publication",
);
assert.equal(
  capabilityIndex(
    initial.anchors.frozenReferences![0]!.values.intelligence,
    "intelligence",
    initial.anchors,
  ),
  100,
);
assert.equal(
  capabilityIndex(models[7]!.component_scores.intelligence_score, "intelligence", initial.anchors),
  150,
);

const next = advanceCapabilities(stored, models, "2026-09-15T02:00:00.000Z");
assert.equal(
  next.dataset.scale,
  stored.dataset.scale,
  "An unchanged capture reuses its saved graph without fitting it again",
);
assert.deepEqual(
  next.dataset.observations,
  stored.dataset.observations,
  "Fetch timestamps must not duplicate or rewrite unchanged evidence",
);
assert.equal(
  capabilityModelId({ ...models[0]!, id: "lab/reference:free" }),
  capabilityModelId({ ...models[0]!, id: "lab/reference" }),
);
const movedRoute = { ...models[0]!, id: "lab/replacement-route" };
const moved = advanceCapabilities(
  stored,
  [...models.slice(1), movedRoute],
  "2026-09-15T02:00:00.000Z",
);
assert.deepEqual(
  moved.positions[capabilityModelId(movedRoute)]!.coordinates,
  initial.positions[capabilityModelId(models[0]!)]!.coordinates,
);
assert.deepEqual(next.positions, initial.positions);
assert.equal(next.dataset.benchmarks.length, initial.dataset.benchmarks.length);
for (const dimension of ["intelligence", "agentic"] as const)
  assert.deepEqual(
    next.dataset.scale!.dimensions[dimension].nodes,
    initial.dataset.scale!.dimensions[dimension].nodes,
  );

const future = {
  ...models[6]!,
  id: "lab/future",
  name: "Future",
  intelligence: { intelligence_index: 90 },
  benchmarks: null,
};
const extended = advanceCapabilities(next, [...models, future], "2026-09-15T03:00:00.000Z");
assert.ok(extended.positions[capabilityModelId(future)]?.coordinates.intelligence != null);
assert.equal(extended.positions[capabilityModelId(future)]?.coordinates.agentic, undefined);
assert.ok(
  capabilityIndex(
    extended.positions[capabilityModelId(future)]!.coordinates.intelligence,
    "intelligence",
    extended.anchors,
  )! > 150,
);
for (const [id, position] of Object.entries(initial.positions))
  assert.deepEqual(extended.positions[id], position);
const corrected = advanceCapabilities(
  extended,
  [...models, { ...future, intelligence: { intelligence_index: 95 } }],
  "2026-09-15T04:00:00.000Z",
);
assert.deepEqual(corrected.positions, extended.positions);

const retired = advanceCapabilities(
  corrected,
  models.map((m) => ({ ...m, benchmarks: null })),
  "2026-09-15T05:00:00.000Z",
);
const task = retired.dataset.benchmarks.find((b) => b.key === "atlas_benchmark_browsecomp")!;
assert.ok(task);
assert.ok(!retired.dataset.activeBenchmarkIds!.includes(task.id));
assert.ok(retired.dataset.observations.some((o) => o.benchmarkId === task.id));
assert.deepEqual(retired.positions, corrected.positions);
const reweighted = prepareTimelineRelease(
  {
    ...retired.dataset,
    benchmarks: retired.dataset.benchmarks.map((b) => ({
      ...b,
      weights: { intelligence: b.weights.intelligence * 2, agentic: b.weights.agentic },
    })),
  },
  retired.dataset.scale!.parameters,
);
assert.deepEqual(
  reweighted.scale!.dimensions.intelligence.nodes,
  retired.dataset.scale!.dimensions.intelligence.nodes,
);
const timeline = capabilityDataset(retired);
assert.equal(
  timeline.prepared!.calibrations.intelligence.estimates.find(
    (e) => e.modelId === capabilityModelId(models[0]!),
  )!.value,
  models[0]!.component_scores.intelligence_score,
);
assert.equal(
  parseEpochTimeline([], capturedAt).benchmarks[0]!.id,
  parseEpochTimeline([], "2026-09-16").benchmarks[0]!.id,
);
db.close();
console.log(
  "Capability publication retains coordinates, mappings, and archived evidence while placing new configurations.",
);
