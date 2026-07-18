/** SQLite row contracts define the handoff between scrapers, snapshot writers, and public payload readers. */

import type { AgentArenaModelScoreRow } from "../scrapers/agent-arena";
import type {
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScoreRow,
} from "../scrapers/agents-last-exam";
import type { ArtificialAnalysisEvaluationResourceRow } from "../scrapers/artificial-analysis/benchmark-resources";
import type { BlueprintBenchModelScoreRow } from "../scrapers/blueprint-bench";
import type { BrowseCompModelScoreRow } from "../scrapers/browsecomp";
import type { CursorBenchModelScoreRow } from "../scrapers/cursorbench";
import type {
	DeepSWERawLeaderboardRow,
	DeepSWESourceVersion,
} from "../scrapers/deep-swe";
import type { GdpPdfModelScoreRow } from "../scrapers/gdp-pdf";
import type {
	ModelsDevFlatModel,
	ModelsDevPayload,
} from "../scrapers/models-dev";
import { OPENROUTER_MODELS_URL } from "../scrapers/openrouter";
import type { RiemannBenchModelScoreRow } from "../scrapers/riemann-bench";
import type { ToolathlonModelScoreRow } from "../scrapers/toolathlon";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../scrapers/vals/terminal-bench";
import type { VendingBench2ModelScoreRow } from "../scrapers/vending-bench-2";
import type { LlmStatsSourceHealth } from "../stats/types";
import type { JsonObject } from "../utils";

export const DEFAULT_DATABASE_PATH = ".cache/database.sqlite";
export const RAW_SOURCE_CACHE_SECONDS = 24 * 60 * 60;
/** Bump when data-pipeline semantics change so fresh snapshots are derived once under the new contract. */
export const DATABASE_PIPELINE_REVISION = 3;

export const RAW_SOURCE_NAMES = [
	"agent_arena",
	"artificial_analysis",
	"artificial_analysis_evaluation_resources",
	"models_dev",
	"agents_last_exam",
	"blueprint_bench_2",
	"browsecomp",
	"cursorbench",
	"deep_swe",
	"gdp_pdf",
	"riemann_bench",
	"toolathlon",
	"vals_index",
	"vals_terminal_bench",
	"vending_bench_2",
	"openrouter",
] as const;

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

/** Raw source table names shared by cache freshness checks, snapshot writes, and D1 verification. */
export const RAW_SOURCE_TABLES = {
	agent_arena: "agent_arena_raw_rows",
	artificial_analysis: "artificial_analysis_raw_models",
	artificial_analysis_evaluation_resources:
		"artificial_analysis_evaluations_raw_rows",
	models_dev: "models_dev_raw_models",
	agents_last_exam: "agents_last_exam_raw_rows",
	blueprint_bench_2: "blueprint_bench_2_raw_rows",
	browsecomp: "browsecomp_raw_rows",
	cursorbench: "cursorbench_raw_rows",
	deep_swe: "deep_swe_raw_rows",
	gdp_pdf: "gdp_pdf_raw_rows",
	riemann_bench: "riemann_bench_raw_rows",
	toolathlon: "toolathlon_raw_rows",
	vals_index: "vals_index_raw_rows",
	vals_terminal_bench: "vals_terminal_bench_raw_rows",
	vending_bench_2: "vending_bench_2_raw_rows",
	openrouter: "openrouter_raw_rows",
} as const satisfies Record<RawSourceName, string>;

/** Tables owned by the local snapshot pipeline and rewritten as a completed run. */
export const SNAPSHOT_TABLES = {
	...RAW_SOURCE_TABLES,
	source_row_states: "source_row_states",
	source_health: "source_health",
	model_stage_rows: "model_stage_rows",
	model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName =
	(typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];

export const SOURCE_URLS = {
	agent_arena: "https://arena.ai/leaderboard/agent",
	artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
	artificial_analysis_evaluation_resources:
		"https://artificialanalysis.ai/evaluations",
	models_dev: "https://models.dev/api.json",
	agents_last_exam: "https://agents-last-exam.org/leaderboard",
	blueprint_bench_2: "https://andonlabs.com/evals/blueprint-bench-2",
	browsecomp:
		"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
	cursorbench: "https://cursor.com/cursorbench",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
	gdp_pdf: "https://surgehq.ai/leaderboards/gdp-pdf",
	toolathlon:
		"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
	vals_index: "https://www.vals.ai/benchmarks/vals_index",
	vals_terminal_bench: "https://www.vals.ai/benchmarks/terminal-bench-2-1",
	vending_bench_2: "https://andonlabs.com/evals/vending-bench-2",
	openrouter_models: OPENROUTER_MODELS_URL,
	openrouter_stats: "https://openrouter.ai/api/frontend/v1/stats/*",
} as const;

export type DatabaseBuildResult = {
	path: string;
	run_id: number;
	source_rows: Record<string, number>;
	source_cache: Record<RawSourceName, RawSourceCacheStatus>;
	source_health: LlmStatsSourceHealth;
	final_model_count: number;
};

export type DatabaseBuildOptions = {
	replaceSourceRows?: boolean;
};

export type DebugTraceRow = {
	trace_kind: "matcher_candidate";
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
	rejected: boolean;
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

export type SourceSnapshots = {
	agentArenaModelScoreRows: AgentArenaModelScoreRow[];
	artificialAnalysisRawRows: JsonObject[];
	artificialAnalysisSelectedRows: JsonObject[];
	artificialAnalysisEvaluationResourceRows: ArtificialAnalysisEvaluationResourceRow[];
	modelsDevPayload: ModelsDevPayload;
	modelsDevModels: ModelsDevFlatModel[];
	modelsDevFetchedAt: number | null;
	modelsDevStatusCode: number | null;
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	valsTerminalBenchRows: TerminalBenchTaskRow[];
	valsTerminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	sourceRowStates: SourceRowState[];
	fetchedAt: {
		agentArena: number | null;
		artificialAnalysis: number | null;
		artificialAnalysisEvaluationResources: number | null;
		agentsLastExam: number | null;
		blueprintBench: number | null;
		browseComp: number | null;
		cursorBench: number | null;
		deepSWE: number | null;
		gdpPdf: number | null;
		riemannBench: number | null;
		toolathlon: number | null;
		valsIndex: number | null;
		valsTerminalBench: number | null;
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
