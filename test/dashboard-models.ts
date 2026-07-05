import assert from "node:assert/strict";
import { limitByIntelligenceScore } from "../app/dashboard/graphs/models";
import { cacheBustedPath } from "../app/dashboard/shared/format";
import {
	dedupeDisplayModels,
	type SortState,
	sortedRows,
} from "../app/dashboard/table/models";
import { metricColumnsForView } from "../app/dashboard/table/tableColumns";
import type { LlmStatsModel } from "../src/model-atlas/stats/types";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

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

assert.deepEqual(
	sortedRows(intelligenceRows, "", sort("model", "ascending")).map((row) => [
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
	sortedRows(intelligenceRows, "", sort("rank", "ascending")).map(
		(row) => row.model.id,
	),
	["provider/first", "provider/second", "provider/third"],
	"rank sort should follow intelligence rank",
);

assert.deepEqual(
	limitByIntelligenceScore(
		[
			scoredModel("provider/high-int-low-overall", "High Int", 90, 10),
			scoredModel("provider/mid-int-high-overall", "High Overall", 60, 99),
			...Array.from({ length: 29 }, (_, index) =>
				scoredModel(`provider/low-${index}`, `Low ${index}`, 30 - index, 30),
			),
		],
		(model) => model,
		30,
	)
		.slice(0, 2)
		.map((model) => model.id),
	["provider/high-int-low-overall", "provider/mid-int-high-overall"],
	"model limit should prefer intelligence score over overall score",
);

const modalityRows = dedupeDisplayModels([
	modalityModel("provider/text", "Text", ["text"]),
	modalityModel("provider/vision", "Vision", ["text", "image"]),
	modalityModel("provider/all", "All", ["text", "image", "audio", "video"]),
]);

assert.deepEqual(
	sortedRows(modalityRows, "", sort("modalities", "descending")).map(
		(row) => row.model.id,
	),
	["provider/all", "provider/vision", "provider/text"],
	"input modality sort should order by capability coverage, not icon label text",
);

assert.deepEqual(
	metricColumnsForView("evals").map((column) => column.key),
	[
		"artificialAnalysisCost",
		"artificialAnalysisSeconds",
		"artificialAnalysisTokens",
		"gpqa",
		"hle",
		"terminalBench",
		"automationBench",
		"blueprintBench",
		"gdpPdf",
		"riemannBench",
		"cursorBench",
		"deepSWE",
		"deepSWECost",
		"deepSWESeconds",
		"deepSWETokens",
		"agentsLastExam",
		"agentsLastExamCost",
		"agentsLastExamSeconds",
		"agentsLastExamInputTokens",
		"agentsLastExamOutputTokens",
	],
	"eval columns should put AA resource metrics before benchmark scores",
);

assert.deepEqual(
	dedupeDisplayModels([
		rankedModel("mistral/mistral-medium-3.5", "Mistral Medium Latest", 90),
		rankedModel("mistralai/mistral-medium-3.5", "Mistral Medium 3.5", 60),
	]).map((row) => row.model.id),
	["mistral/mistral-medium-3.5"],
	"display dedupe should collapse provider ids that only differ by a trailing ai suffix when the slug family matches",
);

assert.equal(
	cacheBustedPath("/api/llm-stats?view=all").startsWith(
		"/api/llm-stats?view=all&reload=",
	),
	true,
	"cache busting should preserve existing query params",
);

function rankedModel(
	id: string,
	name: string,
	intelligenceScore: number,
): LlmStatsModel {
	const model = minimalLlmStatsModel({ id, name });
	return {
		...model,
		scores: {
			...model.scores,
			intelligence_score: intelligenceScore,
		},
	};
}

function scoredModel(
	id: string,
	name: string,
	intelligenceScore: number,
	overallScore: number,
): LlmStatsModel {
	const model = rankedModel(id, name, intelligenceScore);
	return {
		...model,
		scores: {
			...model.scores,
			overall_score: overallScore,
		},
	};
}

function modalityModel(
	id: string,
	name: string,
	input: string[],
): LlmStatsModel {
	return {
		...minimalLlmStatsModel({ id, name }),
		modalities: {
			input,
		},
	};
}

function sort(key: SortState["key"], direction: SortState["direction"]) {
	return { key, direction };
}
