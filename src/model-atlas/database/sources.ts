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
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readCursorBenchRawCache,
	readDeepSWERawCache,
	readEbrBenchRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFrontierMathTier4RawCache,
	readGdpPdfRawCache,
	readHandbookMdRawCache,
	readMercorApexAgentsRawCache,
	readModelsDevRawCache,
	readOpenRouterRawCache,
	readProofBenchRawCache,
	readRawSourceCacheStatus,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readValsTerminalBenchRawCache,
	readVendingBench2RawCache,
	readWeirdMlRawCache,
	refreshedCacheStatus,
} from "./cache";
import {
	persistedSourceRowStates,
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
	chartographySnapshot,
	chessPuzzlesSnapshot,
	cursorBenchSnapshot,
	ebrBenchSnapshot,
	enterpriseBenchCoreCraftSnapshot,
	epochCapabilitiesIndexSnapshot,
	frontierMathTier4Snapshot,
	gdpPdfSnapshot,
	handbookMdSnapshot,
	mercorApexAgentsSnapshot,
	proofBenchSnapshot,
	riemannBenchSnapshot,
	toolathlonSnapshot,
	valsIndexSnapshot,
	valsTerminalBenchSnapshot,
	vendingBench2Snapshot,
	weirdMlSnapshot,
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
	artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
	artificialAnalysisEvaluationResources: ReturnType<
		typeof readArtificialAnalysisEvaluationResourceRawCache
	>;
	modelsDev: ReturnType<typeof readModelsDevRawCache>;
	openRouter: ReturnType<typeof readOpenRouterRawCache>;
	agentArena: ReturnType<typeof readAgentArenaRawCache>;
	agentsLastExam: ReturnType<typeof readAgentsLastExamRawCache>;
	blueprintBench: ReturnType<typeof readBlueprintBenchRawCache>;
	browseComp: ReturnType<typeof readBrowseCompRawCache>;
	chartography: ReturnType<typeof readChartographyRawCache>;
	chessPuzzles: ReturnType<typeof readChessPuzzlesRawCache>;
	cursorBench: ReturnType<typeof readCursorBenchRawCache>;
	deepSWE: ReturnType<typeof readDeepSWERawCache>;
	ebrBench: ReturnType<typeof readEbrBenchRawCache>;
	enterpriseBenchCoreCraft: ReturnType<
		typeof readEnterpriseBenchCoreCraftRawCache
	>;
	epochCapabilitiesIndex: ReturnType<typeof readEpochCapabilitiesIndexRawCache>;
	frontierMathTier4: ReturnType<typeof readFrontierMathTier4RawCache>;
	gdpPdf: ReturnType<typeof readGdpPdfRawCache>;
	handbookMd: ReturnType<typeof readHandbookMdRawCache>;
	mercorApexAgents: ReturnType<typeof readMercorApexAgentsRawCache>;
	proofBench: ReturnType<typeof readProofBenchRawCache>;
	riemannBench: ReturnType<typeof readRiemannBenchRawCache>;
	valsTerminalBench: ReturnType<typeof readValsTerminalBenchRawCache>;
	toolathlon: ReturnType<typeof readToolathlonRawCache>;
	valsIndex: ReturnType<typeof readValsIndexRawCache>;
	vendingBench2: ReturnType<typeof readVendingBench2RawCache>;
	weirdMl: ReturnType<typeof readWeirdMlRawCache>;
};

function readSqliteSourceCaches(db: DatabaseSync): SourceCaches {
	return {
		artificialAnalysis: readArtificialAnalysisRawCache(db),
		artificialAnalysisEvaluationResources:
			readArtificialAnalysisEvaluationResourceRawCache(db),
		modelsDev: readModelsDevRawCache(db),
		openRouter: readOpenRouterRawCache(db),
		agentArena: readAgentArenaRawCache(db),
		agentsLastExam: readAgentsLastExamRawCache(db),
		blueprintBench: readBlueprintBenchRawCache(db),
		browseComp: readBrowseCompRawCache(db),
		chartography: readChartographyRawCache(db),
		chessPuzzles: readChessPuzzlesRawCache(db),
		cursorBench: readCursorBenchRawCache(db),
		deepSWE: readDeepSWERawCache(db),
		ebrBench: readEbrBenchRawCache(db),
		enterpriseBenchCoreCraft: readEnterpriseBenchCoreCraftRawCache(db),
		epochCapabilitiesIndex: readEpochCapabilitiesIndexRawCache(db),
		frontierMathTier4: readFrontierMathTier4RawCache(db),
		gdpPdf: readGdpPdfRawCache(db),
		handbookMd: readHandbookMdRawCache(db),
		mercorApexAgents: readMercorApexAgentsRawCache(db),
		proofBench: readProofBenchRawCache(db),
		riemannBench: readRiemannBenchRawCache(db),
		valsTerminalBench: readValsTerminalBenchRawCache(db),
		toolathlon: readToolathlonRawCache(db),
		valsIndex: readValsIndexRawCache(db),
		vendingBench2: readVendingBench2RawCache(db),
		weirdMl: readWeirdMlRawCache(db),
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
		artificialAnalysis: null,
		artificialAnalysisEvaluationResources: null,
		agentArena: null,
		agentsLastExam: null,
		blueprintBench: null,
		browseComp: null,
		chartography: null,
		chessPuzzles: null,
		cursorBench: null,
		deepSWE: null,
		ebrBench: null,
		enterpriseBenchCoreCraft: null,
		epochCapabilitiesIndex: null,
		frontierMathTier4: null,
		gdpPdf: null,
		handbookMd: null,
		mercorApexAgents: null,
		proofBench: null,
		riemannBench: null,
		valsTerminalBench: null,
		toolathlon: null,
		valsIndex: null,
		vendingBench2: null,
		weirdMl: null,
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
		persistedSourceRowStates(db),
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
		artificialAnalysis,
		artificialAnalysisEvaluationResources,
		modelsDev,
		agentArena,
		agentsLastExam,
		blueprintBench,
		browseComp,
		chartography,
		chessPuzzles,
		cursorBench,
		deepSWE,
		ebrBench,
		enterpriseBenchCoreCraft,
		epochCapabilitiesIndex,
		frontierMathTier4,
		gdpPdf,
		handbookMd,
		mercorApexAgents,
		proofBench,
		riemannBench,
		valsTerminalBench,
		toolathlon,
		valsIndex,
		vendingBench2,
		weirdMl,
	] = await Promise.all([
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
		agentArenaSnapshot(
			caches.agentArena,
			sourceCache.agent_arena,
			options,
			previousMissingSince.agent_arena,
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
		chartographySnapshot(
			caches.chartography,
			sourceCache.chartography,
			options,
			previousMissingSince.chartography,
			nowEpochSeconds,
		),
		chessPuzzlesSnapshot(
			caches.chessPuzzles,
			sourceCache.chess_puzzles,
			options,
			previousMissingSince.chess_puzzles,
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
		ebrBenchSnapshot(
			caches.ebrBench,
			sourceCache.ebr_bench,
			options,
			previousMissingSince.ebr_bench,
			nowEpochSeconds,
		),
		enterpriseBenchCoreCraftSnapshot(
			caches.enterpriseBenchCoreCraft,
			sourceCache.enterprisebench_corecraft,
			options,
			previousMissingSince.enterprisebench_corecraft,
			nowEpochSeconds,
		),
		epochCapabilitiesIndexSnapshot(
			caches.epochCapabilitiesIndex,
			sourceCache.epoch_capabilities_index,
			options,
			previousMissingSince.epoch_capabilities_index,
			nowEpochSeconds,
		),
		frontierMathTier4Snapshot(
			caches.frontierMathTier4,
			sourceCache.frontiermath_tier_4,
			options,
			previousMissingSince.frontiermath_tier_4,
			nowEpochSeconds,
		),
		gdpPdfSnapshot(
			caches.gdpPdf,
			sourceCache.gdp_pdf,
			options,
			previousMissingSince.gdp_pdf,
			nowEpochSeconds,
		),
		handbookMdSnapshot(
			caches.handbookMd,
			sourceCache.handbook_md,
			options,
			previousMissingSince.handbook_md,
			nowEpochSeconds,
		),
		mercorApexAgentsSnapshot(
			caches.mercorApexAgents,
			sourceCache.mercor_apex_agents,
			options,
			previousMissingSince.mercor_apex_agents,
			nowEpochSeconds,
		),
		proofBenchSnapshot(
			caches.proofBench,
			sourceCache.proofbench,
			options,
			previousMissingSince.proofbench,
			nowEpochSeconds,
		),
		riemannBenchSnapshot(
			caches.riemannBench,
			sourceCache.riemann_bench,
			options,
			previousMissingSince.riemann_bench,
			nowEpochSeconds,
		),
		valsTerminalBenchSnapshot(
			caches.valsTerminalBench,
			sourceCache.vals_terminal_bench,
			options,
			previousMissingSince.vals_terminal_bench,
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
		vendingBench2Snapshot(
			caches.vendingBench2,
			sourceCache.vending_bench_2,
			options,
			previousMissingSince.vending_bench_2,
			nowEpochSeconds,
		),
		weirdMlSnapshot(
			caches.weirdMl,
			sourceCache.weirdml,
			options,
			previousMissingSince.weirdml,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDev.modelsDevPayload,
		artificialAnalysis.artificialAnalysisSelectedRows,
	);
	const sourceStatuses: SourceSnapshotStatus[] = [
		artificialAnalysis.sourceStatus,
		artificialAnalysisEvaluationResources.sourceStatus,
		modelsDev.sourceStatus,
		agentArena.sourceStatus,
		agentsLastExam.sourceStatus,
		blueprintBench.sourceStatus,
		browseComp.sourceStatus,
		chartography.sourceStatus,
		chessPuzzles.sourceStatus,
		cursorBench.sourceStatus,
		deepSWE.sourceStatus,
		ebrBench.sourceStatus,
		enterpriseBenchCoreCraft.sourceStatus,
		epochCapabilitiesIndex.sourceStatus,
		frontierMathTier4.sourceStatus,
		gdpPdf.sourceStatus,
		handbookMd.sourceStatus,
		mercorApexAgents.sourceStatus,
		proofBench.sourceStatus,
		riemannBench.sourceStatus,
		valsTerminalBench.sourceStatus,
		toolathlon.sourceStatus,
		valsIndex.sourceStatus,
		vendingBench2.sourceStatus,
		weirdMl.sourceStatus,
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	return {
		snapshots: {
			artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
			artificialAnalysisSelectedRows:
				artificialAnalysis.artificialAnalysisSelectedRows,
			artificialAnalysisEvaluationResourceRows:
				artificialAnalysisEvaluationResources.artificialAnalysisEvaluationResourceRows,
			modelsDevPayload: modelsDev.modelsDevPayload,
			modelsDevModels,
			modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
			modelsDevStatusCode: modelsDev.modelsDevStatusCode,
			agentArenaModelScoreRows: agentArena.agentArenaModelScoreRows,
			agentsLastExamRows: agentsLastExam.agentsLastExamRows,
			agentsLastExamModelScores: agentsLastExam.agentsLastExamModelScores,
			blueprintBenchModelScoreRows: blueprintBench.blueprintBenchModelScoreRows,
			browseCompModelScoreRows: browseComp.browseCompModelScoreRows,
			chartographyRows: chartography.rows,
			chessPuzzleRows: chessPuzzles.rows,
			cursorBenchModelScoreRows: cursorBench.cursorBenchModelScoreRows,
			deepSWERawRows: deepSWE.deepSWERawRows,
			deepSWESourceVersion: deepSWE.deepSWESourceVersion,
			ebrBenchRows: ebrBench.rows,
			enterpriseBenchCoreCraftRows: enterpriseBenchCoreCraft.rows,
			epochCapabilitiesIndexRows: epochCapabilitiesIndex.rows,
			frontierMathTier4Rows: frontierMathTier4.rows,
			gdpPdfModelScoreRows: gdpPdf.gdpPdfModelScoreRows,
			handbookMdRows: handbookMd.rows,
			mercorApexAgentsRows: mercorApexAgents.mercorApexAgentsRows,
			proofBenchRows: proofBench.proofBenchRows,
			riemannBenchModelScoreRows: riemannBench.riemannBenchModelScoreRows,
			riemannBenchSourceUrl: riemannBench.riemannBenchSourceUrl,
			valsTerminalBenchRows: valsTerminalBench.valsTerminalBenchRows,
			valsTerminalBenchModelScoreRows:
				valsTerminalBench.valsTerminalBenchModelScoreRows,
			toolathlonModelScoreRows: toolathlon.toolathlonModelScoreRows,
			valsIndexRows: valsIndex.valsIndexRows,
			valsIndexModelScoreRows: valsIndex.valsIndexModelScoreRows,
			vendingBench2ModelScoreRows: vendingBench2.vendingBench2ModelScoreRows,
			vendingBench2DataUrl: vendingBench2.vendingBench2DataUrl,
			weirdMlRows: weirdMl.weirdMlRows,
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
