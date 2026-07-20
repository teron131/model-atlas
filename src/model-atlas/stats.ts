/** Stats API coordinates live source refresh, enrichment, scoring, and failure-safe payload shape. */

import {
	type BenchmarkRowsByKey,
	benchmarkRowsFromSourceData,
} from "./stats/benchmarks";
import { deriveModelStats } from "./stats/derivation";
import { buildCurrentLlmStatsMetadata } from "./stats/metadata";
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
	const { enrichedRows, models } = await deriveModelStats(sourceData, {
		modelId,
	});
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
