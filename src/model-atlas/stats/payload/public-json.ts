/** Build stable public JSON views for the Model Atlas stats endpoints. */

import { strongestModelVariants } from "../../pipeline/selection/public-list";
import type { ModelAtlasModel, ModelAtlasPayload } from "../types";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "percentage";
const BENCHMARK_SCALE = "decimal";

export type ModelAtlasJsonView =
	| "score"
	| "core"
	| "benchmarks"
	| "all"
	| "full"
	| "dashboard";

type PublicJsonPayload =
	| ScoreJsonPayload
	| CoreJsonPayload
	| BenchmarksJsonPayload
	| FullJsonPayload
	| ModelAtlasPayload;

type CoreJsonPayload = {
	schema: typeof CORE_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	score_scale: typeof SCORE_SCALE;
	methodology: string;
	columns: string[];
	models: CoreJsonModel[];
};

export type FullJsonPayload = Omit<ModelAtlasPayload, "models"> & {
	models: PublicFullJsonModel[];
};

type PublicFullJsonModel = Omit<
	ModelAtlasModel,
	"reasoning" | "logo" | "confidence"
>;

type ScoreJsonPayload = {
	schema: typeof SCORE_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	score_scale: typeof SCORE_SCALE;
	methodology: string;
	scores: ScoreJsonModel[];
};

type ScoreJsonModel = {
	rank: number;
	id: string | null;
	name: string | null;
	provider: string | null;
	score: {
		intelligence: number;
		agentic: number;
		speed: number | null;
		value: number | null;
	};
};

type BenchmarksJsonPayload = {
	schema: typeof BENCHMARKS_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	benchmark_scale: typeof BENCHMARK_SCALE;
	methodology: string;
	benchmarks: BenchmarksJsonModel[];
};

type BenchmarksJsonModel = {
	rank: number;
	id: string | null;
	name: string | null;
	provider: string | null;
	benchmarks: Record<string, number | null>;
};

type CoreJsonModel = {
	rank: number;
	id: string | null;
	name: string | null;
	provider: string | null;
	release_date: string | null;
	input_modalities: string[];
	output_modalities: string[];
	open_weights: boolean | null;
	intelligence_score: number;
	agentic_score: number;
	speed_score: number | null;
	value_score: number | null;
	blended_price: number | null;
	context_window_tokens: number | null;
	input_cost_per_million_tokens: number | null;
	output_cost_per_million_tokens: number | null;
	cache_read_cost_per_million_tokens: number | null;
	throughput_tokens_per_second_median: number | null;
	latency_seconds_median: number | null;
	e2e_latency_seconds_median: number | null;
};

const CORE_MODEL_COLUMNS = [
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
	"blended_price",
	"context_window_tokens",
	"input_cost_per_million_tokens",
	"output_cost_per_million_tokens",
	"cache_read_cost_per_million_tokens",
	"throughput_tokens_per_second_median",
	"latency_seconds_median",
	"e2e_latency_seconds_median",
] as const;

type RankedModel = {
	model: ModelAtlasModel;
	rank: number;
};

/** Keep the default public endpoint loader-friendly; callers opt into heavier table, benchmark, or full views explicitly. */
export function publicJsonPayload(
	payload: ModelAtlasPayload,
	view: string | null,
): PublicJsonPayload {
	switch (view) {
		case "dashboard":
			return payload;
		case "all":
		case "full":
			return fullJsonPayload(payload);
		case "core":
			return coreJsonPayload(payload);
		case "benchmarks":
			return benchmarksJsonPayload(payload);
		default:
			return scoreJsonPayload(payload);
	}
}

/** The core view is the compact table contract: stable scalar columns without dashboard-only decoration. */
export function coreJsonPayload(payload: ModelAtlasPayload): CoreJsonPayload {
	const rankedModels = rankModelsByIntelligence(
		strongestModelVariants(payload.models),
	);
	return {
		schema: CORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(),
		columns: [...CORE_MODEL_COLUMNS],
		models: rankedModels.map(({ model, rank }) => coreJsonModel(model, rank)),
	};
}

/** The score view is the default public ranking surface and exposes only Atlas 0-100 score fields. */
export function scoreJsonPayload(payload: ModelAtlasPayload): ScoreJsonPayload {
	const rankedModels = rankModelsByIntelligence(
		strongestModelVariants(payload.models),
	);
	return {
		schema: SCORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(),
		scores: rankedModels.map(({ model, rank }) => scoreJsonModel(model, rank)),
	};
}

/** Benchmark rows stay in their native decimal scale so downstream users can distinguish raw task scores from Atlas scores. */
export function benchmarksJsonPayload(
	payload: ModelAtlasPayload,
): BenchmarksJsonPayload {
	const rankedModels = rankModelsByIntelligence(
		strongestModelVariants(payload.models),
	);
	return {
		schema: BENCHMARKS_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		benchmark_scale: BENCHMARK_SCALE,
		methodology: methodologyText(),
		benchmarks: rankedModels.map(({ model, rank }) =>
			benchmarksJsonModel(model, rank),
		),
	};
}

/** Preserve every scored variant for power users while removing fields that only make sense in the rendered dashboard. */
export function fullJsonPayload(payload: ModelAtlasPayload): FullJsonPayload {
	return {
		...payload,
		models: payload.models.map(
			({
				confidence: _confidence,
				logo: _logo,
				reasoning: _reasoning,
				...model
			}) => model,
		),
	};
}

function methodologyText(): string {
	return "Model Atlas reports INTELLIGENCE, AGENTIC, SPEED, and VALUE independently and ranks compact public views by INTELLIGENCE. Compact views represent each base model with its highest-INTELLIGENCE scored variant; the all view preserves every scored effort variant. INTELLIGENCE and AGENTIC min-max normalize each selected benchmark against observed values, then average them using benchmark importance multiplied by dimension loading and apply confidence from validation-weighted evidence mass. Each dimension derives its confidence thresholds from the selected portfolio: zero confidence through 10% of total effective weight and full confidence from 60%. Empirical calibration gives each model one total unit of weight across reasoning-effort variants. An unlabelled observation is the source-default variant; when every observation is labelled, source-default selection chooses the highest reported effort. Explicitly labelled observations remain attached to their exact efforts. Missing values use one non-recursive, paired-distribution imputation; sibling-effort context is added only when both benchmark and effort evidence are sufficient, at least four held-out models actually use the cross-effort path, and leave-one-model-out error improves by at least 2% or makes a refused one-dimensional predictor reliable. Each effort direction is calibrated separately. A row without enough sibling-effort evidence falls back to the separately validated one-dimensional predictor, penalty, and confidence. Frontier subtracts 1.0x validated error and baseline subtracts 0.5x; cross-only held-out error determines the confidence of a two-dimensional imputation. APEX Agents first uses a validated exact-model-and-effort Mercor Loop Pass@1 crosswalk when AA is missing. Imputed values never satisfy public admission. SPEED logs provider and workflow inputs before min-max normalization, then gives equal weight to provider speed, workflow runtime, and each active benchmark task-time input. Aggregate price and workflow neighborhoods use the linear mean of the public INTELLIGENCE and AGENTIC scores; benchmark time and cost neighborhoods use each benchmark's declared quality coordinate. Logit coordinates are reserved for probability-like completion rates, while linear coordinates preserve native or composite metric spacing. Quality-adjusted price, workflow, benchmark time, and benchmark cost subtract the model-excluded expected resource use at comparable quality, average model-balanced percentile and 2.5% one-sided winsorized min-max residual scores, and shrink weakly supported comparisons toward 50. VALUE gives equal weight to winsorized log blended price, quality-adjusted log blended price, quality-adjusted workflow price efficiency, and each active quality-adjusted benchmark task-cost input.";
}

/** Use competition ranking semantics: tied intelligence scores share a rank and leave the next ordinal gap. */
function rankModelsByIntelligence(models: ModelAtlasModel[]): RankedModel[] {
	const rankedModels: RankedModel[] = [];
	let previousScore: number | null = null;
	let previousRank = 0;
	for (const [index, model] of models.entries()) {
		const score = model.scores.intelligence_score;
		const rank = score === previousScore ? previousRank : index + 1;
		rankedModels.push({ model, rank });
		previousScore = score;
		previousRank = rank;
	}
	return rankedModels;
}

function scoreJsonModel(model: ModelAtlasModel, rank: number): ScoreJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		score: {
			intelligence: model.scores.intelligence_score,
			agentic: model.scores.agentic_score,
			speed: model.scores.speed_score,
			value: model.scores.value_score,
		},
	};
}

function benchmarksJsonModel(
	model: ModelAtlasModel,
	rank: number,
): BenchmarksJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		benchmarks: Object.fromEntries(
			Object.entries(model.benchmarks ?? {}).map(([key, value]) => [
				key,
				value ?? null,
			]),
		),
	};
}

function coreJsonModel(model: ModelAtlasModel, rank: number): CoreJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		release_date: model.release_date,
		input_modalities: [...(model.modalities?.input ?? [])],
		output_modalities: [...(model.modalities?.output ?? [])],
		open_weights: model.open_weights,
		intelligence_score: model.scores.intelligence_score,
		agentic_score: model.scores.agentic_score,
		speed_score: model.scores.speed_score,
		value_score: model.scores.value_score,
		blended_price: model.cost?.blended_price ?? null,
		context_window_tokens: model.context_window?.context ?? null,
		input_cost_per_million_tokens: model.cost?.input ?? null,
		output_cost_per_million_tokens: model.cost?.output ?? null,
		cache_read_cost_per_million_tokens: model.cost?.cache_read ?? null,
		throughput_tokens_per_second_median:
			model.speed.throughput_tokens_per_second_median,
		latency_seconds_median: model.speed.latency_seconds_median,
		e2e_latency_seconds_median: model.speed.e2e_latency_seconds_median,
	};
}
