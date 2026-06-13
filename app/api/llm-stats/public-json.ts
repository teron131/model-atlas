import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/constants";
import type {
	LlmStatsColumnTooltips,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";

const leanDashboardTooltipKeys = [
	"overall",
	"intelligence",
	"agentic",
	"speed",
	"value",
	"blend",
	"context",
] as const;

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
	models: Array<Omit<LlmStatsModel, "attachment" | "reasoning">>;
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

export function coreJsonPayload(payload: LlmStatsPayload): CoreJsonPayload {
	return {
		schema: CORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(payload),
		columns: [...coreColumnKeys],
		models: payload.models.map((model, index) => coreJsonModel(model, index)),
	};
}

export function scoreJsonPayload(payload: LlmStatsPayload): ScoreJsonPayload {
	return {
		schema: SCORE_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		score_scale: SCORE_SCALE,
		methodology: methodologyText(payload),
		scores: payload.models.map((model, index) => scoreJsonModel(model, index)),
	};
}

export function benchmarksJsonPayload(
	payload: LlmStatsPayload,
): BenchmarksJsonPayload {
	return {
		schema: BENCHMARKS_SCHEMA,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		benchmark_scale: BENCHMARK_SCALE,
		methodology: methodologyText(payload),
		benchmarks: payload.models.map((model, index) =>
			benchmarksJsonModel(model, index),
		),
	};
}

export function fullJsonPayload(payload: LlmStatsPayload): FullJsonPayload {
	return {
		...payload,
		models: payload.models.map(withoutUnusedModelFields),
	};
}

export function leanDashboardPayload(
	payload: LlmStatsPayload,
): LlmStatsPayload {
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		metadata: {
			artificial_analysis: {
				available_benchmark_keys: [],
				available_evaluation_keys: [],
				available_intelligence_keys: [],
			},
			scoring: {
				intelligence_benchmark_keys: [],
				intelligence_benchmark_display_keys: [],
				missing_intelligence_benchmark_keys: [],
				agentic_benchmark_keys: [],
				agentic_benchmark_display_keys: [],
				missing_agentic_benchmark_keys: [],
				selected_benchmark_keys: [],
				benchmark_portfolio: {},
				price_profiles: {},
				simulation_profiles: {},
				simulation_input_token_seconds:
					payload.metadata.scoring.simulation_input_token_seconds,
				quality_score_weights: {
					...payload.metadata.scoring.quality_score_weights,
				},
				overall_relative_score_weights: {
					...payload.metadata.scoring.overall_relative_score_weights,
				},
				column_tooltips: leanDashboardColumnTooltips(
					payload.metadata.scoring.column_tooltips,
				),
			},
		},
		models: payload.models.map(leanDashboardModel),
	};
}

function methodologyText(payload: LlmStatsPayload): string {
	const weights = payload.metadata.scoring.overall_relative_score_weights;
	return `Overall score is ${formatMethodologyWeight(weights.intelligence)} Intelligence, ${formatMethodologyWeight(weights.agentic)} Agentic, ${formatMethodologyWeight(weights.speed)} Speed, and ${formatMethodologyWeight(weights.value)} Value. Intelligence and Agentic blend normalized upstream indexes with linearly normalized baseline/frontier benchmark scores; Speed and Value use percentile-ranked, use-case-weighted latency, throughput, cost, and resource-efficiency signals. Higher is better.`;
}

function formatMethodologyWeight(weight: number): string {
	const percent = Number((weight * 100).toFixed(2));
	return `${percent}%`;
}

function withoutUnusedModelFields(
	model: LlmStatsModel,
): Omit<LlmStatsModel, "attachment" | "reasoning"> {
	const {
		attachment: _attachment,
		reasoning: _reasoning,
		...modelPayload
	} = model;
	return modelPayload;
}

function scoreJsonModel(model: LlmStatsModel, index: number): ScoreJsonModel {
	return {
		rank: index + 1,
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

function benchmarksJsonModel(
	model: LlmStatsModel,
	index: number,
): BenchmarksJsonModel {
	return {
		rank: index + 1,
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

function coreJsonModel(model: LlmStatsModel, index: number): CoreJsonModel {
	return {
		rank: index + 1,
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

function leanDashboardColumnTooltips(
	columnTooltips: LlmStatsColumnTooltips,
): LlmStatsColumnTooltips {
	return Object.fromEntries(
		leanDashboardTooltipKeys.flatMap((key) => {
			const tooltip = columnTooltips[key] ?? COLUMN_TOOLTIPS[key];
			return tooltip == null ? [] : [[key, tooltip]];
		}),
	);
}

function leanDashboardModel(model: LlmStatsModel): LlmStatsModel {
	return {
		id: model.id,
		name: model.name,
		provider: model.provider,
		logo: "",
		release_date: model.release_date,
		modalities: copyModalities(model.modalities),
		open_weights: model.open_weights,
		cost: leanDashboardCost(model.cost),
		context_window:
			model.context_window == null ? null : { ...model.context_window },
		speed: { ...model.speed },
		intelligence: leanDashboardIntelligence(model.intelligence),
		intelligence_index_cost: null,
		task_metrics: null,
		evaluations: null,
		scores: { ...model.scores },
		relative_scores: { ...model.relative_scores },
	} as LlmStatsModel;
}

function copyModalities(
	modalities: LlmStatsModel["modalities"],
): LlmStatsModel["modalities"] {
	if (modalities == null) {
		return null;
	}
	return {
		...(modalities.input == null ? {} : { input: [...modalities.input] }),
		...(modalities.output == null ? {} : { output: [...modalities.output] }),
	};
}

function leanDashboardCost(cost: LlmStatsModel["cost"]): LlmStatsModel["cost"] {
	if (cost == null) {
		return null;
	}
	return {
		...(cost.input == null ? {} : { input: cost.input }),
		...(cost.output == null ? {} : { output: cost.output }),
		...(cost.cache_read == null ? {} : { cache_read: cost.cache_read }),
		...(cost.cache_write == null ? {} : { cache_write: cost.cache_write }),
		...(cost.blended_price == null
			? {}
			: { blended_price: cost.blended_price }),
	};
}

function leanDashboardIntelligence(
	intelligence: LlmStatsModel["intelligence"],
): LlmStatsModel["intelligence"] {
	if (intelligence == null) {
		return null;
	}
	return {
		...(intelligence.intelligence_index == null
			? {}
			: { intelligence_index: intelligence.intelligence_index }),
		...(intelligence.agentic_index == null
			? {}
			: { agentic_index: intelligence.agentic_index }),
	};
}
