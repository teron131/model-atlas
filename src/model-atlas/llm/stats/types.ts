/** Shared public and handoff types for the LLM stats pipeline. */
import type { JsonObject, NumberOrNull } from "../../utils";
import type {
	AgentsLastExamModelScoreRow,
	AgentsLastExamScoreByModelName,
} from "../scrapers/agents-last-exam";
import type {
	AutomationBenchModelScoreRow,
	AutomationBenchScoreByModelName,
} from "../scrapers/automation-bench";
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
import type { getModelsDevStats } from "../scrapers/models-dev";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import type { TerminalBenchAccuracyByModelName } from "../scrapers/terminal-bench";
import type {
	ToolathlonModelScoreRow,
	ToolathlonScoreByModelName,
} from "../scrapers/toolathlon";

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
	omniscience_nonhallucination_rate?: NumberOrNull;
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
} | null;

export type LlmStatsTaskMetricValues = {
	cost?: NumberOrNull;
	seconds?: NumberOrNull;
	input_tokens?: NumberOrNull;
	output_tokens?: NumberOrNull;
};

export type LlmStatsTaskMetrics = {
	artificial_analysis?: LlmStatsTaskMetricValues | null;
	deep_swe?: LlmStatsTaskMetricValues | null;
	agents_last_exam?: LlmStatsTaskMetricValues | null;
} | null;

export type LlmStatsEvaluations = LlmStatsBenchmarkValues & {
	apex_agents?: NumberOrNull;
	critpt?: NumberOrNull;
	gdpval_normalized?: NumberOrNull;
	gpqa?: NumberOrNull;
	hle?: NumberOrNull;
	ifbench?: NumberOrNull;
	lcr?: NumberOrNull;
	mmmu_pro?: NumberOrNull;
	scicode?: NumberOrNull;
	deep_swe?: NumberOrNull;
	agents_last_exam?: NumberOrNull;
	automation_bench?: NumberOrNull;
	terminal_bench_2?: NumberOrNull;
	browsecomp?: NumberOrNull;
	toolathlon?: NumberOrNull;
	cursorbench?: NumberOrNull;
	terminalbench_hard?: NumberOrNull;
};

export type LlmStatsScoringSources = {
	deep_swe?: DeepSWEModelScoreRow | null;
	agents_last_exam?: AgentsLastExamModelScoreRow | null;
} | null;

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

export type LlmStatsNullableRelativeScores = LlmStatsNullableScores & {
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

export type BenchmarkPortfolioEntry = {
	group: BenchmarkGroup;
	intelligencePortion: number;
	agenticPortion: number;
};

export type BenchmarkPortfolio = Readonly<
	Record<string, BenchmarkPortfolioEntry>
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
	scoring: ScoringConfig;
};

export type LlmStatsSourceData = {
	artificialAnalysisRows: unknown[];
	preferredModelsDevModels: ModelsDevModel[];
	modelsDevById: Map<string, ModelsDevModel>;
	artificialAnalysisBySlug: Map<string, ArtificialAnalysisModel>;
	deepSWEModelScoreRows: DeepSWEModelScoreRow[];
	deepSWEScoreByModelName: DeepSWEScoreByModelName;
	terminalBenchAccuracyByModelName: TerminalBenchAccuracyByModelName;
	agentsLastExamModelScoreRows: AgentsLastExamModelScoreRow[];
	agentsLastExamScoreByModelName: AgentsLastExamScoreByModelName;
	automationBenchModelScoreRows: AutomationBenchModelScoreRow[];
	automationBenchScoreByModelName: AutomationBenchScoreByModelName;
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	browseCompScoreByModelName: BrowseCompScoreByModelName;
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	toolathlonScoreByModelName: ToolathlonScoreByModelName;
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	cursorBenchScoreByModelName: CursorBenchScoreByModelName;
};

export type EnrichedRows = {
	rows: Record<string, unknown>[];
	openRouterSpeedById: Map<string, JsonObject>;
	openRouterPricingById: Map<string, JsonObject>;
	speedOutputTokenAnchors: number[];
	deepSWEModelScoreRows?: readonly DeepSWEModelScoreRow[];
	openRouterRawPayload?: OpenRouterRawScrapedPayload | null;
};
