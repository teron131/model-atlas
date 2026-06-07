/** Public Model Atlas API: rebuild from live sources and return failure-safe output. */

import { MODEL_ATLAS_STAGE_CONFIG } from "../constants";
import { nowEpochSeconds } from "../utils";
import { buildFinalModels } from "./llm-stats/final-stage";
import { buildMatchedRows } from "./llm-stats/match-stage";
import { enrichRows } from "./llm-stats/openrouter-stage";
import { fetchSourceData } from "./llm-stats/source-stage";
import type {
	ModelAtlasStageConfig,
	ModelStatsSelectedMetadata,
	ModelStatsSelectedModel,
	ModelStatsSelectedOptions,
	ModelStatsSelectedPayload,
} from "./llm-stats/types";
import { asRecord } from "./shared";

export type {
	ModelAtlasStageConfig,
	ModelStatsColumnTooltip,
	ModelStatsColumnTooltips,
	ModelStatsSelectedBenchmarkValues,
	ModelStatsSelectedContextWindow,
	ModelStatsSelectedCost,
	ModelStatsSelectedCostBreakdown,
	ModelStatsSelectedCostTier,
	ModelStatsSelectedEvaluations,
	ModelStatsSelectedIntelligence,
	ModelStatsSelectedIntelligenceIndexCost,
	ModelStatsSelectedMetadata,
	ModelStatsSelectedModalities,
	ModelStatsSelectedModel,
	ModelStatsSelectedOptions,
	ModelStatsSelectedPayload,
	ModelStatsSelectedRelativeScores,
	ModelStatsSelectedScores,
	ModelStatsSelectedSpeed,
	OverallRelativeScoreWeights,
} from "./llm-stats/types";

/** Return sorted unique keys for metadata fields. */
function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/** Collect available keys from a source model object field. */
function keysFromModelField(
	models: Array<Record<string, unknown> | ModelStatsSelectedModel>,
	field: "evaluations" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

/** Build metadata that exposes available and selected benchmark fields. */
function buildModelStatsSelectedMetadata(
	models: Array<Record<string, unknown> | ModelStatsSelectedModel>,
	scoringConfig: ModelAtlasStageConfig["scoring"],
): ModelStatsSelectedMetadata {
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
		scoring: {
			intelligence_benchmark_keys: [...scoringConfig.intelligenceBenchmarkKeys],
			missing_intelligence_benchmark_keys:
				scoringConfig.intelligenceBenchmarkKeys.filter(
					(key) => !availableBenchmarkKeys.includes(key),
				),
			agentic_benchmark_keys: [...scoringConfig.agenticBenchmarkKeys],
			missing_agentic_benchmark_keys: scoringConfig.agenticBenchmarkKeys.filter(
				(key) => !availableBenchmarkKeys.includes(key),
			),
			selected_benchmark_keys: selectedBenchmarkKeys,
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
		},
	};
}

/** Ensure cached or freshly built payloads expose current scoring metadata. */
function withModelStatsSelectedMetadata(
	payload: Omit<ModelStatsSelectedPayload, "metadata"> &
		Partial<Pick<ModelStatsSelectedPayload, "metadata">>,
	modelsForMetadata: Array<
		Record<string, unknown> | ModelStatsSelectedModel
	> = payload.models,
): ModelStatsSelectedPayload {
	const currentMetadata = buildModelStatsSelectedMetadata(
		modelsForMetadata,
		MODEL_ATLAS_STAGE_CONFIG.scoring,
	);
	return {
		...payload,
		metadata: {
			artificial_analysis:
				payload.metadata?.artificial_analysis ??
				currentMetadata.artificial_analysis,
			scoring: currentMetadata.scoring,
		},
	};
}

/** Return an empty selected Model Atlas payload for failure-safe fallback paths. */
function emptyModelStatsSelectedPayload(): ModelStatsSelectedPayload {
	return withModelStatsSelectedMetadata({
		fetched_at_epoch_seconds: null,
		models: [],
	});
}

/** Build the selected Model Atlas payload from the live pipeline. */
async function buildModelStatsSelectedPayload(
	modelId: string | null = null,
): Promise<ModelStatsSelectedPayload> {
	const sourceData = await fetchSourceData();
	const matchedRows = await buildMatchedRows(
		sourceData,
		MODEL_ATLAS_STAGE_CONFIG.matcher,
	);
	const enrichedRows = await enrichRows(
		matchedRows,
		MODEL_ATLAS_STAGE_CONFIG.openrouter,
		MODEL_ATLAS_STAGE_CONFIG.scoring,
	);
	const models = await buildFinalModels(
		{
			...enrichedRows,
			deepSWEModelScoreRows: sourceData.deepSWEModelScoreRows,
		},
		modelId,
		MODEL_ATLAS_STAGE_CONFIG.final,
		MODEL_ATLAS_STAGE_CONFIG.scoring,
	);
	const fetchedAt = nowEpochSeconds();
	return withModelStatsSelectedMetadata(
		{
			fetched_at_epoch_seconds: fetchedAt,
			models,
		},
		enrichedRows.rows,
	);
}

/** Build the selected Model Atlas payload. */
async function getModelStatsSelectedPayload(
	options: ModelStatsSelectedOptions = {},
): Promise<ModelStatsSelectedPayload> {
	try {
		const modelId = options.id ?? null;
		return await buildModelStatsSelectedPayload(modelId);
	} catch {
		return emptyModelStatsSelectedPayload();
	}
}

/** Build the final selected Model Atlas payload with cache-first list mode and in-memory single-model mode. */
export async function getModelStatsSelected(
	options: ModelStatsSelectedOptions = {},
): Promise<ModelStatsSelectedPayload> {
	return getModelStatsSelectedPayload(options);
}

/** Build the final selected Model Atlas payload from live sources without using cache. */
export async function getModelStatsSelectedLive(
	options: ModelStatsSelectedOptions = {},
): Promise<ModelStatsSelectedPayload> {
	return getModelStatsSelectedPayload(options);
}
