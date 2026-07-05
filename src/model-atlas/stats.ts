/** Public Model Atlas API: rebuild from live sources and return failure-safe output. */

import { STAGE_CONFIG } from "./constants";
import {
	type BenchmarkRowsByKey,
	benchmarkRowsFromSourceData,
} from "./stats/benchmarks";
import { buildMatchedModelRows } from "./stats/matching";
import { buildCurrentLlmStatsMetadata } from "./stats/metadata";
import { enrichModelRowsWithOpenRouter } from "./stats/openrouter-enrichment";
import { buildFinalModels } from "./stats/selection";
import { fetchSourceData } from "./stats/source-data";
import type {
	LlmStatsModel,
	LlmStatsOptions,
	LlmStatsPayload,
} from "./stats/types";
import { nowEpochSeconds } from "./utils";

export type {
	LlmStatsBenchmarkValues,
	LlmStatsColumnTooltip,
	LlmStatsColumnTooltips,
	LlmStatsComponentScores,
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
	LlmStatsScores,
	LlmStatsSpeed,
	ModelAtlasStageConfig,
	OverallScoreWeights,
} from "./stats/types";

/** Ensure cached or freshly built payloads expose current scoring metadata. */
function withLlmStatsMetadata(
	payload: Omit<LlmStatsPayload, "metadata"> &
		Partial<Pick<LlmStatsPayload, "metadata">>,
	modelsForMetadata: Array<
		Record<string, unknown> | LlmStatsModel
	> = payload.models,
	resourceModels: Array<
		Record<string, unknown> | LlmStatsModel
	> = payload.models,
	sourceRowsByKey?: BenchmarkRowsByKey,
): LlmStatsPayload {
	const metadata = buildCurrentLlmStatsMetadata({
		models: modelsForMetadata,
		resourceModels,
		healthModels: payload.models,
		artificialAnalysis: payload.metadata?.artificial_analysis,
		sourceRowsByKey,
	});
	return {
		...payload,
		metadata,
	};
}

/** Return an empty LLM stats payload for failure-safe fallback paths. */
function emptyLlmStatsPayload(): LlmStatsPayload {
	return withLlmStatsMetadata({
		fetched_at_epoch_seconds: null,
		models: [],
	});
}

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
			deepSWEModelScoreRows: sourceData.deepSWE.rows,
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
		models,
		benchmarkRowsFromSourceData(sourceData),
	);
}

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

export async function getLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	return getLlmStatsPayload(options);
}

export async function getLiveLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	return getLlmStatsPayload(options);
}
