/** Public model and payload contracts for the Model Atlas stats surface. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import type { DeepSWELeaderboardRow } from "../benchmarks/scrapers/deep-swe";
import type { LlmStatsColumnTooltips } from "../config/tooltips";
import type {
	PriceProfiles,
	SimulationProfiles,
} from "../config/usage-profiles";
import type { LlmStatsSourceHealth } from "../ingest/types";
import type { LlmStatsModel as PipelineLlmStatsModel } from "../pipeline/model-types";

export type {
	BenchmarkGroup,
	BenchmarkPortfolio,
	BenchmarkPortfolioEntry,
	BenchmarkResourcePolicy,
} from "../benchmarks/factory";
export type {
	LlmStatsSourceHealth,
	LlmStatsSourceHealthEntry,
	LlmStatsSourceHealthStatus,
} from "../ingest/types";
export type {
	LlmStatsBenchmarkValues,
	LlmStatsComponentScores,
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsCostBreakdown,
	LlmStatsCostTier,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsIntelligenceIndexCost,
	LlmStatsModalities,
	LlmStatsModel,
	LlmStatsModelCandidate,
	LlmStatsNullableComponentScores,
	LlmStatsNullableScores,
	LlmStatsScoredCandidate,
	LlmStatsScores,
	LlmStatsScoringSources,
	LlmStatsSpeed,
	LlmStatsTaskMetrics,
	LlmStatsTaskMetricValues,
} from "../pipeline/model-types";

type LlmStatsBenchmarkUpdateStatus =
	| "current"
	| "watch"
	| "stale_possible"
	| "missing";

export type LlmStatsBenchmarkUpdateEntry = {
	status: LlmStatsBenchmarkUpdateStatus;
	observed_count: number;
	checked_top_count: number;
	reference_top_count: number;
	overlap_count: number;
	overlap_model_ids: string[];
	top_model_ids: string[];
	checked_model_ids: string[];
	top_model_labels: string[];
	unrepresented_top_model_labels: string[];
	top_model_reference_rank: number | null;
	reference_metric: "intelligence_score";
};

export type LlmStatsBenchmarkUpdateHealth = Record<
	string,
	LlmStatsBenchmarkUpdateEntry
>;

export type LlmStatsMetadata = {
	artificial_analysis: {
		available_benchmark_keys: string[];
		available_evaluation_keys: string[];
		available_intelligence_keys: string[];
	};
	source_health?: LlmStatsSourceHealth;
	benchmark_update_health?: LlmStatsBenchmarkUpdateHealth;
	scoring: {
		intelligence_benchmark_keys: string[];
		intelligence_benchmark_display_keys: string[];
		missing_intelligence_benchmark_keys: string[];
		agentic_benchmark_keys: string[];
		agentic_benchmark_display_keys: string[];
		missing_agentic_benchmark_keys: string[];
		selected_benchmark_keys: string[];
		benchmark_portfolio: BenchmarkPortfolio;
		price_profiles: PriceProfiles;
		simulation_profiles: SimulationProfiles;
		seconds_per_input_token: number;
		column_tooltips: LlmStatsColumnTooltips;
		snapshot_preservation_version: number;
	};
};

export type LlmStatsPayload = {
	fetched_at_epoch_seconds: number | null;
	metadata: LlmStatsMetadata;
	deep_swe?: {
		rows: DeepSWELeaderboardRow[];
	};
	models: PipelineLlmStatsModel[];
};

export type LlmStatsOptions = {
	id?: string | null;
};
