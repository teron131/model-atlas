/** Verifies live and cached rows share source selection, lookups, and default-effort assembly. */

import assert from "node:assert/strict";

import { cachedSourceDataFromSnapshots } from "../src/model-atlas/database/source-snapshots/data";
import type { SourceSnapshots } from "../src/model-atlas/database/types";
import type { BenchmarkScoreRow } from "../src/model-atlas/scrapers/benchmark-score";
import type {
	DeepSWELeaderboardRow,
	DeepSWERawLeaderboardRow,
} from "../src/model-atlas/scrapers/deep-swe";
import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import { benchmarkRowsFromSourceData } from "../src/model-atlas/stats/benchmarks";
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

function benchmarkScoreRow(
	source: BenchmarkScoreRow["source"],
	benchmarkKey: string,
	modelId: string | null,
	model: string,
	score: number,
): BenchmarkScoreRow {
	return {
		benchmark_key: benchmarkKey,
		source,
		source_url: `https://example.com/${benchmarkKey}`,
		model_id: modelId,
		model,
		base_model: model,
		reasoning_effort: null,
		provider: null,
		rank: 1,
		score,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {},
	};
}

function summary(sourceData: LlmStatsSourceData) {
	const defaultDeepSWE = sourceData.deepSWE.defaultEffortRows[0];
	const indexedDeepSWE = sourceData.deepSWE.rowsByModelName.get("deep-model");
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
const epochRow = benchmarkScoreRow(
	"epoch",
	"chess_puzzles",
	"epoch/example-model",
	"Epoch Example Model",
	0.71,
);
const surgeRow = benchmarkScoreRow(
	"surge",
	"chartography",
	null,
	"Surge Example Model",
	0.64,
);
const valsRow = benchmarkScoreRow(
	"vals",
	"proofbench",
	"vals/example-model",
	"Vals Example Model",
	0.58,
);
const sourceRows: LlmStatsSourceRows = {
	artificialAnalysisRows: [{ model_id: "google/example-model" }],
	artificialAnalysisEvaluationResourceRows: [],
	modelsDevModels,
	agentArenaRows: [],
	agentsLastExamRows: [],
	aleBenchConfigurationRows: [],
	blueprintBenchRows: [],
	browseCompRows: [],
	chartographyRows: [surgeRow],
	chessPuzzleRows: [epochRow],
	cursorBenchRows: [],
	deepSWEEffortRows,
	ebrBenchRows: [],
	enterpriseBenchCoreCraftRows: [],
	epochCapabilitiesIndexRows: [],
	frontierCodeRows: [],
	frontierMathTier4Rows: [],
	gdpPdfRows: [],
	handbookMdRows: [],
	harveyLabRows: [],
	mercorApexAgentsRows: [],
	proofBenchRows: [valsRow],
	riemannBenchRows: [],
	terminalBenchRows: [],
	toolathlonRows: [],
	valsIndexRows: [],
	vendingBench2Rows: [],
	weirdMlRows: [],
};

const liveSourceData = buildSourceData(sourceRows);
const cachedSourceData = cachedSourceDataFromSnapshots({
	artificialAnalysisSelectedRows: sourceRows.artificialAnalysisRows,
	artificialAnalysisEvaluationResourceRows:
		sourceRows.artificialAnalysisEvaluationResourceRows,
	modelsDevModels,
	agentArenaModelScoreRows: [],
	agentsLastExamModelScores: [],
	aleBenchConfigurationRows: [],
	blueprintBenchModelScoreRows: [],
	browseCompModelScoreRows: [],
	chartographyRows: [surgeRow],
	chessPuzzleRows: [epochRow],
	cursorBenchModelScoreRows: [],
	deepSWERawRows: deepSWEEffortRows.map(
		(row): DeepSWERawLeaderboardRow => ({
			...row,
			source_version: "v1.1",
		}),
	),
	ebrBenchRows: [],
	enterpriseBenchCoreCraftRows: [],
	epochCapabilitiesIndexRows: [],
	frontierCodeRows: [],
	frontierMathTier4Rows: [],
	gdpPdfModelScoreRows: [],
	handbookMdRows: [],
	harveyLabModelScoreRows: [],
	mercorApexAgentsRows: [],
	proofBenchRows: [valsRow],
	riemannBenchModelScoreRows: [],
	terminalBenchModelScoreRows: [],
	toolathlonModelScoreRows: [],
	valsIndexModelScoreRows: [],
	vendingBench2ModelScoreRows: [],
	weirdMlRows: [],
} as unknown as SourceSnapshots);

assert.deepEqual(summary(cachedSourceData), summary(liveSourceData));
const liveBenchmarkRows = benchmarkRowsFromSourceData(liveSourceData);
assert.deepEqual(liveBenchmarkRows.chess_puzzles, [
	{
		id: "epoch/example-model",
		label: "Epoch Example Model",
		provider: null,
		value: 0.71,
	},
]);
assert.deepEqual(liveBenchmarkRows.chartography, [
	{
		id: null,
		label: "Surge Example Model",
		provider: null,
		value: 0.64,
	},
]);
assert.deepEqual(liveBenchmarkRows.proofbench, [
	{
		id: "vals/example-model",
		label: "Vals Example Model",
		provider: null,
		value: 0.58,
	},
]);
assert.deepEqual(summary(liveSourceData), {
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
