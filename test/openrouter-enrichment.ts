/** Verifies OpenRouter alias collapse, default-effort selection, and route telemetry lookup. */

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import {
	isSameOpenRouterModelRoute,
	publicOpenRouterModelId,
	publicOpenRouterModelName,
} from "../src/model-atlas/openrouter-routes";
import {
	aggregateModelRows,
	enrichModelRowsWithOpenRouter,
} from "../src/model-atlas/stats/openrouter-enrichment";

function assertEqual(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`Expected ${expected}, got ${actual}`);
	}
}

const enriched = await enrichModelRowsWithOpenRouter(
	aggregateModelRows([
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

assertEqual(enriched.rows.length, 1);
assertEqual(enriched.rows[0]?.id, "anthropic/claude-opus-4.8");
assertEqual(enriched.rows[0]?.openrouter_id, "anthropic/claude-opus-4.8");

const effortObservations = [
	{
		id: "openai/gpt-5.6-sol",
		provider_id: "openai",
		artificial_analysis_id: "openai/gpt-5-6-sol",
		artificial_analysis_slug: "gpt-5-6-sol",
		reasoning_effort: "max",
		evaluations: { scicode: 0.56, terminalbench_v21: 0.88 },
		intelligence: { coding_index: 77, intelligence_index: 59 },
		intelligence_index_cost: { total_cost: 12 },
	},
	{
		id: "openai/gpt-5.6-sol",
		provider_id: "openai",
		artificial_analysis_id: "openai/gpt-5-6-sol-xhigh",
		artificial_analysis_slug: "gpt-5-6-sol-xhigh",
		reasoning_effort: "xhigh",
		evaluations: { scicode: 0.55, terminalbench_v21: 0.9 },
		intelligence: { coding_index: 78, intelligence_index: 58 },
		intelligence_index_cost: { total_cost: 10 },
	},
] as const;
const preservedEffortObservations = JSON.stringify(effortObservations);
const defaultEffortRows = aggregateModelRows([...effortObservations]);
const defaultEffortRow = defaultEffortRows[0] as Record<string, unknown>;
const defaultEffortEvaluations = defaultEffortRow.evaluations as Record<
	string,
	unknown
>;
const defaultEffortIntelligence = defaultEffortRow.intelligence as Record<
	string,
	unknown
>;
const defaultEffortIntelligenceCost =
	defaultEffortRow.intelligence_index_cost as Record<string, unknown>;
assertEqual(defaultEffortRows.length, 1);
assertEqual(defaultEffortRow.artificial_analysis_id, "openai/gpt-5-6-sol");
assertEqual(defaultEffortRow.reasoning_effort, undefined);
assertEqual(defaultEffortEvaluations.scicode, 0.56);
assertEqual(defaultEffortEvaluations.terminalbench_v21, 0.88);
assertEqual(defaultEffortIntelligence.coding_index, 77);
assertEqual(defaultEffortIntelligence.intelligence_index, 59);
assertEqual(defaultEffortIntelligenceCost.total_cost, 12);
assertEqual(JSON.stringify(effortObservations), preservedEffortObservations);

const separatelyNamedMaxRow = aggregateModelRows([
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
assertEqual(
	separatelyNamedMaxRow.artificial_analysis_id,
	"anthropic/claude-opus-4-6-adaptive",
);
assertEqual(
	(separatelyNamedMaxRow.intelligence as Record<string, unknown>)
		.intelligence_index,
	44,
);

const nullClaudeConfigurationObservations = [
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
const preservedNullClaudeConfigurationObservations = JSON.stringify(
	nullClaudeConfigurationObservations,
);
const nullClaudeConfigurationRows = aggregateModelRows([
	...nullClaudeConfigurationObservations,
]);
assertEqual(nullClaudeConfigurationRows.length, 1);
const nullClaudeConfigurationRow = nullClaudeConfigurationRows[0] as Record<
	string,
	unknown
>;
assertEqual(
	nullClaudeConfigurationRow.artificial_analysis_id,
	"anthropic/claude-4-5-sonnet",
);
assertEqual(
	(nullClaudeConfigurationRow.intelligence as Record<string, unknown>)
		.intelligence_index,
	29,
);
assertEqual(nullClaudeConfigurationRow.reasoning_effort, undefined);
assertEqual(
	JSON.stringify(nullClaudeConfigurationObservations),
	preservedNullClaudeConfigurationObservations,
);

assertEqual(
	publicOpenRouterModelId("anthropic/claude-opus-4.8-fast"),
	"anthropic/claude-opus-4.8",
);
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-ultra"), "openai/gpt-5.5");
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-max"), "openai/gpt-5.5");
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.5-adaptive"),
	"openai/gpt-5.5",
);
assertEqual(publicOpenRouterModelId("openai/gpt-5.5-xhigh"), "openai/gpt-5.5");
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.5-non-reasoning"),
	"openai/gpt-5.5",
);
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.6-sol-pro"),
	"openai/gpt-5.6-sol",
);
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.6-terra-pro"),
	"openai/gpt-5.6-terra",
);
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.6-luna-pro"),
	"openai/gpt-5.6-luna",
);
assertEqual(
	publicOpenRouterModelId("openai/gpt-5.6-sol"),
	"openai/gpt-5.6-sol",
);
assertEqual(
	publicOpenRouterModelId("google/gemini-2.5-pro"),
	"google/gemini-2.5-pro",
);
assertEqual(
	publicOpenRouterModelId("provider/model-pro-preview-06-2026"),
	"provider/model-pro",
);
assertEqual(
	publicOpenRouterModelId("google/gemini-2.5-flash-preview-09-2025"),
	"google/gemini-2.5-flash",
);
assertEqual(
	publicOpenRouterModelId("provider/model-family-3-5"),
	"provider/model-family-3.5",
);
assertEqual(
	publicOpenRouterModelId("provider/model-family-12-05"),
	"provider/model-family-12-05",
);
assertEqual(
	publicOpenRouterModelName(
		"Mistral Medium Latest",
		"mistralai/mistral-medium-3.5",
	),
	"Mistral Medium 3.5",
);
assertEqual(
	isSameOpenRouterModelRoute(
		"anthropic/claude-opus-4.6",
		"anthropic/claude-4.6-opus-20260205",
	),
	true,
);
assertEqual(
	isSameOpenRouterModelRoute(
		"anthropic/claude-opus-4.6",
		"anthropic/claude-4.6-opus-thinking",
	),
	false,
);

const qwenRouteEnriched = await enrichModelRowsWithOpenRouter(
	[
		{
			id: "qwen/qwen3.7",
			openrouter_id: "qwen/qwen3.7",
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
					summary: {
						throughput_tokens_per_second_median: 47,
						latency_seconds_median: 1.58,
						e2e_latency_seconds_median: null,
					},
				},
				pricing: null,
			},
		],
	},
);
assertEqual(
	qwenRouteEnriched.openRouterSpeedById.get("qwen/qwen3.7")
		?.throughput_tokens_per_second_median,
	47,
);

const aliasOnlyEnriched = await enrichModelRowsWithOpenRouter(
	aggregateModelRows([
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

assertEqual(aliasOnlyEnriched.rows.length, 1);
assertEqual(aliasOnlyEnriched.rows[0]?.id, "openai/gpt-5.5");
assertEqual(aliasOnlyEnriched.rows[0]?.openrouter_id, "openai/gpt-5.5");

const qualifiedFallbackRows = aggregateModelRows([
	{
		id: "openai/gpt-test",
		openrouter_id: "gpt-test",
		provider_id: "openai",
		intelligence: { intelligence_index: 50 },
	},
]);
assertEqual(qualifiedFallbackRows[0]?.id, "openai/gpt-test");
assertEqual(qualifiedFallbackRows[0]?.openrouter_id, "openai/gpt-test");

const datedGeminiPreviewEnriched = await enrichModelRowsWithOpenRouter(
	aggregateModelRows([
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

assertEqual(datedGeminiPreviewEnriched.rows.length, 1);
assertEqual(datedGeminiPreviewEnriched.rows[0]?.id, "google/gemini-2.5-flash");
assertEqual(
	datedGeminiPreviewEnriched.rows[0]?.openrouter_id,
	"google/gemini-2.5-flash",
);
