/** Stable SQLite database contracts for the Model Atlas snapshot pipeline. */

import type { JsonObject } from "../../utils";
import type {
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScoreRow,
} from "../scrapers/agents-last-exam";
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
import type { RiemannBenchModelScoreRow } from "../scrapers/riemann-bench";
import type {
	TerminalBenchAgentModelAccuracyRow,
	TerminalBenchModelMedianAccuracyRow,
} from "../scrapers/terminal-bench";
import type { ToolathlonModelScoreRow } from "../scrapers/toolathlon";
import type { LlmStatsSourceData, LlmStatsSourceHealth } from "../stats/types";

export const DEFAULT_DATABASE_PATH = ".cache/database.sqlite";
export const RAW_SOURCE_CACHE_SECONDS = 24 * 60 * 60;

export const RAW_SOURCE_NAMES = [
	"artificial_analysis",
	"models_dev",
	"deep_swe",
	"terminal_bench",
	"agents_last_exam",
	"blueprint_bench_2",
	"gdp_pdf",
	"riemann_bench",
	"browsecomp",
	"toolathlon",
	"cursorbench",
	"openrouter",
] as const;

export const SOURCE_URLS = {
	artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
	models_dev: "https://models.dev/api.json",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
	terminal_bench: "https://www.tbench.ai/leaderboard/terminal-bench/2.0",
	agents_last_exam: "https://agenthle.org/leaderboard",
	blueprint_bench_2: "https://andonlabs.com/evals/blueprint-bench-2",
	gdp_pdf: "https://surgehq.ai/leaderboards/gdp-pdf",
	riemann_bench: "https://surgehq.ai/leaderboards/riemann-bench",
	browsecomp:
		"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
	toolathlon:
		"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
	cursorbench: "https://cursor.com/cursorbench",
	openrouter_models: "https://openrouter.ai/api/frontend/models",
	openrouter_stats: "https://openrouter.ai/api/frontend/stats/*",
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
	aa_id: string | null;
	aa_slug: string | null;
	aa_name: string | null;
	aa_raw_row_index: number | null;
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

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

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
	aaRawRows: JsonObject[];
	aaSelectedRows: JsonObject[];
	modelsDevPayload: ModelsDevPayload;
	modelsDevModels: ModelsDevFlatModel[];
	modelsDevFetchedAt: number | null;
	modelsDevStatusCode: number | null;
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWEModelScoreRows: LlmStatsSourceData["deepSWEModelScoreRows"];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	terminalBenchRows: TerminalBenchAgentModelAccuracyRow[];
	terminalBenchModelScores: TerminalBenchModelMedianAccuracyRow[];
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: {
		artificialAnalysis: number | null;
		deepSWE: number | null;
		terminalBench: number | null;
		agentsLastExam: number | null;
		blueprintBench: number | null;
		gdpPdf: number | null;
		riemannBench: number | null;
		browseComp: number | null;
		toolathlon: number | null;
		cursorBench: number | null;
	};
};
