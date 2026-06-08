import type {
	ModelStatsSelectedModel,
	ModelStatsSelectedPayload,
} from "../src/model-atlas/llm/llm-stats/types";

export function minimalSelectedPayload({
	fetchedAt,
	models = [],
}: {
	fetchedAt: number;
	models?: ModelStatsSelectedModel[];
}): ModelStatsSelectedPayload {
	return {
		fetched_at_epoch_seconds: fetchedAt,
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
				price_profiles: {},
				simulation_profiles: {},
				simulation_input_token_seconds: 0,
				quality_score_weights: {
					index: 0,
					selected_benchmarks: 0,
				},
				overall_relative_score_weights: {
					intelligence: 0,
					agentic: 0,
					speed: 0,
					value: 0,
				},
				column_tooltips: {},
			},
		},
		models,
	};
}

export function minimalSelectedModel({
	id,
	name,
}: {
	id: string;
	name: string;
}): ModelStatsSelectedModel {
	return {
		id,
		name,
		provider: null,
		logo: "",
		attachment: null,
		reasoning: null,
		release_date: null,
		modalities: null,
		open_weights: null,
		cost: null,
		context_window: null,
		speed: {
			throughput_tokens_per_second_median: null,
			latency_seconds_median: null,
			e2e_latency_seconds_median: null,
		},
		intelligence: null,
		intelligence_index_cost: null,
		task_metrics: null,
		evaluations: null,
		scores: {
			intelligence_score: 0,
			agentic_score: 0,
			speed_score: 0,
			value_score: null,
		},
		relative_scores: {
			intelligence_score: 0,
			agentic_score: 0,
			speed_score: 0,
			value_score: null,
			overall_score: 0,
		},
	};
}
