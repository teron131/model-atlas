/** Public Model Atlas API: rebuild from live sources and return failure-safe output. */

import { STAGE_CONFIG } from "../constants";
import { asFiniteNumber, nowEpochSeconds } from "../utils";
import { asRecord } from "./shared";
import {
	ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS,
	addBenchmarkRow,
	type BenchmarkRowsByKey,
	type BenchmarkSourceRow,
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

type SourceDraft = {
	label: string;
	provider?: string | null;
	value: number | null;
};

type SourceSpec = {
	key: string;
	rows: readonly SourceDraft[];
};

/** Define how one source row list maps into benchmark update rows. */
function sourceSpec<T>(
	key: string,
	rows: readonly T[],
	toDraft: (row: T) => SourceDraft,
): SourceSpec {
	return {
		key,
		rows: rows.map(toDraft),
	};
}

/** Add rows from one sparse benchmark source into the benchmark-keyed update map. */
function addSourceRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	source: SourceSpec,
): void {
	for (const draft of source.rows) {
		if (draft.value == null || !Number.isFinite(draft.value)) {
			continue;
		}
		addBenchmarkRow(rowsByKey, source.key, {
			id: null,
			label: draft.label,
			provider: draft.provider ?? null,
			value: draft.value,
		});
	}
}

/** Return one-benchmark source row mappings for sparse benchmark sources. */
function sparseBenchmarkSources(sourceData: LlmStatsSourceData): SourceSpec[] {
	return [
		sourceSpec("agents_last_exam", sourceData.agentsLastExam.rows, (row) => ({
			label: row.model,
			value: row.median_score,
		})),
		sourceSpec("automation_bench", sourceData.automationBench.rows, (row) => ({
			label: row.model,
			value: row.adjusted_score,
		})),
		sourceSpec("blueprint_bench_2", sourceData.blueprintBench.rows, (row) => ({
			label: row.model,
			value: row.score,
		})),
		sourceSpec("browsecomp", sourceData.browseComp.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("cursorbench", sourceData.cursorBench.rows, (row) => ({
			label: row.model,
			value: row.score,
		})),
		sourceSpec("deep_swe", sourceData.deepSWE.rows, (row) => ({
			label: row.model,
			value: row.pass_at_1,
		})),
		sourceSpec("gdp_pdf", sourceData.gdpPdf.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("riemann_bench", sourceData.riemannBench.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("terminal_bench_2", sourceData.terminalBench.rows, (row) => ({
			label: row.model,
			value: row.median_accuracy,
		})),
		sourceSpec("toolathlon", sourceData.toolathlon.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
	];
}

/** Add Artificial Analysis rows, which carry many benchmark keys in one payload. */
function addArtificialAnalysisRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	sourceData: LlmStatsSourceData,
): void {
	for (const row of sourceData.artificialAnalysis.rows) {
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
			addBenchmarkRow(rowsByKey, key, {
				id: modelId,
				label,
				provider: null,
				value,
			});
		}
	}
}

/** Converts source benchmark rows into benchmark-keyed update rows. */
function benchmarkRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowsByKey {
	const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
	addArtificialAnalysisRows(rowsByKey, sourceData);
	for (const source of sparseBenchmarkSources(sourceData)) {
		addSourceRows(rowsByKey, source);
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
	sourceRowsByKey?: BenchmarkRowsByKey,
): LlmStatsPayload {
	const metadata = buildCurrentLlmStatsMetadata({
		models: modelsForMetadata,
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
		benchmarkRowsFromSourceData(sourceData),
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
