/** Ingest contracts for raw caches, source snapshots, and the handoff into storage writers and payload readers. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_KEYS,
	BENCHMARK_RUNTIME_KEYS,
	type BenchmarkObservationKey,
	type BenchmarkRuntimeKey,
} from "../benchmarks/registry";
import type { JsonObject } from "../runtime";
import type { AgentArenaModelScoreRow } from "../scrapers/agent-arena";
import type {
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScoreRow,
} from "../scrapers/agents-last-exam";
import type { AleBenchConfigurationRow } from "../scrapers/ale-bench";
import type { ArtificialAnalysisEvaluationResourceRow } from "../scrapers/artificial-analysis/benchmark-resources";
import type { BlueprintBenchModelScoreRow } from "../scrapers/blueprint-bench";
import type { CursorBenchModelScoreRow } from "../scrapers/cursorbench";
import type {
	DeepSWERawLeaderboardRow,
	DeepSWESourceVersion,
} from "../scrapers/deep-swe";
import type { FrontierCodeModelEffortRow } from "../scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../scrapers/mercor-apex-agents";
import type {
	ModelsDevFlatModel,
	ModelsDevPayload,
} from "../scrapers/models-dev";
import { OPENROUTER_MODELS_URL } from "../scrapers/openrouter";
import type { GdpPdfModelScoreRow } from "../scrapers/surge/gdp-pdf";
import type { RiemannBenchModelScoreRow } from "../scrapers/surge/riemann-bench";
import type {
	HarveyLabModelScoreRow,
	HarveyLabTaskRow,
} from "../scrapers/vals/harvey-lab";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../scrapers/vals/terminal-bench";
import type { VendingBench2ModelScoreRow } from "../scrapers/vending-bench-2";

export type LlmStatsSourceHealthStatus =
	| "cache_hit"
	| "fresh"
	| "using_cached_rows"
	| "empty";

export type LlmStatsSourceHealthEntry = {
	source: string;
	status: LlmStatsSourceHealthStatus;
	last_fetch_epoch_seconds: number | null;
	source_input_count: number;
	cache_hit: boolean;
	refreshed: boolean;
	using_cached_rows: boolean;
	active_row_count: number;
	quarantined_row_count: number;
};

export type LlmStatsSourceHealth = {
	generated_at_epoch_seconds: number | null;
	sources: Record<string, LlmStatsSourceHealthEntry>;
};

export const DEFAULT_DATABASE_PATH = ".cache/database.sqlite";
export const RAW_SOURCE_CACHE_SECONDS = 24 * 60 * 60;

const CORE_RAW_SOURCE_NAMES = [
	"artificial_analysis",
	"artificial_analysis_evaluation_resources",
	"models_dev",
	"openrouter",
] as const;

export const RAW_SOURCE_NAMES = [
	...CORE_RAW_SOURCE_NAMES,
	...BENCHMARK_RUNTIME_KEYS,
	...BENCHMARK_OBSERVATION_KEYS,
] as const;

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

/** Catalog benchmark-observation sources share one physical table while retaining independent cache partitions. */
export function isBenchmarkObservationRawSource(
	source: RawSourceName,
): source is BenchmarkObservationKey {
	return (BENCHMARK_OBSERVATION_KEYS as readonly string[]).includes(source);
}

/** Raw source table names shared by cache freshness checks, snapshot writes, and D1 verification. */
const CORE_RAW_SOURCE_TABLES = {
	artificial_analysis: "artificial_analysis_raw_models",
	artificial_analysis_evaluation_resources:
		"artificial_analysis_evaluations_raw_rows",
	models_dev: "models_dev_raw_models",
	openrouter: "openrouter_raw_rows",
} as const satisfies Record<(typeof CORE_RAW_SOURCE_NAMES)[number], string>;

const BENCHMARK_RUNTIME_RAW_SOURCE_TABLES = Object.fromEntries(
	BENCHMARK_RUNTIME_KEYS.map((key) => [key, `${key}_raw_rows`]),
) as Record<BenchmarkRuntimeKey, `${BenchmarkRuntimeKey}_raw_rows`>;

const BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES = Object.fromEntries(
	BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
		binding.rawSourceKey,
		binding.rawTable,
	]),
) as Record<(typeof BENCHMARK_OBSERVATION_KEYS)[number], string>;

export const RAW_SOURCE_TABLES = {
	...CORE_RAW_SOURCE_TABLES,
	...BENCHMARK_RUNTIME_RAW_SOURCE_TABLES,
	...BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES,
} as const satisfies Record<RawSourceName, string>;

/** Tables owned by the local snapshot pipeline and rewritten as a completed run. */
export const SNAPSHOT_TABLES = {
	...RAW_SOURCE_TABLES,
	source_quarantines: "source_quarantines",
	source_health: "source_health",
	models: "models",
	model_evaluations: "model_evaluations",
	model_task_metrics: "model_task_metrics",
	model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName =
	(typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];

export const SOURCE_URLS = {
	artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
	artificial_analysis_evaluation_resources:
		"https://artificialanalysis.ai/evaluations",
	models_dev: "https://models.dev/api.json",
	openrouter_models: OPENROUTER_MODELS_URL,
	openrouter_stats: "https://openrouter.ai/api/frontend/v1/stats/*",
	agent_arena: "https://arena.ai/leaderboard/agent",
	agents_last_exam: "https://agents-last-exam.org/leaderboard",
	ale_bench: "https://sakanaai.github.io/ALE-Bench-Leaderboard",
	blueprint_bench_2: "https://andonlabs.com/evals/blueprint-bench-2",
	cursorbench: "https://cursor.com/cursorbench",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
	frontier_code: "https://cognition.com/frontiercode",
	gdp_pdf: "https://surgehq.ai/leaderboards/gdp-pdf",
	vals_harvey_lab: "https://www.vals.ai/benchmarks/hlab",
	mercor_apex_agents: "https://www.mercor.com/apex/apex-agents-leaderboard/",
	riemann_bench: "https://surgehq.ai/leaderboards/riemann-bench",
	vals_terminal_bench: "https://www.vals.ai/benchmarks/terminal-bench-2-1",
	vals_index: "https://www.vals.ai/benchmarks/vals_index",
	vending_bench_2: "https://andonlabs.com/evals/vending-bench-2",
} as const;

export type DatabaseBuildResult = {
	path: string;
	source_rows: Record<string, number>;
	source_cache: Record<RawSourceName, RawSourceCacheStatus>;
	source_health: LlmStatsSourceHealth;
	final_model_count: number;
};

export type DatabaseBuildOptions = {
	replaceSourceRows?: boolean;
};

export type DebugTraceRow = {
	artificial_analysis_id: string | null;
	artificial_analysis_slug: string | null;
	artificial_analysis_name: string | null;
	artificial_analysis_raw_row_index: number | null;
	candidate_rank: number | null;
	candidate_model_id: string | null;
	candidate_provider_id: string | null;
	candidate_provider_name: string | null;
	candidate_name: string | null;
	candidate_score: number | null;
	selected: boolean;
	rejection_reason: string;
	selected_model_id: string | null;
	models_dev_row_index: number | null;
	openrouter_model_id: string | null;
	openrouter_model_stats_row_index: number | null;
};

export type RawSourceCacheStatus = {
	last_fetch_epoch_seconds: number | null;
	source_input_count: number;
	cache_hit: boolean;
	refreshed: boolean;
};

export type SourceRowStatus = "active" | "quarantined_missing_from_source";

export type SourceRowState = {
	source: RawSourceName;
	row_key: string;
	row_label: string | null;
	status: SourceRowStatus;
	missing_from_source_since_epoch_seconds: number | null;
};

type BenchmarkObservationSnapshotRows = {
	[Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceRowsKey"]]: BenchmarkObservationRow[];
};

type BenchmarkObservationFetchedAt = {
	[Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceDataKey"]]:
		| number
		| null;
};

export type SourceSnapshots = BenchmarkObservationSnapshotRows & {
	artificialAnalysisRawRows: JsonObject[];
	artificialAnalysisSelectedRows: JsonObject[];
	artificialAnalysisEvaluationResourceRows: ArtificialAnalysisEvaluationResourceRow[];
	modelsDevPayload: ModelsDevPayload;
	modelsDevModels: ModelsDevFlatModel[];
	modelsDevFetchedAt: number | null;
	modelsDevStatusCode: number | null;
	agentArenaModelScoreRows: AgentArenaModelScoreRow[];
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	aleBenchConfigurationRows: AleBenchConfigurationRow[];
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	frontierCodeRows: FrontierCodeModelEffortRow[];
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	harveyLabRows: HarveyLabTaskRow[];
	harveyLabModelScoreRows: HarveyLabModelScoreRow[];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
	terminalBenchRows: TerminalBenchTaskRow[];
	terminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	sourceRowStates: SourceRowState[];
	fetchedAt: BenchmarkObservationFetchedAt & {
		artificialAnalysis: number | null;
		artificialAnalysisEvaluationResources: number | null;
		agentArena: number | null;
		agentsLastExam: number | null;
		aleBench: number | null;
		blueprintBench: number | null;
		cursorBench: number | null;
		deepSWE: number | null;
		frontierCode: number | null;
		gdpPdf: number | null;
		harveyLab: number | null;
		mercorApexAgents: number | null;
		riemannBench: number | null;
		terminalBench: number | null;
		valsIndex: number | null;
		vendingBench2: number | null;
	};
};

export type SourceSnapshotStatus = {
	source: RawSourceName;
	fetchedAt: number | null;
	sourceInputCount: number;
	sourceRowStates: SourceRowState[];
	fetchedAtKey?: keyof SourceSnapshots["fetchedAt"];
};
