/** Verifies dashboard model ranking, filtering, labels, and metric display. */

import assert from "node:assert/strict";

import {
  filterGraphPreviewsByIntelligenceFloor,
  graphModelLabel,
} from "../app/dashboard/graphs/model-series";
import {
  filterByIntelligenceRank,
  filterByModelControls,
  filterByModelQuery,
  filterByReleaseRecency,
  modelDisplayName,
  modelsForVariantDisplay,
  providerOptions,
  reasoningVariantGroups,
  toggleProviderFilter,
} from "../app/dashboard/shared/model-display";
import {
  benchmarkDisplayValue,
  benchmarkMeterValue,
  benchmarkMetricColumns,
  benchmarkMetricValue,
  dedupeDisplayModels,
  sortedRows,
  type SortState,
  taskMetricColumns,
} from "../app/dashboard/table/models";
import { canonicalReasoningEffort } from "../src/model-atlas/identity/normalization";
import { previewModelFromCandidate } from "../src/model-atlas/pipeline/selection/public-list";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const intelligenceRows = dedupeDisplayModels([
  rankedModel("provider/third", "Third", 30),
  rankedModel("provider/first", "First", 90),
  rankedModel("provider/second", "Second", 60),
]);

assert.deepEqual(
  intelligenceRows.map((row) => [row.model.id, row.intelligenceRank]),
  [
    ["provider/third", 3],
    ["provider/first", 1],
    ["provider/second", 2],
  ],
  "row ranks should be tied to intelligence score, not source/display order",
);

const tiedIntelligenceRows = dedupeDisplayModels([
  rankedModel("provider/first", "First", 100),
  rankedModel("provider/second-a", "Second A", 90),
  rankedModel("provider/second-b", "Second B", 90),
  rankedModel("provider/fourth", "Fourth", 80),
]);
assert.deepEqual(
  tiedIntelligenceRows.map((row) => [row.model.id, row.intelligenceRank]),
  [
    ["provider/first", 1],
    ["provider/second-a", 2],
    ["provider/second-b", 2],
    ["provider/fourth", 4],
  ],
  "equal intelligence scores should share competition ranks",
);

const previewRankingRows = dedupeDisplayModels([
  rankedModel("provider/official-first", "Official First", 90),
  previewModelFromCandidate({
    ...rankedModel("provider/preview", "Preview", 85),
    component_scores: {
      intelligence_score: 85,
      agentic_score: 80,
      speed_score: null,
    },
  }),
  rankedModel("provider/official-second", "Official Second", 80),
]);
assert.deepEqual(
  previewRankingRows.map((row) => [row.model.id, row.intelligenceRank]),
  [
    ["provider/official-first", 1],
    ["provider/preview", "preview"],
    ["provider/official-second", 2],
  ],
  "preview rows should use the preview rank marker without shifting official competition ranks",
);
assert.deepEqual(
  sortedRows(previewRankingRows, "", sortState("intelligence", "descending")).map(
    (row) => row.model.id,
  ),
  ["provider/official-first", "provider/preview", "provider/official-second"],
  "preview rows with evidence should still sit in provisional score order",
);
assert.deepEqual(
  sortedRows(previewRankingRows, "", sortState("rank", "ascending")).map((row) => row.model.id),
  ["provider/official-first", "provider/preview", "provider/official-second"],
  "rank sorting should place a preview at its Intelligence-relative position",
);
assert.equal(
  graphModelLabel(previewRankingRows[1]!.model),
  "* Preview",
  "preview graph labels should carry the marker explained by the legend",
);
const lowPreview = previewModelFromCandidate({
  ...rankedModel("provider/low-preview", "Low Preview", 70),
  component_scores: {
    intelligence_score: 70,
    agentic_score: 70,
    speed_score: null,
  },
});
assert.deepEqual(
  filterGraphPreviewsByIntelligenceFloor(
    [...previewRankingRows.map((row) => row.model), lowPreview],
    (model) => model,
  ).map((model) => model.id),
  ["provider/official-first", "provider/preview", "provider/official-second"],
  "graphs should omit previews below the displayed official Intelligence floor",
);

const aleBenchColumn = benchmarkMetricColumns.find((column) => column.key === "aleBench");
assert.ok(aleBenchColumn, "ALE-B should remain a dashboard benchmark column");
const aleBenchRows = dedupeDisplayModels([
  benchmarkModel("provider/low", "Low", 1_000),
  benchmarkModel("provider/mid", "Mid", 1_500),
  benchmarkModel("provider/high", "High", 2_000),
]);
assert.deepEqual(
  aleBenchRows.map((row) => benchmarkDisplayValue(row, aleBenchColumn)),
  [0, 50, 100],
  "ALE-B should display its min-max normalized score",
);
assert.deepEqual(
  aleBenchRows.map((row) => benchmarkMetricValue(row.model, aleBenchColumn)),
  [1_000, 1_500, 2_000],
  "ALE-B display normalization should preserve raw benchmark values",
);

const agentArenaColumn = benchmarkMetricColumns.find((column) => column.key === "agentArena");
assert.ok(agentArenaColumn, "Arena should remain a dashboard benchmark column");
const agentArenaRows = dedupeDisplayModels([
  agentArenaModel("provider/low", "Low", -0.1),
  agentArenaModel("provider/mid", "Mid", 0),
  agentArenaModel("provider/high", "High", 0.1),
]);
assert.deepEqual(
  agentArenaRows.map((row) => benchmarkDisplayValue(row, agentArenaColumn)),
  [0, 50, 100],
  "Arena should display its min-max normalized score",
);
assert.deepEqual(
  agentArenaRows.map((row) => benchmarkMetricValue(row.model, agentArenaColumn)),
  [-0.1, 0, 0.1],
  "Arena display normalization should preserve raw reward values",
);

const aaColumn = benchmarkMetricColumns.find((column) => column.key === "aaIntelligenceIndex");
const eciColumn = benchmarkMetricColumns.find((column) => column.key === "epochCapabilitiesIndex");
assert.ok(aaColumn, "AA should remain a dashboard benchmark column");
assert.ok(eciColumn, "ECI should remain a dashboard benchmark column");
const indexRows = dedupeDisplayModels([
  indexBenchmarkModel("provider/low", "Low", 45, 150),
  indexBenchmarkModel("provider/mid", "Mid", 50, 155),
  indexBenchmarkModel("provider/high", "High", 55, 160),
]);
assert.deepEqual(
  indexRows.map((row) => [benchmarkMeterValue(row, aaColumn), benchmarkMeterValue(row, eciColumn)]),
  [
    [0, 0],
    [50, 50],
    [100, 100],
  ],
  "number benchmarks should scale meter positions to their observed min and max",
);
assert.deepEqual(
  indexRows.map((row) => [
    benchmarkDisplayValue(row, aaColumn),
    benchmarkDisplayValue(row, eciColumn),
  ]),
  [
    [45, 150],
    [50, 155],
    [55, 160],
  ],
  "number benchmark meters should preserve their raw display values",
);

const frontierCodeColumn = benchmarkMetricColumns.find((column) => column.key === "frontierCode");
assert.equal(
  frontierCodeColumn?.format,
  "percent",
  "FrontierCode should display its normalized source score as a percentage",
);
assert.deepEqual(
  taskMetricColumns
    .filter((column) => column.source === "frontier_code")
    .map((column) => column.key),
  ["frontierCodeCost", "frontierCodeTokens"],
  "FrontierCode should expose source cost and token columns",
);

assert.deepEqual(
  sortedRows(intelligenceRows, "", sortState("model", "ascending")).map((row) => [
    row.model.id,
    row.intelligenceRank,
  ]),
  [
    ["provider/first", 1],
    ["provider/second", 2],
    ["provider/third", 3],
  ],
  "model sort should not renumber intelligence ranks",
);

assert.deepEqual(
  sortedRows(intelligenceRows, "", sortState("rank", "ascending")).map((row) => row.model.id),
  ["provider/first", "provider/second", "provider/third"],
  "rank sort should follow intelligence rank",
);

const rankedPopulation = [
  rankedModel("provider/high", "High", 90),
  rankedModel("provider/mid", "Mid", 60),
  ...Array.from({ length: 29 }, (_, index) =>
    rankedModel(`provider/low-${index}`, `Low ${index}`, 30 - index),
  ),
];
assert.deepEqual(
  filterByIntelligenceRank(rankedPopulation, (model) => model, 30, rankedPopulation)
    .slice(0, 2)
    .map((model) => model.id),
  ["provider/high", "provider/mid"],
  "rank filtering should retain models through the requested global Intelligence rank",
);

const variantPopulation = [
  { ...rankedModel("provider/a", "A", 90), reasoning_effort: "max" },
  { ...rankedModel("provider/a", "A", 80), reasoning_effort: "high" },
  ...Array.from({ length: 29 }, (_, index) =>
    rankedModel(`provider/included-${index}`, `Included ${index}`, 70 - index),
  ),
  rankedModel("provider/excluded", "Excluded", 1),
];
const rankFilteredVariants = filterByIntelligenceRank(
  variantPopulation,
  (model) => model,
  30,
  variantPopulation,
);
assert.equal(
  rankFilteredVariants.length,
  31,
  "rank filters should select model families before expanding their variants",
);
assert.deepEqual(
  rankFilteredVariants.slice(0, 2).map((model) => modelDisplayName(model)),
  ["A (max)", "A (high)"],
);
assert.equal(
  rankFilteredVariants.some((model) => model.id === "provider/excluded"),
  false,
);

const filteredRankedPopulation = filterByIntelligenceRank(
  rankedPopulation.slice(1),
  (model) => model,
  30,
  rankedPopulation,
);
assert.equal(
  filteredRankedPopulation.some((model) => model.id === "provider/low-28"),
  false,
  "other filters should not backfill a model whose global Intelligence rank is below the threshold",
);
const previewModel = previewRankingRows.find((row) => row.intelligenceRank === "preview")?.model;
assert.ok(previewModel);
const previewRankPopulation = [...rankedPopulation, previewModel];
const previewRankFiltered = filterByIntelligenceRank(
  previewRankPopulation,
  (model) => model,
  30,
  previewRankPopulation,
);
assert.equal(
  previewRankFiltered.includes(previewModel),
  true,
  "unranked previews should remain visible without consuming ranked slots",
);
assert.equal(previewRankFiltered.length, 31);

const recencyReference = Date.parse("2026-08-31T00:00:00Z") / 1_000;
const recentModels = filterByReleaseRecency(
  [
    { ...rankedModel("provider/recent", "Recent", 70), release_date: "2026-06-03" },
    { ...rankedModel("provider/recent", "Recent", 60), release_date: "2026-01-01" },
    { ...rankedModel("provider/boundary", "Boundary", 90), release_date: "2026-06-02" },
    { ...rankedModel("provider/future", "Future", 100), release_date: "2026-09-01" },
    rankedModel("provider/unknown", "Unknown", 80),
  ],
  (model) => model,
  90,
  recencyReference,
);
assert.deepEqual(
  recentModels.map((model) => model.id),
  ["provider/recent", "provider/recent"],
  "recency filters should retain every variant of model families released in the selected window",
);

const connectedMixedVariants = reasoningVariantGroups(
  [
    { ...rankedModel("provider/mixed", "Mixed", 80), reasoning_effort: null },
    { ...rankedModel("provider/mixed", "Mixed", 70), reasoning_effort: "medium" },
    rankedModel("provider/unrelated", "Unrelated", 60),
  ],
  (model) => model,
);
assert.deepEqual(
  connectedMixedVariants.map((group) => group.variants.map((model) => model.reasoning_effort)),
  [["medium", null]],
  "variant connectors should include an unlabeled sibling when the same model also has an effort-labelled variant",
);

const providerModelOptions = providerOptions([
  {
    ...rankedModel("openai/reasoner", "Reasoner", 100),
    provider: "OpenAI",
    reasoning_effort: "max",
  },
  {
    ...rankedModel("openai/reasoner", "Reasoner", 95),
    provider: "OpenAI",
    reasoning_effort: "high",
  },
  {
    ...rankedModel("openai/utility", "Utility", 0),
    provider: "OpenAI",
  },
  { ...rankedModel("anthropic/first", "First", 60), provider: "Anthropic" },
  { ...rankedModel("anthropic/second", "Second", 55), provider: "Anthropic" },
]);
assert.equal(
  providerModelOptions.find((option) => option.slug === "openai")?.count,
  2,
  "provider counts should count models instead of variants",
);

const providerAliasOptions = providerOptions([
  { ...rankedModel("meta/llama-alpha", "Llama Alpha", 80), provider: "Meta" },
  {
    ...rankedModel("meta-llama/llama-beta", "Llama Beta", 70),
    provider: "Meta-Llama",
  },
  {
    ...rankedModel("mistral/large", "Mistral Large", 75),
    provider: "Mistral",
  },
  {
    ...rankedModel("mistralai/small", "Mistral Small", 65),
    provider: "MistralAI",
  },
]);
assert.deepEqual(
  providerAliasOptions
    .filter((option) => option.slug === "meta" || option.slug === "mistral")
    .map(({ slug, label, count }) => ({ slug, label, count }))
    .sort((left, right) => left.slug.localeCompare(right.slug)),
  [
    { slug: "meta", label: "Meta", count: 2 },
    { slug: "mistral", label: "Mistral", count: 2 },
  ],
  "provider aliases should share one filter option and canonical label",
);
assert.equal(
  providerModelOptions[0]?.slug,
  "anthropic",
  "provider ordering should score each model once instead of overweighting variants",
);

assert.deepEqual(toggleProviderFilter([], "openai"), ["openai"]);
assert.deepEqual(toggleProviderFilter(["openai"], "anthropic"), ["openai", "anthropic"]);
assert.deepEqual(toggleProviderFilter(["openai", "anthropic"], "openai"), ["anthropic"]);
assert.deepEqual(
  filterByModelControls(
    [
      { ...rankedModel("openai/first", "First", 90), provider: "OpenAI" },
      {
        ...rankedModel("anthropic/second", "Second", 80),
        provider: "Anthropic",
      },
      { ...rankedModel("google/third", "Third", 70), provider: "Google" },
    ],
    (model) => model,
    { providers: ["openai", "anthropic"], maxCost: "all" },
  ).map((model) => model.id),
  ["openai/first", "anthropic/second"],
  "provider filtering should include the union of every selected provider",
);

const modalityRows = dedupeDisplayModels([
  modalityModel("provider/text", "Text", ["text"]),
  modalityModel("provider/vision", "Vision", ["text", "image"]),
  modalityModel("provider/all", "All", ["text", "image", "audio", "video"]),
]);

assert.deepEqual(
  sortedRows(modalityRows, "", sortState("modalities", "descending")).map((row) => row.model.id),
  ["provider/all", "provider/vision", "provider/text"],
  "input modality sort should order by capability coverage, not icon label text",
);

assert.deepEqual(
  dedupeDisplayModels([
    rankedModel("mistral/mistral-medium-3.5", "Mistral Medium Latest", 90),
    rankedModel("mistralai/mistral-medium-3.5", "Mistral Medium 3.5", 60),
  ]).map((row) => row.model.id),
  ["mistral/mistral-medium-3.5"],
  "display dedupe should collapse provider ids that only differ by a trailing ai suffix when the slug family matches",
);

const effortVariants = [
  {
    ...rankedModel("provider/reasoner", "Reasoner", 80),
    reasoning_effort: "high",
    benchmarks: { arc_agi_3: 0.3016 },
    benchmark_dates: { arc_agi_3: "2026-07-24" },
    task_metrics: { arc_agi_3: { cost: 20_657.37 } },
  },
  {
    ...rankedModel("provider/reasoner", "Reasoner", 90),
    reasoning_effort: "max",
    benchmarks: { arc_agi_2: 0.904 },
  },
];
assert.equal(canonicalReasoningEffort("null"), null);
assert.equal(canonicalReasoningEffort(null), null);
assert.equal(canonicalReasoningEffort("non-reasoning"), "none");
assert.equal(
  modelDisplayName({
    ...rankedModel("provider/reasoner", "Reasoner", 80),
    reasoning_effort: "none",
  }),
  "Reasoner (none)",
  "none should remain the canonical display label",
);
const compactEffortModels = modelsForVariantDisplay(effortVariants, false);
const expandedEffortModels = modelsForVariantDisplay(effortVariants, true);
assert.deepEqual(
  compactEffortModels.map((model) => [modelDisplayName(model), model.scores.intelligence_score]),
  [["Reasoner", 90]],
  "collapsed mode should keep the strongest variant and omit its effort label",
);
assert.deepEqual(compactEffortModels[0]?.benchmarks, {
  arc_agi_2: 0.904,
  arc_agi_3: 0.3016,
});
assert.deepEqual(compactEffortModels[0]?.task_metrics?.arc_agi_3, {
  cost: 20_657.37,
});
assert.equal(
  expandedEffortModels[1]?.benchmarks?.arc_agi_3,
  undefined,
  "expanded variants should retain exact-effort missingness",
);
const sourceOnlyVariants = [
  {
    ...rankedModel("provider/source-only", "Source Only", 90),
    reasoning_effort: "max",
    benchmarks: { arc_agi_2: 0.8 },
  },
];
const sourceOnlyBenchmarkObservations = {
  arc_agi_3: [
    {
      model_id: "provider/source-only",
      model: "Source Only",
      base_model: "Source Only",
      canonical_value: 0.0152,
      reasoning_effort: "high",
      cost: 10_000,
      observed_at: "2026-08-07",
    },
  ],
};
const sourceOnlyCompactModels = modelsForVariantDisplay(
  sourceOnlyVariants,
  false,
  sourceOnlyBenchmarkObservations,
);
assert.equal(sourceOnlyCompactModels[0]?.benchmarks?.arc_agi_3, 0.0152);
assert.deepEqual(sourceOnlyCompactModels[0]?.task_metrics?.arc_agi_3, {
  cost: 10_000,
  observed_cost: 10_000,
  cost_price_ratio: 1,
  observed_at: "2026-08-07",
});
const multiEffortSourceObservations = {
  arc_agi_2: [
    {
      model_id: "provider/source-only",
      model: "Source Only (High)",
      base_model: "Source Only",
      canonical_value: 0.8833,
      reasoning_effort: "high",
      cost: 1.5,
      observed_at: "2026-08-07",
    },
    {
      model_id: "provider/source-only",
      model: "Source Only (Max)",
      base_model: "Source Only",
      canonical_value: 0.9042,
      reasoning_effort: "max",
      cost: 2.1,
      observed_at: "2026-08-07",
    },
  ],
};
const multiEffortCompactModels = modelsForVariantDisplay(
  sourceOnlyVariants,
  false,
  multiEffortSourceObservations,
);
assert.equal(
  multiEffortCompactModels[0]?.benchmarks?.arc_agi_2,
  0.8,
  "a representative's direct benchmark value should remain unchanged",
);
const multiEffortMissingRepresentative = [
  {
    ...rankedModel("provider/source-only", "Source Only", 90),
    reasoning_effort: "xhigh",
  },
];
const projectedMultiEffortModels = modelsForVariantDisplay(
  multiEffortMissingRepresentative,
  false,
  multiEffortSourceObservations,
);
assert.equal(
  projectedMultiEffortModels[0]?.benchmarks?.arc_agi_2,
  0.9042,
  "compact rows should project the highest available observed effort",
);
assert.equal(projectedMultiEffortModels[0]?.task_metrics?.arc_agi_2?.cost, 2.1);
assert.equal(
  modelsForVariantDisplay(sourceOnlyVariants, true)[0]?.benchmarks?.arc_agi_3,
  undefined,
  "expanded mode should not relabel a source-only effort as the retained variant",
);
const searchableVariant = {
  ...rankedModel("provider/reasoner", "Reasoner", 90),
  provider: "Example Provider",
  reasoning_effort: "max",
  open_weights: true,
  modalities: { input: ["text", "image"], output: ["text"] },
};
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "reasoner max").length,
  1,
  "model search should include the visible reasoning variant label",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "reason* *max").length,
  1,
  "model search should treat '*' as a case-insensitive glob wildcard",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "reason.*").length,
  0,
  "model search should keep regular-expression punctuation literal except for '*'",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "unrelated").length,
  0,
  "model search should reject unrelated identity text",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "open weights").length,
  1,
  "model search should include explicit contextual metadata",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "image input").length,
  1,
  "model search should include modality context",
);
assert.equal(
  filterByModelQuery([searchableVariant], (model) => model, "reasoner thematic mismatch").length,
  0,
  "model search should reject candidates below the query-term coverage threshold",
);
assert.deepEqual(
  dedupeDisplayModels(modelsForVariantDisplay(effortVariants, true)).map((row) =>
    modelDisplayName(row.model),
  ),
  ["Reasoner (high)", "Reasoner (max)"],
  "expanded mode should preserve and label each reasoning effort as a model variant",
);
assert.deepEqual(
  modelsForVariantDisplay(
    [
      rankedModel("alibaba/qwen3.6-plus", "Qwen 3.6 Plus", 40),
      rankedModel("qwen/qwen3.6-plus", "Qwen 3.6 Plus", 50),
    ],
    true,
  ).map((model) => model.id),
  ["qwen/qwen3.6-plus"],
  "expanded mode should not present provider aliases as model variants",
);

function rankedModel(id: string, name: string, intelligenceScore: number): ModelAtlasModel {
  const model = minimalModelAtlasModel({ id, name });
  return {
    ...model,
    scores: {
      ...model.scores,
      intelligence_score: intelligenceScore,
    },
  };
}

function modalityModel(id: string, name: string, input: string[]): ModelAtlasModel {
  return {
    ...minimalModelAtlasModel({ id, name }),
    modalities: {
      input,
    },
  };
}

function benchmarkModel(id: string, name: string, aleBenchScore: number): ModelAtlasModel {
  return {
    ...minimalModelAtlasModel({ id, name }),
    benchmarks: { ale_bench: aleBenchScore },
  };
}

function agentArenaModel(id: string, name: string, agentArenaReward: number): ModelAtlasModel {
  return {
    ...minimalModelAtlasModel({ id, name }),
    benchmarks: { agent_arena: agentArenaReward },
  };
}

function indexBenchmarkModel(
  id: string,
  name: string,
  aaIntelligenceIndex: number,
  epochCapabilitiesIndex: number,
): ModelAtlasModel {
  return {
    ...minimalModelAtlasModel({ id, name }),
    benchmarks: {
      aa_intelligence_index: aaIntelligenceIndex,
      epoch_capabilities_index: epochCapabilitiesIndex,
    },
  };
}

function sortState(key: SortState["key"], direction: SortState["direction"]) {
  return { key, direction };
}
