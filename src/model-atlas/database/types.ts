/** SQLite row contracts define the handoff between scrapers, snapshot writers, and public payload readers. */

import type { AgentArenaModelScoreRow } from "../scrapers/agent-arena";
import type {
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScoreRow,
} from "../scrapers/agents-last-exam";
import type { ArtificialAnalysisEvaluationResourceRow } from "../scrapers/artificial-analysis/benchmark-resources";
import type { BenchmarkScoreRow } from "../scrapers/benchmark-score";
import type { BlueprintBenchModelScoreRow } from "../scrapers/blueprint-bench";
import type { BrowseCompModelScoreRow } from "../scrapers/browsecomp";
import type { CursorBenchModelScoreRow } from "../scrapers/cursorbench";
import type {
	DeepSWERawLeaderboardRow,
	DeepSWESourceVersion,
} from "../scrapers/deep-swe";
import type { MercorApexAgentsRow } from "../scrapers/mercor-apex-agents";
import type {
	ModelsDevFlatModel,
	ModelsDevPayload,
} from "../scrapers/models-dev";
import { OPENROUTER_MODELS_URL } from "../scrapers/openrouter";
import type { GdpPdfModelScoreRow } from "../scrapers/surge/gdp-pdf";
import type { RiemannBenchModelScoreRow } from "../scrapers/surge/riemann-bench";
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

export const RAW_SOURCE_NAMES = [
	"artificial_analysis",
	"artificial_analysis_evaluation_resources",
	"models_dev",
	"openrouter",
	"agent_arena",
	"agents_last_exam",
	"blueprint_bench_2",
	"browsecomp",
	"chartography",
	"chess_puzzles",
	"cursorbench",
	"deep_swe",
	"ebr_bench",
	"enterprisebench_corecraft",
	"epoch_capabilities_index",
	"frontiermath_tier_4",
	"gdp_pdf",
	"handbook_md",
	"mercor_apex_agents",
	"proofbench",
	"riemann_bench",
	"vals_terminal_bench",
	"toolathlon",
	"vals_index",
	"vending_bench_2",
	"weirdml",
] as const;

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

/** Raw source table names shared by cache freshness checks, snapshot writes, and D1 verification. */
export const RAW_SOURCE_TABLES = {
	artificial_analysis: "artificial_analysis_raw_models",
	artificial_analysis_evaluation_resources:
		"artificial_analysis_evaluations_raw_rows",
	models_dev: "models_dev_raw_models",
	openrouter: "openrouter_raw_rows",
	agent_arena: "agent_arena_raw_rows",
	agents_last_exam: "agents_last_exam_raw_rows",
	blueprint_bench_2: "blueprint_bench_2_raw_rows",
	browsecomp: "browsecomp_raw_rows",
	chartography: "chartography_raw_rows",
	chess_puzzles: "chess_puzzles_raw_rows",
	cursorbench: "cursorbench_raw_rows",
	deep_swe: "deep_swe_raw_rows",
	ebr_bench: "ebr_bench_raw_rows",
	enterprisebench_corecraft: "enterprisebench_corecraft_raw_rows",
	epoch_capabilities_index: "epoch_capabilities_index_raw_rows",
	frontiermath_tier_4: "frontiermath_tier_4_raw_rows",
	gdp_pdf: "gdp_pdf_raw_rows",
	handbook_md: "handbook_md_raw_rows",
	mercor_apex_agents: "mercor_apex_agents_raw_rows",
	proofbench: "proofbench_raw_rows",
	riemann_bench: "riemann_bench_raw_rows",
	vals_terminal_bench: "vals_terminal_bench_raw_rows",
	toolathlon: "toolathlon_raw_rows",
	vals_index: "vals_index_raw_rows",
	vending_bench_2: "vending_bench_2_raw_rows",
	weirdml: "weirdml_raw_rows",
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
	blueprint_bench_2: "https://andonlabs.com/evals/blueprint-bench-2",
	browsecomp:
		"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
	chartography: "https://surgehq.ai/benchmarks/chartography",
	chess_puzzles: "https://epoch.ai/data/benchmarks.csv",
	cursorbench: "https://cursor.com/cursorbench",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
	ebr_bench: "https://epoch.ai/data/benchmarks.csv",
	enterprisebench_corecraft:
		"https://surgehq.ai/benchmarks/enterprisebench-corecraft",
	epoch_capabilities_index: "https://epoch.ai/data/eci_scores.csv",
	frontiermath_tier_4: "https://epoch.ai/data/benchmarks.csv",
	gdp_pdf: "https://surgehq.ai/leaderboards/gdp-pdf",
	handbook_md: "https://surgehq.ai/benchmarks/handbook",
	mercor_apex_agents: "https://www.mercor.com/apex/apex-agents-leaderboard/",
	proofbench: "https://www.vals.ai/benchmarks/proof_bench",
	riemann_bench: "https://surgehq.ai/leaderboards/riemann-bench",
	vals_terminal_bench: "https://www.vals.ai/benchmarks/terminal-bench-2-1",
	toolathlon:
		"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
	vals_index: "https://www.vals.ai/benchmarks/vals_index",
	vending_bench_2: "https://andonlabs.com/evals/vending-bench-2",
	weirdml: "https://htihle.github.io/data/weirdml_data.csv",
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

export type SourceSnapshots = {
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
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	chartographyRows: BenchmarkScoreRow[];
	chessPuzzleRows: BenchmarkScoreRow[];
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	ebrBenchRows: BenchmarkScoreRow[];
	enterpriseBenchCoreCraftRows: BenchmarkScoreRow[];
	epochCapabilitiesIndexRows: BenchmarkScoreRow[];
	frontierMathTier4Rows: BenchmarkScoreRow[];
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	handbookMdRows: BenchmarkScoreRow[];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	proofBenchRows: BenchmarkScoreRow[];
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
	valsTerminalBenchRows: TerminalBenchTaskRow[];
	valsTerminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	weirdMlRows: BenchmarkScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: {
		artificialAnalysis: number | null;
		artificialAnalysisEvaluationResources: number | null;
		agentArena: number | null;
		agentsLastExam: number | null;
		blueprintBench: number | null;
		browseComp: number | null;
		chartography: number | null;
		chessPuzzles: number | null;
		cursorBench: number | null;
		deepSWE: number | null;
		ebrBench: number | null;
		enterpriseBenchCoreCraft: number | null;
		epochCapabilitiesIndex: number | null;
		frontierMathTier4: number | null;
		gdpPdf: number | null;
		handbookMd: number | null;
		mercorApexAgents: number | null;
		proofBench: number | null;
		riemannBench: number | null;
		valsTerminalBench: number | null;
		toolathlon: number | null;
		valsIndex: number | null;
		vendingBench2: number | null;
		weirdMl: number | null;
	};
};

export type SourceSnapshotStatus = {
	source: RawSourceName;
	fetchedAt: number | null;
	sourceInputCount: number;
	sourceRowStates: SourceRowState[];
	fetchedAtKey?: keyof SourceSnapshots["fetchedAt"];
};
