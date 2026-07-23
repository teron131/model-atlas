/** Live stats coordinates source refresh, enrichment, scoring, and failure-safe payload assembly. */

import { fetchSourceData } from "../ingest/assembly";
import {
	type BenchmarkRowsByKey,
	benchmarkRowsFromSourceData,
} from "../pipeline/benchmark-rows";
import { deriveModelStats } from "../pipeline/derivation";
import { nowEpochSeconds } from "../runtime";
import { buildCurrentModelAtlasMetadata } from "./payload/metadata";
import type {
	ModelAtlasModel,
	ModelAtlasOptions,
	ModelAtlasPayload,
} from "./types";

export type {
	ModelAtlasBenchmarks,
	ModelAtlasBenchmarkValues,
	ModelAtlasComponentScores,
	ModelAtlasContextWindow,
	ModelAtlasCost,
	ModelAtlasCostBreakdown,
	ModelAtlasCostTier,
	ModelAtlasIntelligence,
	ModelAtlasIntelligenceIndexCost,
	ModelAtlasMetadata,
	ModelAtlasModalities,
	ModelAtlasModel,
	ModelAtlasOptions,
	ModelAtlasPayload,
	ModelAtlasScores,
	ModelAtlasSpeed,
} from "./types";

/** Metadata is refreshed around cached or rebuilt payload rows so public scoring copy tracks current config. */
function withCurrentMetadata(
	payload: Omit<ModelAtlasPayload, "metadata"> &
		Partial<Pick<ModelAtlasPayload, "metadata">>,
	modelsForMetadata: Array<
		Record<string, unknown> | ModelAtlasModel
	> = payload.models,
	resourceModels: Array<
		Record<string, unknown> | ModelAtlasModel
	> = payload.models,
	sourceRowsByKey?: BenchmarkRowsByKey,
): ModelAtlasPayload {
	const metadata = buildCurrentModelAtlasMetadata({
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
): Promise<ModelAtlasPayload> {
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

export async function getLiveModelAtlasPayload(
	options: ModelAtlasOptions = {},
): Promise<ModelAtlasPayload> {
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
