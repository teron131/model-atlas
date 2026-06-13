import assert from "node:assert/strict";
import { cacheBustedPath } from "../app/dashboard/shared/format";
import {
	dedupeDisplayModels,
	type SortState,
	sortedRows,
} from "../app/dashboard/table/models";
import { metricColumnsForView } from "../app/dashboard/table/tableColumns";
import type { LlmStatsModel } from "../src/model-atlas/llm/stats/types";
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
		"aaCost",
		"aaSeconds",
		"aaTokens",
	],
	"eval columns should keep resource metrics next to their matching benchmark",
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
		relative_scores: {
			...model.relative_scores,
			intelligence_score: intelligenceScore,
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
