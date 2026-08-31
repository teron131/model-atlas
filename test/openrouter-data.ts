/** Verifies OpenRouter alias collapse, variant selection, and route telemetry lookup. */

import { STAGE_CONFIG } from "../src/model-atlas/config";
import {
  isSameOpenRouterModelRoute,
  publicOpenRouterModelId,
  publicOpenRouterModelName,
} from "../src/model-atlas/identity/openrouter";
import {
  buildModelVariants,
  collapseModelVariants,
} from "../src/model-atlas/pipeline/model-catalog";
import { prepareOpenRouterModelData } from "../src/model-atlas/pipeline/openrouter-data";

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

const openRouterData = await prepareOpenRouterModelData(
  collapseModelVariants([
    {
      id: "anthropic/claude-opus-4.8-fast",
      openrouter_id: "anthropic/claude-opus-4.8-fast",
      provider_id: "openrouter",
      artificial_analysis_id: "aa/claude-opus-4.8",
      intelligence: {
        intelligence_index: 90,
      },
    },
    {
      id: "anthropic/claude-opus-4.8",
      openrouter_id: "anthropic/claude-opus-4.8",
      provider_id: "openrouter",
      intelligence: {
        intelligence_index: 90,
      },
    },
  ]),
  STAGE_CONFIG.openrouter,
  STAGE_CONFIG.scoring,
  null,
);

assertEqual(openRouterData.modelRows.length, 1);
assertEqual(openRouterData.modelRows[0]?.id, "anthropic/claude-opus-4.8");
assertEqual(openRouterData.modelRows[0]?.openrouter_id, "anthropic/claude-opus-4.8");

const effortObservations = [
  {
    id: "openai/gpt-5.6-sol",
    provider_id: "openai",
    artificial_analysis_id: "openai/gpt-5-6-sol",
    artificial_analysis_slug: "gpt-5-6-sol",
    reasoning_effort: "max",
    benchmarks: { scicode: 0.56, terminal_bench_3: 0.88 },
    intelligence: { coding_index: 77, intelligence_index: 59 },
    intelligence_index_cost: { total_cost: 12 },
  },
  {
    id: "openai/gpt-5.6-sol",
    provider_id: "openai",
    artificial_analysis_id: "openai/gpt-5-6-sol-xhigh",
    artificial_analysis_slug: "gpt-5-6-sol-xhigh",
    reasoning_effort: "xhigh",
    benchmarks: { scicode: 0.55, terminal_bench_3: 0.9 },
    intelligence: { coding_index: 78, intelligence_index: 58 },
    intelligence_index_cost: { total_cost: 10 },
  },
] as const;
const preservedEffortObservations = JSON.stringify(effortObservations);
const collapsedVariantRows = collapseModelVariants([...effortObservations]);
const expandedVariantRows = buildModelVariants([...effortObservations]);
assertEqual(expandedVariantRows.length, 2);
assertEqual(expandedVariantRows[0]?.reasoning_effort, "max");
assertEqual(expandedVariantRows[1]?.reasoning_effort, "xhigh");
const explicitEffortWithCatalogAliasRows = buildModelVariants([
  effortObservations[1],
  {
    id: "openai/gpt-5.6-sol",
    provider_id: "openai",
    artificial_analysis_id: null,
    reasoning_effort: null,
  },
]);
const [explicitEffortWithCatalogAlias] = explicitEffortWithCatalogAliasRows;
assertEqual(explicitEffortWithCatalogAlias?.reasoning_effort, "xhigh");
assertEqual(explicitEffortWithCatalogAliasRows.length, 1);
const museSourceRows = [
  {
    id: "meta/muse-spark-1.1",
    provider_id: "meta",
    artificial_analysis_id: "meta/muse-spark-1-1",
    artificial_analysis_slug: "muse-spark-1-1",
    reasoning_effort: "xhigh",
    benchmarks: { hle: 0.5 },
  },
  {
    id: "meta/muse-spark-1.1",
    provider_id: "meta",
    artificial_analysis_id: "meta/muse-spark",
    artificial_analysis_slug: "muse-spark",
    reasoning_effort: null,
    benchmarks: { hle: 0.4 },
  },
] as const;
const versionAlignedSourceDefaultRows = buildModelVariants([...museSourceRows]);
const [versionAlignedSourceDefault] = versionAlignedSourceDefaultRows;
assertEqual(versionAlignedSourceDefault?.reasoning_effort, "xhigh");
assertEqual(versionAlignedSourceDefaultRows.length, 1);
assertEqual(
  (versionAlignedSourceDefault?.benchmarks as Record<string, unknown> | undefined)?.hle,
  0.5,
);
const [o3MiniHigh] = buildModelVariants([
  {
    id: "openai/o3-mini",
    provider_id: "openai",
    artificial_analysis_id: "openai/o3-mini",
    artificial_analysis_slug: "o3-mini",
    reasoning_effort: null,
    benchmarks: { gpqa: 0.74, hle: 0.08, scicode: 0.39 },
  },
  {
    id: "openai/o3-mini",
    provider_id: "openai",
    artificial_analysis_id: "openai/o3-mini-high",
    artificial_analysis_slug: "o3-mini-high",
    reasoning_effort: "high",
    benchmarks: {
      critpt: 0.003,
      gdpval_normalized: 0,
      gpqa: 0.77,
      hle: 0.12,
      scicode: 0.4,
      tau_banking: 0.05,
    },
  },
]);
const o3MiniHighBenchmarks = o3MiniHigh?.benchmarks as Record<string, unknown>;
assertEqual(o3MiniHigh?.reasoning_effort, "high");
assertEqual(o3MiniHighBenchmarks.critpt, 0.003);
assertEqual(o3MiniHighBenchmarks.gdpval_normalized, 0);
assertEqual(o3MiniHighBenchmarks.gpqa, 0.77);
assertEqual(o3MiniHighBenchmarks.tau_banking, 0.05);
const [canonicalNoneVariant] = buildModelVariants([
  {
    id: "openai/gpt-5.6-sol",
    provider_id: "openai",
    artificial_analysis_id: "openai/gpt-5-6-sol-non-reasoning",
    artificial_analysis_slug: "gpt-5-6-sol-non-reasoning",
    reasoning_effort: "non-reasoning",
    benchmarks: { scicode: 0.4 },
  },
]);
assertEqual(canonicalNoneVariant?.reasoning_effort, "none");
const genericReasoningRows = buildModelVariants([
  {
    id: "anthropic/claude-haiku-4.5",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-4-5-haiku-reasoning",
    artificial_analysis_slug: "claude-4-5-haiku-reasoning",
    reasoning_effort: null,
    benchmarks: { hle: 0.4 },
  },
  {
    id: "anthropic/claude-haiku-4.5",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-4-5-haiku",
    artificial_analysis_slug: "claude-4-5-haiku",
    reasoning_effort: "none",
    benchmarks: { hle: 0.2 },
  },
]);
const genericReasoningRow = genericReasoningRows.find((row) => row.reasoning_effort == null);
const nonReasoningRow = genericReasoningRows.find((row) => row.reasoning_effort === "none");
assertEqual(genericReasoningRows.length, 2);
assertEqual((genericReasoningRow?.benchmarks as Record<string, unknown> | undefined)?.hle, 0.4);
assertEqual((nonReasoningRow?.benchmarks as Record<string, unknown> | undefined)?.hle, 0.2);
const collapsedVariantRow = collapsedVariantRows[0] as Record<string, unknown>;
const collapsedVariantBenchmarks = collapsedVariantRow.benchmarks as Record<string, unknown>;
const collapsedVariantIntelligence = collapsedVariantRow.intelligence as Record<string, unknown>;
const collapsedVariantIntelligenceCost = collapsedVariantRow.intelligence_index_cost as Record<
  string,
  unknown
>;
assertEqual(collapsedVariantRows.length, 1);
assertEqual(collapsedVariantRow.artificial_analysis_id, "openai/gpt-5-6-sol");
assertEqual(collapsedVariantRow.reasoning_effort, undefined);
assertEqual(collapsedVariantBenchmarks.scicode, 0.56);
assertEqual(collapsedVariantBenchmarks.terminal_bench_3, 0.88);
assertEqual(collapsedVariantIntelligence.coding_index, 77);
assertEqual(collapsedVariantIntelligence.intelligence_index, 59);
assertEqual(collapsedVariantIntelligenceCost.total_cost, 12);
assertEqual(JSON.stringify(effortObservations), preservedEffortObservations);

const versionedReplacementRows = buildModelVariants([
  {
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash",
    provider_id: "deepseek",
    artificial_analysis_id: "deepseek/deepseek-v4-flash",
    artificial_analysis_slug: "deepseek-v4-flash-0731",
    reasoning_effort: null,
    benchmarks: { hle: 0.3 },
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731",
    provider_id: "deepseek",
    artificial_analysis_id: "deepseek/deepseek-v4-flash",
    artificial_analysis_slug: "deepseek-v4-flash-0731",
    reasoning_effort: "max",
    benchmarks: { hle: 0.36 },
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731",
    openrouter_id: "deepseek/deepseek-v4-flash-0731",
    provider_id: "openrouter",
  },
]);
assertEqual(versionedReplacementRows.length, 1);
assertEqual(versionedReplacementRows[0]?.name, "DeepSeek V4 Flash");
assertEqual(versionedReplacementRows[0]?.reasoning_effort, "max");

const separatelyNamedMaxRow = collapseModelVariants([
  {
    id: "anthropic/claude-opus-4.6",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-opus-4-6",
    artificial_analysis_slug: "claude-opus-4-6",
    reasoning_effort: "high",
    intelligence: { intelligence_index: 38 },
  },
  {
    id: "anthropic/claude-opus-4.6",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-opus-4-6-adaptive",
    artificial_analysis_slug: "claude-opus-4-6-adaptive",
    reasoning_effort: "max",
    intelligence: { intelligence_index: 44 },
  },
])[0] as Record<string, unknown>;
assertEqual(separatelyNamedMaxRow.artificial_analysis_id, "anthropic/claude-opus-4-6-adaptive");
assertEqual((separatelyNamedMaxRow.intelligence as Record<string, unknown>).intelligence_index, 44);

const unlabeledEffortObservations = [
  {
    id: "anthropic/claude-sonnet-4.5",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-4-5-sonnet",
    artificial_analysis_slug: "claude-4-5-sonnet",
    reasoning_effort: null,
    intelligence: { intelligence_index: 29 },
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    provider_id: "anthropic",
    artificial_analysis_id: "anthropic/claude-4-5-sonnet-thinking",
    artificial_analysis_slug: "claude-4-5-sonnet-thinking",
    reasoning_effort: null,
    intelligence: { intelligence_index: 36 },
  },
] as const;
const originalUnlabeledEffortJson = JSON.stringify(unlabeledEffortObservations);
const collapsedUnlabeledRows = collapseModelVariants([...unlabeledEffortObservations]);
assertEqual(collapsedUnlabeledRows.length, 1);
const collapsedUnlabeledRow = collapsedUnlabeledRows[0] as Record<string, unknown>;
assertEqual(collapsedUnlabeledRow.artificial_analysis_id, "anthropic/claude-4-5-sonnet");
assertEqual((collapsedUnlabeledRow.intelligence as Record<string, unknown>).intelligence_index, 29);
assertEqual(collapsedUnlabeledRow.reasoning_effort, undefined);
assertEqual(JSON.stringify(unlabeledEffortObservations), originalUnlabeledEffortJson);

assertEqual(publicOpenRouterModelId("anthropic/claude-opus-4.8-fast"), "anthropic/claude-opus-4.8");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-ultra"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-max"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("qwen/qwen3.8-max"), "qwen/qwen3.8-max");
assertEqual(publicOpenRouterModelId("qwen/qwen3.8-reasoning-max"), "qwen/qwen3.8");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-adaptive"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-xhigh"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-non-reasoning"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("openai/gpt-5.6-sol-pro"), "openai/gpt-5.6-sol-pro");
assertEqual(publicOpenRouterModelId("openai/gpt-5.6-terra-pro"), "openai/gpt-5.6-terra-pro");
assertEqual(publicOpenRouterModelId("openai/gpt-5.6-luna-pro"), "openai/gpt-5.6-luna-pro");
assertEqual(publicOpenRouterModelId("openai/gpt-5.6-sol"), "openai/gpt-5.6-sol");
assertEqual(publicOpenRouterModelId("google/gemini-2.5-pro"), "google/gemini-2.5-pro");
assertEqual(publicOpenRouterModelId("provider/model-pro-preview-06-2026"), "provider/model-pro");
assertEqual(
  publicOpenRouterModelId("google/gemini-2.5-flash-preview-09-2025"),
  "google/gemini-2.5-flash",
);
assertEqual(publicOpenRouterModelId("provider/model-family-3-5"), "provider/model-family-3.5");
assertEqual(publicOpenRouterModelId("provider/model-family-12-05"), "provider/model-family-12-05");
assertEqual(
  publicOpenRouterModelName("Mistral Medium Latest", "mistralai/mistral-medium-3.5"),
  "Mistral Medium 3.5",
);
assertEqual(
  publicOpenRouterModelName("DeepSeek V4 Flash 0731", "deepseek/deepseek-v4-flash-0731"),
  "DeepSeek V4 Flash",
);
assertEqual(
  isSameOpenRouterModelRoute("anthropic/claude-opus-4.6", "anthropic/claude-4.6-opus-20260205"),
  true,
);
assertEqual(
  isSameOpenRouterModelRoute("anthropic/claude-opus-4.6", "anthropic/claude-4.6-opus-thinking"),
  false,
);

const qwenRouteData = await prepareOpenRouterModelData(
  [
    {
      id: "qwen/qwen3.7-max",
      openrouter_id: "qwen/qwen3.7-max",
      provider_id: "qwen",
      intelligence: {
        intelligence_index: 90,
      },
    },
  ],
  STAGE_CONFIG.openrouter,
  STAGE_CONFIG.scoring,
  {
    fetched_at_epoch_seconds: 123,
    directory: [],
    models: [
      {
        id: "qwen/qwen3.7-max",
        selected_permaslug: "qwen/qwen3.7-max-20260520",
        candidate_permaslugs: ["qwen/qwen3.7-max-20260520"],
        performance: {
          throughput: { data: [{ x: "2026-08-09", y: { route: 47 } }] },
          series_token_weights: { route: 1 },
        },
        pricing: null,
      },
    ],
  },
);
assertEqual(
  qwenRouteData.speedByModelId.get("qwen/qwen3.7-max")?.throughput_tokens_per_second_median,
  47,
);

const aliasOnlyData = await prepareOpenRouterModelData(
  collapseModelVariants([
    {
      id: "openai/gpt-5.5-xhigh",
      openrouter_id: "openai/gpt-5.5-xhigh",
      provider_id: "openrouter",
      intelligence: {
        intelligence_index: 90,
      },
    },
  ]),
  STAGE_CONFIG.openrouter,
  STAGE_CONFIG.scoring,
  null,
);

assertEqual(aliasOnlyData.modelRows.length, 1);
assertEqual(aliasOnlyData.modelRows[0]?.id, "openai/gpt-5.5");
assertEqual(aliasOnlyData.modelRows[0]?.openrouter_id, "openai/gpt-5.5");

const qualifiedFallbackRows = collapseModelVariants([
  {
    id: "openai/gpt-test",
    openrouter_id: "gpt-test",
    provider_id: "openai",
    intelligence: { intelligence_index: 50 },
  },
]);
assertEqual(qualifiedFallbackRows[0]?.id, "openai/gpt-test");
assertEqual(qualifiedFallbackRows[0]?.openrouter_id, "openai/gpt-test");

const datedGeminiPreviewData = await prepareOpenRouterModelData(
  collapseModelVariants([
    {
      id: "google/gemini-2.5-flash-preview-09-2025",
      openrouter_id: "google/gemini-2.5-flash-preview-09-2025",
      provider_id: "vercel",
      intelligence: {
        intelligence_index: 90,
      },
    },
  ]),
  STAGE_CONFIG.openrouter,
  STAGE_CONFIG.scoring,
  null,
);

assertEqual(datedGeminiPreviewData.modelRows.length, 1);
assertEqual(datedGeminiPreviewData.modelRows[0]?.id, "google/gemini-2.5-flash");
assertEqual(datedGeminiPreviewData.modelRows[0]?.openrouter_id, "google/gemini-2.5-flash");
