/** Shared public and handoff types for the selected Model Atlas pipeline. */
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
	DeepSWELeaderboardRow,
	DeepSWEModelScoreRow,
	DeepSWEScoreByModelName,
} from "../scrapers/deep-swe";
import type { getModelsDevStats } from "../scrapers/models-dev";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import type { TerminalBenchAccuracyByModelName } from "../scrapers/terminal-bench";

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

export type ModelStatsSelectedModalities = {
	input?: string[];
	output?: string[];
};

export type ModelStatsSelectedCostBreakdown = {
	input?: NumberOrNull;
	output?: NumberOrNull;
	cache_read?: NumberOrNull;
	cache_write?: NumberOrNull;
};

export type ModelStatsSelectedCostTier = ModelStatsSelectedCostBreakdown & {
	tier?: {
		type?: string;
		size?: NumberOrNull;
	};
};

export type ModelStatsSelectedCost =
	| (ModelStatsSelectedCostBreakdown & {
			weighted_input?: NumberOrNull;
			weighted_output?: NumberOrNull;
			blended_price?: NumberOrNull;
			context_over_200k?: ModelStatsSelectedCostBreakdown;
			tiers?: ModelStatsSelectedCostTier[];
	  })
	| null;

export type ModelStatsSelectedContextWindow = {
	context?: NumberOrNull;
	input?: NumberOrNull;
	output?: NumberOrNull;
} | null;

export type ModelStatsSelectedSpeed = {
	throughput_tokens_per_second_median: NumberOrNull;
	latency_seconds_median: NumberOrNull;
	e2e_latency_seconds_median: NumberOrNull;
};

export type ModelStatsSelectedBenchmarkValues = {
	[key: string]: NumberOrNull | undefined;
};

export type ModelStatsSelectedIntelligence =
	ModelStatsSelectedBenchmarkValues & {
		intelligence_index?: NumberOrNull;
		agentic_index?: NumberOrNull;
		coding_index?: NumberOrNull;
		omniscience_index?: NumberOrNull;
		omniscience_accuracy?: NumberOrNull;
		omniscience_nonhallucination_rate?: NumberOrNull;
	};

export type ModelStatsSelectedIntelligenceIndexCost = {
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

export type ModelStatsSelectedTaskMetricValues = {
	cost?: NumberOrNull;
	seconds?: NumberOrNull;
	input_tokens?: NumberOrNull;
	output_tokens?: NumberOrNull;
};

export type ModelStatsSelectedTaskMetrics = {
	artificial_analysis?: ModelStatsSelectedTaskMetricValues | null;
	deep_swe?: ModelStatsSelectedTaskMetricValues | null;
	agents_last_exam?: ModelStatsSelectedTaskMetricValues | null;
} | null;

export type ModelStatsSelectedEvaluations =
	ModelStatsSelectedBenchmarkValues & {
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
		terminalbench_hard?: NumberOrNull;
	};

export type ModelStatsScoringSources = {
	deep_swe?: DeepSWEModelScoreRow | null;
	agents_last_exam?: AgentsLastExamModelScoreRow | null;
} | null;

export type ModelStatsNullableScores = {
	intelligence_score: NumberOrNull;
	agentic_score: NumberOrNull;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
};

export type ModelStatsSelectedScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
};

export type ModelStatsNullableRelativeScores = ModelStatsNullableScores & {
	overall_score: NumberOrNull;
};

export type ModelStatsSelectedRelativeScores = {
	intelligence_score: number;
	agentic_score: number;
	speed_score: NumberOrNull;
	value_score: NumberOrNull;
	overall_score: number;
};

type ModelStatsModelFields = {
	id: string | null;
	name: string | null;
	provider: string | null;
	logo: string;
	attachment: boolean | null;
	reasoning: boolean | null;
	release_date: string | null;
	modalities: ModelStatsSelectedModalities | null;
	open_weights: boolean | null;
	cost: ModelStatsSelectedCost;
	context_window: ModelStatsSelectedContextWindow;
	speed: ModelStatsSelectedSpeed;
	intelligence: ModelStatsSelectedIntelligence | null;
	intelligence_index_cost: ModelStatsSelectedIntelligenceIndexCost;
	task_metrics: ModelStatsSelectedTaskMetrics;
	evaluations: ModelStatsSelectedEvaluations | null;
};

export type ModelStatsModelCandidate = ModelStatsModelFields & {
	scoring_sources?: ModelStatsScoringSources;
	scores: ModelStatsNullableScores | null;
	relative_scores: null;
};

export type ModelStatsScoredCandidate = ModelStatsModelFields & {
	scoring_sources?: ModelStatsScoringSources;
	scores: ModelStatsNullableScores | null;
	relative_scores: ModelStatsNullableRelativeScores;
};

export type ModelStatsSelectedModel = ModelStatsModelFields & {
	scores: ModelStatsSelectedScores;
	relative_scores: ModelStatsSelectedRelativeScores;
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

export type ModelStatsColumnTooltipRow = readonly [string, string];

export type ModelStatsColumnTooltipSectionKind =
	| "price_profile"
	| "price_share"
	| "workflow_simulation";

export type ModelStatsColumnTooltipNestedSection = {
	title: string;
	kind?: ModelStatsColumnTooltipSectionKind;
	weight?: string;
	rows: readonly ModelStatsColumnTooltipRow[];
};

export type ModelStatsColumnTooltipSectionItem =
	| ModelStatsColumnTooltipRow
	| ModelStatsColumnTooltipNestedSection;

export type ModelStatsColumnTooltipSection = {
	title: string;
	hideTitle?: boolean;
	kind?: ModelStatsColumnTooltipSectionKind;
	weight?: string;
	rows: readonly ModelStatsColumnTooltipSectionItem[];
};

export type ModelStatsColumnTooltip = {
	title: string;
	body: string;
	rows?: readonly ModelStatsColumnTooltipRow[];
	sections?: readonly ModelStatsColumnTooltipSection[];
};

export type ModelStatsColumnTooltips = Record<string, ModelStatsColumnTooltip>;

export type ModelStatsSelectedMetadata = {
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
		column_tooltips: ModelStatsColumnTooltips;
	};
};

export type ModelStatsSelectedPayload = {
	fetched_at_epoch_seconds: number | null;
	metadata: ModelStatsSelectedMetadata;
	deep_swe?: {
		rows: DeepSWELeaderboardRow[];
	};
	models: ModelStatsSelectedModel[];
};

export type ModelStatsSelectedOptions = {
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
	columnTooltips: ModelStatsColumnTooltips;
};

export type ModelAtlasStageConfig = {
	matcher: MatcherConfig;
	openrouter: OpenRouterConfig;
	final: FinalStageConfig;
	scoring: ScoringConfig;
};

export type ModelStatsSourceData = {
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
};

export type EnrichedRows = {
	rows: Record<string, unknown>[];
	openRouterSpeedById: Map<string, JsonObject>;
	openRouterPricingById: Map<string, JsonObject>;
	speedOutputTokenAnchors: number[];
	deepSWEModelScoreRows?: readonly DeepSWEModelScoreRow[];
	openRouterRawPayload?: OpenRouterRawScrapedPayload | null;
};
