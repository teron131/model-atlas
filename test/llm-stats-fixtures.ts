import { SNAPSHOT_PRESERVATION_VERSION } from "../src/model-atlas/stats/snapshot-preservation";
import type {
	LlmStatsModel,
	LlmStatsPayload,
} from "../src/model-atlas/stats/types";

export function minimalLlmStatsPayload({
	fetchedAt,
	models = [],
}: {
	fetchedAt: number;
	models?: LlmStatsModel[];
}): LlmStatsPayload {
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
				benchmark_portfolio: {},
				price_profiles: {},
				simulation_profiles: {},
				simulation_input_token_seconds: 0,
				overall_score_weights: {
					intelligence: 0,
					agentic: 0,
					speed: 0,
					value: 0,
				},
				column_tooltips: {},
				snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
			},
		},
		models,
	};
}

export function minimalLlmStatsModel({
	id,
	name,
}: {
	id: string;
	name: string;
}): LlmStatsModel {
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
		component_scores: {
			intelligence_score: 0,
			agentic_score: 0,
			speed_score: 0,
		},
		scores: {
			intelligence_score: 0,
			agentic_score: 0,
			speed_score: 0,
			value_score: null,
			overall_score: 0,
		},
	};
}
