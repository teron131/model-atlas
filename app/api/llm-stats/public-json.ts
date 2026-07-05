/** Build stable public JSON views for the Model Atlas stats endpoints. */

import type {
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/stats/types";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "percentage";
const BENCHMARK_SCALE = "decimal";

export type LlmStatsJsonView = "score" | "core" | "benchmarks" | "all" | "full";

export type PublicJsonPayload =
	| ScoreJsonPayload
	| CoreJsonPayload
	| BenchmarksJsonPayload
	| FullJsonPayload;

export type CoreJsonPayload = {
	schema: typeof CORE_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	score_scale: typeof SCORE_SCALE;
	methodology: string;
	columns: string[];
	models: CoreJsonModel[];
};

export type FullJsonPayload = Omit<LlmStatsPayload, "models"> & {
	models: PublicFullJsonModel[];
};

type PublicRelativeScores = Omit<
	LlmStatsModel["relative_scores"],
	"price_score"
>;

type PublicFullJsonModel = Omit<
	LlmStatsModel,
	"attachment" | "reasoning" | "logo" | "relative_scores"
> & {
	relative_scores: PublicRelativeScores;
};

export type ScoreJsonPayload = {
	schema: typeof SCORE_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	score_scale: typeof SCORE_SCALE;
	methodology: string;
	scores: ScoreJsonModel[];
};

export type ScoreJsonModel = {
	rank: number;
	id: string | null;
	name: string | null;
	provider: string | null;
	score: {
		intelligence: number;
		agentic: number;
		speed: number | null;
		time_efficiency: number | null;
		cost_efficiency: number | null;
		overall: number;
	};
};

export type BenchmarksJsonPayload = {
	schema: typeof BENCHMARKS_SCHEMA;
	fetched_at_epoch_seconds: number | null;
	benchmark_scale: typeof BENCHMARK_SCALE;
	methodology: string;
	benchmarks: BenchmarksJsonModel[];
};

export type BenchmarksJsonModel = {
	rank: number;
	id: string | null;
	name: string | null;
	provider: string | null;
	benchmarks: Record<string, number | null>;
};

export type CoreJsonModel = {
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
	time_efficiency_score: number | null;
	cost_efficiency_score: number | null;
	overall_score: number;
	blended_price: number | null;
	context_window_tokens: number | null;
	input_cost_per_million_tokens: number | null;
	output_cost_per_million_tokens: number | null;
	cache_read_cost_per_million_tokens: number | null;
	throughput_tokens_per_second_median: number | null;
	latency_seconds_median: number | null;
	e2e_latency_seconds_median: number | null;
};

const coreColumnKeys = [
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
	"time_efficiency_score",
	"cost_efficiency_score",
	"overall_score",
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
	model: LlmStatsModel;
	rank: number;
};

/** Keep the default public endpoint loader-friendly; callers opt into heavier table, benchmark, or full views explicitly. */
export function publicJsonPayload(
	payload: LlmStatsPayload,
	view: string | null,
): PublicJsonPayload {
	switch (view) {
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
export function coreJsonPayload(payload: LlmStatsPayload): CoreJsonPayload {
	const rankedModels = rankModelsByIntelligence(payload.models);
	return {
		schema: CORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(),
		columns: [...coreColumnKeys],
		models: rankedModels.map(({ model, rank }) => coreJsonModel(model, rank)),
	};
}

/** The score view is the default public ranking surface and exposes only relative 0-100 score components. */
export function scoreJsonPayload(payload: LlmStatsPayload): ScoreJsonPayload {
	const rankedModels = rankModelsByIntelligence(payload.models);
	return {
		schema: SCORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(),
		scores: rankedModels.map(({ model, rank }) => scoreJsonModel(model, rank)),
	};
}

/** Benchmark rows stay in their native decimal scale so downstream users can distinguish raw task scores from Atlas-relative scores. */
export function benchmarksJsonPayload(
	payload: LlmStatsPayload,
): BenchmarksJsonPayload {
	const rankedModels = rankModelsByIntelligence(payload.models);
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

/** Preserve the internal payload shape for power users while removing fields that only make sense in the rendered dashboard. */
export function fullJsonPayload(payload: LlmStatsPayload): FullJsonPayload {
	return {
		...payload,
		models: payload.models.map(withoutUnusedModelFields),
	};
}

function methodologyText(): string {
	return "Intelligence and Agentic blend normalized upstream indexes with linearly normalized baseline/frontier benchmark scores. Speed blends raw provider speed stats and workflow simulation: higher throughput ranks higher, while lower latency and workflow seconds rank higher. Time efficiency measures benchmark task-time value against similarly scoring models; when explicit runtime is missing, served throughput estimates task time from output tokens. Cost efficiency measures benchmark task-cost value against similarly scoring models; higher means better resource value at comparable benchmark quality.";
}

/** Use competition ranking semantics: tied intelligence scores share a rank and leave the next ordinal gap. */
function rankModelsByIntelligence(models: LlmStatsModel[]): RankedModel[] {
	const rankedModels: RankedModel[] = [];
	let previousScore: number | null = null;
	let previousRank = 0;
	for (const [index, model] of models.entries()) {
		const score = model.relative_scores.intelligence_score;
		const rank = score === previousScore ? previousRank : index + 1;
		rankedModels.push({ model, rank });
		previousScore = score;
		previousRank = rank;
	}
	return rankedModels;
}

function withoutUnusedModelFields(model: LlmStatsModel): PublicFullJsonModel {
	const {
		attachment: _attachment,
		logo: _logo,
		relative_scores: relativeScores,
		reasoning: _reasoning,
		...modelPayload
	} = model;
	const { price_score: _priceScore, ...publicRelativeScores } = relativeScores;
	return {
		...modelPayload,
		relative_scores: publicRelativeScores,
	};
}

function scoreJsonModel(model: LlmStatsModel, rank: number): ScoreJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		score: {
			intelligence: model.relative_scores.intelligence_score,
			agentic: model.relative_scores.agentic_score,
			speed: model.relative_scores.speed_score,
			time_efficiency: model.relative_scores.time_efficiency_score,
			cost_efficiency: model.relative_scores.cost_efficiency_score,
			overall: model.relative_scores.overall_score,
		},
	};
}

function benchmarksJsonModel(
	model: LlmStatsModel,
	rank: number,
): BenchmarksJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		benchmarks: Object.fromEntries(
			Object.entries(model.evaluations ?? {}).map(([key, value]) => [
				key,
				value ?? null,
			]),
		),
	};
}

function coreJsonModel(model: LlmStatsModel, rank: number): CoreJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		release_date: model.release_date,
		input_modalities: [...(model.modalities?.input ?? [])],
		output_modalities: [...(model.modalities?.output ?? [])],
		open_weights: model.open_weights,
		intelligence_score: model.relative_scores.intelligence_score,
		agentic_score: model.relative_scores.agentic_score,
		speed_score: model.relative_scores.speed_score,
		time_efficiency_score: model.relative_scores.time_efficiency_score,
		cost_efficiency_score: model.relative_scores.cost_efficiency_score,
		overall_score: model.relative_scores.overall_score,
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
