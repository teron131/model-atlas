/** Build the compact initial payload used by the dashboard route. */

import { COLUMN_TOOLTIPS } from "../../src/model-atlas/constants";
import type {
	BenchmarkPortfolio,
	LlmStatsColumnTooltips,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../src/model-atlas/stats/types";

const leanDashboardTooltipKeys = [
	"overall",
	"intelligence",
	"agentic",
	"speed",
	"value",
	"blend",
	"context",
] as const;

export function leanDashboardPayload(
	payload: LlmStatsPayload,
): LlmStatsPayload {
	const frontierBenchmarkPortfolio = leanDashboardBenchmarkPortfolio(
		payload.metadata.scoring.benchmark_portfolio,
	);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		metadata: {
			artificial_analysis: {
				available_benchmark_keys: [],
				available_evaluation_keys: [],
				available_intelligence_keys: [],
			},
			...(payload.metadata.source_health == null
				? {}
				: { source_health: payload.metadata.source_health }),
			...(payload.metadata.benchmark_update_health == null
				? {}
				: {
						benchmark_update_health: payload.metadata.benchmark_update_health,
					}),
			scoring: {
				intelligence_benchmark_keys: [],
				intelligence_benchmark_display_keys: [],
				missing_intelligence_benchmark_keys: [],
				agentic_benchmark_keys: [],
				agentic_benchmark_display_keys: [],
				missing_agentic_benchmark_keys: [],
				selected_benchmark_keys: [],
				benchmark_portfolio: frontierBenchmarkPortfolio,
				price_profiles: {},
				simulation_profiles: {},
				simulation_input_token_seconds:
					payload.metadata.scoring.simulation_input_token_seconds,
				overall_score_weights: {
					...payload.metadata.scoring.overall_score_weights,
				},
				column_tooltips: leanDashboardColumnTooltips(
					payload.metadata.scoring.column_tooltips,
				),
				snapshot_preservation_version:
					payload.metadata.scoring.snapshot_preservation_version,
			},
		},
		models: payload.models.map((model) =>
			leanDashboardModel(model, frontierBenchmarkPortfolio),
		),
	};
}

function leanDashboardBenchmarkPortfolio(
	benchmarkPortfolio: BenchmarkPortfolio,
): BenchmarkPortfolio {
	return Object.fromEntries(
		Object.entries(benchmarkPortfolio).filter(
			([, entry]) => entry.group === "frontier",
		),
	);
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

function leanDashboardModel(
	model: LlmStatsModel,
	benchmarkPortfolio: BenchmarkPortfolio,
): LlmStatsModel {
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
		task_metrics: leanDashboardTaskMetrics(model.task_metrics),
		evaluations: leanDashboardEvaluations(
			model.evaluations,
			benchmarkPortfolio,
		),
		component_scores: { ...model.component_scores },
		scores: { ...model.scores },
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

function leanDashboardTaskMetrics(
	taskMetrics: LlmStatsModel["task_metrics"],
): LlmStatsModel["task_metrics"] {
	if (taskMetrics == null) {
		return null;
	}
	const leanTaskMetrics = Object.fromEntries(
		Object.entries(taskMetrics).map(([key, value]) => [
			key,
			value == null ? null : { ...value },
		]),
	);
	return Object.keys(leanTaskMetrics).length > 0 ? leanTaskMetrics : null;
}

function leanDashboardEvaluations(
	evaluations: LlmStatsModel["evaluations"],
	frontierBenchmarkPortfolio: BenchmarkPortfolio,
): LlmStatsModel["evaluations"] {
	const frontierEvaluations = Object.fromEntries(
		Object.keys(frontierBenchmarkPortfolio).flatMap((key) => {
			const value = evaluations?.[key];
			return value == null ? [] : [[key, value]];
		}),
	);
	return Object.keys(frontierEvaluations).length > 0
		? frontierEvaluations
		: null;
}
