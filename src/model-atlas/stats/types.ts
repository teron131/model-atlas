/** Shared public and handoff types for the LLM stats pipeline. */

import type {
	AgentsLastExamModelScoreRow,
	AgentsLastExamScoreByModelName,
} from "../scrapers/agents-last-exam";
import type {
	ArtificialAnalysisEvaluationResourceByBenchmark,
	ArtificialAnalysisEvaluationResourceRow,
} from "../scrapers/artificial-analysis/evaluation-resources";
import type {
	AutomationBenchModelScoreRow,
	AutomationBenchScoreByModelName,
} from "../scrapers/automation-bench";
import type {
	BlueprintBenchModelScoreRow,
	BlueprintBenchScoreByModelName,
} from "../scrapers/blueprint-bench";
import type {
	BrowseCompModelScoreRow,
	BrowseCompScoreByModelName,
} from "../scrapers/browsecomp";
import type {
	CursorBenchModelScoreRow,
	CursorBenchScoreByModelName,
} from "../scrapers/cursorbench";
import type {
	DeepSWELeaderboardRow,
	DeepSWEModelScoreRow,
	DeepSWEScoreByModelName,
} from "../scrapers/deep-swe";
import type {
	GdpPdfModelScoreRow,
	GdpPdfScoreByModelName,
} from "../scrapers/gdp-pdf";
import type { getModelsDevStats } from "../scrapers/models-dev";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import type {
	RiemannBenchModelScoreRow,
	RiemannBenchScoreByModelName,
} from "../scrapers/riemann-bench";
import type {
	ToolathlonModelScoreRow,
	ToolathlonScoreByModelName,
} from "../scrapers/toolathlon";
import type {
	ValsIndexModelScoreRow,
	ValsIndexScoreByModelName,
} from "../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchRowsByModelName,
} from "../scrapers/vals/terminal-bench";
import type { JsonObject, NumberOrNull } from "../utils";
import type { TerminalBenchAggregateRow } from "./benchmarks/terminal-bench";

export type ModelsDevModel = Awaited<
	ReturnType<typeof getModelsDevStats>
>["models"][number];

export type ArtificialAnalysisModel = {
	model_id?: unknown;
	name?: unknown;
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
			deep_swe?: LlmStatsTaskMetricValues | null;
			agents_last_exam?: LlmStatsTaskMetricValues | null;
	  })
	| null;

export type LlmStatsEvaluations = LlmStatsBenchmarkValues & {
	apex_agents?: NumberOrNull;
	critpt?: NumberOrNull;
	gdpval_normalized?: NumberOrNull;
	gpqa?: NumberOrNull;
	hle?: NumberOrNull;
	lcr?: NumberOrNull;
	mmmu_pro?: NumberOrNull;
	scicode?: NumberOrNull;
	tau_banking?: NumberOrNull;
	deep_swe?: NumberOrNull;
	agents_last_exam?: NumberOrNull;
	automation_bench?: NumberOrNull;
	blueprint_bench_2?: NumberOrNull;
	gdp_pdf?: NumberOrNull;
	riemann_bench?: NumberOrNull;
	browsecomp?: NumberOrNull;
	toolathlon?: NumberOrNull;
	cursorbench?: NumberOrNull;
	terminalbench_v21?: NumberOrNull;
	vals_index?: NumberOrNull;
};

export type LlmStatsScoringSourceRow =
	| JsonObject
	| AgentsLastExamModelScoreRow
	| ArtificialAnalysisEvaluationResourceRow
	| TerminalBenchAggregateRow
	| AutomationBenchModelScoreRow
	| CursorBenchModelScoreRow
	| DeepSWEModelScoreRow;

export type LlmStatsScoringSources =
	| (Record<string, LlmStatsScoringSourceRow | null | undefined> & {
			deep_swe?: DeepSWEModelScoreRow | null;
			agents_last_exam?: AgentsLastExamModelScoreRow | null;
			terminalbench_v21?: TerminalBenchAggregateRow | null;
			automation_bench?: AutomationBenchModelScoreRow | null;
			cursorbench?: CursorBenchModelScoreRow | null;
	  })
	| null;

export type LlmStatsNullableScores = {
	intelligence_score: NumberOrNull;
	agentic_score: NumberOrNull;
	speed_score: NumberOrNull;
};

export type LlmStatsScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
};

export type LlmStatsNullableRelativeScores = {
	intelligence_score: NumberOrNull;
	agentic_score: NumberOrNull;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
	overall_score: NumberOrNull;
};

export type LlmStatsRelativeScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
	overall_score: number;
};

type LlmStatsModelFields = {
	id: string | null;
	name: string | null;
	provider: string | null;
	logo: string;
	attachment: boolean | null;
	reasoning: boolean | null;
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
	scores: LlmStatsNullableScores | null;
	relative_scores: null;
};

export type LlmStatsScoredCandidate = LlmStatsModelFields & {
	scoring_sources?: LlmStatsScoringSources;
	scores: LlmStatsNullableScores | null;
	relative_scores: LlmStatsNullableRelativeScores;
};

export type LlmStatsModel = LlmStatsModelFields & {
	scores: LlmStatsScores;
	relative_scores: LlmStatsRelativeScores;
};

export type OverallRelativeScoreWeights = {
	intelligence: number;
	agentic: number;
	speed: number;
	value: number;
};

export type QualityScoreWeights = {
	index: number;
	baseline: number;
	frontier: number;
};

export type BenchmarkGroup = "baseline" | "frontier";

export type BenchmarkResourceSource = "artificial_analysis" | "benchmark";
export type BenchmarkResourceUnit = "per_task" | "total";
export type BenchmarkResourceTokenMeasure = "tokens" | "output_tokens";

export type BenchmarkResourcePolicy = {
	source: BenchmarkResourceSource;
	unit: BenchmarkResourceUnit;
	tokenMeasure: BenchmarkResourceTokenMeasure;
};

export type BenchmarkPortfolioEntry = {
	group: BenchmarkGroup;
	intelligencePortion: number;
	agenticPortion: number;
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

export type LlmStatsBenchmarkUpdateStatus =
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
	reference_metric: "overall_score";
};

export type LlmStatsBenchmarkUpdateHealth = Record<
	string,
	LlmStatsBenchmarkUpdateEntry
>;

export type PriceProfile = {
	weight: number;
	input: number;
	output: number;
};

export type PriceProfiles = Record<string, PriceProfile>;

export type SimulationTokenRange = {
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
	quality_full_credit_at: number;
	quality_blend: {
		intelligence: number;
		agentic: number;
	};
};

export type SimulationProfiles = Record<string, SimulationProfile>;

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

export type LlmStatsColumnTooltipSection = {
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
		simulation_input_token_seconds: number;
		quality_score_weights: QualityScoreWeights;
		overall_relative_score_weights: OverallRelativeScoreWeights;
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

export type MatcherConfig = {
	variantTokens: readonly string[];
};

export type OpenRouterConfig = {
	speedConcurrency: number;
};

export type FinalStageConfig = {
	nullFieldPruneThreshold: number;
	nullFieldPruneRecentLookbackDays: number;
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
	simulationInputTokenSeconds: number;
	benchmarkPortfolio: BenchmarkPortfolio;
	frontierBenchmarkKeys: readonly string[];
	qualityScoreWeights: QualityScoreWeights;
	overallRelativeScoreWeights: OverallRelativeScoreWeights;
	columnTooltips: LlmStatsColumnTooltips;
};

export type ModelAtlasStageConfig = {
	matcher: MatcherConfig;
	openrouter: OpenRouterConfig;
	final: FinalStageConfig;
	snapshotPreservation: SnapshotPreservationConfig;
	scoring: ScoringConfig;
};

export type LlmStatsScoreSourceRows<Row, Lookup> = {
	rows: Row[];
	scoreByModelName: Lookup;
};

export type LlmStatsSourceData = {
	artificialAnalysis: {
		rows: unknown[];
		bySlug: Map<string, ArtificialAnalysisModel>;
	};
	artificialAnalysisEvaluationResources: LlmStatsScoreSourceRows<
		ArtificialAnalysisEvaluationResourceRow,
		ArtificialAnalysisEvaluationResourceByBenchmark
	>;
	modelsDev: {
		rows: ModelsDevModel[];
		byId: Map<string, ModelsDevModel>;
	};
	agentsLastExam: LlmStatsScoreSourceRows<
		AgentsLastExamModelScoreRow,
		AgentsLastExamScoreByModelName
	>;
	automationBench: LlmStatsScoreSourceRows<
		AutomationBenchModelScoreRow,
		AutomationBenchScoreByModelName
	>;
	blueprintBench: LlmStatsScoreSourceRows<
		BlueprintBenchModelScoreRow,
		BlueprintBenchScoreByModelName
	>;
	browseComp: LlmStatsScoreSourceRows<
		BrowseCompModelScoreRow,
		BrowseCompScoreByModelName
	>;
	cursorBench: LlmStatsScoreSourceRows<
		CursorBenchModelScoreRow,
		CursorBenchScoreByModelName
	>;
	deepSWE: LlmStatsScoreSourceRows<
		DeepSWEModelScoreRow,
		DeepSWEScoreByModelName
	>;
	gdpPdf: LlmStatsScoreSourceRows<GdpPdfModelScoreRow, GdpPdfScoreByModelName>;
	riemannBench: LlmStatsScoreSourceRows<
		RiemannBenchModelScoreRow,
		RiemannBenchScoreByModelName
	>;
	toolathlon: LlmStatsScoreSourceRows<
		ToolathlonModelScoreRow,
		ToolathlonScoreByModelName
	>;
	valsIndex: LlmStatsScoreSourceRows<
		ValsIndexModelScoreRow,
		ValsIndexScoreByModelName
	>;
	valsTerminalBench: LlmStatsScoreSourceRows<
		TerminalBenchModelHarnessRow,
		TerminalBenchRowsByModelName
	>;
};

export type LlmStatsEnrichmentResult = {
	rows: Record<string, unknown>[];
	openRouterSpeedById: Map<string, JsonObject>;
	openRouterPricingById: Map<string, JsonObject>;
	speedOutputTokenAnchors: number[];
	deepSWEModelScoreRows?: readonly DeepSWEModelScoreRow[];
	openRouterRawPayload?: OpenRouterRawScrapedPayload | null;
};
