/** Stats API coordinates live source refresh, enrichment, scoring, and failure-safe payload shape. */

import { STAGE_CONFIG } from "./constants";
import {
	type BenchmarkRowsByKey,
	benchmarkRowsFromSourceData,
	enrichModelRowsWithSupplementalBenchmarks,
} from "./stats/benchmarks";
import { buildModelCatalogRows } from "./stats/catalog";
import { buildMatchedModelRows } from "./stats/matching";
import { buildCurrentLlmStatsMetadata } from "./stats/metadata";
import {
	aggregateExpandedModelRows,
	enrichModelRowsWithOpenRouter,
} from "./stats/openrouter-enrichment";
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

/** Metadata is refreshed around cached or rebuilt payload rows so public scoring copy tracks current config. */
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

async function buildLlmStatsPayload(
	modelId: string | null = null,
): Promise<LlmStatsPayload> {
	const sourceData = await fetchSourceData();
	const matchedRows = buildMatchedModelRows(sourceData, STAGE_CONFIG.matcher);
	const catalogRows = buildModelCatalogRows(sourceData, matchedRows);
	const aggregatedRows = aggregateExpandedModelRows(catalogRows);
	const benchmarkEnrichedRows = enrichModelRowsWithSupplementalBenchmarks(
		aggregatedRows,
		sourceData,
	);
	const enrichedRows = await enrichModelRowsWithOpenRouter(
		benchmarkEnrichedRows,
		STAGE_CONFIG.openrouter,
		STAGE_CONFIG.scoring,
	);
	const models = await buildFinalModels(
		{
			...enrichedRows,
			deepSWEDefaultEffortRows: sourceData.deepSWE.defaultEffortRows,
		},
		modelId,
		STAGE_CONFIG.final,
		STAGE_CONFIG.scoring,
	);
	const fetchedAt = nowEpochSeconds();
	return withLlmStatsMetadata(
		{
			fetched_at_epoch_seconds: fetchedAt,
			deep_swe: { rows: sourceData.deepSWE.effortRows },
			models,
		},
		enrichedRows.rows,
		models,
		benchmarkRowsFromSourceData(sourceData),
	);
}

export async function getLiveLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	try {
		const modelId = options.id ?? null;
		return await buildLlmStatsPayload(modelId);
	} catch {
		return withLlmStatsMetadata({
			fetched_at_epoch_seconds: null,
			models: [],
		});
	}
}
