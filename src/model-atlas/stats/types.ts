/** Public model and payload contracts for the Model Atlas stats surface. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import type { Confidence } from "../config/stage";
import type { ModelAtlasColumnTooltips } from "../config/tooltips";
import type { ModelAtlasSourceHealth } from "../ingest/types";
import type { ModelAtlasModel as PipelineModel } from "../pipeline/model-types";

export type {
	BenchmarkGroup,
	BenchmarkPortfolio,
	BenchmarkPortfolioEntry,
	BenchmarkResourcePolicy,
} from "../benchmarks/factory";
export type {
	ModelAtlasSourceHealth,
	ModelAtlasSourceHealthEntry,
	ModelAtlasSourceHealthStatus,
} from "../ingest/types";
export type {
	ModelAtlasBenchmarks,
	ModelAtlasBenchmarkValues,
	ModelAtlasComponentScores,
	ModelAtlasConfidence,
	ModelAtlasContextWindow,
	ModelAtlasCost,
	ModelAtlasCostBreakdown,
	ModelAtlasCostTier,
	ModelAtlasIntelligence,
	ModelAtlasModalities,
	ModelAtlasModel,
	ModelAtlasModelCandidate,
	ModelAtlasNullableComponentScores,
	ModelAtlasNullableScores,
	ModelAtlasScoredCandidate,
	ModelAtlasScores,
	ModelAtlasScoringSources,
	ModelAtlasSpeed,
	ModelAtlasTaskMetrics,
	ModelAtlasTaskMetricValues,
} from "../pipeline/model-types";

type ModelAtlasBenchmarkUpdateStatus =
	| "current"
	| "watch"
	| "stale_possible"
	| "missing";

export type ModelAtlasBenchmarkUpdateEntry = {
	status: ModelAtlasBenchmarkUpdateStatus;
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

export type ModelAtlasBenchmarkUpdateHealth = Record<
	string,
	ModelAtlasBenchmarkUpdateEntry
>;

export type ModelAtlasMetadata = {
	available_metrics: {
		benchmark_keys: string[];
	};
	source_health?: ModelAtlasSourceHealth;
	benchmark_update_health?: ModelAtlasBenchmarkUpdateHealth;
	scoring: {
		intelligence_benchmark_keys: string[];
		intelligence_benchmark_display_keys: string[];
		missing_intelligence_benchmark_keys: string[];
		agentic_benchmark_keys: string[];
		agentic_benchmark_display_keys: string[];
		missing_agentic_benchmark_keys: string[];
		selected_benchmark_keys: string[];
		benchmark_portfolio: BenchmarkPortfolio;
		confidence: Confidence;
		column_tooltips: ModelAtlasColumnTooltips;
		snapshot_preservation_version: number;
	};
};

export type ModelAtlasPayload = {
	fetched_at_epoch_seconds: number | null;
	metadata: ModelAtlasMetadata;
	models: PipelineModel[];
};

export type ModelAtlasOptions = {
	id?: string | null;
};
