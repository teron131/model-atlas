import assert from "node:assert/strict";

import {
	dedupeDisplayModels,
	type SortState,
	sortedRows,
} from "../app/dashboard/models";
import type { ModelStatsSelectedModel } from "../src/model-atlas/llm/llm-stats/types";
import { minimalSelectedModel } from "./model_stats_fixtures";

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

assert.deepEqual(
	dedupeDisplayModels([
		rankedModel("mistral/mistral-medium-3.5", "Mistral Medium Latest", 90),
		rankedModel("mistralai/mistral-medium-3.5", "Mistral Medium 3.5", 60),
	]).map((row) => row.model.id),
	["mistral/mistral-medium-3.5"],
	"display dedupe should collapse provider ids that only differ by a trailing ai suffix when the slug family matches",
);

function rankedModel(
	id: string,
	name: string,
	intelligenceScore: number,
): ModelStatsSelectedModel {
	const model = minimalSelectedModel({ id, name });
	return {
		...model,
		relative_scores: {
			...model.relative_scores,
			intelligence_score: intelligenceScore,
		},
	};
}

function sort(key: SortState["key"], direction: SortState["direction"]) {
	return { key, direction };
}
