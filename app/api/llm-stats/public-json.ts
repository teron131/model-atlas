/** Build stable public JSON views for the Model Atlas stats endpoints. */

import type {
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";

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
	models: Array<Omit<LlmStatsModel, "attachment" | "reasoning" | "logo">>;
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
		overall: number;
		intelligence: number;
		agentic: number;
		speed: number | null;
		value: number | null;
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
	overall_score: number;
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

const coreColumnKeys = [
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
] as const;

/** Select the public JSON projection requested by an API view parameter. */
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

/** Return the compact table-oriented public JSON projection. */
export function coreJsonPayload(payload: LlmStatsPayload): CoreJsonPayload {
	const ranks = intelligenceRanks(payload.models);
	return {
		schema: CORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(payload),
		columns: [...coreColumnKeys],
		models: payload.models.map((model, index) =>
			coreJsonModel(model, ranks[index] ?? index + 1),
		),
	};
}

/** Return the public ranking and relative score projection. */
export function scoreJsonPayload(payload: LlmStatsPayload): ScoreJsonPayload {
	const ranks = intelligenceRanks(payload.models);
	return {
		schema: SCORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(payload),
		scores: payload.models.map((model, index) =>
			scoreJsonModel(model, ranks[index] ?? index + 1),
		),
	};
}

/** Return public benchmark values for each model. */
export function benchmarksJsonPayload(
	payload: LlmStatsPayload,
): BenchmarksJsonPayload {
	const ranks = intelligenceRanks(payload.models);
	return {
		schema: BENCHMARKS_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		benchmark_scale: BENCHMARK_SCALE,
		methodology: methodologyText(payload),
		benchmarks: payload.models.map((model, index) =>
			benchmarksJsonModel(model, ranks[index] ?? index + 1),
		),
	};
}

/** Return the full public payload without dashboard-only model fields. */
export function fullJsonPayload(payload: LlmStatsPayload): FullJsonPayload {
	return {
		...payload,
		models: payload.models.map(withoutUnusedModelFields),
	};
}

/** Summarize the score methodology in endpoint payloads. */
function methodologyText(payload: LlmStatsPayload): string {
	const weights = payload.metadata.scoring.overall_relative_score_weights;
	return `Overall score is ${formatMethodologyWeight(weights.intelligence)} Intelligence, ${formatMethodologyWeight(weights.agentic)} Agentic, ${formatMethodologyWeight(weights.speed)} Speed, and ${formatMethodologyWeight(weights.value)} Value. Intelligence and Agentic blend normalized upstream indexes with linearly normalized baseline/frontier benchmark scores; Speed and Value use percentile-ranked, use-case-weighted latency, throughput, cost, and resource-efficiency signals. Higher is better.`;
}

/** Format a fractional score weight as a percentage label. */
function formatMethodologyWeight(weight: number): string {
	const percent = Number((weight * 100).toFixed(2));
	return `${percent}%`;
}

/** Return competition ranks for models already sorted by intelligence score. */
function intelligenceRanks(models: LlmStatsModel[]): number[] {
	const ranks: number[] = [];
	let previousScore: number | null = null;
	let previousRank = 0;
	for (const [index, model] of models.entries()) {
		const score = model.relative_scores.intelligence_score;
		const rank = score === previousScore ? previousRank : index + 1;
		ranks.push(rank);
		previousScore = score;
		previousRank = rank;
	}
	return ranks;
}

/** Strip internal rendering fields from the full public model projection. */
function withoutUnusedModelFields(
	model: LlmStatsModel,
): Omit<LlmStatsModel, "attachment" | "reasoning" | "logo"> {
	const {
		attachment: _attachment,
		logo: _logo,
		reasoning: _reasoning,
		...modelPayload
	} = model;
	return modelPayload;
}

/** Convert one stats model into the public score row shape. */
function scoreJsonModel(model: LlmStatsModel, rank: number): ScoreJsonModel {
	return {
		rank,
		id: model.id,
		name: model.name,
		provider: model.provider,
		score: {
			overall: model.relative_scores.overall_score,
			intelligence: model.relative_scores.intelligence_score,
			agentic: model.relative_scores.agentic_score,
			speed: model.relative_scores.speed_score,
			value: model.relative_scores.value_score,
		},
	};
}

/** Convert one stats model into the public benchmark row shape. */
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

/** Convert one stats model into the public core table row shape. */
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
		overall_score: model.relative_scores.overall_score,
		intelligence_score: model.relative_scores.intelligence_score,
		agentic_score: model.relative_scores.agentic_score,
		speed_score: model.relative_scores.speed_score,
		value_score: model.relative_scores.value_score,
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
