/** Public model and payload contracts for the Model Atlas stats surface. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import type { BenchmarkObservationsByKey } from "../benchmarks/observation";
import type { QualityCoverageThresholds } from "../config/stage";
import type { ModelAtlasColumnTooltips } from "../config/tooltips";
import type { ModelAtlasPublishedModel as PipelinePublishedModel } from "../pipeline/model-types";
import type { ModelAtlasSourceHealth } from "../sources/types";

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
  ModelAtlasSourceQuarantine,
} from "../sources/types";
export type {
  ModelAtlasBenchmarks,
  ModelAtlasBenchmarkValues,
  ModelAtlasCandidate,
  ModelAtlasCandidateComponentScores,
  ModelAtlasCandidateScores,
  ModelAtlasComponentScores,
  ModelAtlasConfidence,
  ModelAtlasContextWindow,
  ModelAtlasCost,
  ModelAtlasCostBreakdown,
  ModelAtlasCostTier,
  ModelAtlasIntelligence,
  ModelAtlasModalities,
  ModelAtlasModel,
  ModelAtlasPublishedModel,
  ModelAtlasScoredCandidate,
  ModelAtlasScores,
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoreDimension,
  ModelAtlasScoringSources,
  ModelAtlasSpeed,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
} from "../pipeline/model-types";

export type ModelAtlasBenchmarkHealthLeader = {
  source_id: string;
  model_id: string | null;
  label: string;
  value: number;
  reasoning_effort: string | null;
  variants: { label: string; value: number; reasoning_effort: string | null }[];
};

/** Descriptive coverage and spread, separate from source freshness and human portfolio judgments. */
export type ModelAtlasBenchmarkUpdateEntry = {
  schema_version: 2;
  status: "missing" | "unmatched" | "partially_matched" | "matched";
  evidence_origin: "source" | "model_observations";
  cohort: "all_available_models";
  representative: "best_reported_per_model";
  observed_count: number;
  distinct_model_count: number;
  matched_model_count: number;
  unmatched_model_count: number;
  source_leaders: ModelAtlasBenchmarkHealthLeader[];
  matched_leaders: ModelAtlasBenchmarkHealthLeader[];
  spread: {
    full_range: number | null;
    leader_gap: number | null;
    top_count: number;
    top_range: number | null;
    top_range_without_leader: number | null;
  };
};

export type ModelAtlasBenchmarkUpdateHealth = Record<string, ModelAtlasBenchmarkUpdateEntry>;

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
    agentic_token_modifier_cap: number;
    missing_agentic_benchmark_keys: string[];
    selected_benchmark_keys: string[];
    benchmark_portfolio: BenchmarkPortfolio;
    quality_coverage: QualityCoverageThresholds;
    column_tooltips: ModelAtlasColumnTooltips;
    snapshot_preservation_version: number;
  };
};

export type ModelAtlasPayload = {
  fetched_at_epoch_seconds: number | null;
  metadata: ModelAtlasMetadata;
  models: PipelinePublishedModel[];
  benchmark_observations?: BenchmarkObservationsByKey;
};

export type ModelAtlasOptions = {
  id?: string | null;
};
