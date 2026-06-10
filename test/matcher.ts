import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { buildMatchedRows } from "../src/model-atlas/llm/llm-stats/match-stage";
import type { SourceData } from "../src/model-atlas/llm/llm-stats/types";
import { runMatcher } from "../src/model-atlas/llm/matcher/pipeline";
import type {
	MatcherSourceModel,
	ModelsDevModel,
	PreferredProviderPools,
} from "../src/model-atlas/llm/matcher/types";

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

const sourceData = buildSourceData([
	sourceModel("google/example-2-5-flash", 20),
	sourceModel("google/example-3-pro", 50),
]);
const matchedRows = await buildMatchedRows(sourceData, STAGE_CONFIG.matcher);

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

function buildSourceData(
	artificialAnalysisRows: Record<string, unknown>[],
): SourceData {
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
		browseCompModelScoreRows: [],
		browseCompScoreByModelName: new Map(),
	};
}
