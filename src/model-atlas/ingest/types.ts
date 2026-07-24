/** Ingest contracts for raw caches, source snapshots, and the handoff into storage writers and payload readers. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import type { AgentArenaModelScoreRow } from "../benchmarks/scrapers/agent-arena";
import type {
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScoreRow,
} from "../benchmarks/scrapers/agents-last-exam";
import type { AleBenchConfigurationRow } from "../benchmarks/scrapers/ale-bench";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../benchmarks/scrapers/artificial-analysis/results";
import type { BlueprintBenchModelScoreRow } from "../benchmarks/scrapers/blueprint-bench";
import type { CursorBenchModelScoreRow } from "../benchmarks/scrapers/cursorbench";
import type { DeepSWERawLeaderboardRow } from "../benchmarks/scrapers/deep-swe";
import type { FrontierCodeModelEffortRow } from "../benchmarks/scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../benchmarks/scrapers/mercor-apex-agents";
import type { GdpPdfModelScoreRow } from "../benchmarks/scrapers/surge/gdp-pdf";
import type { RiemannBenchModelScoreRow } from "../benchmarks/scrapers/surge/riemann-bench";
import type {
	HarveyLabModelScoreRow,
	HarveyLabTaskRow,
} from "../benchmarks/scrapers/vals/harvey-lab";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../benchmarks/scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../benchmarks/scrapers/vals/terminal-bench";
import type { VendingBench2ModelScoreRow } from "../benchmarks/scrapers/vending-bench-2";
import type { JsonObject } from "../runtime";
import type {
	ModelsDevFlatModel,
	ModelsDevPayload,
} from "../scrapers/models-dev";
import type { RawSourceName } from "./source-registry";

export type ModelAtlasSourceHealthStatus =
	| "cache_hit"
	| "fresh"
	| "using_cached_rows"
	| "empty";

export type ModelAtlasSourceHealthEntry = {
	status: ModelAtlasSourceHealthStatus;
	last_fetch_epoch_seconds: number | null;
	source_input_count: number;
	active_row_count: number;
	quarantined_row_count: number;
};

export type ModelAtlasSourceHealth = {
	generated_at_epoch_seconds: number | null;
	sources: Record<string, ModelAtlasSourceHealthEntry>;
};

export type DatabaseBuildResult = {
	path: string;
	source_rows: Record<string, number>;
	source_cache: Record<RawSourceName, RawSourceCacheStatus>;
	source_health: ModelAtlasSourceHealth;
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
	artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
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
	frontierCodeRows: FrontierCodeModelEffortRow[];
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	harveyLabRows: HarveyLabTaskRow[];
	harveyLabModelScoreRows: HarveyLabModelScoreRow[];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchPersistenceUrl: string;
	terminalBenchRows: TerminalBenchTaskRow[];
	terminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	sourceRowStates: SourceRowState[];
	fetchedAt: BenchmarkObservationFetchedAt & {
		artificialAnalysis: number | null;
		artificialAnalysisBenchmarkResources: number | null;
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
