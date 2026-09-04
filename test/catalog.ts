/** Verifies model-catalog identity, inclusion, alias collapse, and public admission. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import type { ScoringConfig } from "../src/model-atlas/config/stage";
import { canonicalModelKey } from "../src/model-atlas/identity/normalization";
import { buildModelCatalogRows } from "../src/model-atlas/pipeline/model-catalog";
import {
  buildFinalModels,
  hasRequiredBasicSpecs,
  hasRequiredBenchmarkEvidence,
  hasRequiredPublicRelevance,
} from "../src/model-atlas/pipeline/selection/builder";
import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import type { BenchmarkPortfolio } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const sourceData = {
  modelsDev: {
    rows: [
      catalogModel("provider/family-1", "Family 1", "family"),
      catalogModel("provider/family-latest", "Family Latest", "family"),
      catalogModel("other", "Other", "other"),
      catalogModel("provider/other-image", "Other Image", "other-image"),
    ],
    byId: new Map<string, ModelsDevFlatModel>(),
  },
};
const catalogRows = buildModelCatalogRows(sourceData, [
  {
    id: "provider/matched",
    name: "Matched",
    modalities: { output: ["text"] },
  },
  {
    id: "provider/matched-image",
    name: "Matched Image",
    modalities: { output: ["text"] },
  },
]);

assert.deepEqual(
  catalogRows.map((row) => row.id),
  ["provider/matched", "provider/family-1", "provider/other"],
  "catalog policy should keep text models while excluding image labels and redundant latest aliases",
);

assert.equal(
  canonicalModelKey({ id: "alibaba/qwen3.6-plus", name: "Qwen 3.6 Plus" }),
  canonicalModelKey({ id: "qwen/qwen3.6-plus", name: "Qwen 3.6 Plus" }),
  "provider aliases with the same public model identity should share calibration mass",
);
assert.equal(
  canonicalModelKey({
    id: "anthropic/claude-opus-4.7",
    name: "Claude Opus 4.7",
  }),
  canonicalModelKey({
    id: "anthropic/claude-opus-4.7-fast",
    name: "Claude Opus 4.7 (Fast)",
  }),
  "configuration labels should remain variants of the same model",
);

const completeBasicSpecs = {
  id: "provider/model",
  name: "Model",
  release_date: "2026-01-01",
  modalities: { output: ["text"] },
  cost: { input: 1, output: 2 },
  context_window: { context: 100_000, output: 10_000 },
  speed: {
    throughput_tokens_per_second_median: 50,
    latency_seconds_median: 1,
    e2e_latency_seconds_median: 2,
  },
};
assert.equal(hasRequiredBasicSpecs(completeBasicSpecs), true);
assert.equal(
  hasRequiredBasicSpecs({
    ...completeBasicSpecs,
    speed: {
      throughput_tokens_per_second_median: null,
      latency_seconds_median: null,
      e2e_latency_seconds_median: null,
    },
  }),
  false,
  "sparse core specs should not form an official leaderboard model",
);

assert.equal(
  hasRequiredPublicRelevance({
    scores: {
      intelligence_score: 10,
      agentic_score: 10,
      speed_score: 9,
      value_score: 9,
    },
  }),
  true,
  "both qualifying quality scores should satisfy the public relevance threshold",
);
assert.equal(
  hasRequiredPublicRelevance({
    scores: {
      intelligence_score: 10,
      agentic_score: 9,
      speed_score: 100,
      value_score: 100,
    },
  }),
  false,
  "resource scores should not rescue a model below the Agentic relevance floor",
);

const evidencePortfolio = {
  intelligence_observed: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  intelligence_missing: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  agentic_observed: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  agentic_missing: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
} satisfies BenchmarkPortfolio;
const evidenceScoringConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["intelligence_observed", "intelligence_missing"],
  agenticBenchmarkKeys: ["agentic_observed", "agentic_missing"],
  benchmarkPortfolio: evidencePortfolio,
} satisfies ScoringConfig;
const benchmarkAdmissionConfig = {
  indexBenchmarkKeys: ["intelligence_observed", "agentic_observed"],
  minimumObservedIndexes: 2,
  minimumObservedBenchmarks: 2,
  minimumObservedPerDimension: 1,
} as const;
const minimumEvidenceModel = {
  ...minimalModelAtlasModel({ id: "provider/model", name: "Model" }),
  benchmarks: {
    intelligence_observed: 0.5,
    agentic_observed: 0.5,
  },
};
assert.equal(
  hasRequiredBenchmarkEvidence(
    minimumEvidenceModel,
    evidenceScoringConfig,
    benchmarkAdmissionConfig,
  ),
  true,
  "observed evidence in both dimensions should be visible",
);
assert.equal(
  hasRequiredBenchmarkEvidence(
    {
      ...minimumEvidenceModel,
      benchmarks: { intelligence_observed: 0.5 },
    },
    evidenceScoringConfig,
    { ...benchmarkAdmissionConfig, minimumObservedBenchmarks: 1 },
  ),
  false,
  "intelligence-only evidence should be hidden",
);
assert.equal(
  hasRequiredBenchmarkEvidence(minimumEvidenceModel, evidenceScoringConfig, {
    ...benchmarkAdmissionConfig,
    minimumObservedBenchmarks: 3,
  }),
  false,
  "dimension coverage should not replace the minimum benchmark count",
);
assert.equal(
  hasRequiredBenchmarkEvidence(
    {
      ...minimumEvidenceModel,
      benchmarks: { agentic_observed: 0.5 },
    },
    evidenceScoringConfig,
    { ...benchmarkAdmissionConfig, minimumObservedBenchmarks: 1 },
  ),
  false,
  "agentic-only evidence should be hidden",
);
assert.equal(
  hasRequiredBenchmarkEvidence(
    {
      ...minimumEvidenceModel,
      benchmarks: {
        intelligence_missing: 0.5,
        agentic_observed: 0.5,
      },
    },
    evidenceScoringConfig,
    benchmarkAdmissionConfig,
  ),
  false,
  "models with fewer than two index signals should be hidden",
);
assert.equal(
  catalogRows.find((row) => row.id === "provider/other")?.openrouter_id,
  "provider/other",
  "catalog rows should carry the canonical qualified route into variant construction",
);

const duplicateRouteId = "provider/same-route";
const selectedBenchmarkKeys = [
  ...new Set([
    ...STAGE_CONFIG.scoring.intelligenceBenchmarkKeys,
    ...STAGE_CONFIG.scoring.agenticBenchmarkKeys,
  ]),
];
const indexBenchmarkKeys = new Set<string>(
  STAGE_CONFIG.final.benchmarkAdmission.indexBenchmarkKeys,
);
const duplicateRouteModels = await buildFinalModels(
  {
    modelRows: [
      duplicateRouteRow("Existing Route Name", "2026-07-01", 0.8),
      duplicateRouteRow("Renamed Route", "2026-08-26", 0.6),
    ],
    speedByModelId: new Map([
      [
        duplicateRouteId,
        {
          throughput_tokens_per_second_median: 50,
          latency_seconds_median: 1,
          e2e_latency_seconds_median: 5,
        },
      ],
    ]),
    pricingByModelId: new Map([[duplicateRouteId, { weighted_input: 1, weighted_output: 2 }]]),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
  {
    baselineDate: "2026-07-30",
    observedDate: "2026-08-27",
  },
);
assert.deepEqual(
  duplicateRouteModels.map((model) => [model.id, model.name, model.preview === true]),
  [[duplicateRouteId, "Existing Route Name", false]],
  "one public route must not appear as both an official model and a renamed preview",
);

const knownPreviewId = "provider/known-preview";
const unknownPreviewId = "provider/unknown-preview";
const coveredRecentId = "provider/covered-recent";
const coveredOlderId = "provider/covered-older";
const expiredPreviewId = "provider/expired-preview";
const admissionRows = [
  {
    ...recentPreviewRow(knownPreviewId, "Known Preview", {
      intelligence_index: 70,
      agentic_index: 65,
    }),
    release_date: "2026-07-29",
    benchmarks: { critpt: 0.7, tau_banking: 0.7 },
  },
  recentPreviewRow(unknownPreviewId, "Unknown Preview"),
  {
    ...recentPreviewRow(coveredRecentId, "Covered Recent", {
      intelligence_index: 75,
      agentic_index: 70,
    }),
    release_date: "2026-08-27",
  },
  {
    ...recentPreviewRow(coveredOlderId, "Covered Older", {
      intelligence_index: 75,
      agentic_index: 70,
    }),
    release_date: "2026-07-28",
  },
  {
    ...recentPreviewRow(expiredPreviewId, "Expired Preview", {
      intelligence_index: 70,
      agentic_index: 65,
    }),
    release_date: "2026-07-28",
    benchmarks: { critpt: 0.7, tau_banking: 0.7 },
  },
];
const previewModels = await buildFinalModels(
  {
    modelRows: admissionRows,
    speedByModelId: new Map(
      admissionRows.map(({ id }) => [
        id,
        {
          throughput_tokens_per_second_median: 50,
          latency_seconds_median: 1,
          e2e_latency_seconds_median: 5,
        },
      ]),
    ),
    pricingByModelId: new Map(
      admissionRows.map(({ id }) => [id, { weighted_input: 1, weighted_output: 2 }]),
    ),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
  {
    baselineDate: "2026-07-30",
    observedDate: "2026-08-27",
  },
);
assert.deepEqual(
  previewModels.map((model) => [model.id, model.preview === true]).sort(),
  [
    [coveredOlderId, false],
    [coveredRecentId, false],
    [knownPreviewId, true],
  ].sort(),
  "covered models rank immediately at any age; only undercovered models younger than 30 days with two index signals survive as previews",
);
assert.deepEqual(
  previewModels.find((model) => model.id === coveredRecentId)?.scores,
  previewModels.find((model) => model.id === coveredOlderId)?.scores,
  "release age alone must not select a different scoring policy for adequately covered models",
);

const metadataPreviewId = "provider/metadata-preview";
const completeMetadataRow = recentPreviewRow(metadataPreviewId, "Metadata Preview", {
  intelligence_index: 75,
  agentic_index: 70,
});
const metadataPreviewRow = {
  ...completeMetadataRow,
  release_date: null,
  cost: null,
  limit: null,
};
const metadataModels = await buildFinalModels(
  {
    modelRows: [
      ...admissionRows,
      metadataPreviewRow,
      { ...metadataPreviewRow, id: "provider/old-metadata-preview", release_date: "2025-01-01" },
      { ...metadataPreviewRow, id: "provider/sparse-metadata", benchmarks: { critpt: 0.7 } },
      { ...metadataPreviewRow, id: "provider/no-index-metadata", intelligence: null },
      { ...metadataPreviewRow, id: "provider/non-text", modalities: { output: ["image"] } },
    ],
    speedByModelId: new Map(),
    pricingByModelId: new Map(),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
  { baselineDate: "2026-07-30", observedDate: "2026-08-27" },
);
assert.deepEqual(
  metadataModels.map((model) => model.id).sort(),
  [coveredOlderId, coveredRecentId, metadataPreviewId, "provider/old-metadata-preview"].sort(),
  "incomplete specs waive neither broad benchmark evidence nor index coverage; only the new benchmark-complete preview path is independent of release age",
);
assert.ok(metadataModels.every((model) => model.preview === true));
const metadataPreview = metadataModels.find((model) => model.id === metadataPreviewId)!;
assert.equal(metadataPreview.release_date, null);
assert.equal(metadataPreview.cost, null);
assert.equal(metadataPreview.context_window, null);
assert.equal(metadataPreview.scores.speed_score, null);
assert.equal(metadataPreview.scores.value_score, null);
assert.ok(metadataPreview.scores.intelligence_score! >= 10);
assert.ok(metadataPreview.scores.agentic_score! >= 10);

const completedMetadataModels = await buildFinalModels(
  {
    modelRows: [completeMetadataRow],
    speedByModelId: new Map([[metadataPreviewId, completeBasicSpecs.speed]]),
    pricingByModelId: new Map([[metadataPreviewId, { weighted_input: 1, weighted_output: 2 }]]),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.equal(completedMetadataModels.length, 1);
assert.notEqual(
  completedMetadataModels[0]?.preview,
  true,
  "complete metadata restores ordinary admission without retaining a preview duplicate",
);

const fallbackRows = ["high", "max"].map((effort, index) => ({
  ...metadataPreviewRow,
  reasoning_effort: effort,
  artificial_analysis_cost: { input: 10, output: 50 },
  median_output_tokens_per_second: 100 - index * 50,
  median_time_to_first_token_seconds: 2 + index * 10,
  median_end_to_end_response_time_seconds: 20 + index * 40,
}));
const fallbackModels = await buildFinalModels(
  {
    modelRows: fallbackRows,
    speedByModelId: new Map(),
    pricingByModelId: new Map(),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.equal(fallbackModels.length, 2);
assert.equal(
  fallbackModels.find((model) => model.reasoning_effort === "high")?.speed
    .throughput_tokens_per_second_median,
  100,
);
assert.equal(
  fallbackModels.find((model) => model.reasoning_effort === "max")?.speed
    .throughput_tokens_per_second_median,
  50,
  "AA fallback telemetry stays on its exact effort rather than a shared route map",
);
assert.ok(
  fallbackModels.every(
    (model) =>
      model.preview &&
      model.cost?.input === 10 &&
      model.cost?.output === 50 &&
      model.cost?.blended_price === 30,
  ),
);
assert.ok(
  fallbackModels.every(
    (model) => model.scores.speed_score != null && model.scores.value_score != null,
  ),
);
const primaryModels = await buildFinalModels(
  {
    modelRows: [{ ...fallbackRows[0], cost: { input: 8, output: 40 } }],
    speedByModelId: new Map([
      [
        metadataPreviewId,
        {
          throughput_tokens_per_second_median: 200,
          latency_seconds_median: null,
          e2e_latency_seconds_median: 7,
        },
      ],
    ]),
    pricingByModelId: new Map([[metadataPreviewId, { weighted_input: 6, weighted_output: null }]]),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.deepEqual(primaryModels[0]?.speed, {
  throughput_tokens_per_second_median: 200,
  latency_seconds_median: 2,
  e2e_latency_seconds_median: 7,
});
assert.deepEqual(
  primaryModels[0]?.cost,
  { input: 8, output: 40, weighted_input: 6, weighted_output: 40, blended_price: 23 },
  "primary catalog and OpenRouter values replace fallback fields independently",
);

function duplicateRouteRow(name: string, releaseDate: string, benchmarkValue: number) {
  return {
    id: duplicateRouteId,
    name,
    release_date: releaseDate,
    modalities: { input: ["text"], output: ["text"] },
    cost: { input: 1, output: 2 },
    limit: { context: 100_000, output: 10_000 },
    benchmarks: Object.fromEntries(selectedBenchmarkKeys.map((key) => [key, benchmarkValue])),
  };
}

function recentPreviewRow(
  id: string,
  name: string,
  intelligence?: { intelligence_index: number; agentic_index: number },
) {
  return {
    id,
    name,
    release_date: "2026-08-26",
    modalities: { input: ["text"], output: ["text"] },
    cost: { input: 1, output: 2 },
    limit: { context: 100_000, output: 10_000 },
    ...(intelligence == null ? {} : { intelligence }),
    benchmarks: Object.fromEntries(
      selectedBenchmarkKeys.filter((key) => !indexBenchmarkKeys.has(key)).map((key) => [key, 0.7]),
    ),
  };
}

function catalogModel(id: string, name: string, family: string): ModelsDevFlatModel {
  return {
    provider_id: "provider",
    provider_name: "Provider",
    model_id: id,
    model: {
      id,
      name,
      family,
      modalities: { output: ["text"] },
    },
  };
}
