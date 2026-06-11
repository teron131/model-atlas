/** Stats package exports. */

export {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BASELINE_BENCHMARKS,
	BENCHMARK_PORTFOLIO,
	FRONTIER_BENCHMARKS,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	OVERALL_RELATIVE_SCORE_WEIGHTS,
	PRICE_PROFILES,
	SELECTED_AGENTIC_BENCHMARKS,
	SELECTED_INTELLIGENCE_BENCHMARKS,
	STAGE_CONFIG,
} from "./constants";
export type {
	ImageMatchCandidate,
	ImageMatchMappedModel,
	ImageMatchModelMappingOptions,
	ImageMatchModelMappingPayload,
} from "./image/matcher";
export { getImageMatchModelMapping } from "./image/matcher";
export type {
	ArenaAiImageOptions,
	ArenaAiImageOutputPayload,
} from "./image/sources/arena-ai";
export { getArenaAiImageStats } from "./image/sources/arena-ai";
export type {
	ArtificialAnalysisImageOptions,
	ArtificialAnalysisImageOutputPayload,
} from "./image/sources/artificial-analysis";
export { getArtificialAnalysisImageStats } from "./image/sources/artificial-analysis";
export type {
	ImageStatsModel,
	ImageStatsOptions,
	ImageStatsPayload,
} from "./image/stats";
export {
	getImageStats,
	saveImageStats,
} from "./image/stats";
export type {
	LlmMatchCandidate,
	LlmMatchMappedModel,
	LlmMatchModelMappingOptions,
	LlmMatchModelMappingPayload,
	LlmMatchResult,
	LlmScraperFallbackMatchDiagnosticsPayload,
} from "./llm/matcher";
export { getMatchModelMapping } from "./llm/matcher";
export type {
	AgentsLastExamHarnessPayload,
	AgentsLastExamHarnessRow,
	AgentsLastExamModelScorePayload,
	AgentsLastExamModelScoreRow,
	AgentsLastExamScraperOptions,
} from "./llm/scrapers/agents-last-exam";
export {
	agentsLastExamBenchmarkScore,
	buildAgentsLastExamScoreByModelName,
	findAgentsLastExamModelScore,
	getAgentsLastExamHarnessStats,
	getAgentsLastExamModelScoreStats,
	processAgentsLastExamLeaderboardRows,
	summarizeAgentsLastExamModelScores,
} from "./llm/scrapers/agents-last-exam";
export type { ArtificialAnalysisOptions } from "./llm/scrapers/artificial-analysis-api";
export { getArtificialAnalysisStats } from "./llm/scrapers/artificial-analysis-api";
export type {
	ArtificialAnalysisScrapedPayload,
	ArtificialAnalysisScrapedRawPayload,
	ArtificialAnalysisScraperOptions,
	ArtificialAnalysisScraperProcessOptions,
} from "./llm/scrapers/artificial-analysis-evals";
export {
	ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS,
	getArtificialAnalysisScrapedEvalsOnlyStats,
	getArtificialAnalysisScrapedRawStats,
	getArtificialAnalysisScrapedStats,
	processArtificialAnalysisScrapedRows,
} from "./llm/scrapers/artificial-analysis-evals";
export type {
	AutomationBenchDomainModel,
	AutomationBenchDomainRow,
	AutomationBenchLeaderboardPayload,
	AutomationBenchModelScoreRow,
	AutomationBenchOverallRow,
	AutomationBenchScraperOptions,
} from "./llm/scrapers/automation-bench";
export {
	buildAutomationBenchScoreByModelName,
	findAutomationBenchScore,
	getAutomationBenchLeaderboardStats,
	processAutomationBenchDomainText,
	processAutomationBenchOverallText,
	processAutomationBenchPageHtml,
	summarizeAutomationBenchModelScores,
} from "./llm/scrapers/automation-bench";
export type {
	BlueprintBenchModelScorePayload,
	BlueprintBenchModelScoreRow,
	BlueprintBenchScraperOptions,
} from "./llm/scrapers/blueprint-bench";
export {
	buildBlueprintBenchScoreByModelName,
	findBlueprintBenchScore,
	getBlueprintBenchModelScoreStats,
	processBlueprintBenchPageHtml,
} from "./llm/scrapers/blueprint-bench";
export type {
	BrowseCompModelScorePayload,
	BrowseCompModelScoreRow,
	BrowseCompScraperOptions,
} from "./llm/scrapers/browsecomp";
export {
	buildBrowseCompScoreByModelName,
	findBrowseCompScore,
	getBrowseCompModelScoreStats,
	processBrowseCompDetailsJson,
} from "./llm/scrapers/browsecomp";
export type {
	CursorBenchModelScorePayload,
	CursorBenchModelScoreRow,
	CursorBenchScraperOptions,
} from "./llm/scrapers/cursorbench";
export {
	buildCursorBenchScoreByModelName,
	findCursorBenchScore,
	getCursorBenchModelScoreStats,
	processCursorBenchPageHtml,
} from "./llm/scrapers/cursorbench";
export type {
	DeepSWELeaderboardPayload,
	DeepSWELeaderboardRow,
	DeepSWEModelScoreRow,
	DeepSWEScraperOptions,
} from "./llm/scrapers/deep-swe";
export {
	buildDeepSWEScoreByModelName,
	findDeepSWEModelScore,
	getDeepSWEModelScoreStats,
	getDeepSWERawLeaderboardStats,
	summarizeDeepSWEBestModelScores,
	summarizeDeepSWEDefaultModelScores,
} from "./llm/scrapers/deep-swe";
export type {
	GdpPdfModelScorePayload,
	GdpPdfModelScoreRow,
	GdpPdfScraperOptions,
} from "./llm/scrapers/gdp-pdf";
export {
	buildGdpPdfScoreByModelName,
	findGdpPdfScore,
	getGdpPdfModelScoreStats,
	processGdpPdfPageHtml,
} from "./llm/scrapers/gdp-pdf";
export type {
	ModelRecord,
	ModelsDevFlatModel,
	ModelsDevOptions,
	ModelsDevPayload,
	ModelsDevSourcePayload,
	ProviderRecord,
	VercelGatewayModelRecord,
} from "./llm/scrapers/models-dev";
export {
	getModelsDevSourceStats,
	getModelsDevStats,
	processModelsDevPayload,
} from "./llm/scrapers/models-dev";
export type {
	OpenRouterEffectivePricingResponse,
	OpenRouterFrontendModel,
	OpenRouterModelStats,
	OpenRouterPerformanceSummary,
	OpenRouterPricingSummary,
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterScrapedModel,
	OpenRouterScrapedPayload,
	OpenRouterScraperOptions,
	OpenRouterSingleModelOptions,
	OpenRouterStatsPoint,
	OpenRouterStatsResponse,
} from "./llm/scrapers/openrouter";
export {
	getOpenRouterModelStats,
	getOpenRouterRawScrapedStats,
	getOpenRouterScrapedStats,
	processOpenRouterModelStats,
} from "./llm/scrapers/openrouter";
export type {
	RiemannBenchModelScorePayload,
	RiemannBenchModelScoreRow,
	RiemannBenchScraperOptions,
} from "./llm/scrapers/riemann-bench";
export {
	buildRiemannBenchScoreByModelName,
	findRiemannBenchScore,
	getRiemannBenchModelScoreStats,
	processRiemannBenchPageHtml,
} from "./llm/scrapers/riemann-bench";
export type {
	TerminalBenchAgentModelAccuracyPayload,
	TerminalBenchAgentModelAccuracyRow,
	TerminalBenchModelMedianAccuracyPayload,
	TerminalBenchModelMedianAccuracyRow,
	TerminalBenchScraperOptions,
} from "./llm/scrapers/terminal-bench";
export {
	getTerminalBenchAgentModelAccuracyStats,
	getTerminalBenchModelMedianAccuracyStats,
	processTerminalBenchLeaderboardRows,
	summarizeTerminalBenchModelMedianAccuracy,
} from "./llm/scrapers/terminal-bench";
export type {
	ToolathlonModelScorePayload,
	ToolathlonModelScoreRow,
	ToolathlonScraperOptions,
} from "./llm/scrapers/toolathlon";
export {
	buildToolathlonScoreByModelName,
	findToolathlonScore,
	getToolathlonModelScoreStats,
	processToolathlonDetailsJson,
} from "./llm/scrapers/toolathlon";
export type {
	LlmStatsBenchmarkValues,
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsCostBreakdown,
	LlmStatsCostTier,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsIntelligenceIndexCost,
	LlmStatsMetadata,
	LlmStatsModalities,
	LlmStatsModel,
	LlmStatsOptions,
	LlmStatsPayload,
	LlmStatsRelativeScores,
	LlmStatsScores,
	LlmStatsSpeed,
	ModelAtlasStageConfig,
	OverallRelativeScoreWeights,
} from "./llm/stats";
export {
	getLiveLlmStats,
	getLlmStats,
} from "./llm/stats";
export type { NumberOrNull, WeightedScorePart } from "./math-utils";
export {
	clamp,
	finiteNumbers,
	isPositiveFinite,
	logMinMaxScale,
	meanOfFinite,
	meanOrNull,
	minMaxScale,
	percentileRank,
	weightedMeanOfFinite,
} from "./math-utils";
