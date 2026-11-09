/** Public model and payload contracts for the Model Atlas stats surface. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import type { BenchmarkObservationsByKey } from "../benchmarks/observation";
import type { ModelAtlasColumnTooltips } from "../config/tooltips";
import type { ModelAtlasModel } from "../pipeline/model-types";
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
  ModelAtlasScoredCandidate,
  ModelAtlasScores,
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasChangeMark,
  ModelAtlasInputChange,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoreDimension,
  ModelAtlasScoreMove,
  ModelAtlasScoringSources,
  ModelAtlasSpeed,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
  ModelAtlasVariantChanges,
} from "../pipeline/model-types";

export type ModelAtlasBenchmarkHealthLeader = {
  source_id: string;
  model_id: string | null;
  label: string;
  value: number;
  reasoning_effort: string | null;
  variants: { label: string; value: number; reasoning_effort: string | null }[];
};

/** Descriptive coverage, spread, and row updates, separate from human portfolio judgments. */
export type ModelAtlasBenchmarkUpdateEntry = {
  schema_version: 3;
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
    /** Mean source-published standard error of the top leaders' representative rows; null unless every one of them publishes one. */
    top_standard_error: number | null;
  };
  /** Each model's best result per labelled effort; a pair is inverted when the lower effort's result is above the higher effort's. */
  efforts: {
    pair_count: number;
    inverted_pair_count: number;
    largest_inversion: number | null;
  };
  /** The refresh at which the rows last differed from the previous refresh's in any model, label, effort, value, standard error, or version; null until a refresh sees them change. */
  rows_updated_at_epoch_seconds: number | null;
  /** Identifies the rows' content for the next refresh's comparison; null when the entry was built outside a refresh, so it cannot be compared. */
  rows_fingerprint: string | null;
  /** When a source feeding this benchmark could not be refreshed and serves cached rows, the earliest time those rows were fetched; null when every source is current. */
  cached_rows_fetched_at_epoch_seconds: number | null;
};

export type ModelAtlasBenchmarkUpdateHealth = Record<string, ModelAtlasBenchmarkUpdateEntry>;

export type ModelAtlasMetadata = {
  available_metrics: {
    benchmark_keys: string[];
  };
  source_health?: ModelAtlasSourceHealth;
  benchmark_update_health?: ModelAtlasBenchmarkUpdateHealth;
  /** Source-published version per benchmark; absent from snapshots built before versions were published. */
  benchmark_versions?: Readonly<Record<string, string>>;
  scoring: {
    /** Record the effective group and pairwise weights alongside published scores. */
    intelligence_scoring?: {
      group_weights: { frontier: number; baseline: number };
      pairwise_weight: number;
    };
    intelligence_benchmark_keys: string[];
    intelligence_benchmark_display_keys: string[];
    missing_intelligence_benchmark_keys: string[];
    agentic_benchmark_keys: string[];
    agentic_benchmark_display_keys: string[];
    agentic_token_modifier_cap: number;
    missing_agentic_benchmark_keys: string[];
    selected_benchmark_keys: string[];
    benchmark_portfolio: BenchmarkPortfolio;
    column_tooltips: ModelAtlasColumnTooltips;
    snapshot_preservation_version: number | null;
  };
};

export type ModelAtlasPayload = {
  fetched_at_epoch_seconds: number | null;
  metadata: ModelAtlasMetadata;
  models: ModelAtlasModel[];
  benchmark_observations?: BenchmarkObservationsByKey;
};

export type ModelAtlasOptions = {
  id?: string | null;
};
