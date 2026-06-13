import assert from "node:assert/strict";

import {
	benchmarksJsonPayload,
	coreJsonPayload,
	fullJsonPayload,
	leanDashboardPayload,
	scoreJsonPayload,
} from "../app/api/llm-stats/public-json";
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
};
fullPayload.metadata.scoring.overall_relative_score_weights = {
	intelligence: 0.11,
	agentic: 0.22,
	speed: 0.33,
	value: 0.34,
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
	"Overall score is 11% Intelligence, 22% Agentic, 33% Speed, and 34% Value. Intelligence and Agentic blend normalized upstream indexes with linearly normalized baseline/frontier benchmark scores; Speed and Value use percentile-ranked, use-case-weighted latency, throughput, cost, and resource-efficiency signals. Higher is better.";

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
assert.deepEqual(leanPayload.metadata.scoring.benchmark_portfolio, {});
assert.equal(model?.evaluations, null);
assert.equal(model?.task_metrics, null);
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
	"overall_score",
	"intelligence_score",
	"agentic_score",
	"speed_score",
	"value_score",
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
assert.equal("attachment" in (model ?? {}), false);
assert.equal("reasoning" in (model ?? {}), false);
assert.equal("attachment" in (fullJsonModel ?? {}), false);
assert.equal("reasoning" in (fullJsonModel ?? {}), false);
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
