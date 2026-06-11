import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { runMatcher } from "../src/model-atlas/llm/matcher/pipeline";
import type {
	MatcherSourceModel,
	ModelsDevModel,
	PreferredProviderPools,
} from "../src/model-atlas/llm/matcher/types";
import { buildCursorBenchScoreByModelName } from "../src/model-atlas/llm/scrapers/cursorbench";
import { buildToolathlonScoreByModelName } from "../src/model-atlas/llm/scrapers/toolathlon";
import { buildMatchedModelRows } from "../src/model-atlas/llm/stats/matching";
import type { LlmStatsSourceData } from "../src/model-atlas/llm/stats/types";

const sourceRows: MatcherSourceModel[] = [
	source("example-medium-3-5", "Example Medium 3.5"),
	source("example-medium-3", "Example Medium 3"),
];

const providerPools: PreferredProviderPools = {
	primary: [
		model("openrouter", "example/example-medium-3-5", "Example Medium 3.5"),
		model("openrouter", "example/example-medium-3.1", "Example Medium 3.1"),
	],
	fallback: [
		model("fallback", "example/example-medium-3.5", "Example Medium Latest"),
	],
};

const output = runMatcher(sourceRows, providerPools, 5);

assert.equal(
	output.models[0]?.best_match?.provider_id,
	"openrouter",
	"OpenRouter should remain the preferred identity even when fallback providers expose an exact slug",
);
assert.equal(
	output.models[0]?.best_match?.model_id,
	"example/example-medium-3-5",
);
assert.equal(
	output.models[1]?.best_match,
	null,
	"an older numeric version should not match a newer OpenRouter sibling when the exact row is absent",
);

const sourceData = modelStatsSourceData([
	sourceModel("google/example-2-5-flash", 20),
	sourceModel("google/example-3-pro", 50),
]);
const matchedRows = await buildMatchedModelRows(
	sourceData,
	STAGE_CONFIG.matcher,
);

assert.equal(
	matchedRows.find((row) => row.aa_id === "google/example-2-5-flash")?.id,
	"google/example-2.5-flash",
	"an exact OpenRouter route should win over flash-lite or image siblings",
);
assert.equal(
	matchedRows.some((row) => row.aa_id === "google/example-3-pro"),
	false,
	"image and latest routes should not stand in for a base source row",
);
assert.equal(
	asEvaluations(
		matchedRows.find((row) => row.aa_id === "google/example-2-5-flash"),
	).toolathlon,
	0.42,
	"Toolathlon scores should attach through the benchmark lookup path",
);
assert.equal(
	asEvaluations(
		matchedRows.find((row) => row.aa_id === "google/example-2-5-flash"),
	).cursorbench,
	0.58,
	"CursorBench scores should attach through the benchmark lookup path",
);

function source(sourceSlug: string, sourceName: string): MatcherSourceModel {
	return {
		sourceSlug,
		sourceName,
		sourceReleaseDate: null,
	};
}

function model(
	providerId: string,
	modelId: string,
	modelName: string,
): ModelsDevModel {
	return {
		provider_id: providerId,
		provider_name: providerId,
		model_id: modelId,
		model: {
			id: modelId,
			name: modelName,
		},
	} as ModelsDevModel;
}

function sourceModel(
	modelId: string,
	intelligenceIndex: number,
): Record<string, unknown> {
	return {
		model_id: modelId,
		intelligence: { intelligence_index: intelligenceIndex },
		evaluations: {},
		intelligence_index_cost: {},
	};
}

function modelStatsSourceData(
	artificialAnalysisRows: Record<string, unknown>[],
): LlmStatsSourceData {
	const toolathlonModelScoreRows = [
		{
			rank: 1,
			model: "Example 2.5 Flash",
			provider: "google",
			provider_name: "Google",
			score: 0.42,
			source_url: null,
			analysis_method: null,
			verified: false,
			self_reported: true,
			announcement_date: null,
		},
	];
	const cursorBenchModelScoreRows = [
		{
			rank: 1,
			model: "Example 2.5 Flash",
			base_model: "Example 2.5 Flash",
			reasoning_effort: null,
			score: 0.58,
			cost_per_task_usd: 1.25,
			tokens_per_task: 12_000,
			steps_per_task: 42,
		},
	];
	const modelsDevModels = [
		model(
			"openrouter",
			"google/example-2.5-flash-lite",
			"Example 2.5 Flash Lite",
		),
		model("openrouter", "google/example-2.5-flash-image", "Example Image"),
		model("openrouter", "google/example-2.5-flash", "Example 2.5 Flash"),
		model(
			"openrouter",
			"google/example-3-pro-image-preview",
			"Example Pro Image",
		),
		model("openrouter", "~google/example-pro-latest", "Example Pro Latest"),
	];
	const artificialAnalysisBySlug = new Map<string, Record<string, unknown>>();
	for (const row of artificialAnalysisRows) {
		const modelId = row.model_id;
		if (typeof modelId === "string") {
			artificialAnalysisBySlug.set(modelId.split("/").at(-1) ?? modelId, row);
		}
	}

	return {
		artificialAnalysisRows,
		preferredModelsDevModels: modelsDevModels,
		modelsDevById: new Map(
			modelsDevModels.map((modelsDevModel) => [
				modelsDevModel.model_id,
				modelsDevModel,
			]),
		),
		artificialAnalysisBySlug,
		deepSWEModelScoreRows: [],
		deepSWEScoreByModelName: new Map(),
		terminalBenchAccuracyByModelName: new Map(),
		agentsLastExamModelScoreRows: [],
		agentsLastExamScoreByModelName: new Map(),
		automationBenchModelScoreRows: [],
		automationBenchScoreByModelName: new Map(),
		browseCompModelScoreRows: [],
		browseCompScoreByModelName: new Map(),
		toolathlonModelScoreRows,
		toolathlonScoreByModelName: buildToolathlonScoreByModelName(
			toolathlonModelScoreRows,
		),
		cursorBenchModelScoreRows,
		cursorBenchScoreByModelName: buildCursorBenchScoreByModelName(
			cursorBenchModelScoreRows,
		),
	};
}

function asEvaluations(
	row: Record<string, unknown> | undefined,
): Record<string, unknown> {
	return row?.evaluations && typeof row.evaluations === "object"
		? (row.evaluations as Record<string, unknown>)
		: {};
}
