/** Public Model Atlas API: rebuild from live sources and return failure-safe output. */

import { STAGE_CONFIG } from "../constants";
import { asFiniteNumber, nowEpochSeconds } from "../utils";
import { asRecord } from "./shared";
import {
	ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS,
	appendBenchmarkUpdateOfficialRow,
	type BenchmarkUpdateOfficialRow,
	type BenchmarkUpdateOfficialRowsByKey,
} from "./stats/health";
import { buildMatchedModelRows } from "./stats/matching";
import { buildCurrentLlmStatsMetadata } from "./stats/metadata";
import { enrichModelRowsWithOpenRouter } from "./stats/openrouter-enrichment";
import { buildFinalModels } from "./stats/selection";
import { fetchSourceData } from "./stats/source-data";
import type {
	LlmStatsModel,
	LlmStatsOptions,
	LlmStatsPayload,
	LlmStatsSourceData,
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

/** Converts source benchmark rows into official public rows. */
function officialRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkUpdateOfficialRowsByKey {
	const rowsByKey: Record<string, BenchmarkUpdateOfficialRow[]> = {};
	for (const row of sourceData.artificialAnalysisRows) {
		const record = asRecord(row);
		const modelId =
			typeof record.model_id === "string" && record.model_id.length > 0
				? record.model_id
				: null;
		const label =
			typeof record.name === "string" && record.name.length > 0
				? record.name
				: modelId;
		if (label == null) {
			continue;
		}
		const evaluations = asRecord(record.evaluations);
		for (const key of ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS) {
			const value = asFiniteNumber(evaluations[key]);
			if (value == null) {
				continue;
			}
			appendBenchmarkUpdateOfficialRow(rowsByKey, key, {
				id: modelId,
				label,
				provider: null,
				value,
			});
		}
	}
	for (const row of sourceData.browseCompModelScoreRows) {
		appendBenchmarkUpdateOfficialRow(rowsByKey, "browsecomp", {
			id: null,
			label: row.model,
			provider: row.provider,
			value: row.score,
		});
	}
	return rowsByKey;
}

/** Ensure cached or freshly built payloads expose current scoring metadata. */
function withLlmStatsMetadata(
	payload: Omit<LlmStatsPayload, "metadata"> &
		Partial<Pick<LlmStatsPayload, "metadata">>,
	modelsForMetadata: Array<
		Record<string, unknown> | LlmStatsModel
	> = payload.models,
	officialRowsByKey?: BenchmarkUpdateOfficialRowsByKey,
): LlmStatsPayload {
	const metadata = buildCurrentLlmStatsMetadata({
		models: modelsForMetadata,
		healthModels: payload.models,
		artificialAnalysis: payload.metadata?.artificial_analysis,
		officialRowsByKey,
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
		officialRowsFromSourceData(sourceData),
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
