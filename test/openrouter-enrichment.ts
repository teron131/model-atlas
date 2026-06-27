import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { publicOpenRouterModelId } from "../src/model-atlas/llm/openrouter-routes";
import { enrichModelRowsWithOpenRouter } from "../src/model-atlas/llm/stats/openrouter-enrichment";

function assertEqual(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`Expected ${expected}, got ${actual}`);
	}
}

const enriched = await enrichModelRowsWithOpenRouter(
	[
		{
			id: "anthropic/claude-opus-4.8-fast",
			openrouter_id: "anthropic/claude-opus-4.8-fast",
			provider_id: "openrouter",
			aa_id: "aa/claude-opus-4.8",
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
	],
	STAGE_CONFIG.openrouter,
	STAGE_CONFIG.scoring,
	null,
);

assertEqual(enriched.rows.length, 1);
assertEqual(enriched.rows[0]?.id, "anthropic/claude-opus-4.8");
assertEqual(enriched.rows[0]?.openrouter_id, "anthropic/claude-opus-4.8");

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

const aliasOnlyEnriched = await enrichModelRowsWithOpenRouter(
	[
		{
			id: "openai/gpt-5.5-xhigh",
			openrouter_id: "openai/gpt-5.5-xhigh",
			provider_id: "openrouter",
			intelligence: {
				intelligence_index: 90,
			},
		},
	],
	STAGE_CONFIG.openrouter,
	STAGE_CONFIG.scoring,
	null,
);

assertEqual(aliasOnlyEnriched.rows.length, 1);
assertEqual(aliasOnlyEnriched.rows[0]?.id, "openai/gpt-5.5");
assertEqual(aliasOnlyEnriched.rows[0]?.openrouter_id, "openai/gpt-5.5");

const datedGeminiPreviewEnriched = await enrichModelRowsWithOpenRouter(
	[
		{
			id: "google/gemini-2.5-flash-preview-09-2025",
			openrouter_id: "google/gemini-2.5-flash-preview-09-2025",
			provider_id: "vercel",
			intelligence: {
				intelligence_index: 90,
			},
		},
	],
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
