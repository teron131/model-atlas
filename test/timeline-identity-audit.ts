/** Reproduce spelling/provider duplicates and verify the whole-release audit catches bad identities and contradictory dates before publication. */
import assert from "node:assert/strict";

import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import { auditHistoricalIdentities } from "../src/model-atlas/timeline/identity-audit";
import { historicalSourceModel } from "../src/model-atlas/timeline/index-sources";
import {
  historicalNameKey,
  resolveHistoricalModelIdentities,
} from "../src/model-atlas/timeline/model-identity";
import type { HistoricalSourceRelease } from "../src/model-atlas/timeline/types";

const aa = historicalSourceModel("Gemini 1.5 Pro (Sep 2024)", "Google", null, "2024-09-24");
const epoch = historicalSourceModel(
  "Gemini 1.5 Pro (Sept 2024)",
  "Google DeepMind",
  null,
  "2024-09-24",
);
const release: HistoricalSourceRelease = {
  id: "identity-audit",
  capturedAt: "2026-01-01",
  artifacts: [],
  portfolios: [],
  models: [aa, epoch],
  benchmarks: ["aa:old", "epoch:task"].map((id) => ({
    id,
    key: id,
    label: id,
    kind: "task",
    scale: "probability",
    weights: { intelligence: 1, agentic: 1 },
  })),
  observations: [
    {
      modelId: aa.id,
      benchmarkId: "aa:old",
      value: 0.5,
      observedAt: "2026-01-01",
      source: "https://artificialanalysis.ai/leaderboards/models",
      sourceModelVersion: "gemini-1-5-pro",
    },
    {
      modelId: epoch.id,
      benchmarkId: "epoch:task",
      value: 0.6,
      observedAt: "2026-01-01",
      source: "Epoch",
      sourceModelVersion: "gemini-1.5-pro-002",
    },
  ],
};
const resolved = historicalDatasetFromReleases([release]);
const raw = { ...resolved, models: release.models, observations: release.observations };
assert.ok(auditHistoricalIdentities(raw).errors.some((error) => error.kind === "unresolved-alias"));
assert.equal(
  resolved.models.length,
  1,
  "A published release date is enough; the API ID need not encode a YYYYMMDD date",
);
assert.equal(resolved.models[0]!.id, aa.id);
assert.equal(resolved.observations.length, 2);
assert.deepEqual(auditHistoricalIdentities(resolved).errors, []);
assert.equal(auditHistoricalIdentities(resolved).reviewGroups.length, 0);
assert.ok(
  auditHistoricalIdentities({
    ...resolved,
    models: [...resolved.models, resolved.models[0]!],
  }).errors.some((error) => error.kind === "duplicate-model-id"),
  "Repeated model IDs must not pass merely because a Map silently collapses them",
);
const explicit = { ...aa, id: "aa-model:exact-publisher-configuration::unknown" };
const exactRows = [
  { ...release.observations[0]!, modelId: aa.id },
  { ...release.observations[0]!, modelId: explicit.id, benchmarkId: "aa:new" },
];
const exact = resolveHistoricalModelIdentities([aa, explicit], exactRows);
assert.equal(
  exact.models.length,
  1,
  "An explicit source ID must not duplicate the same dated publisher configuration",
);
assert.equal(exact.observations.length, 2);
assert.deepEqual(resolveHistoricalModelIdentities(exact.models, exact.observations), exact);
const conflicting = resolveHistoricalModelIdentities(
  [aa, explicit],
  [exactRows[0]!, { ...exactRows[0]!, modelId: explicit.id, value: 0.9 }],
);
assert.equal(
  conflicting.models.length,
  2,
  "Conflicting measurements are not proof of equivalent configurations",
);
const differentVersion = resolveHistoricalModelIdentities(
  [aa, explicit],
  [exactRows[0]!, { ...exactRows[1]!, sourceModelVersion: "gemini-1-5-pro-reasoning" }],
);
assert.equal(
  differentVersion.models.length,
  2,
  "Reasoning and non-reasoning publisher versions remain distinct",
);
assert.notEqual(historicalNameKey("Command R"), historicalNameKey("Command R+"));
assert.notEqual(historicalNameKey("Qwen3 Thinking"), historicalNameKey("Qwen3 Instruct"));
const frozenName = historicalSourceModel("Qwen 3.8 Flash Next", "alibaba", null, "2026-08-26");
const sourceName = historicalSourceModel("Qwen3.8-Flash-Next", "Alibaba", null, "2026-08-26");
const namedReference = resolveHistoricalModelIdentities(
  [frozenName, sourceName],
  [
    {
      modelId: frozenName.id,
      benchmarkId: "atlas:intelligence:fixture",
      value: 80,
      referenceConfidence: 0.8,
      observedAt: "2026-09-01",
      source: "Model Atlas frozen checkpoint",
    },
    {
      modelId: sourceName.id,
      benchmarkId: "aa:old",
      value: 0.8,
      observedAt: "2026-09-01",
      source: "https://artificialanalysis.ai/leaderboards/models",
      sourceModelVersion: "qwen3-8-flash-next",
    },
  ],
);
assert.equal(
  namedReference.models.length,
  1,
  "A frozen catalog identity does not need an external API slug to receive an exact dated name match",
);
assert.equal(namedReference.models[0]!.id, frozenName.id);
assert.equal(namedReference.observations.find((o) => o.referenceConfidence != null)!.value, 80);

const bad = { ...aa, name: "Gemini 1.5 Pro (May 2024)", releaseDate: "2024-02-15" };
assert.ok(
  auditHistoricalIdentities({ ...raw, models: [bad, epoch] }).errors.some(
    (error) => error.kind === "contradictory-release-date",
  ),
);
const repaired = historicalDatasetFromReleases([
  { ...release, id: "bad-date", models: [bad], observations: [release.observations[0]!] },
  {
    ...release,
    id: "good-date",
    capturedAt: "2026-02-01",
    models: [{ ...bad, releaseDate: "2024-05-14" }],
    observations: [release.observations[0]!],
  },
]);
assert.equal(
  repaired.models[0]!.releaseDate,
  "2024-05-14",
  "An earlier contradictory date must not override consistent source metadata",
);
assert.equal(
  resolveHistoricalModelIdentities([bad], []).models[0]!.releaseDate,
  null,
  "Do not invent a date when no consistent evidence is available",
);
assert.ok(
  auditHistoricalIdentities({
    ...raw,
    observations: [...raw.observations, raw.observations[0]!],
  }).errors.some((error) => error.kind === "duplicate-measurement"),
);
console.log(
  "Full-release identity audit catches Gemini aliases, date conflicts, and repeated measurements.",
);
