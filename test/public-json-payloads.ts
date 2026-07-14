/** Verify the public model boundary, JSON projections, and dashboard bootstrap projection. */

import assert from "node:assert/strict";

import {
	benchmarksJsonPayload,
	coreJsonPayload,
	fullJsonPayload,
	scoreJsonPayload,
} from "../app/api/llm-stats/public-json";
import { compactDashboardPayload } from "../app/dashboard/payload";
import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { selectPublicModels } from "../src/model-atlas/stats/selection/public-list";
import type { LlmStatsScoredCandidate } from "../src/model-atlas/stats/types";
import {
	minimalLlmStatsModel,
	minimalLlmStatsPayload,
} from "./llm-stats-fixtures";

const internalCandidate = {
	...minimalLlmStatsModel({
		id: "provider/internal-candidate",
		name: "Internal Candidate",
	}),
	scoring_sources: {
		regression_probe: { raw_score: 0.8 },
	},
	internal_probe: "must not be public",
	component_scores: {
		intelligence_score: 80,
		agentic_score: 70,
		speed_score: 60,
	},
	scores: {
		intelligence_score: 80,
		agentic_score: 70,
		speed_score: 60,
		value_score: 50,
		overall_score: 70,
	},
} satisfies LlmStatsScoredCandidate & { internal_probe: string };
const [projectedPublicModel] = selectPublicModels(
	[internalCandidate],
	null,
	STAGE_CONFIG.final,
	STAGE_CONFIG.scoring,
);
assert.deepEqual(
	Object.keys(projectedPublicModel ?? {}).sort(),
	Object.keys(
		minimalLlmStatsModel({
			id: "provider/internal-candidate",
			name: "Internal Candidate",
		}),
	).sort(),
	"public selection should project candidates onto the exact public model surface",
);
assert.equal(
	"scoring_sources" in (projectedPublicModel ?? {}),
	false,
	"public selection should not expose scoring provenance",
);

const missingOverallScoreCandidate: LlmStatsScoredCandidate = {
	...internalCandidate,
	id: "provider/missing-overall-score",
	name: "Missing Overall Score",
	scores: {
		...internalCandidate.scores,
		overall_score: null,
	},
};
assert.deepEqual(
	selectPublicModels(
		[missingOverallScoreCandidate],
		null,
		STAGE_CONFIG.final,
		STAGE_CONFIG.scoring,
	),
	[],
	"public selection should exclude candidates without a finite overall score",
);

const lowScoreCandidate: LlmStatsScoredCandidate = {
	...internalCandidate,
	id: "provider/low-score",
	name: "Low Score",
	component_scores: {
		...internalCandidate.component_scores,
		intelligence_score: 5,
		agentic_score: 4,
	},
	scores: {
		...internalCandidate.scores,
		intelligence_score: 5,
		agentic_score: 4,
		overall_score: 5,
	},
};
assert.equal(
	selectPublicModels(
		[lowScoreCandidate],
		null,
		STAGE_CONFIG.final,
		STAGE_CONFIG.scoring,
	).length,
	1,
	"low finite scores should remain public when evidence admission is handled separately",
);

const reasoningEffortModels = selectPublicModels(
	[
		{ ...internalCandidate, reasoning_effort: "high" },
		{
			...internalCandidate,
			reasoning_effort: "max",
			scores: { ...internalCandidate.scores, intelligence_score: 90 },
		},
	],
	null,
	STAGE_CONFIG.final,
	STAGE_CONFIG.scoring,
);
assert.deepEqual(
	reasoningEffortModels.map((model) => model.reasoning_effort),
	["max", "high"],
	"the dashboard payload should retain separately scored reasoning-effort variants",
);
assert.equal(
	scoreJsonPayload(
		minimalLlmStatsPayload({ fetchedAt: 123, models: reasoningEffortModels }),
	).scores.length,
	1,
	"the default public score view should keep one representative variant per model",
);
assert.equal(
	scoreJsonPayload(
		minimalLlmStatsPayload({ fetchedAt: 123, models: reasoningEffortModels }),
	).scores[0]?.score.intelligence,
	90,
	"collapsed public views should use the strongest variant for each model",
);

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
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
};
const compactPayload = compactDashboardPayload(fullPayload);
const model = compactPayload.models[0];
const scorePayload = scoreJsonPayload(fullPayload);
const scoreModel = scorePayload.scores[0];
const corePayload = coreJsonPayload(fullPayload);
const coreModel = corePayload.models[0];
const benchmarksPayload = benchmarksJsonPayload(fullPayload);
const benchmarksModel = benchmarksPayload.benchmarks[0];
const fullJsonModel = fullJsonPayload(fullPayload).models[0];
const methodology =
	"INTELLIGENCE and AGENTIC min-max normalize each selected benchmark against observed values, then average them using benchmark importance multiplied by dimension loading and apply validation-weighted evidence coverage. Empirical calibration gives each model one total unit of weight across reasoning-effort variants. An unlabelled benchmark belongs to the model's default highest effort. Missing values use one non-recursive, paired-distribution imputation; sibling-effort context is added only when both benchmark and effort evidence are sufficient, at least four held-out models actually use the cross-effort path, and leave-one-model-out error improves by at least 2% or makes a refused one-dimensional predictor reliable. Each effort direction is calibrated separately. A row without enough sibling-effort evidence falls back to the separately validated one-dimensional predictor, penalty, and confidence. Frontier subtracts 1.0x validated error and baseline subtracts 0.5x; cross-only held-out error determines the confidence of a two-dimensional imputation. Imputed values never satisfy public admission. SPEED logs provider and workflow inputs before min-max normalization, then gives equal weight to provider speed, workflow runtime, and each active benchmark task-time input. Quality-adjusted price, workflow, benchmark time, and benchmark cost subtract the model-excluded expected resource use at comparable quality, average model-balanced percentile and 2.5% one-sided winsorized min-max residual scores, and shrink weakly supported comparisons toward 50. VALUE gives equal weight to winsorized log blended price, quality-adjusted log blended price, quality-adjusted workflow price efficiency, and each active quality-adjusted benchmark task-cost input.";

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

assert.equal(compactPayload.deep_swe, undefined);
assert.deepEqual(
	compactPayload.metadata.artificial_analysis.available_benchmark_keys,
	[],
);
assert.deepEqual(compactPayload.metadata.scoring.selected_benchmark_keys, []);
assert.deepEqual(compactPayload.metadata.scoring.benchmark_portfolio, {
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
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
assert.equal("reasoning_effort" in (fullJsonModel ?? {}), false);
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
