/** Shared model and scoring contracts used by derivation and the public stats surface. */

import type {
	BenchmarkKey,
	BenchmarkResourceKey,
} from "../benchmarks/registry";
import type { NumberOrNull } from "../numeric";
import type { JsonObject } from "../runtime";
import type { AgentArenaModelScoreRow } from "../scrapers/agent-arena";
import type { AgentsLastExamModelScoreRow } from "../scrapers/agents-last-exam";
import type { AleBenchModelScoreRow } from "../scrapers/ale-bench";
import type { ArtificialAnalysisEvaluationResourceRow } from "../scrapers/artificial-analysis/benchmark-resources";
import type { BenchmarkObservationRow } from "../scrapers/benchmark-observation";
import type { CursorBenchModelScoreRow } from "../scrapers/cursorbench";
import type { DeepSWEModelScoreRow } from "../scrapers/deep-swe";
import type { FrontierCodeModelEffortRow } from "../scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../scrapers/mercor-apex-agents";
import type { HarveyLabModelScoreRow } from "../scrapers/vals/harvey-lab";
import type { VendingBench2ModelScoreRow } from "../scrapers/vending-bench-2";
import type { TerminalBenchAggregateRow } from "./benchmark-rows/terminal-bench";

export type LlmStatsModalities = {
	input?: string[];
	output?: string[];
};

export type LlmStatsCostBreakdown = {
	input?: NumberOrNull;
	output?: NumberOrNull;
	cache_read?: NumberOrNull;
	cache_write?: NumberOrNull;
};

export type LlmStatsCostTier = LlmStatsCostBreakdown & {
	tier?: {
		type?: string;
		size?: NumberOrNull;
	};
};

export type LlmStatsCost =
	| (LlmStatsCostBreakdown & {
			weighted_input?: NumberOrNull;
			weighted_output?: NumberOrNull;
			blended_price?: NumberOrNull;
			context_over_200k?: LlmStatsCostBreakdown;
			tiers?: LlmStatsCostTier[];
	  })
	| null;

export type LlmStatsContextWindow = {
	context?: NumberOrNull;
	input?: NumberOrNull;
	output?: NumberOrNull;
} | null;

export type LlmStatsSpeed = {
	throughput_tokens_per_second_median: NumberOrNull;
	latency_seconds_median: NumberOrNull;
	e2e_latency_seconds_median: NumberOrNull;
};

export type LlmStatsBenchmarkValues = {
	[key: string]: NumberOrNull | undefined;
};

export type LlmStatsIntelligence = LlmStatsBenchmarkValues & {
	intelligence_index?: NumberOrNull;
	agentic_index?: NumberOrNull;
	coding_index?: NumberOrNull;
	omniscience_index?: NumberOrNull;
	omniscience_accuracy?: NumberOrNull;
};

export type LlmStatsIntelligenceIndexCost = {
	input_cost?: NumberOrNull;
	reasoning_cost?: NumberOrNull;
	output_cost?: NumberOrNull;
	total_cost?: NumberOrNull;
	input_tokens?: NumberOrNull;
	reasoning_tokens?: NumberOrNull;
	answer_tokens?: NumberOrNull;
	output_tokens?: NumberOrNull;
	total_tokens?: NumberOrNull;
	cost_per_task?: NumberOrNull;
	seconds_per_task?: NumberOrNull;
	output_tokens_per_task?: NumberOrNull;
} | null;

export type LlmStatsTaskMetricValues = {
	cost?: NumberOrNull;
	seconds?: NumberOrNull;
	tokens?: NumberOrNull;
	input_tokens?: NumberOrNull;
	output_tokens?: NumberOrNull;
};

export type LlmStatsTaskMetrics =
	| (Record<string, LlmStatsTaskMetricValues | null | undefined> &
			Partial<Record<BenchmarkResourceKey, LlmStatsTaskMetricValues | null>> & {
				artificial_analysis?: LlmStatsTaskMetricValues | null;
			})
	| null;

export type LlmStatsEvaluations = LlmStatsBenchmarkValues &
	Partial<Record<BenchmarkKey, NumberOrNull>> & {
		gpqa?: NumberOrNull;
		mmmu_pro?: NumberOrNull;
	};

type LlmStatsScoringSourceRow =
	| JsonObject
	| ArtificialAnalysisEvaluationResourceRow
	| AgentArenaModelScoreRow
	| AgentsLastExamModelScoreRow
	| AleBenchModelScoreRow
	| BenchmarkObservationRow
	| CursorBenchModelScoreRow
	| DeepSWEModelScoreRow
	| FrontierCodeModelEffortRow
	| MercorApexAgentsRow
	| TerminalBenchAggregateRow
	| HarveyLabModelScoreRow
	| VendingBench2ModelScoreRow;

export type LlmStatsScoringSources =
	| (Record<string, LlmStatsScoringSourceRow | null | undefined> & {
			agent_arena?: AgentArenaModelScoreRow | null;
			agents_last_exam?: AgentsLastExamModelScoreRow | null;
			apex_agents_mercor?: MercorApexAgentsRow | null;
			automation_bench?: ArtificialAnalysisEvaluationResourceRow | null;
			cursorbench?: CursorBenchModelScoreRow | null;
			deep_swe?: DeepSWEModelScoreRow | null;
			frontier_code?: FrontierCodeModelEffortRow | null;
			harvey_lab?: HarveyLabModelScoreRow | null;
			itbench_sre?: ArtificialAnalysisEvaluationResourceRow | null;
			terminalbench_v21?: TerminalBenchAggregateRow | null;
			vending_bench_2?: VendingBench2ModelScoreRow | null;
	  })
	| null;

export type LlmStatsNullableComponentScores = {
	intelligence_score: NumberOrNull;
	agentic_score: NumberOrNull;
	speed_score: NumberOrNull;
};

export type LlmStatsComponentScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
};

export type LlmStatsNullableScores = {
	intelligence_score: NumberOrNull;
	agentic_score: NumberOrNull;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
};

export type LlmStatsScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
};

type LlmStatsModelFields = {
	id: string | null;
	name: string | null;
	provider: string | null;
	logo: string;
	reasoning: boolean | null;
	reasoning_effort: string | null;
	release_date: string | null;
	modalities: LlmStatsModalities | null;
	open_weights: boolean | null;
	cost: LlmStatsCost;
	context_window: LlmStatsContextWindow;
	speed: LlmStatsSpeed;
	intelligence: LlmStatsIntelligence | null;
	intelligence_index_cost: LlmStatsIntelligenceIndexCost;
	task_metrics: LlmStatsTaskMetrics;
	evaluations: LlmStatsEvaluations | null;
};

export type LlmStatsModelCandidate = LlmStatsModelFields & {
	scoring_sources?: LlmStatsScoringSources;
	component_scores: LlmStatsNullableComponentScores | null;
	scores: null;
};

export type LlmStatsScoredCandidate = LlmStatsModelFields & {
	scoring_sources?: LlmStatsScoringSources;
	component_scores: LlmStatsNullableComponentScores | null;
	scores: LlmStatsNullableScores;
};

export type LlmStatsModel = LlmStatsModelFields & {
	component_scores: LlmStatsComponentScores;
	scores: LlmStatsScores;
};
