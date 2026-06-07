/** Stable SQLite database contracts for the Model Atlas snapshot pipeline. */

import type { JsonObject } from "../../utils";
import type { SourceData } from "../llm-stats/types";
import type { DeepSWELeaderboardRow } from "../sources/deep-swe-scraper";
import type {
	ModelsDevFlatModel,
	ModelsDevPayload,
} from "../sources/models-dev";
import type {
	TerminalBenchAgentModelAccuracyRow,
	TerminalBenchModelMedianAccuracyRow,
} from "../sources/terminal-bench-scraper";

export const DEFAULT_DATABASE_PATH = ".cache/database.sqlite";
export const RAW_SOURCE_CACHE_SECONDS = 24 * 60 * 60;

export const RAW_SOURCE_NAMES = [
	"artificial_analysis",
	"models_dev",
	"deep_swe",
	"terminal_bench",
	"openrouter",
] as const;

export const SOURCE_URLS = {
	artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
	models_dev: "https://models.dev/api.json",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/leaderboard-live.json",
	terminal_bench: "https://www.tbench.ai/leaderboard/terminal-bench/2.0",
	openrouter_models: "https://openrouter.ai/api/frontend/models",
	openrouter_stats: "https://openrouter.ai/api/frontend/stats/*",
} as const;

export type DatabaseBuildResult = {
	path: string;
	run_id: number;
	source_rows: Record<string, number>;
	source_cache: Record<RawSourceName, RawSourceCacheStatus>;
	final_model_count: number;
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

export type SourceSnapshots = {
	aaRawRows: JsonObject[];
	aaSelectedRows: JsonObject[];
	modelsDevPayload: ModelsDevPayload;
	modelsDevModels: ModelsDevFlatModel[];
	modelsDevFetchedAt: number | null;
	modelsDevStatusCode: number | null;
	deepSWERawRows: DeepSWELeaderboardRow[];
	deepSWEModelScoreRows: SourceData["deepSWEModelScoreRows"];
	terminalBenchRows: TerminalBenchAgentModelAccuracyRow[];
	terminalBenchModelScores: TerminalBenchModelMedianAccuracyRow[];
	fetchedAt: {
		artificialAnalysis: number | null;
		deepSWE: number | null;
		terminalBench: number | null;
	};
};
