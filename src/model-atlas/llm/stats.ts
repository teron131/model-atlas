/** Public Model Atlas API: rebuild from live sources and return failure-safe output. */

import { STAGE_CONFIG } from "../constants";
import { nowEpochSeconds } from "../utils";
import { asRecord } from "./shared";
import { buildBenchmarkUpdateHealth } from "./stats/health";
import { buildMatchedModelRows } from "./stats/matching";
import { enrichModelRowsWithOpenRouter } from "./stats/openrouter-enrichment";
import { buildFinalModels } from "./stats/selection";
import { SNAPSHOT_PRESERVATION_VERSION } from "./stats/snapshot-preservation";
import { fetchSourceData } from "./stats/source-data";
import type {
	LlmStatsMetadata,
	LlmStatsModel,
	LlmStatsOptions,
	LlmStatsPayload,
	ModelAtlasStageConfig,
} from "./stats/types";

export type {
	LlmStatsBenchmarkValues,
	LlmStatsColumnTooltip,
	LlmStatsColumnTooltips,
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
} from "./stats/types";

/** Return sorted unique keys for metadata fields. */
function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/** Collect available keys from a source model object field. */
function keysFromModelField(
	models: Array<Record<string, unknown> | LlmStatsModel>,
	field: "evaluations" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

/** Build metadata that exposes available and selected benchmark fields. */
function buildLlmStatsMetadata(
	models: Array<Record<string, unknown> | LlmStatsModel>,
	healthModels: readonly LlmStatsModel[],
	scoringConfig: ModelAtlasStageConfig["scoring"],
): LlmStatsMetadata {
	const availableEvaluationKeys = keysFromModelField(models, "evaluations");
	const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
	const availableBenchmarkKeys = sortedUniqueKeys([
		...availableEvaluationKeys,
		...availableIntelligenceKeys,
	]);
	const selectedBenchmarkKeys = sortedUniqueKeys([
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]);
	return {
		artificial_analysis: {
			available_benchmark_keys: availableBenchmarkKeys,
			available_evaluation_keys: availableEvaluationKeys,
			available_intelligence_keys: availableIntelligenceKeys,
		},
		benchmark_update_health: buildBenchmarkUpdateHealth(
			healthModels,
			scoringConfig,
		),
		scoring: {
			intelligence_benchmark_keys: [...scoringConfig.intelligenceBenchmarkKeys],
			intelligence_benchmark_display_keys: [
				...scoringConfig.intelligenceBenchmarkDisplayKeys,
			],
			missing_intelligence_benchmark_keys:
				scoringConfig.intelligenceBenchmarkKeys.filter(
					(key) => !availableBenchmarkKeys.includes(key),
				),
			agentic_benchmark_keys: [...scoringConfig.agenticBenchmarkKeys],
			agentic_benchmark_display_keys: [
				...scoringConfig.agenticBenchmarkDisplayKeys,
			],
			missing_agentic_benchmark_keys: scoringConfig.agenticBenchmarkKeys.filter(
				(key) => !availableBenchmarkKeys.includes(key),
			),
			selected_benchmark_keys: selectedBenchmarkKeys,
			benchmark_portfolio: { ...scoringConfig.benchmarkPortfolio },
			price_profiles: { ...scoringConfig.priceProfiles },
			simulation_profiles: { ...scoringConfig.simulationProfiles },
			simulation_input_token_seconds: scoringConfig.simulationInputTokenSeconds,
			quality_score_weights: {
				...scoringConfig.qualityScoreWeights,
			},
			overall_relative_score_weights: {
				...scoringConfig.overallRelativeScoreWeights,
			},
			column_tooltips: { ...scoringConfig.columnTooltips },
			snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
		},
	};
}

/** Ensure cached or freshly built payloads expose current scoring metadata. */
function withLlmStatsMetadata(
	payload: Omit<LlmStatsPayload, "metadata"> &
		Partial<Pick<LlmStatsPayload, "metadata">>,
	modelsForMetadata: Array<
		Record<string, unknown> | LlmStatsModel
	> = payload.models,
): LlmStatsPayload {
	const currentMetadata = buildLlmStatsMetadata(
		modelsForMetadata,
		payload.models,
		STAGE_CONFIG.scoring,
	);
	return {
		...payload,
		metadata: {
			artificial_analysis:
				payload.metadata?.artificial_analysis ??
				currentMetadata.artificial_analysis,
			benchmark_update_health: currentMetadata.benchmark_update_health,
			scoring: currentMetadata.scoring,
		},
	};
}

/** Return an empty LLM stats payload for failure-safe fallback paths. */
function emptyLlmStatsPayload(): LlmStatsPayload {
	return withLlmStatsMetadata({
		fetched_at_epoch_seconds: null,
		models: [],
	});
}

/** Build the LLM stats payload from the live pipeline. */
async function buildLlmStatsPayload(
	modelId: string | null = null,
): Promise<LlmStatsPayload> {
	const sourceData = await fetchSourceData();
	const matchedRows = await buildMatchedModelRows(
		sourceData,
		STAGE_CONFIG.matcher,
	);
	const enrichedRows = await enrichModelRowsWithOpenRouter(
		matchedRows,
		STAGE_CONFIG.openrouter,
		STAGE_CONFIG.scoring,
	);
	const models = await buildFinalModels(
		{
			...enrichedRows,
			deepSWEModelScoreRows: sourceData.deepSWEModelScoreRows,
		},
		modelId,
		STAGE_CONFIG.final,
		STAGE_CONFIG.scoring,
	);
	const fetchedAt = nowEpochSeconds();
	return withLlmStatsMetadata(
		{
			fetched_at_epoch_seconds: fetchedAt,
			models,
		},
		enrichedRows.rows,
	);
}

/** Build the LLM stats payload. */
async function getLlmStatsPayload(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	try {
		const modelId = options.id ?? null;
		return await buildLlmStatsPayload(modelId);
	} catch {
		return emptyLlmStatsPayload();
	}
}

/** Build the final LLM stats payload with cache-first list mode and in-memory single-model mode. */
export async function getLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	return getLlmStatsPayload(options);
}

/** Build the final LLM stats payload from live sources without using cache. */
export async function getLiveLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	return getLlmStatsPayload(options);
}
