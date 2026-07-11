/** Source snapshot orchestration for the Model Atlas SQLite database pipeline. */

import type { DatabaseSync } from "node:sqlite";

import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import { selectModelsDevRowsForArtificialAnalysis } from "../stats/source-policy";
import type { ScoringConfig } from "../stats/types";
import {
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	refreshedCacheStatus,
} from "./cache";
import { latestSourceRowStates, missingSinceBySource } from "./policy";
import { artificialAnalysisSnapshot } from "./source-snapshots/artificial-analysis";
import { modelsDevSnapshot } from "./source-snapshots/models-dev";
import {
	artificialAnalysisEvaluationResourceSnapshot,
	blueprintBenchSnapshot,
	browseCompSnapshot,
	cursorBenchSnapshot,
	gdpPdfSnapshot,
	riemannBenchSnapshot,
	toolathlonSnapshot,
	valsIndexSnapshot,
	valsTerminalBenchSnapshot,
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
	type SourceSnapshotStatus,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

function sourceCacheDefaults(
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
	const sourceCache = sourceCacheDefaults(db, nowEpochSeconds);
	const previousMissingSince = missingSinceBySource(latestSourceRowStates(db));
	const [
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
	] = await Promise.all([
		artificialAnalysisSnapshot(
			db,
			sourceCache.artificial_analysis,
			options,
			scoringConfig,
			previousMissingSince.artificial_analysis,
			nowEpochSeconds,
		),
		artificialAnalysisEvaluationResourceSnapshot(
			db,
			sourceCache.artificial_analysis_evaluation_resources,
			options,
			previousMissingSince.artificial_analysis_evaluation_resources,
			nowEpochSeconds,
		),
		modelsDevSnapshot(
			db,
			sourceCache.models_dev,
			options,
			previousMissingSince.models_dev,
			nowEpochSeconds,
		),
		agentsLastExamSnapshot(
			db,
			sourceCache.agents_last_exam,
			options,
			previousMissingSince.agents_last_exam,
			nowEpochSeconds,
		),
		blueprintBenchSnapshot(
			db,
			sourceCache.blueprint_bench_2,
			options,
			previousMissingSince.blueprint_bench_2,
			nowEpochSeconds,
		),
		browseCompSnapshot(
			db,
			sourceCache.browsecomp,
			options,
			previousMissingSince.browsecomp,
			nowEpochSeconds,
		),
		cursorBenchSnapshot(
			db,
			sourceCache.cursorbench,
			options,
			previousMissingSince.cursorbench,
			nowEpochSeconds,
		),
		deepSWESnapshot(
			db,
			sourceCache.deep_swe,
			options,
			previousMissingSince.deep_swe,
			nowEpochSeconds,
		),
		gdpPdfSnapshot(
			db,
			sourceCache.gdp_pdf,
			options,
			previousMissingSince.gdp_pdf,
			nowEpochSeconds,
		),
		riemannBenchSnapshot(
			db,
			sourceCache.riemann_bench,
			options,
			previousMissingSince.riemann_bench,
			nowEpochSeconds,
		),
		toolathlonSnapshot(
			db,
			sourceCache.toolathlon,
			options,
			previousMissingSince.toolathlon,
			nowEpochSeconds,
		),
		valsIndexSnapshot(
			db,
			sourceCache.vals_index,
			options,
			previousMissingSince.vals_index,
			nowEpochSeconds,
		),
		valsTerminalBenchSnapshot(
			db,
			sourceCache.vals_terminal_bench,
			options,
			previousMissingSince.vals_terminal_bench,
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
	const status = readRawSourceCacheStatus(db, "openrouter", nowEpochSeconds);
	const cached = readOpenRouterRawCache(db);
	const cachedModelIds = new Set(cached?.models.map((model) => model.id) ?? []);
	const cacheCoversModels = modelIds.every((modelId) =>
		cachedModelIds.has(modelId),
	);
	if (
		status.cache_hit &&
		cached != null &&
		cacheCoversModels &&
		options.replaceSourceRows !== true
	) {
		return {
			rawPayload: cached,
			cacheStatus: {
				...status,
				source_input_count: cached.directory.length + cached.models.length,
			},
		};
	}
	try {
		const rawPayload =
			modelIds.length === 0
				? null
				: await getOpenRouterRawScrapedStats({
						modelIds,
						concurrency: speedConcurrency,
					});
		return {
			rawPayload,
			cacheStatus: refreshedCacheStatus(
				rawPayload?.fetched_at_epoch_seconds ?? null,
				(rawPayload?.directory.length ?? 0) + (rawPayload?.models.length ?? 0),
			),
		};
	} catch {
		return {
			rawPayload: cached,
			cacheStatus: {
				...status,
				source_input_count:
					(cached?.directory.length ?? 0) + (cached?.models.length ?? 0),
			},
		};
	}
}
