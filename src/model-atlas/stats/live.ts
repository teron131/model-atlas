/** Live stats coordinates source refresh, enrichment, scoring, and failure-safe payload assembly. */

import { fetchSourceData } from "../ingest/assembly";
import {
	type BenchmarkRowsByKey,
	benchmarkRowsFromSourceData,
} from "../pipeline/benchmark-rows";
import { deriveModelStats } from "../pipeline/derivation";
import { nowEpochSeconds } from "../runtime";
import { buildCurrentLlmStatsMetadata } from "./payload/metadata";
import type { LlmStatsModel, LlmStatsOptions, LlmStatsPayload } from "./types";

export type {
	LlmStatsBenchmarkValues,
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
} from "./types";

/** Metadata is refreshed around cached or rebuilt payload rows so public scoring copy tracks current config. */
function withCurrentMetadata(
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

async function buildLivePayload(
	modelId: string | null = null,
): Promise<LlmStatsPayload> {
	const sourceData = await fetchSourceData();
	const { enrichment, models } = await deriveModelStats(sourceData, {
		modelId,
	});
	const fetchedAt = nowEpochSeconds();
	return withCurrentMetadata(
		{
			fetched_at_epoch_seconds: fetchedAt,
			deep_swe: { rows: sourceData.deepSWE.effortRows },
			models,
		},
		enrichment.rows,
		models,
		benchmarkRowsFromSourceData(sourceData),
	);
}

export async function getLiveLlmStats(
	options: LlmStatsOptions = {},
): Promise<LlmStatsPayload> {
	try {
		const modelId = options.id ?? null;
		return await buildLivePayload(modelId);
	} catch {
		return withCurrentMetadata({
			fetched_at_epoch_seconds: null,
			models: [],
		});
	}
}
