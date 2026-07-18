/** Source snapshot orchestration shares one cache-aware workflow across local SQLite and production D1. */

import type { DatabaseSync } from "node:sqlite";

import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import { selectModelsDevRowsForArtificialAnalysis } from "../stats/source-policy";
import type { ScoringConfig } from "../stats/types";
import {
	readAgentArenaRawCache,
	readAgentsLastExamRawCache,
	readArtificialAnalysisEvaluationResourceRawCache,
	readArtificialAnalysisRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readCursorBenchRawCache,
	readDeepSWERawCache,
	readGdpPdfRawCache,
	readModelsDevRawCache,
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readValsTerminalBenchRawCache,
	readVendingBench2RawCache,
	refreshedCacheStatus,
} from "./cache";
import {
	latestSourceRowStates,
	mergeCachedSourceRows,
	missingSinceBySource,
} from "./policy";
import { artificialAnalysisSnapshot } from "./source-snapshots/artificial-analysis";
import { modelsDevSnapshot } from "./source-snapshots/models-dev";
import {
	agentArenaSnapshot,
	artificialAnalysisEvaluationResourceSnapshot,
	blueprintBenchSnapshot,
	browseCompSnapshot,
	cursorBenchSnapshot,
	gdpPdfSnapshot,
	riemannBenchSnapshot,
	toolathlonSnapshot,
	valsIndexSnapshot,
	valsTerminalBenchSnapshot,
	vendingBench2Snapshot,
} from "./source-snapshots/sparse-benchmarks";
import {
	agentsLastExamSnapshot,
	deepSWESnapshot,
} from "./source-snapshots/summarized-benchmarks";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
	type SourceSnapshotStatus,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

const PARTIAL_OPENROUTER_TIMEOUT_MS = 10_000;
const PARTIAL_OPENROUTER_MAX_RETRIES = 1;

export type SourceCaches = {
	agentArena: ReturnType<typeof readAgentArenaRawCache>;
	artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
	artificialAnalysisEvaluationResources: ReturnType<
		typeof readArtificialAnalysisEvaluationResourceRawCache
	>;
	modelsDev: ReturnType<typeof readModelsDevRawCache>;
	agentsLastExam: ReturnType<typeof readAgentsLastExamRawCache>;
	blueprintBench: ReturnType<typeof readBlueprintBenchRawCache>;
	browseComp: ReturnType<typeof readBrowseCompRawCache>;
	cursorBench: ReturnType<typeof readCursorBenchRawCache>;
	deepSWE: ReturnType<typeof readDeepSWERawCache>;
	gdpPdf: ReturnType<typeof readGdpPdfRawCache>;
	riemannBench: ReturnType<typeof readRiemannBenchRawCache>;
	toolathlon: ReturnType<typeof readToolathlonRawCache>;
	valsIndex: ReturnType<typeof readValsIndexRawCache>;
	valsTerminalBench: ReturnType<typeof readValsTerminalBenchRawCache>;
	vendingBench2: ReturnType<typeof readVendingBench2RawCache>;
	openRouter: ReturnType<typeof readOpenRouterRawCache>;
};

function readSqliteSourceCaches(db: DatabaseSync): SourceCaches {
	return {
		agentArena: readAgentArenaRawCache(db),
		artificialAnalysis: readArtificialAnalysisRawCache(db),
		artificialAnalysisEvaluationResources:
			readArtificialAnalysisEvaluationResourceRawCache(db),
		modelsDev: readModelsDevRawCache(db),
		agentsLastExam: readAgentsLastExamRawCache(db),
		blueprintBench: readBlueprintBenchRawCache(db),
		browseComp: readBrowseCompRawCache(db),
		cursorBench: readCursorBenchRawCache(db),
		deepSWE: readDeepSWERawCache(db),
		gdpPdf: readGdpPdfRawCache(db),
		riemannBench: readRiemannBenchRawCache(db),
		toolathlon: readToolathlonRawCache(db),
		valsIndex: readValsIndexRawCache(db),
		valsTerminalBench: readValsTerminalBenchRawCache(db),
		vendingBench2: readVendingBench2RawCache(db),
		openRouter: readOpenRouterRawCache(db),
	};
}

function readSourceCacheStatuses(
	db: DatabaseSync,
	nowEpochSeconds: number,
): Record<RawSourceName, RawSourceCacheStatus> {
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source) => [
			source,
			readRawSourceCacheStatus(db, source, nowEpochSeconds),
		]),
	) as Record<RawSourceName, RawSourceCacheStatus>;
}

/** Updates source cache status after source refresh snapshots. */
function updatedSourceCacheStatus(
	status: RawSourceCacheStatus,
	lastFetchEpochSeconds: number | null,
	sourceInputCount: number,
): RawSourceCacheStatus {
	return {
		...status,
		refreshed:
			!status.cache_hit &&
			lastFetchEpochSeconds !== status.last_fetch_epoch_seconds,
		last_fetch_epoch_seconds: lastFetchEpochSeconds,
		source_input_count: sourceInputCount,
	};
}

function updateSourceCacheStatuses(
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>,
	sourceStatuses: SourceSnapshotStatus[],
): void {
	for (const sourceStatus of sourceStatuses) {
		sourceCache[sourceStatus.source] = updatedSourceCacheStatus(
			sourceCache[sourceStatus.source],
			sourceStatus.fetchedAt,
			sourceStatus.sourceInputCount,
		);
	}
}

function fetchedAtFromSourceStatuses(
	sourceStatuses: SourceSnapshotStatus[],
): SourceSnapshots["fetchedAt"] {
	const fetchedAt: SourceSnapshots["fetchedAt"] = {
		agentArena: null,
		artificialAnalysis: null,
		artificialAnalysisEvaluationResources: null,
		agentsLastExam: null,
		blueprintBench: null,
		browseComp: null,
		cursorBench: null,
		deepSWE: null,
		gdpPdf: null,
		riemannBench: null,
		toolathlon: null,
		valsIndex: null,
		valsTerminalBench: null,
		vendingBench2: null,
	};
	for (const sourceStatus of sourceStatuses) {
		if (sourceStatus.fetchedAtKey != null) {
			fetchedAt[sourceStatus.fetchedAtKey] = sourceStatus.fetchedAt;
		}
	}
	return fetchedAt;
}

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
	scoringConfig: ScoringConfig,
	options: DatabaseBuildOptions = {},
): Promise<SourceSnapshotCacheResult> {
	return refreshSourceSnapshots(
		readSqliteSourceCaches(db),
		readSourceCacheStatuses(db, nowEpochSeconds),
		latestSourceRowStates(db),
		nowEpochSeconds,
		scoringConfig,
		options,
	);
}

/** Refreshes normalized source snapshots from storage-independent cached source values. */
export async function refreshSourceSnapshots(
	caches: SourceCaches,
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>,
	previousSourceRowStates: readonly SourceRowState[],
	nowEpochSeconds: number,
	scoringConfig: ScoringConfig,
	options: DatabaseBuildOptions = {},
): Promise<SourceSnapshotCacheResult> {
	const previousMissingSince = missingSinceBySource(previousSourceRowStates);
	const [
		agentArena,
		artificialAnalysis,
		artificialAnalysisEvaluationResources,
		modelsDev,
		agentsLastExam,
		blueprintBench,
		browseComp,
		cursorBench,
		deepSWE,
		gdpPdf,
		riemannBench,
		toolathlon,
		valsIndex,
		valsTerminalBench,
		vendingBench2,
	] = await Promise.all([
		agentArenaSnapshot(
			caches.agentArena,
			sourceCache.agent_arena,
			options,
			previousMissingSince.agent_arena,
			nowEpochSeconds,
		),
		artificialAnalysisSnapshot(
			caches.artificialAnalysis,
			sourceCache.artificial_analysis,
			options,
			scoringConfig,
			previousMissingSince.artificial_analysis,
			nowEpochSeconds,
		),
		artificialAnalysisEvaluationResourceSnapshot(
			caches.artificialAnalysisEvaluationResources,
			sourceCache.artificial_analysis_evaluation_resources,
			options,
			previousMissingSince.artificial_analysis_evaluation_resources,
			nowEpochSeconds,
		),
		modelsDevSnapshot(
			caches.modelsDev,
			sourceCache.models_dev,
			options,
			previousMissingSince.models_dev,
			nowEpochSeconds,
		),
		agentsLastExamSnapshot(
			caches.agentsLastExam,
			sourceCache.agents_last_exam,
			options,
			previousMissingSince.agents_last_exam,
			nowEpochSeconds,
		),
		blueprintBenchSnapshot(
			caches.blueprintBench,
			sourceCache.blueprint_bench_2,
			options,
			previousMissingSince.blueprint_bench_2,
			nowEpochSeconds,
		),
		browseCompSnapshot(
			caches.browseComp,
			sourceCache.browsecomp,
			options,
			previousMissingSince.browsecomp,
			nowEpochSeconds,
		),
		cursorBenchSnapshot(
			caches.cursorBench,
			sourceCache.cursorbench,
			options,
			previousMissingSince.cursorbench,
			nowEpochSeconds,
		),
		deepSWESnapshot(
			caches.deepSWE,
			sourceCache.deep_swe,
			options,
			previousMissingSince.deep_swe,
			nowEpochSeconds,
		),
		gdpPdfSnapshot(
			caches.gdpPdf,
			sourceCache.gdp_pdf,
			options,
			previousMissingSince.gdp_pdf,
			nowEpochSeconds,
		),
		riemannBenchSnapshot(
			caches.riemannBench,
			sourceCache.riemann_bench,
			options,
			previousMissingSince.riemann_bench,
			nowEpochSeconds,
		),
		toolathlonSnapshot(
			caches.toolathlon,
			sourceCache.toolathlon,
			options,
			previousMissingSince.toolathlon,
			nowEpochSeconds,
		),
		valsIndexSnapshot(
			caches.valsIndex,
			sourceCache.vals_index,
			options,
			previousMissingSince.vals_index,
			nowEpochSeconds,
		),
		valsTerminalBenchSnapshot(
			caches.valsTerminalBench,
			sourceCache.vals_terminal_bench,
			options,
			previousMissingSince.vals_terminal_bench,
			nowEpochSeconds,
		),
		vendingBench2Snapshot(
			caches.vendingBench2,
			sourceCache.vending_bench_2,
			options,
			previousMissingSince.vending_bench_2,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDev.modelsDevPayload,
		artificialAnalysis.artificialAnalysisSelectedRows,
	);
	const sourceStatuses: SourceSnapshotStatus[] = [
		agentArena.sourceStatus,
		artificialAnalysis.sourceStatus,
		artificialAnalysisEvaluationResources.sourceStatus,
		modelsDev.sourceStatus,
		agentsLastExam.sourceStatus,
		blueprintBench.sourceStatus,
		browseComp.sourceStatus,
		cursorBench.sourceStatus,
		deepSWE.sourceStatus,
		gdpPdf.sourceStatus,
		riemannBench.sourceStatus,
		toolathlon.sourceStatus,
		valsIndex.sourceStatus,
		valsTerminalBench.sourceStatus,
		vendingBench2.sourceStatus,
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	return {
		snapshots: {
			agentArenaModelScoreRows: agentArena.agentArenaModelScoreRows,
			artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
			artificialAnalysisSelectedRows:
				artificialAnalysis.artificialAnalysisSelectedRows,
			artificialAnalysisEvaluationResourceRows:
				artificialAnalysisEvaluationResources.artificialAnalysisEvaluationResourceRows,
			modelsDevPayload: modelsDev.modelsDevPayload,
			modelsDevModels,
			modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
			modelsDevStatusCode: modelsDev.modelsDevStatusCode,
			agentsLastExamRows: agentsLastExam.agentsLastExamRows,
			agentsLastExamModelScores: agentsLastExam.agentsLastExamModelScores,
			blueprintBenchModelScoreRows: blueprintBench.blueprintBenchModelScoreRows,
			browseCompModelScoreRows: browseComp.browseCompModelScoreRows,
			cursorBenchModelScoreRows: cursorBench.cursorBenchModelScoreRows,
			deepSWERawRows: deepSWE.deepSWERawRows,
			deepSWESourceVersion: deepSWE.deepSWESourceVersion,
			gdpPdfModelScoreRows: gdpPdf.gdpPdfModelScoreRows,
			riemannBenchModelScoreRows: riemannBench.riemannBenchModelScoreRows,
			riemannBenchSourceUrl: riemannBench.riemannBenchSourceUrl,
			toolathlonModelScoreRows: toolathlon.toolathlonModelScoreRows,
			valsIndexRows: valsIndex.valsIndexRows,
			valsIndexModelScoreRows: valsIndex.valsIndexModelScoreRows,
			valsTerminalBenchRows: valsTerminalBench.valsTerminalBenchRows,
			valsTerminalBenchModelScoreRows:
				valsTerminalBench.valsTerminalBenchModelScoreRows,
			vendingBench2ModelScoreRows: vendingBench2.vendingBench2ModelScoreRows,
			vendingBench2DataUrl: vendingBench2.vendingBench2DataUrl,
			sourceRowStates: sourceStatuses.flatMap(
				(sourceStatus) => sourceStatus.sourceRowStates,
			),
			fetchedAt: fetchedAtFromSourceStatuses(sourceStatuses),
		},
		sourceCache,
	};
}

/** Load OpenRouter raw stats from SQLite when fresh and complete for the current matched model ids. */
export async function loadOpenRouterRawPayload(
	db: DatabaseSync,
	modelIds: string[],
	speedConcurrency: number,
	nowEpochSeconds: number,
	options: DatabaseBuildOptions = {},
): Promise<{
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
	cacheStatus: RawSourceCacheStatus;
}> {
	return refreshOpenRouterRawPayload(
		readOpenRouterRawCache(db),
		readRawSourceCacheStatus(db, "openrouter", nowEpochSeconds),
		modelIds,
		speedConcurrency,
		options,
	);
}

/** Fresh OpenRouter caches fetch only uncovered model IDs; stale or explicitly replaced caches refresh the full requested set. */
export function openRouterModelIdsToRefresh(
	cached: SourceCaches["openRouter"],
	status: RawSourceCacheStatus,
	modelIds: readonly string[],
	replaceSourceRows: boolean,
): string[] {
	const requestedModelIds = [...new Set(modelIds)];
	if (cached == null || !status.cache_hit || replaceSourceRows) {
		return requestedModelIds;
	}
	const cachedModelIds = new Set(cached.models.map((model) => model.id));
	return requestedModelIds.filter((modelId) => !cachedModelIds.has(modelId));
}

/** Keeps cached OpenRouter evidence only for current requested keys, while an empty request preserves all cached data. */
function reconcileOpenRouterCacheModels(
	cached: SourceCaches["openRouter"],
	requestedModelIds: readonly string[],
): SourceCaches["openRouter"] {
	if (cached == null || requestedModelIds.length === 0) {
		return cached;
	}
	const requestedModelIdSet = new Set(requestedModelIds);
	return {
		...cached,
		models: cached.models.filter((model) => requestedModelIdSet.has(model.id)),
	};
}

/** Refreshes OpenRouter data from a storage-independent cache value. */
export async function refreshOpenRouterRawPayload(
	cached: SourceCaches["openRouter"],
	status: RawSourceCacheStatus,
	modelIds: string[],
	speedConcurrency: number,
	options: DatabaseBuildOptions = {},
): Promise<{
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
	cacheStatus: RawSourceCacheStatus;
}> {
	const replaceSourceRows = options.replaceSourceRows === true;
	const requestedModelIds = [...new Set(modelIds)];
	const scopedCache = reconcileOpenRouterCacheModels(cached, requestedModelIds);
	const modelIdsToRefresh = openRouterModelIdsToRefresh(
		scopedCache,
		status,
		requestedModelIds,
		replaceSourceRows,
	);
	if (
		scopedCache != null &&
		modelIdsToRefresh.length === 0 &&
		!replaceSourceRows
	) {
		return {
			rawPayload: scopedCache,
			cacheStatus: {
				...status,
				source_input_count:
					scopedCache.directory.length + scopedCache.models.length,
			},
		};
	}
	try {
		const useCachedDirectory =
			status.cache_hit && scopedCache != null && !replaceSourceRows;
		const fetchedPayload =
			modelIdsToRefresh.length === 0
				? null
				: await getOpenRouterRawScrapedStats({
						modelIds: modelIdsToRefresh,
						concurrency: speedConcurrency,
						...(useCachedDirectory
							? {
									modelDirectory: scopedCache.directory,
									timeoutMs: PARTIAL_OPENROUTER_TIMEOUT_MS,
									maxRetries: PARTIAL_OPENROUTER_MAX_RETRIES,
								}
							: {}),
					});
		const rawPayload =
			fetchedPayload == null
				? scopedCache
				: scopedCache == null || replaceSourceRows
					? fetchedPayload
					: {
							fetched_at_epoch_seconds: fetchedPayload.fetched_at_epoch_seconds,
							directory: mergeCachedSourceRows(
								scopedCache.directory,
								fetchedPayload.directory,
								(row) => row.permaslug ?? row.slug ?? null,
							),
							models: mergeCachedSourceRows(
								scopedCache.models,
								fetchedPayload.models,
								(row) => row.id,
							),
						};
		return {
			rawPayload,
			cacheStatus: refreshedCacheStatus(
				rawPayload?.fetched_at_epoch_seconds ?? null,
				(rawPayload?.directory.length ?? 0) + (rawPayload?.models.length ?? 0),
			),
		};
	} catch {
		return {
			rawPayload: scopedCache,
			cacheStatus: {
				...status,
				source_input_count:
					(scopedCache?.directory.length ?? 0) +
					(scopedCache?.models.length ?? 0),
			},
		};
	}
}
