/** Shared factories keep tests aligned with Model Atlas payload contracts. */

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkObservationRowsKey,
} from "../src/model-atlas/benchmarks/registry";
import { CONFIDENCE } from "../src/model-atlas/config/stage";
import { SNAPSHOT_PRESERVATION_VERSION } from "../src/model-atlas/stats/payload/snapshot-preservation";
import type {
	ModelAtlasModel,
	ModelAtlasPayload,
} from "../src/model-atlas/stats/types";

/** Build every generic benchmark row group, defaulting unspecified sources to empty. */
export function benchmarkObservationRowGroups<Row>(
	overrides: Partial<Record<BenchmarkObservationRowsKey, Row[]>> = {},
): Record<BenchmarkObservationRowsKey, Row[]> {
	return Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map(({ sourceRowsKey }) => [
			sourceRowsKey,
			overrides[sourceRowsKey] ?? [],
		]),
	) as Record<BenchmarkObservationRowsKey, Row[]>;
}

export function minimalModelAtlasPayload({
	fetchedAt,
	models = [],
}: {
	fetchedAt: number;
	models?: ModelAtlasModel[];
}): ModelAtlasPayload {
	return {
		fetched_at_epoch_seconds: fetchedAt,
		metadata: {
			artificial_analysis: {
				available_benchmark_keys: [],
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
				confidence: CONFIDENCE,
				price_profiles: {},
				simulation_profiles: {},
				seconds_per_input_token: 0,
				column_tooltips: {},
				snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
			},
		},
		models,
	};
}

export function minimalModelAtlasModel({
	id,
	name,
}: {
	id: string;
	name: string;
}): ModelAtlasModel {
	return {
		id,
		name,
		provider: null,
		logo: "",
		reasoning: null,
		reasoning_effort: null,
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
		benchmarks: null,
		confidence: {
			intelligence: 1,
			agentic: 1,
		},
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
		},
	};
}
