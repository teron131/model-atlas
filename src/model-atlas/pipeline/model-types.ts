/** Shared model and scoring contracts used by derivation and the public stats surface. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type {
	BenchmarkKey,
	BenchmarkResourceKey,
} from "../benchmarks/registry";
import type { AgentArenaModelScoreRow } from "../benchmarks/scrapers/agent-arena";
import type { AgentsLastExamModelScoreRow } from "../benchmarks/scrapers/agents-last-exam";
import type { AleBenchModelScoreRow } from "../benchmarks/scrapers/ale-bench";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../benchmarks/scrapers/artificial-analysis/results";
import type { CursorBenchModelScoreRow } from "../benchmarks/scrapers/cursorbench";
import type { DeepSWEModelScoreRow } from "../benchmarks/scrapers/deep-swe";
import type { FrontierCodeModelEffortRow } from "../benchmarks/scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../benchmarks/scrapers/mercor-apex-agents";
import type { HarveyLabModelScoreRow } from "../benchmarks/scrapers/vals/harvey-lab";
import type { VendingBench2ModelScoreRow } from "../benchmarks/scrapers/vending-bench-2";
import type { NumberOrNull } from "../numeric";
import type { JsonObject } from "../runtime";
import type { TerminalBenchAggregateRow } from "./benchmark-rows/terminal-bench";

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
	agentic_index?: NumberOrNull;
	coding_index?: NumberOrNull;
	omniscience_index?: NumberOrNull;
	omniscience_accuracy?: NumberOrNull;
};

export type ModelAtlasTaskMetricValues = {
	cost?: NumberOrNull;
	seconds?: NumberOrNull;
	tokens?: NumberOrNull;
	input_tokens?: NumberOrNull;
	output_tokens?: NumberOrNull;
};

export type ModelAtlasTaskMetrics =
	| (Record<string, ModelAtlasTaskMetricValues | null | undefined> &
			Partial<
				Record<BenchmarkResourceKey, ModelAtlasTaskMetricValues | null>
			> & {
				artificial_analysis?: ModelAtlasTaskMetricValues | null;
			})
	| null;

export type ModelAtlasBenchmarks = ModelAtlasBenchmarkValues &
	Partial<Record<BenchmarkKey, NumberOrNull>> & {
		gpqa?: NumberOrNull;
		mmmu_pro?: NumberOrNull;
	};

type ModelAtlasScoringSourceRow =
	| JsonObject
	| ArtificialAnalysisBenchmarkResourceRow
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

export type ModelAtlasScoringSources =
	| (Record<string, ModelAtlasScoringSourceRow | null | undefined> & {
			agent_arena?: AgentArenaModelScoreRow | null;
			agents_last_exam?: AgentsLastExamModelScoreRow | null;
			apex_agents_mercor?: MercorApexAgentsRow | null;
			automation_bench?: ArtificialAnalysisBenchmarkResourceRow | null;
			cursorbench?: CursorBenchModelScoreRow | null;
			deep_swe?: DeepSWEModelScoreRow | null;
			frontier_code?: FrontierCodeModelEffortRow | null;
			harvey_lab?: HarveyLabModelScoreRow | null;
			itbench_sre?: ArtificialAnalysisBenchmarkResourceRow | null;
			terminalbench_v21?: TerminalBenchAggregateRow | null;
			vending_bench_2?: VendingBench2ModelScoreRow | null;
	  })
	| null;

export type ModelAtlasNullableComponentScores = {
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
};

export type ModelAtlasNullableScores = {
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

type ModelAtlasModelFields = {
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
	confidence: ModelAtlasConfidence;
};

export type ModelAtlasModelCandidate = ModelAtlasModelFields & {
	scoring_sources?: ModelAtlasScoringSources;
	component_scores: ModelAtlasNullableComponentScores | null;
	scores: null;
};

export type ModelAtlasScoredCandidate = ModelAtlasModelFields & {
	scoring_sources?: ModelAtlasScoringSources;
	component_scores: ModelAtlasNullableComponentScores | null;
	scores: ModelAtlasNullableScores;
};

export type ModelAtlasModel = ModelAtlasModelFields & {
	component_scores: ModelAtlasComponentScores;
	scores: ModelAtlasScores;
};
