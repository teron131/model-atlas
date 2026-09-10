/** Verifies model-catalog identity, inclusion, alias collapse, and public admission. */

import assert from "node:assert/strict";

import { INDEX_BENCHMARK_KEYS } from "../src/model-atlas/benchmarks/index-policy";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import type { FinalStageConfig, ScoringConfig } from "../src/model-atlas/config/stage";
import { canonicalModelKey } from "../src/model-atlas/identity/normalization";
import { buildModelCatalogRows } from "../src/model-atlas/pipeline/model-catalog";
import type { OpenRouterModelData } from "../src/model-atlas/pipeline/openrouter-data";
import {
  buildFinalModels,
  hasRequiredBenchmarkEvidence,
  hasRequiredPublicRelevance,
  prepareModelSelection,
  selectOpenRouterModelRows,
} from "../src/model-atlas/pipeline/selection/builder";
import type { BenchmarkVersioningOptions } from "../src/model-atlas/pipeline/selection/candidate";
import type { ModelsDevFlatModel } from "../src/model-atlas/sources/models-dev/catalog";
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
  minimumObservedWeight: 2,
  minimumObservedPerDimension: 1,
} as const;
const minimumEvidenceModel = {
  ...minimalModelAtlasModel({ id: "provider/model", name: "Model" }),
  benchmarks: {
    intelligence_observed: 0.5,
    agentic_observed: 0.5,
  },
};
/** Pin evidence totals independently of score normalization and model metadata. */
function admitsWeight(benchmarks: Record<string, number>, minimumObservedWeight: number): boolean {
  return hasRequiredBenchmarkEvidence({ intelligence: null, benchmarks }, STAGE_CONFIG.scoring, {
    minimumObservedWeight,
    minimumObservedPerDimension: 0,
  });
}
assert.equal(admitsWeight({ aa_intelligence_index: 0 }, 10), true);
assert.equal(
  admitsWeight({ aa_intelligence_index: 50, hle: 0.5 }, 10.5),
  false,
  "an observed component cannot increase the breadth of its own index",
);
assert.equal(
  admitsWeight({ aa_intelligence_index: 50, cais_capabilities_index: 50, hle: 0.5 }, 16),
  true,
);
assert.equal(
  admitsWeight({ aa_intelligence_index: 50, cais_capabilities_index: 50, hle: 0.5 }, 16.5),
  false,
  "HLE counts once across both indexes and standalone evidence",
);
assert.equal(admitsWeight({ critpt: 0.5, frontiermath_erdos: 0.5 }, 1.5), true);
assert.equal(
  admitsWeight({ critpt: 0.5, frontiermath_erdos: 0.5 }, 2),
  false,
  "half-importance standalone evidence contributes half a unit",
);
assert.equal(
  admitsWeight({ coding_index: 80, agentic_index: 80, omniscience_index: 80 }, 1),
  false,
);
assert.equal(
  hasRequiredBenchmarkEvidence(
    {
      intelligence: null,
      benchmarks: {
        agent_arena: 0,
        ale_bench: 0,
        apex_agents: 0,
        apex_swe: 0,
        arc_agi_2: 0,
        arc_agi_3: 0,
        automation_bench: 0,
        blueprint_bench_2: 0,
      },
    },
    STAGE_CONFIG.scoring,
    STAGE_CONFIG.final.benchmarkAdmission,
  ),
  true,
  "eight observed standalone tasks qualify without an aggregate, even at zero scores",
);
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
    { ...benchmarkAdmissionConfig, minimumObservedWeight: 1 },
  ),
  false,
  "intelligence-only evidence should be hidden",
);
assert.equal(
  hasRequiredBenchmarkEvidence(minimumEvidenceModel, evidenceScoringConfig, {
    ...benchmarkAdmissionConfig,
    minimumObservedWeight: 3,
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
    { ...benchmarkAdmissionConfig, minimumObservedWeight: 1 },
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
  true,
  "standalone evidence does not require aggregate index signals",
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
const indexBenchmarkKeys = new Set<string>(INDEX_BENCHMARK_KEYS);
const qualityRows = [0.0001, 0.9].map((value, index) => ({
  id: `provider/quality-${index}`,
  name: `Quality ${index}`,
  release_date: "2026-08-26",
  modalities: { output: ["text"] },
  cost: { input: 1, output: 2 },
  limit: { context: 100_000, output: 10_000 },
  intelligence: { intelligence_index: value * 100, agentic_index: value * 100 },
  benchmarks: Object.fromEntries(
    selectedBenchmarkKeys
      .filter((key) => key !== "aa_intelligence_index")
      .map((key) => [key, value]),
  ),
}));
const qualitySelection = prepareModelSelection(qualityRows, STAGE_CONFIG.scoring, {
  baselineDate: "2026-08-27",
  observedDate: "2026-08-27",
});
assert.deepEqual(
  qualitySelection.candidates.map((model) => [
    model.component_scores?.intelligence_score,
    model.component_scores?.agentic_score,
  ]),
  [
    [0, 0],
    [100, 100],
  ],
  "quality must be computed with both reference models before per-model enrichment is chosen",
);
assert.deepEqual(
  selectOpenRouterModelRows(qualitySelection, STAGE_CONFIG.final, STAGE_CONFIG.scoring).map(
    (row) => row.id,
  ),
  ["provider/quality-1"],
  "complete benchmark evidence must not trigger OpenRouter fetching when computed quality is below ten",
);
const enrichedQualityModels = await buildFinalModels(
  qualitySelection,
  {
    modelRows: qualityRows,
    speedByModelId: new Map([["provider/quality-1", completeBasicSpecs.speed]]),
    pricingByModelId: new Map([["provider/quality-1", { weighted_input: 3, weighted_output: 6 }]]),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.deepEqual(
  enrichedQualityModels.map((model) => model.id),
  ["provider/quality-1"],
);
assert.deepEqual(
  enrichedQualityModels.map((model) => [
    model.scores.intelligence_score,
    model.scores.agentic_score,
  ]),
  [[100, 100]],
  "adding OpenRouter speed and pricing must preserve the previously computed quality scores",
);
assert.equal(enrichedQualityModels[0]!.speed.throughput_tokens_per_second_median, 50);
assert.equal(qualitySelection.candidates[1]!.speed.throughput_tokens_per_second_median, null);

const duplicateRouteModels = await buildTestModels(
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
  duplicateRouteModels.map((model) => [model.id, model.name, "preview" in model]),
  [[duplicateRouteId, "Existing Route Name", false]],
  "one public route must not appear twice under different names",
);

const knownPreviewId = "provider/known-preview";
const unknownPreviewId = "provider/unknown-preview";
const coveredRecentId = "provider/covered-recent";
const coveredOlderId = "provider/covered-older";
const expiredPreviewId = "provider/expired-preview";
// Keep index quality equally strong so these admission checks isolate age and evidence rather than the relevance floor.
const admissionRows = [
  {
    ...evidenceRow(knownPreviewId, "Known Preview", {
      intelligence_index: 75,
      agentic_index: 65,
    }),
    release_date: "2026-07-29",
    benchmarks: { critpt: 0.7, tau_banking: 0.7, vals_index: 70 },
  },
  evidenceRow(unknownPreviewId, "Unknown Preview"),
  {
    ...evidenceRow(coveredRecentId, "Covered Recent", {
      intelligence_index: 75,
      agentic_index: 70,
    }),
    release_date: "2026-08-27",
  },
  {
    ...evidenceRow(coveredOlderId, "Covered Older", {
      intelligence_index: 75,
      agentic_index: 70,
    }),
    release_date: "2026-07-28",
  },
  {
    ...evidenceRow(expiredPreviewId, "Expired Preview", {
      intelligence_index: 75,
      agentic_index: 65,
    }),
    release_date: "2026-07-28",
    benchmarks: { critpt: 0.7, tau_banking: 0.7, vals_index: 70 },
  },
];
const admissionSelection = prepareModelSelection(admissionRows, STAGE_CONFIG.scoring, {
  baselineDate: "2026-08-27",
  observedDate: "2026-08-27",
});
for (const id of [knownPreviewId, expiredPreviewId]) {
  assert.ok(
    hasRequiredPublicRelevance({
      scores: admissionSelection.candidates.find((model) => model.id === id)!.component_scores,
    }),
    "release-age fixtures must independently clear the quality floor",
  );
}
const qualifiedModels = await buildTestModels(
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
  selectOpenRouterModelRows(admissionSelection, STAGE_CONFIG.final, STAGE_CONFIG.scoring)
    .map((row) => row.id)
    .sort(),
  [coveredOlderId, coveredRecentId, knownPreviewId, expiredPreviewId, unknownPreviewId].sort(),
  "route fetching accepts represented coverage without requiring a current index or recent release",
);
assert.deepEqual(
  qualifiedModels.map((model) => [model.id, "preview" in model]).sort(),
  [
    [coveredOlderId, false],
    [coveredRecentId, false],
    [knownPreviewId, false],
    [expiredPreviewId, false],
    [unknownPreviewId, false],
  ].sort(),
  "represented coverage gives complete models ordinary ranks regardless of release age",
);
assert.deepEqual(
  qualifiedModels.find((model) => model.id === coveredRecentId)?.scores,
  qualifiedModels.find((model) => model.id === coveredOlderId)?.scores,
  "release age alone must not select a different scoring policy for adequately covered models",
);

const incompleteMetadataId = "provider/metadata-preview";
const completeMetadataRow = evidenceRow(incompleteMetadataId, "Metadata Preview", {
  intelligence_index: 75,
  agentic_index: 70,
});
const incompleteMetadataRow = {
  ...completeMetadataRow,
  release_date: null,
  cost: null,
  limit: null,
};
assert.deepEqual(
  selectOpenRouterModelRows(
    prepareModelSelection(
      [
        incompleteMetadataRow,
        {
          ...incompleteMetadataRow,
          id: "provider/benchmark-index",
          intelligence: { agentic_index: 70 },
          benchmarks: { ...incompleteMetadataRow.benchmarks, aa_intelligence_index: 75 },
        },
        { ...admissionRows[0]!, id: "provider/missing-context", limit: null },
        { ...incompleteMetadataRow, id: "provider/no-index", intelligence: null },
        { ...incompleteMetadataRow, id: "provider/non-text", modalities: { output: ["image"] } },
      ],
      STAGE_CONFIG.scoring,
      { baselineDate: "2026-08-27", observedDate: "2026-08-27" },
    ),
    STAGE_CONFIG.final,
    STAGE_CONFIG.scoring,
  ).map((row) => row.id),
  [
    incompleteMetadataId,
    "provider/benchmark-index",
    "provider/missing-context",
    "provider/no-index",
  ],
  "represented coverage supports incomplete metadata with or without AA",
);
const metadataModels = await buildTestModels(
  {
    modelRows: [
      ...admissionRows,
      incompleteMetadataRow,
      { ...incompleteMetadataRow, id: "provider/old-metadata-preview", release_date: "2025-01-01" },
      {
        ...incompleteMetadataRow,
        id: "provider/sparse-metadata",
        intelligence: null,
        benchmarks: { critpt: 0.7 },
      },
      { ...incompleteMetadataRow, id: "provider/no-index-metadata", intelligence: null },
      { ...incompleteMetadataRow, id: "provider/non-text", modalities: { output: ["image"] } },
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
  [
    coveredOlderId,
    coveredRecentId,
    knownPreviewId,
    expiredPreviewId,
    unknownPreviewId,
    incompleteMetadataId,
    "provider/old-metadata-preview",
    "provider/no-index-metadata",
  ].sort(),
  "incomplete metadata requires represented evidence, not index counts or release age",
);
assert.ok(metadataModels.every((model) => !("preview" in model)));
const incompleteMetadata = metadataModels.find((model) => model.id === incompleteMetadataId)!;
assert.equal(incompleteMetadata.release_date, null);
assert.equal(incompleteMetadata.cost, null);
assert.equal(incompleteMetadata.context_window, null);
assert.equal(incompleteMetadata.scores.speed_score, null);
assert.equal(incompleteMetadata.scores.value_score, null);
assert.ok(incompleteMetadata.scores.intelligence_score! >= 10);
assert.ok(incompleteMetadata.scores.agentic_score! >= 10);

const completedMetadataModels = await buildTestModels(
  {
    modelRows: [completeMetadataRow],
    speedByModelId: new Map([[incompleteMetadataId, completeBasicSpecs.speed]]),
    pricingByModelId: new Map([[incompleteMetadataId, { weighted_input: 1, weighted_output: 2 }]]),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.equal(completedMetadataModels.length, 1);
assert.notEqual(
  "preview" in completedMetadataModels[0]!,
  true,
  "metadata enrichment retains a single ranked model",
);

// A smallest known index qualifies at any age, with or without complete metadata.
const singleIndexRow = {
  ...completeMetadataRow,
  id: "provider/recent-single-index",
  intelligence: null,
  benchmarks: { cais_capabilities_index: 0.7 },
  release_date: "2026-07-29",
};
const singleIndexRows = [
  singleIndexRow,
  { ...singleIndexRow, id: "provider/expired-single-index", release_date: "2026-07-28" },
  { ...singleIndexRow, id: "provider/future-single-index", release_date: "2026-08-28" },
  { ...singleIndexRow, id: "provider/undated-single-index", release_date: null },
  { ...singleIndexRow, id: "provider/incomplete-single-index", cost: null },
  {
    ...singleIndexRow,
    id: "provider/aa-subindex-only",
    benchmarks: {},
    intelligence: { agentic_index: 80, coding_index: 80 },
  },
  {
    ...singleIndexRow,
    id: "provider/low-quality-single-index",
    benchmarks: { cais_capabilities_index: 0 },
  },
].map((row) => ({ ...row, name: row.id }));
const singleIndexModels = await buildTestModels(
  {
    modelRows: singleIndexRows,
    speedByModelId: new Map(singleIndexRows.map((row) => [row.id, completeBasicSpecs.speed])),
    pricingByModelId: new Map(),
    outputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
  },
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
  { baselineDate: "2026-08-27", observedDate: "2026-08-27" },
);
assert.deepEqual(
  singleIndexModels.map((model) => [model.id, "preview" in model]).sort(),
  [
    [singleIndexRow.id, false],
    ["provider/expired-single-index", false],
    ["provider/future-single-index", false],
    ["provider/undated-single-index", false],
    ["provider/incomplete-single-index", false],
  ].sort(),
  "one known index meets coverage; missing metadata does not create a separate admission path",
);

const fallbackRows = ["high", "max"].map((effort, index) => ({
  ...incompleteMetadataRow,
  reasoning_effort: effort,
  artificial_analysis_cost: { input: 10, output: 50 },
  median_output_tokens_per_second: 100 - index * 50,
  median_time_to_first_token_seconds: 2 + index * 10,
  median_end_to_end_response_time_seconds: 20 + index * 40,
}));
const fallbackModels = await buildTestModels(
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
      !("preview" in model) &&
      model.cost?.input === 10 &&
      model.cost?.output === 50 &&
      model.cost?.blended_price === 30,
  ),
);
assert.ok(
  fallbackModels.every(
    (model) => model.scores.speed_score == null && model.scores.value_score == null,
  ),
);
const primaryModels = await buildTestModels(
  {
    modelRows: [{ ...fallbackRows[0], cost: { input: 8, output: 40 } }],
    speedByModelId: new Map([
      [
        incompleteMetadataId,
        {
          throughput_tokens_per_second_median: 200,
          latency_seconds_median: null,
          e2e_latency_seconds_median: 7,
        },
      ],
    ]),
    pricingByModelId: new Map([
      [incompleteMetadataId, { weighted_input: 6, weighted_output: null }],
    ]),
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

function evidenceRow(
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
    benchmarks: {
      ...Object.fromEntries(
        selectedBenchmarkKeys
          .filter((key) => !indexBenchmarkKeys.has(key))
          .map((key) => [key, 0.7]),
      ),
      vals_index: 70,
    },
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

/** Exercise both selection phases while keeping the existing catalog fixtures and final-output expectations. */
function buildTestModels(
  openRouterData: OpenRouterModelData,
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
  versioning?: BenchmarkVersioningOptions,
) {
  const selection = prepareModelSelection(openRouterData.modelRows, scoringConfig, versioning);
  return buildFinalModels(selection, openRouterData, id, finalConfig, scoringConfig);
}
