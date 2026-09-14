/** Protect verified release matching, source provenance, effort separation, and replay of formerly split historical identities. */
import assert from "node:assert/strict";

import {
  calibrateTimeline,
  DEFAULT_TIMELINE_PARAMETERS,
} from "../src/model-atlas/timeline/calibration";
import {
  historicalDatasetFromReleases,
  historicalReleaseId,
} from "../src/model-atlas/timeline/dataset";
import { historicalSourceModel } from "../src/model-atlas/timeline/index-sources";
import { resolveHistoricalModelIdentities } from "../src/model-atlas/timeline/model-identity";
import { prepareTimelineRelease } from "../src/model-atlas/timeline/scale";
import type { HistoricalSourceRelease } from "../src/model-atlas/timeline/types";

const model = (name: string, effort: string | null = null) =>
  historicalSourceModel(name, "Anthropic", effort, null);
const juneAa = model("Claude 3.5 Sonnet (June '24)");
const juneShort = model("Claude 3.5 Sonnet (June)");
const juneEpoch = model("Claude 3.5 Sonnet");
const octoberAa = model("Claude 3.5 Sonnet (Oct 2024)");
const octoberEpoch = model("Claude 3.5 Sonnet (October 2024)");
const high = model("Claude 3.5 Sonnet", "high");
const ambiguous = { ...juneAa, id: "aa-model:separate-configuration::unknown" };
const merelySimilar = model("Claude 3.5 Sonnet (Jun 2024) unverified");
const seeds = Array.from({ length: 8 }, (_, i) => model(`Reference ${i}`));
const aaSource = "https://artificialanalysis.ai/leaderboards/models";
const observation = (
  modelId: string,
  benchmarkId: string,
  value: number,
  sourceModelVersion: string,
  source = aaSource,
) => ({ modelId, benchmarkId, value, sourceModelVersion, source, observedAt: "2026-01-01" });
const release: HistoricalSourceRelease = {
  id: "verified-identities",
  capturedAt: "2026-01-01",
  artifacts: [],
  portfolios: [],
  models: [
    ...seeds,
    juneAa,
    juneShort,
    juneEpoch,
    octoberAa,
    octoberEpoch,
    high,
    ambiguous,
    merelySimilar,
  ],
  benchmarks: ["aa:old", "aa:new", "epoch:task"].map((id) => ({
    id,
    key: id,
    label: id,
    kind: "task",
    scale: "probability",
    weights: { intelligence: 1, agentic: 1 },
  })),
  observations: [
    ...seeds.flatMap((m, i) =>
      ["aa:old", "aa:new", "epoch:task"].map((id) =>
        observation(m.id, id, 0.1 + 0.1 * i, `reference-${i}`),
      ),
    ),
    observation(juneAa.id, "aa:old", 0.5, "claude-35-sonnet-june-24"),
    observation(juneShort.id, "aa:new", 0.6, "claude-35-sonnet-june-24"),
    observation(
      juneEpoch.id,
      "epoch:task",
      0.7,
      "claude-3-5-sonnet-20240620",
      "Epoch measured result",
    ),
    observation(octoberAa.id, "aa:old", 0.7, "claude-35-sonnet"),
    observation(
      octoberEpoch.id,
      "epoch:task",
      0.8,
      "claude-3-5-sonnet-20241022",
      "Epoch measured result",
    ),
    observation(high.id, "aa:old", 0.8, "claude-35-sonnet-june-24"),
    observation(ambiguous.id, "aa:old", 0.9, "claude-35-sonnet-june-24"),
    observation(merelySimilar.id, "aa:old", 0.4, "unverified-version"),
  ],
};
const canonical = "name:claude-3-5-sonnet-jun-2024::unknown";
const october = "name:claude-3-5-sonnet-oct-2024::unknown";
const original = JSON.stringify(release);
const current = seeds.map((m, i) => ({
  model_id: m.id,
  name: m.name,
  provider_id: "Anthropic",
  intelligence_score: i * 10,
  agentic_score: i * 10,
  intelligence_confidence: 0.9,
  agentic_confidence: 0.9,
}));
const selected = historicalDatasetFromReleases([release], current);
assert.equal(
  selected.releaseId,
  historicalReleaseId({
    ...selected,
    models: [...selected.models].reverse(),
    observations: [...selected.observations].reverse(),
  }),
  "Release identity ignores input ordering",
);
assert.notEqual(
  selected.releaseId,
  historicalReleaseId({
    ...selected,
    benchmarks: selected.benchmarks.map((benchmark) => ({
      ...benchmark,
      weights: { intelligence: 0.25, agentic: 0.75 },
    })),
  }),
  "Changed dimension weights invalidate the evidence release",
);
assert.equal(
  selected.reference.id,
  historicalDatasetFromReleases([release], [...current].reverse()).reference.id,
);
const duplicateCatalog = historicalDatasetFromReleases(
  [release],
  [
    ...current,
    {
      ...current[0]!,
      model_id: "lab/distinct-configuration",
      intelligence_score: 9,
      agentic_score: 8,
    },
  ],
);
assert.equal(duplicateCatalog.reference.models, current.length + 1);
assert.ok(duplicateCatalog.models.some((model) => model.id.includes("distinct-configuration")));

const primaryData = historicalDatasetFromReleases(
  [release],
  current.map((row, index) => ({
    ...row,
    benchmarkObservations: [
      { benchmark_key: "arc_agi_2", value: index / 20, observed_at: "2026-01-01" },
    ],
  })),
);
const primary = primaryData.benchmarks.find(
  (benchmark) => benchmark.key === "atlas_benchmark_arc_agi_2",
)!;
assert.equal(primary.primary, true);
assert.equal(primary.scale, "probability");
assert.deepEqual(primary.weights, { intelligence: 1, agentic: 0 });
assert.deepEqual(
  primaryData.observations
    .filter((row) => row.benchmarkId === primary.id)
    .map((row) => row.value)
    .sort((a, b) => a - b),
  seeds.map((_, index) => index / 20),
);
assert.notEqual(
  primaryData.reference.id,
  selected.reference.id,
  "Changed primary measurements invalidate the reference identity",
);
assert.equal(JSON.stringify(release), original, "Source releases remain immutable");
assert.equal(selected.observations.length, release.observations.length + seeds.length * 2);
assert.equal(selected.models.find((m) => m.id === canonical)!.releaseDate, "2024-06-20");
assert.equal(selected.models.find((m) => m.id === october)!.releaseDate, "2024-10-22");
assert.equal(selected.observations.filter((o) => o.modelId === canonical).length, 3);
assert.equal(selected.observations.filter((o) => o.modelId === october).length, 2);
assert.ok(
  selected.models.some((m) => m.id === high.id),
  "A dated base-model match does not invent an effort-specific catalog entry",
);
assert.ok(selected.models.some((m) => m.id === ambiguous.id));
assert.ok(selected.models.some((m) => m.id === merelySimilar.id));
assert.deepEqual(
  selected.observations.find((o) => o.modelId === canonical && o.benchmarkId === "epoch:task"),
  { ...release.observations.find((o) => o.modelId === juneEpoch.id)!, modelId: canonical },
);

const prepared = prepareTimelineRelease(selected, DEFAULT_TIMELINE_PARAMETERS);
const oldScale = {
  ...prepared.scale!,
  id: "prior-release-with-split-identities",
  models: release.models,
  observations: [
    ...release.observations,
    ...prepared.observations.filter((o) =>
      Object.values(prepared.rootBenchmarkIds).includes(o.benchmarkId),
    ),
  ],
};
const old = JSON.stringify(oldScale);
const incoming = historicalDatasetFromReleases(
  [
    {
      ...release,
      models: seeds,
      observations: release.observations.filter((o) => seeds.some((m) => m.id === o.modelId)),
    },
  ],
  current,
);
const replay = prepareTimelineRelease(incoming, DEFAULT_TIMELINE_PARAMETERS, oldScale);
assert.equal(
  JSON.stringify(oldScale),
  old,
  "Matching a retained alias does not rewrite the prior calibration",
);
assert.ok(
  !replay.models.some((m) =>
    [juneAa.id, juneShort.id, juneEpoch.id, octoberEpoch.id].includes(m.id),
  ),
);
assert.deepEqual(
  replay.scale!.models,
  replay.models,
  "The saved registry also keeps the resolved identities",
);
assert.deepEqual(
  replay.scale!.dimensions,
  prepared.scale!.dimensions,
  "Matching preserves published benchmark mappings",
);
assert.deepEqual(
  calibrateTimeline(replay, "intelligence"),
  calibrateTimeline(prepared, "intelligence"),
);
assert.equal(
  prepareTimelineRelease(replay, DEFAULT_TIMELINE_PARAMETERS).scale!.id,
  replay.scale!.id,
  "Matched replay is idempotent",
);

const duplicate = resolveHistoricalModelIdentities(release.models, [
  ...release.observations,
  { ...release.observations.find((o) => o.modelId === juneAa.id)!, modelId: juneEpoch.id },
]);
assert.equal(
  duplicate.observations.length,
  release.observations.length,
  "A duplicated measurement counts once after identity resolution",
);
const conflictingSourceRows = resolveHistoricalModelIdentities(release.models, [
  ...release.observations,
  observation(juneEpoch.id, "aa:old", 0.9, "claude-3-5-sonnet-20240620"),
]);
assert.equal(
  conflictingSourceRows.observations.length,
  release.observations.length + 1,
  "Distinct conflicting publisher records remain separate instead of being merged or discarded",
);

const ambiguousRelease = resolveHistoricalModelIdentities(release.models, [
  ...release.observations,
  observation(juneAa.id, "aa:new", 0.9, "claude-35-sonnet"),
]);
assert.ok(ambiguousRelease.models.some((m) => m.id === octoberAa.id));
assert.ok(
  ambiguousRelease.models.some((m) => m.id === juneAa.id),
  "A row carrying multiple publisher versions stays separate instead of joining two releases",
);
assert.deepEqual(
  resolveHistoricalModelIdentities(
    [...release.models].reverse(),
    [...release.observations].reverse(),
  ).observations,
  resolveHistoricalModelIdentities(release.models, release.observations).observations,
  "Input order cannot choose an identity or a score",
);
console.log("Verified historical release matching and retained replay checks passed.");

// A different family exercises the shared numeric/variant matcher without any Sonnet-specific aliases.
const sourceModel = historicalSourceModel(
  "Example Pro 2 (Jan 2024)",
  "Example",
  null,
  "2024-01-15",
);
const catalogModel = historicalSourceModel("Example Pro 2", "Example", null, "2024-01-15");
const laterModel = historicalSourceModel("Example Pro 2 (Mar 2024)", "Example", null, "2024-03-15");
const otherProvider = { ...catalogModel, id: "name:other-provider::unknown", provider: "Other" };
const genericModels = [sourceModel, catalogModel, laterModel, otherProvider];
const genericObservations = [
  observation(sourceModel.id, "aa:index", 0.5, "example-pro-2"),
  observation(
    catalogModel.id,
    "epoch:task",
    0.6,
    "example-pro-2-20240115",
    "Epoch measured result",
  ),
  observation(laterModel.id, "epoch:task", 0.7, "example-pro-2-20240315", "Epoch measured result"),
  observation(
    otherProvider.id,
    "epoch:task",
    0.8,
    "example-pro-2-20240115",
    "Epoch measured result",
  ),
];
const generic = resolveHistoricalModelIdentities(genericModels, genericObservations);
assert.equal(generic.models.length, 3);
assert.equal(generic.observations.filter((o) => o.modelId === sourceModel.id).length, 2);
assert.ok(
  generic.models.some((m) => m.id === laterModel.id),
  "A later dated snapshot stays separate",
);
assert.ok(
  generic.models.some((m) => m.id === otherProvider.id),
  "Matching never crosses providers",
);
const retainedAlias = resolveHistoricalModelIdentities(
  [...generic.models, catalogModel],
  [...generic.observations, genericObservations[1]!],
);
assert.deepEqual(
  retainedAlias,
  generic,
  "Replaying an old label for the exact dated API version cannot resurrect duplicate observations",
);

const frozen = resolveHistoricalModelIdentities(genericModels, [
  ...genericObservations,
  { ...observation(catalogModel.id, "atlas:reference", 42, ""), referenceConfidence: 0.8 },
]);
assert.ok(
  frozen.models.some((m) => m.id === catalogModel.id && !m.current),
  "A retired frozen reference retains its identity",
);
assert.equal(frozen.observations.find((o) => o.benchmarkId === "atlas:reference")!.value, 42);

const mixed = resolveHistoricalModelIdentities(genericModels, [
  ...genericObservations,
  observation(
    catalogModel.id,
    "epoch:other",
    0.65,
    "example-pro-2-20240115_32K",
    "Epoch measured result",
  ),
]);
assert.equal(
  mixed.models.length,
  genericModels.length,
  "A mixed configuration group is not a dated catalog target",
);
const unknownDate = resolveHistoricalModelIdentities(
  [{ ...sourceModel, name: "Example Pro 2", releaseDate: null }, catalogModel],
  genericObservations.filter((o) => [sourceModel.id, catalogModel.id].includes(o.modelId)),
);
assert.equal(
  unknownDate.models.length,
  2,
  "An undated source cannot choose a historical release by name alone",
);
console.log("Shared matcher release, provider, configuration, and frozen-reference checks passed.");

const datedFamily = historicalSourceModel("Dated model", "Lab", null, "2025-01-31");
const previewDatedEffort = historicalSourceModel("Dated model", "Lab", "high", "2024-12-20");
const releaseEvidence = [
  observation(
    datedFamily.id,
    "epoch:task",
    0.6,
    "dated-model-2025-01-31_high",
    "Epoch measured result",
  ),
];
const correctedDate = resolveHistoricalModelIdentities(
  [datedFamily, previewDatedEffort],
  releaseEvidence,
);
assert.equal(
  correctedDate.models.find((model) => model.id === previewDatedEffort.id)!.releaseDate,
  "2025-01-31",
);
assert.equal(
  correctedDate.models.length,
  2,
  "A shared release date does not merge effort configurations",
);
assert.equal(
  previewDatedEffort.releaseDate,
  "2024-12-20",
  "Date reconciliation does not mutate its inputs",
);
const conflictingRelease = { ...datedFamily, id: "other-dated-release", releaseDate: "2025-02-01" };
const unresolvedDate = resolveHistoricalModelIdentities(
  [datedFamily, previewDatedEffort, conflictingRelease],
  [
    ...releaseEvidence,
    observation(
      conflictingRelease.id,
      "epoch:other",
      0.7,
      "dated-model-2025-02-01_high",
      "Epoch measured result",
    ),
  ],
);
assert.equal(
  unresolvedDate.models.find((model) => model.id === previewDatedEffort.id)!.releaseDate,
  "2024-12-20",
  "Conflicting dated releases cannot supply a guessed family date",
);

// Source naming aliases share one displayed family while effort settings and genuinely later releases retain their evidence identities.
const previewHigh = historicalSourceModel("Example Pro Preview", "Google", "high", "2025-11-18");
const previewLow = historicalSourceModel("Example Pro Preview", "Google", "low", "2025-11-18");
const namedRelease = historicalSourceModel("Example Pro", "Google DeepMind", null, "2025-11-18");
const laterRelease = historicalSourceModel("Example Pro", "Google", null, "2026-01-01");
laterRelease.id = "later-release";
laterRelease.family = "later-family";
const names = [previewHigh, previewLow, namedRelease, laterRelease];
const nameObservations = names.map((m, i) =>
  observation(m.id, `source:${i}`, 40 + i, `version:${i}`, "publisher"),
);
const familyAliases = resolveHistoricalModelIdentities(names, nameObservations);
assert.equal(
  familyAliases.models.find((m) => m.id === previewHigh.id)!.family,
  namedRelease.family,
);
assert.equal(familyAliases.models.find((m) => m.id === previewLow.id)!.family, namedRelease.family);
assert.equal(familyAliases.models.find((m) => m.id === laterRelease.id)!.family, "later-family");
assert.deepEqual(
  familyAliases.observations,
  [...nameObservations].sort((a, b) => a.modelId.localeCompare(b.modelId)),
);
assert.equal(familyAliases.models.length, names.length);
assert.deepEqual(
  resolveHistoricalModelIdentities(familyAliases.models, familyAliases.observations),
  familyAliases,
);

// An older AA result cannot migrate into a newer current snapshot merely because its publisher reused the base name and slug.
const currentRevision = {
  ...historicalSourceModel("Versioned Model", "Lab", "max", "2026-07-31"),
  current: true,
};
const publishedRevision = historicalSourceModel("Versioned Model 0731", "Lab", "max", null);
const revisionRows = [
  {
    ...observation(currentRevision.id, "aa:early", 40, "versioned-model"),
    observedAt: "2026-07-01",
    sourceReleaseDate: "2026-04-24",
  },
  {
    ...observation(currentRevision.id, "aa:latest", 25, "versioned-model-0420"),
    observedAt: "2026-09-01",
    sourceReleaseDate: "2026-04-24",
  },
  {
    ...observation(publishedRevision.id, "aa:latest", 35, "versioned-model"),
    observedAt: "2026-09-01",
  },
  {
    ...observation(currentRevision.id, "reference", 60, "reference", "frozen checkpoint"),
    observedAt: "2026-09-10",
    referenceConfidence: 0.8,
  },
];
const revisions = resolveHistoricalModelIdentities(
  [currentRevision, publishedRevision],
  revisionRows,
);
const earlierRevision = revisions.models.find((m) => m.releaseDate === "2026-04-24")!;
assert.ok(earlierRevision && !earlierRevision.current);
assert.equal(revisions.models.find((m) => m.id === currentRevision.id)!.releaseDate, "2026-07-31");
assert.equal(
  revisions.observations.find(
    (o) => o.modelId === currentRevision.id && o.benchmarkId === "aa:latest",
  )!.value,
  35,
);
assert.equal(
  revisions.observations.find(
    (o) => o.modelId === earlierRevision.id && o.benchmarkId === "aa:latest",
  )!.value,
  25,
);
assert.equal(revisions.observations.length, revisionRows.length);
assert.deepEqual(
  resolveHistoricalModelIdentities(revisions.models, revisions.observations),
  revisions,
);
