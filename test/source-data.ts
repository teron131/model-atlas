/** Verifies live and cached rows share source selection, lookups, and default-effort assembly. */

import assert from "node:assert/strict";

import { cachedSourceDataFromSnapshots } from "../src/model-atlas/database/source-snapshots/source-data";
import type { SourceSnapshots } from "../src/model-atlas/database/types";
import type {
	DeepSWELeaderboardRow,
	DeepSWERawLeaderboardRow,
} from "../src/model-atlas/scrapers/deep-swe";
import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import {
	buildSourceData,
	type LlmStatsSourceRows,
} from "../src/model-atlas/stats/source-data";
import type { LlmStatsSourceData } from "../src/model-atlas/stats/types";

function modelsDevModel(
	providerId: string,
	modelId: string,
): ModelsDevFlatModel {
	return {
		provider_id: providerId,
		provider_name: providerId,
		model_id: modelId,
		model: { id: modelId, name: modelId },
	};
}

function deepSWERow(
	reasoningEffort: string | null,
	passAt1: number,
): DeepSWELeaderboardRow {
	return {
		model: "Deep Model",
		reasoning_effort: reasoningEffort,
		config: null,
		pass_at_1: passAt1,
		ci_lo: null,
		ci_hi: null,
		ci_half: null,
		n_tasks_attempted: 100,
		mean_cost_usd: 2,
		mean_duration_seconds: 20,
		mean_output_tokens: 200,
	};
}

function contract(sourceData: LlmStatsSourceData) {
	const defaultDeepSWE = sourceData.deepSWE.defaultEffortRows[0];
	const indexedDeepSWE = sourceData.deepSWE.scoreByModelName.get("deep-model");
	return {
		artificialAnalysisModelId:
			sourceData.artificialAnalysis.bySlug.get("example-model")?.model_id,
		modelsDevRows: sourceData.modelsDev.rows.map((row) => [
			row.model_id,
			row.provider_id,
		]),
		modelsDevLookupProvider:
			sourceData.modelsDev.byId.get("shared/model")?.provider_id,
		deepSWEEffortCount: sourceData.deepSWE.effortRows.length,
		deepSWEDefault: {
			reasoningEffort: defaultDeepSWE?.reasoning_effort,
			passAt1: defaultDeepSWE?.pass_at_1,
		},
		deepSWEIndexedDefault: {
			reasoningEffort: indexedDeepSWE?.reasoning_effort,
			passAt1: indexedDeepSWE?.pass_at_1,
		},
	};
}

const modelsDevModels = [
	modelsDevModel("vercel", "shared/model"),
	modelsDevModel("unsupported", "unsupported/model"),
	modelsDevModel("openrouter", "shared/model"),
	modelsDevModel("vercel", "vercel/model"),
];
const deepSWEEffortRows = [deepSWERow("max", 0.8), deepSWERow(null, 0.4)];
const sourceRows: LlmStatsSourceRows = {
	artificialAnalysisRows: [{ model_id: "google/example-model" }],
	artificialAnalysisEvaluationResourceRows: [],
	modelsDevModels,
	agentsLastExamRows: [],
	blueprintBenchRows: [],
	browseCompRows: [],
	cursorBenchRows: [],
	deepSWEEffortRows,
	gdpPdfRows: [],
	riemannBenchRows: [],
	toolathlonRows: [],
	valsIndexRows: [],
	valsTerminalBenchRows: [],
};

const liveSourceData = buildSourceData(sourceRows);
const cachedSourceData = cachedSourceDataFromSnapshots({
	artificialAnalysisSelectedRows: sourceRows.artificialAnalysisRows,
	artificialAnalysisEvaluationResourceRows:
		sourceRows.artificialAnalysisEvaluationResourceRows,
	modelsDevModels,
	agentsLastExamModelScores: [],
	blueprintBenchModelScoreRows: [],
	browseCompModelScoreRows: [],
	cursorBenchModelScoreRows: [],
	deepSWERawRows: deepSWEEffortRows.map(
		(row): DeepSWERawLeaderboardRow => ({
			...row,
			source_version: "v1.1",
		}),
	),
	gdpPdfModelScoreRows: [],
	riemannBenchModelScoreRows: [],
	toolathlonModelScoreRows: [],
	valsIndexModelScoreRows: [],
	valsTerminalBenchModelScoreRows: [],
} as unknown as SourceSnapshots);

assert.deepEqual(contract(cachedSourceData), contract(liveSourceData));
assert.deepEqual(contract(liveSourceData), {
	artificialAnalysisModelId: "google/example-model",
	modelsDevRows: [
		["shared/model", "openrouter"],
		["vercel/model", "vercel"],
	],
	modelsDevLookupProvider: "openrouter",
	deepSWEEffortCount: 2,
	deepSWEDefault: { reasoningEffort: null, passAt1: 0.4 },
	deepSWEIndexedDefault: { reasoningEffort: null, passAt1: 0.4 },
});
