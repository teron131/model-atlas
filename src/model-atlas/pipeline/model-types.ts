/** Shared model and scoring contracts used by derivation and the public stats surface. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type { BenchmarkKey, BenchmarkResourceKey } from "../benchmarks/registry";
import type { CommunityIndexKey, CommunityIndexPlace } from "../community/catalog";
import type { NumberOrNull } from "../math-utils";
import type { JsonObject } from "../runtime";
import type { AgentsLastExamModelScoreRow } from "../sources/agents-last-exam/leaderboard";
import type { AleBenchModelScoreRow } from "../sources/ale-bench/leaderboard";
import type { ArenaAgentModelScoreRow } from "../sources/arena/agent";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../sources/artificial-analysis/benchmark-resources";
import type { DeepSWEModelScoreRow } from "../sources/deep-swe/leaderboard";
import type { FrontierCodeModelEffortRow } from "../sources/frontier-code/leaderboard";
import type { TerminalBench4ModelHarnessRow } from "../sources/terminal-bench-4/leaderboard";
import type { VendingBench2ModelScoreRow } from "../sources/vending-bench-2/leaderboard";

export type ModelAtlasModalities = {
  input?: string[];
  output?: string[];
};

export type ModelAtlasCostBreakdown = {
  input?: NumberOrNull;
  output?: NumberOrNull;
  cache_read?: NumberOrNull;
  cache_write?: NumberOrNull;
};

export type ModelAtlasCostTier = ModelAtlasCostBreakdown & {
  tier?: {
    type?: string;
    size?: NumberOrNull;
  };
};

export type ModelAtlasCost =
  | (ModelAtlasCostBreakdown & {
      weighted_input?: NumberOrNull;
      weighted_output?: NumberOrNull;
      blended_price?: NumberOrNull;
      context_over_200k?: ModelAtlasCostBreakdown;
      tiers?: ModelAtlasCostTier[];
    })
  | null;

export type ModelAtlasContextWindow = {
  context?: NumberOrNull;
  input?: NumberOrNull;
  output?: NumberOrNull;
} | null;

export type ModelAtlasSpeed = {
  throughput_tokens_per_second_median: NumberOrNull;
  latency_seconds_median: NumberOrNull;
  e2e_latency_seconds_median: NumberOrNull;
};

export type ModelAtlasBenchmarkValues = {
  [key: string]: NumberOrNull | undefined;
};

export type ModelAtlasIntelligence = ModelAtlasBenchmarkValues & {
  intelligence_index?: NumberOrNull;
  omniscience_index?: NumberOrNull;
  omniscience_accuracy?: NumberOrNull;
};

export type ModelAtlasTaskMetricValues = {
  quality?: NumberOrNull;
  cost?: NumberOrNull;
  observed_cost?: NumberOrNull;
  seconds?: NumberOrNull;
  tokens?: NumberOrNull;
  input_tokens?: NumberOrNull;
  output_tokens?: NumberOrNull;
  observed_at?: string | null;
  cost_price_ratio?: NumberOrNull;
};

export type ModelAtlasTaskMetrics =
  | (Record<string, ModelAtlasTaskMetricValues | null | undefined> &
      Partial<Record<BenchmarkResourceKey, ModelAtlasTaskMetricValues | null>> & {
        artificial_analysis?: ModelAtlasTaskMetricValues | null;
      })
  | null;

export type ModelAtlasBenchmarks = ModelAtlasBenchmarkValues &
  Partial<Record<BenchmarkKey, NumberOrNull>>;

type ScoringSourceRow =
  | JsonObject
  | ArtificialAnalysisBenchmarkResourceRow
  | ArenaAgentModelScoreRow
  | AgentsLastExamModelScoreRow
  | AleBenchModelScoreRow
  | BenchmarkObservationRow
  | DeepSWEModelScoreRow
  | FrontierCodeModelEffortRow
  | TerminalBench4ModelHarnessRow
  | VendingBench2ModelScoreRow;

export type ModelAtlasScoringSources =
  | (Record<string, ScoringSourceRow | null | undefined> & {
      arena_agent?: ArenaAgentModelScoreRow | null;
      agents_last_exam?: AgentsLastExamModelScoreRow | null;
      analyst_agent?: ArtificialAnalysisBenchmarkResourceRow | null;
      apex_agents?: BenchmarkObservationRow | null;
      automation_bench?: BenchmarkObservationRow | null;
      deep_swe?: DeepSWEModelScoreRow | null;
      frontier_code?: FrontierCodeModelEffortRow | null;
      terminal_bench_4?: TerminalBench4ModelHarnessRow | null;
      vending_bench_2?: VendingBench2ModelScoreRow | null;
    })
  | null;

/** A catalog model between source matching and candidate projection; its evidence objects keep source values for scoring to coerce. */
export type ModelRow = {
  id: string | null;
  name?: string | null;
  provider_id?: string | null;
  openrouter_id?: string | null;
  artificial_analysis_id?: string | null;
  artificial_analysis_slug?: string | null;
  reasoning_effort?: string | null;
  family?: string | null;
  logo?: string | null;
  release_date?: string | null;
  reasoning?: boolean | null;
  open_weights?: boolean | null;
  modalities?: JsonObject;
  cost?: JsonObject;
  limit?: JsonObject;
  artificial_analysis_cost?: JsonObject;
  median_output_tokens_per_second?: number;
  median_time_to_first_token_seconds?: number;
  median_end_to_end_response_time_seconds?: number;
  benchmarks?: JsonObject;
  intelligence?: JsonObject;
  intelligence_index_cost?: JsonObject;
  scoring_sources?: JsonObject;
  /** Marks a version-replacement row with the undated Artificial Analysis source id it resolved from; the previous published model is looked up under that id first. */
  version_replacement_source_id?: string;
};

export type ModelAtlasCandidateComponentScores = {
  intelligence_score: NumberOrNull;
  agentic_score: NumberOrNull;
  speed_score: NumberOrNull;
};

export type ModelAtlasComponentScores = {
  intelligence_score: number;
  agentic_score: number;
  speed_score: NumberOrNull;
};

export type ModelAtlasConfidence = {
  intelligence: NumberOrNull;
  agentic: NumberOrNull;
  speed: NumberOrNull;
  value: NumberOrNull;
};

export type ModelAtlasCandidateScores = {
  intelligence_score: NumberOrNull;
  agentic_score: NumberOrNull;
  speed_score: NumberOrNull;
  value_score: NumberOrNull;
};

export type ModelAtlasScores = {
  intelligence_score: number;
  agentic_score: number;
  speed_score: NumberOrNull;
  value_score: NumberOrNull;
};

export type ModelAtlasScoreDimension = "intelligence" | "agentic" | "speed" | "value";

export type ModelAtlasScoreChangeCause = {
  kind: "model" | "evidence" | "coverage" | "methodology" | "relative";
  label: string;
};

export type ModelAtlasBenchmarkRankDriver = {
  benchmark_key: string;
  label: string;
  benchmark_rank: number;
  benchmark_model_count: number;
  rank_correlation: number;
};

export type ModelAtlasScoreChange = {
  refresh_id: number;
  dimension: ModelAtlasScoreDimension;
  score_before: number | null;
  score_after: number;
  score_delta: number | null;
  rank_before: number | null;
  rank_after: number | null;
  confidence_before: number | null;
  confidence_after: number | null;
  causes: ModelAtlasScoreChangeCause[];
  rank_drivers: ModelAtlasBenchmarkRankDriver[];
};

type ModelFields = {
  id: string | null;
  name: string | null;
  provider: string | null;
  logo: string;
  reasoning: boolean | null;
  reasoning_effort: string | null;
  release_date: string | null;
  modalities: ModelAtlasModalities | null;
  open_weights: boolean | null;
  cost: ModelAtlasCost;
  context_window: ModelAtlasContextWindow;
  speed: ModelAtlasSpeed;
  intelligence: ModelAtlasIntelligence | null;
  task_metrics: ModelAtlasTaskMetrics;
  benchmarks: ModelAtlasBenchmarks | null;
  benchmark_dates: Record<string, string> | null;
  confidence: ModelAtlasConfidence;
  latest_change?: ModelAtlasScoreChange | null;
  community_indexes?: Partial<Record<CommunityIndexKey, CommunityIndexPlace>>;
};

export type ModelAtlasCandidate = ModelFields & {
  scoring_sources?: ModelAtlasScoringSources;
  component_scores: ModelAtlasCandidateComponentScores | null;
  scores: null;
};

export type ModelAtlasScoredCandidate = ModelFields & {
  scoring_sources?: ModelAtlasScoringSources;
  component_scores: ModelAtlasCandidateComponentScores | null;
  scores: ModelAtlasCandidateScores;
};

export type ModelAtlasModel = ModelFields & {
  component_scores: ModelAtlasComponentScores;
  scores: ModelAtlasScores;
};
