/** Verify public JSON projections and the dashboard bootstrap projection. */

import assert from "node:assert/strict";

import {
	benchmarksJsonPayload,
	coreJsonPayload,
	fullJsonPayload,
	scoreJsonPayload,
} from "../app/api/llm-stats/public-json";
import { leanDashboardPayload } from "../app/dashboard/payload";
import {
	minimalLlmStatsModel,
	minimalLlmStatsPayload,
} from "./llm-stats-fixtures";

const fullPayload = minimalLlmStatsPayload({
	fetchedAt: 123,
	models: [
		{
			...minimalLlmStatsModel({
				id: "provider/model",
				name: "Model",
			}),
			cost: {
				input: 1,
				output: 2,
				cache_read: 0.5,
				cache_write: 1.5,
				blended_price: 1.8,
				weighted_input: 0.4,
			},
			intelligence: {
				intelligence_index: 80,
				agentic_index: 70,
				gpqa: 0.9,
			},
			intelligence_index_cost: {
				total_cost: 12,
			},
			task_metrics: {
				artificial_analysis: {
					cost: 1.25,
					seconds: 2,
					output_tokens: 3,
				},
				deep_swe: {
					cost: 3,
					seconds: 4,
					output_tokens: 5,
				},
			},
			evaluations: {
				gpqa: 0.9,
				deep_swe: 0.6,
			},
		},
	],
});
fullPayload.deep_swe = {
	rows: [
		{
			model: "Model",
			reasoning_effort: null,
			config: null,
			pass_at_1: 0.6,
			ci_lo: null,
			ci_hi: null,
			ci_half: null,
			n_tasks_attempted: 113,
			mean_cost_usd: 3,
			mean_duration_seconds: 4,
			mean_output_tokens: 5,
		},
	],
};
fullPayload.metadata.scoring.selected_benchmark_keys = ["gpqa", "deep_swe"];
fullPayload.metadata.scoring.benchmark_portfolio = {
	gpqa: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	deep_swe: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 1,
	},
};
const leanPayload = leanDashboardPayload(fullPayload);
const model = leanPayload.models[0];
const scorePayload = scoreJsonPayload(fullPayload);
const scoreModel = scorePayload.scores[0];
const corePayload = coreJsonPayload(fullPayload);
const coreModel = corePayload.models[0];
const benchmarksPayload = benchmarksJsonPayload(fullPayload);
const benchmarksModel = benchmarksPayload.benchmarks[0];
const fullJsonModel = fullJsonPayload(fullPayload).models[0];
const methodology =
	"INTELLIGENCE and AGENTIC blend normalized upstream indexes with linearly normalized baseline/frontier benchmark scores. SPEED gives equal weight to provider speed stats, workflow simulation, and each active benchmark task-time input; benchmark task-time compares runtime among similarly scoring models. VALUE gives equal weight to blended price, quality per price, workflow price value, and each active benchmark task-cost input; lower costs raise the score.";

assert.equal(scorePayload.schema, "model_atlas.score");
assert.equal(scorePayload.score_scale, "percentage");
assert.equal(scorePayload.methodology, methodology);
assert.deepEqual(scoreModel, {
	rank: 1,
	id: "provider/model",
	name: "Model",
	provider: null,
	score: {
		overall: 0,
		intelligence: 0,
		agentic: 0,
		speed: 0,
		value: null,
	},
});

assert.equal(leanPayload.deep_swe, undefined);
assert.deepEqual(
	leanPayload.metadata.artificial_analysis.available_benchmark_keys,
	[],
);
assert.deepEqual(leanPayload.metadata.scoring.selected_benchmark_keys, []);
assert.deepEqual(leanPayload.metadata.scoring.benchmark_portfolio, {
	deep_swe: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 1,
	},
});
assert.deepEqual(model?.evaluations, {
	deep_swe: 0.6,
});
assert.deepEqual(model?.task_metrics, {
	artificial_analysis: {
		cost: 1.25,
		seconds: 2,
		output_tokens: 3,
	},
	deep_swe: {
		cost: 3,
		seconds: 4,
		output_tokens: 5,
	},
});
assert.equal(model?.intelligence_index_cost, null);
assert.deepEqual(model?.intelligence, {
	intelligence_index: 80,
	agentic_index: 70,
});
assert.deepEqual(model?.cost, {
	input: 1,
	output: 2,
	cache_read: 0.5,
	cache_write: 1.5,
	blended_price: 1.8,
});

assert.equal(corePayload.schema, "model_atlas.core");
assert.equal(corePayload.score_scale, "percentage");
assert.equal(corePayload.methodology, methodology);
assert.deepEqual(corePayload.columns, [
	"rank",
	"id",
	"name",
	"provider",
	"release_date",
	"input_modalities",
	"output_modalities",
	"open_weights",
	"intelligence_score",
	"agentic_score",
	"speed_score",
	"value_score",
	"overall_score",
	"blended_price",
	"context_window_tokens",
	"input_cost_per_million_tokens",
	"output_cost_per_million_tokens",
	"cache_read_cost_per_million_tokens",
	"throughput_tokens_per_second_median",
	"latency_seconds_median",
	"e2e_latency_seconds_median",
]);
assert.deepEqual(Object.keys(coreModel ?? {}), corePayload.columns);
assert.equal(coreModel?.rank, 1);
assert.equal(coreModel?.id, "provider/model");
assert.equal(coreModel?.input_cost_per_million_tokens, 1);
assert.equal(coreModel?.blended_price, 1.8);
assert.equal("evaluations" in (coreModel ?? {}), false);
assert.equal("task_metrics" in (coreModel ?? {}), false);
assert.equal("logo" in (coreModel ?? {}), false);
assert.equal("attachment" in (coreModel ?? {}), false);
assert.equal("reasoning" in (coreModel ?? {}), false);
assert.equal(model?.logo, "");
assert.equal("logo" in (fullJsonModel ?? {}), false);
assert.equal("attachment" in (model ?? {}), false);
assert.equal("reasoning" in (model ?? {}), false);
assert.equal("attachment" in (fullJsonModel ?? {}), false);
assert.equal("reasoning" in (fullJsonModel ?? {}), false);
assert.deepEqual(Object.keys(fullJsonModel?.scores ?? {}), [
	"intelligence_score",
	"agentic_score",
	"speed_score",
	"value_score",
	"overall_score",
]);
assert.equal(benchmarksPayload.schema, "model_atlas.benchmarks");
assert.equal(benchmarksPayload.benchmark_scale, "decimal");
assert.equal(benchmarksPayload.methodology, methodology);
assert.deepEqual(benchmarksModel, {
	rank: 1,
	id: "provider/model",
	name: "Model",
	provider: null,
	benchmarks: {
		gpqa: 0.9,
		deep_swe: 0.6,
	},
});

const tiedPayload = minimalLlmStatsPayload({
	fetchedAt: 123,
	models: [
		rankedModel("provider/first", "First", 100),
		rankedModel("provider/second-a", "Second A", 90),
		rankedModel("provider/second-b", "Second B", 90),
		rankedModel("provider/fourth", "Fourth", 80),
	],
});
assert.deepEqual(
	scoreJsonPayload(tiedPayload).scores.map((model) => model.rank),
	[1, 2, 2, 4],
	"score JSON should use tied competition ranks",
);
assert.deepEqual(
	coreJsonPayload(tiedPayload).models.map((model) => model.rank),
	[1, 2, 2, 4],
	"core JSON should use tied competition ranks",
);
assert.deepEqual(
	benchmarksJsonPayload(tiedPayload).benchmarks.map((model) => model.rank),
	[1, 2, 2, 4],
	"benchmarks JSON should use tied competition ranks",
);

function rankedModel(id: string, name: string, intelligenceScore: number) {
	const model = minimalLlmStatsModel({ id, name });
	return {
		...model,
		scores: {
			...model.scores,
			intelligence_score: intelligenceScore,
		},
	};
}
