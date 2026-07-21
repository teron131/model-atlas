/** Shared public and handoff types for the LLM stats pipeline. */

import type { MatcherConfig } from "../matcher";
import type { NumberOrNull } from "../math-utils";
import type {
	AgentArenaModelScoreRow,
	AgentArenaRowsByModelName,
} from "../scrapers/agent-arena";
import type {
	AgentsLastExamModelScoreRow,
	AgentsLastExamRowsByModelName,
} from "../scrapers/agents-last-exam";
import type {
	AleBenchConfigurationRow,
	AleBenchModelScoreRow,
	AleBenchRowsByModelName,
} from "../scrapers/ale-bench";
import type {
	ArtificialAnalysisEvaluationResourceByBenchmark,
	ArtificialAnalysisEvaluationResourceRow,
} from "../scrapers/artificial-analysis/benchmark-resources";
import type {
	BenchmarkRowsByModelName,
	BenchmarkScoreRow,
} from "../scrapers/benchmark-score";
import type {
	BlueprintBenchModelScoreRow,
	BlueprintBenchRowsByModelName,
} from "../scrapers/blueprint-bench";
import type {
	BrowseCompModelScoreRow,
	BrowseCompRowsByModelName,
} from "../scrapers/browsecomp";
import type {
	CursorBenchModelScoreRow,
	CursorBenchRowsByModelName,
} from "../scrapers/cursorbench";
import type {
	DeepSWELeaderboardRow,
	DeepSWEModelScoreRow,
	DeepSWERowsByModelName,
} from "../scrapers/deep-swe";
import type {
	FrontierCodeModelEffortRow,
	FrontierCodeRowsByModelName,
} from "../scrapers/frontier-code";
import type {
	MercorApexAgentsRow,
	MercorApexAgentsRowsByModelName,
} from "../scrapers/mercor-apex-agents";
import type { ModelsDevFlatModel } from "../scrapers/models-dev";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import type {
	GdpPdfModelScoreRow,
	GdpPdfRowsByModelName,
} from "../scrapers/surge/gdp-pdf";
import type {
	RiemannBenchModelScoreRow,
	RiemannBenchRowsByModelName,
} from "../scrapers/surge/riemann-bench";
import type {
	ToolathlonModelScoreRow,
	ToolathlonRowsByModelName,
} from "../scrapers/toolathlon";
import type {
	HarveyLabModelScoreRow,
	HarveyLabRowsByModelName,
} from "../scrapers/vals/harvey-lab";
import type {
	ValsIndexModelScoreRow,
	ValsIndexRowsByModelName,
} from "../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchRowsByModelName,
} from "../scrapers/vals/terminal-bench";
import type {
	VendingBench2ModelScoreRow,
	VendingBench2RowsByModelName,
} from "../scrapers/vending-bench-2";
import type { JsonObject } from "../utils";
import type { TerminalBenchAggregateRow } from "./benchmarks/terminal-bench";

type ModelsDevModel = ModelsDevFlatModel;

export type ArtificialAnalysisModel = {
	model_id?: unknown;
	name?: unknown;
	reasoning_effort?: unknown;
	logo?: unknown;
	median_speed?: unknown;
	median_time?: unknown;
	median_end_to_end_response_time?: unknown;
	evaluations?: unknown;
	intelligence?: unknown;
	intelligence_index_cost?: unknown;
};

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
	| (Record<string, LlmStatsTaskMetricValues | null | undefined> & {
			artificial_analysis?: LlmStatsTaskMetricValues | null;
			agents_last_exam?: LlmStatsTaskMetricValues | null;
			ale_bench?: LlmStatsTaskMetricValues | null;
			apex_agents?: LlmStatsTaskMetricValues | null;
			automation_bench?: LlmStatsTaskMetricValues | null;
			briefcase?: LlmStatsTaskMetricValues | null;
			critpt?: LlmStatsTaskMetricValues | null;
			cursorbench?: LlmStatsTaskMetricValues | null;
			deep_swe?: LlmStatsTaskMetricValues | null;
			frontier_code?: LlmStatsTaskMetricValues | null;
			gdpval_normalized?: LlmStatsTaskMetricValues | null;
			harvey_lab?: LlmStatsTaskMetricValues | null;
			hle?: LlmStatsTaskMetricValues | null;
			itbench_sre?: LlmStatsTaskMetricValues | null;
			tau_banking?: LlmStatsTaskMetricValues | null;
			terminalbench_v21?: LlmStatsTaskMetricValues | null;
	  })
	| null;

export type LlmStatsEvaluations = LlmStatsBenchmarkValues & {
	agent_arena?: NumberOrNull;
	agents_last_exam?: NumberOrNull;
	ale_bench?: NumberOrNull;
	apex_agents?: NumberOrNull;
	automation_bench?: NumberOrNull;
	blueprint_bench_2?: NumberOrNull;
	briefcase?: NumberOrNull;
	browsecomp?: NumberOrNull;
	chartography?: NumberOrNull;
	chess_puzzles?: NumberOrNull;
	critpt?: NumberOrNull;
	cursorbench?: NumberOrNull;
	deep_swe?: NumberOrNull;
	ebr_bench?: NumberOrNull;
	enterprisebench_corecraft?: NumberOrNull;
	epoch_capabilities_index?: NumberOrNull;
	frontier_code?: NumberOrNull;
	frontiermath_tier_4?: NumberOrNull;
	gdp_pdf?: NumberOrNull;
	gdpval_normalized?: NumberOrNull;
	gpqa?: NumberOrNull;
	handbook_md?: NumberOrNull;
	harvey_lab?: NumberOrNull;
	hle?: NumberOrNull;
	itbench_sre?: NumberOrNull;
	lcr?: NumberOrNull;
	mmmu_pro?: NumberOrNull;
	proofbench?: NumberOrNull;
	riemann_bench?: NumberOrNull;
	scicode?: NumberOrNull;
	tau_banking?: NumberOrNull;
	terminalbench_v21?: NumberOrNull;
	toolathlon?: NumberOrNull;
	vals_index?: NumberOrNull;
	vending_bench_2?: NumberOrNull;
	weirdml?: NumberOrNull;
};

type LlmStatsScoringSourceRow =
	| JsonObject
	| ArtificialAnalysisEvaluationResourceRow
	| AgentArenaModelScoreRow
	| AgentsLastExamModelScoreRow
	| AleBenchModelScoreRow
	| BenchmarkScoreRow
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

export type BenchmarkGroup = "baseline" | "frontier";

type BenchmarkResourceSource = "artificial_analysis" | "benchmark";
type BenchmarkResourceUnit = "per_task" | "total";
type BenchmarkResourceTokenMeasure = "tokens" | "output_tokens";

export type BenchmarkResourcePolicy = {
	source: BenchmarkResourceSource;
	unit: BenchmarkResourceUnit;
	tokenMeasure: BenchmarkResourceTokenMeasure;
};

type BenchmarkDimensionLoadings = {
	intelligence: number;
	agentic: number;
};

export type BenchmarkPortfolioEntry = {
	group: BenchmarkGroup;
	benchmarkImportance: number;
	dimensionLoadings: BenchmarkDimensionLoadings;
	resourcePolicy?: BenchmarkResourcePolicy;
};

export type BenchmarkPortfolio = Readonly<
	Record<string, BenchmarkPortfolioEntry>
>;

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

type LlmStatsBenchmarkUpdateStatus =
	| "current"
	| "watch"
	| "stale_possible"
	| "missing";

export type LlmStatsBenchmarkUpdateEntry = {
	status: LlmStatsBenchmarkUpdateStatus;
	observed_count: number;
	checked_top_count: number;
	reference_top_count: number;
	overlap_count: number;
	overlap_model_ids: string[];
	top_model_ids: string[];
	checked_model_ids: string[];
	top_model_labels: string[];
	unrepresented_top_model_labels: string[];
	top_model_reference_rank: number | null;
	reference_metric: "intelligence_score";
};

export type LlmStatsBenchmarkUpdateHealth = Record<
	string,
	LlmStatsBenchmarkUpdateEntry
>;

type PriceProfile = {
	weight: number;
	input: number;
	output: number;
};

type PriceProfiles = Record<string, PriceProfile>;

type SimulationTokenRange = {
	lower: number;
	upper: number;
};

export type SimulationProfile = {
	weight: number;
	calls: number;
	input_tokens_per_call: SimulationTokenRange;
	output_tokens_per_call: SimulationTokenRange;
	cacheable_input_share: number;
	cache_hit_rate_after_first_call: SimulationTokenRange;
	full_credit_quality_score: number;
	quality_blend: {
		intelligence: number;
		agentic: number;
	};
};

type SimulationProfiles = Record<string, SimulationProfile>;

export type LlmStatsColumnTooltipRow = readonly [string, string];

export type LlmStatsColumnTooltipSectionKind =
	| "price_profile"
	| "price_share"
	| "workflow_simulation";

export type LlmStatsColumnTooltipNestedSection = {
	title: string;
	kind?: LlmStatsColumnTooltipSectionKind;
	weight?: string;
	rows: readonly LlmStatsColumnTooltipRow[];
};

export type LlmStatsColumnTooltipSectionItem =
	| LlmStatsColumnTooltipRow
	| LlmStatsColumnTooltipNestedSection;

type LlmStatsColumnTooltipSection = {
	title: string;
	hideTitle?: boolean;
	kind?: LlmStatsColumnTooltipSectionKind;
	weight?: string;
	rows: readonly LlmStatsColumnTooltipSectionItem[];
};

export type LlmStatsColumnTooltip = {
	title: string;
	body: string;
	rows?: readonly LlmStatsColumnTooltipRow[];
	sections?: readonly LlmStatsColumnTooltipSection[];
};

export type LlmStatsColumnTooltips = Record<string, LlmStatsColumnTooltip>;

export type LlmStatsMetadata = {
	artificial_analysis: {
		available_benchmark_keys: string[];
		available_evaluation_keys: string[];
		available_intelligence_keys: string[];
	};
	source_health?: LlmStatsSourceHealth;
	benchmark_update_health?: LlmStatsBenchmarkUpdateHealth;
	scoring: {
		intelligence_benchmark_keys: string[];
		intelligence_benchmark_display_keys: string[];
		missing_intelligence_benchmark_keys: string[];
		agentic_benchmark_keys: string[];
		agentic_benchmark_display_keys: string[];
		missing_agentic_benchmark_keys: string[];
		selected_benchmark_keys: string[];
		benchmark_portfolio: BenchmarkPortfolio;
		price_profiles: PriceProfiles;
		simulation_profiles: SimulationProfiles;
		seconds_per_input_token: number;
		column_tooltips: LlmStatsColumnTooltips;
		snapshot_preservation_version: number;
	};
};

export type LlmStatsPayload = {
	fetched_at_epoch_seconds: number | null;
	metadata: LlmStatsMetadata;
	deep_swe?: {
		rows: DeepSWELeaderboardRow[];
	};
	models: LlmStatsModel[];
};

export type LlmStatsOptions = {
	id?: string | null;
};

export type OpenRouterConfig = {
	speedConcurrency: number;
};

export type FinalStageConfig = {
	nullFieldPruneThreshold: number;
	nullFieldPruneRecentLookbackDays: number;
	benchmarkAdmission: BenchmarkAdmissionConfig;
};

export type BenchmarkAdmissionConfig = {
	indexBenchmarkKeys: readonly string[];
	minimumObservedBenchmarks: number;
	minimumObservedBenchmarksPerDimension: number;
};

export type SnapshotPreservationConfig = {
	minPreviousIntelligenceScore: number;
	minIntelligenceScoreDrop: number;
};

export type ScoringConfig = {
	intelligenceBenchmarkKeys: readonly string[];
	intelligenceBenchmarkDisplayKeys: readonly string[];
	agenticBenchmarkKeys: readonly string[];
	agenticBenchmarkDisplayKeys: readonly string[];
	defaultSpeedOutputTokenAnchors: readonly number[];
	speedOutputTokenRangeMin: number;
	speedOutputTokenRangeMax: number;
	speedAnchorQuantiles: readonly number[];
	priceProfiles: PriceProfiles;
	simulationProfiles: SimulationProfiles;
	secondsPerInputToken: number;
	benchmarkPortfolio: BenchmarkPortfolio;
	columnTooltips: LlmStatsColumnTooltips;
};

export type ModelAtlasStageConfig = {
	matcher: MatcherConfig;
	openrouter: OpenRouterConfig;
	final: FinalStageConfig;
	snapshotPreservation: SnapshotPreservationConfig;
	scoring: ScoringConfig;
};

type LlmStatsIndexedSourceRows<Row, Lookup> = {
	rows: Row[];
	rowsByModelName: Lookup;
};

export type LlmStatsSourceData = {
	artificialAnalysis: {
		rows: unknown[];
		bySlug: Map<string, ArtificialAnalysisModel>;
	};
	artificialAnalysisEvaluationResources: {
		rows: ArtificialAnalysisEvaluationResourceRow[];
		observationByModelName: ArtificialAnalysisEvaluationResourceByBenchmark;
		defaultEffortByModelName: ArtificialAnalysisEvaluationResourceByBenchmark;
	};
	modelsDev: {
		rows: ModelsDevModel[];
		byId: Map<string, ModelsDevModel>;
	};
	agentArena: LlmStatsIndexedSourceRows<
		AgentArenaModelScoreRow,
		AgentArenaRowsByModelName
	>;
	agentsLastExam: LlmStatsIndexedSourceRows<
		AgentsLastExamModelScoreRow,
		AgentsLastExamRowsByModelName
	>;
	aleBench: {
		configurationRows: AleBenchConfigurationRow[];
		sourceDefaultRows: AleBenchModelScoreRow[];
		rowsByModelName: AleBenchRowsByModelName;
	};
	blueprintBench: LlmStatsIndexedSourceRows<
		BlueprintBenchModelScoreRow,
		BlueprintBenchRowsByModelName
	>;
	browseComp: LlmStatsIndexedSourceRows<
		BrowseCompModelScoreRow,
		BrowseCompRowsByModelName
	>;
	chartography: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	chessPuzzles: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	cursorBench: LlmStatsIndexedSourceRows<
		CursorBenchModelScoreRow,
		CursorBenchRowsByModelName
	>;
	deepSWE: {
		effortRows: DeepSWELeaderboardRow[];
		defaultEffortRows: DeepSWEModelScoreRow[];
		rowsByModelName: DeepSWERowsByModelName;
	};
	ebrBench: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	enterpriseBenchCoreCraft: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	epochCapabilitiesIndex: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	frontierCode: LlmStatsIndexedSourceRows<
		FrontierCodeModelEffortRow,
		FrontierCodeRowsByModelName
	>;
	frontierMathTier4: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	gdpPdf: LlmStatsIndexedSourceRows<GdpPdfModelScoreRow, GdpPdfRowsByModelName>;
	handbookMd: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	harveyLab: LlmStatsIndexedSourceRows<
		HarveyLabModelScoreRow,
		HarveyLabRowsByModelName
	>;
	mercorApexAgents: LlmStatsIndexedSourceRows<
		MercorApexAgentsRow,
		MercorApexAgentsRowsByModelName
	>;
	proofBench: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
	riemannBench: LlmStatsIndexedSourceRows<
		RiemannBenchModelScoreRow,
		RiemannBenchRowsByModelName
	>;
	terminalBench: LlmStatsIndexedSourceRows<
		TerminalBenchModelHarnessRow,
		TerminalBenchRowsByModelName
	>;
	toolathlon: LlmStatsIndexedSourceRows<
		ToolathlonModelScoreRow,
		ToolathlonRowsByModelName
	>;
	valsIndex: LlmStatsIndexedSourceRows<
		ValsIndexModelScoreRow,
		ValsIndexRowsByModelName
	>;
	vendingBench2: LlmStatsIndexedSourceRows<
		VendingBench2ModelScoreRow,
		VendingBench2RowsByModelName
	>;
	weirdMl: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
};

export type LlmStatsEnrichmentResult = {
	rows: Record<string, unknown>[];
	openRouterSpeedById: Map<string, JsonObject>;
	openRouterPricingById: Map<string, JsonObject>;
	openRouterRawPayload?: OpenRouterRawScrapedPayload | null;
	speedOutputTokenAnchors: number[];
	deepSWEDefaultEffortRows?: readonly DeepSWEModelScoreRow[];
};
