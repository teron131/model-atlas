/** Source snapshot orchestration for the Model Atlas SQLite database pipeline. */

import type { DatabaseSync } from "node:sqlite";

import {
	type ModelsDevPayload,
	processModelsDevPayload,
} from "../scrapers/models-dev";
import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import {
	buildArtificialAnalysisRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
} from "../stats/source-policy";
import type { ScoringConfig } from "../stats/types";
import {
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	refreshedCacheStatus,
} from "./cache";
import { latestSourceRowStates, missingSinceBySource } from "./policy";
import {
	type ArtificialAnalysisSnapshot,
	artificialAnalysisSnapshot,
} from "./source-snapshots/artificial-analysis";
import {
	type ModelsDevSnapshot,
	modelsDevSnapshot,
	modelsDevSourceInputCount,
} from "./source-snapshots/models-dev";
import {
	type BlueprintBenchSnapshot,
	type BrowseCompSnapshot,
	blueprintBenchSnapshot,
	browseCompSnapshot,
	type CursorBenchSnapshot,
	cursorBenchSnapshot,
	type GdpPdfSnapshot,
	gdpPdfSnapshot,
	type RiemannBenchSnapshot,
	riemannBenchSnapshot,
	type ToolathlonSnapshot,
	toolathlonSnapshot,
} from "./source-snapshots/sparse-benchmarks";
import {
	type AgentsLastExamSnapshot,
	agentsLastExamSnapshot,
	type DeepSWESnapshot,
	deepSWESnapshot,
	type TerminalBenchSnapshot,
	terminalBenchSnapshot,
} from "./source-snapshots/summarized-benchmarks";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

type SnapshotSourceStatus = {
	source: RawSourceName;
	fetchedAt: number | null;
	sourceInputCount: number;
	sourceRowStates: SourceRowState[];
	fetchedAtKey?: keyof SourceSnapshots["fetchedAt"];
};

type LoadedSourceSnapshots = {
	artificialAnalysis: ArtificialAnalysisSnapshot;
	modelsDev: ModelsDevSnapshot;
	agentsLastExam: AgentsLastExamSnapshot;
	blueprintBench: BlueprintBenchSnapshot;
	browseComp: BrowseCompSnapshot;
	cursorBench: CursorBenchSnapshot;
	deepSWE: DeepSWESnapshot;
	gdpPdf: GdpPdfSnapshot;
	riemannBench: RiemannBenchSnapshot;
	terminalBench: TerminalBenchSnapshot;
	toolathlon: ToolathlonSnapshot;
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
	sourceStatuses: SnapshotSourceStatus[],
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
	sourceStatuses: SnapshotSourceStatus[],
): SourceSnapshots["fetchedAt"] {
	const fetchedAt: SourceSnapshots["fetchedAt"] = {
		artificialAnalysis: null,
		agentsLastExam: null,
		blueprintBench: null,
		browseComp: null,
		cursorBench: null,
		deepSWE: null,
		gdpPdf: null,
		riemannBench: null,
		terminalBench: null,
		toolathlon: null,
	};
	for (const sourceStatus of sourceStatuses) {
		if (sourceStatus.fetchedAtKey != null) {
			fetchedAt[sourceStatus.fetchedAtKey] = sourceStatus.fetchedAt;
		}
	}
	return fetchedAt;
}

function sourceStatusesFromSnapshots({
	artificialAnalysis,
	modelsDev,
	agentsLastExam,
	blueprintBench,
	browseComp,
	cursorBench,
	deepSWE,
	gdpPdf,
	riemannBench,
	terminalBench,
	toolathlon,
}: LoadedSourceSnapshots): SnapshotSourceStatus[] {
	return [
		{
			source: "artificial_analysis",
			fetchedAt: artificialAnalysis.fetchedAt.artificialAnalysis,
			sourceInputCount: artificialAnalysis.artificialAnalysisRawRows.length,
			sourceRowStates: artificialAnalysis.sourceRowStates,
			fetchedAtKey: "artificialAnalysis",
		},
		{
			source: "models_dev",
			fetchedAt: modelsDev.modelsDevFetchedAt,
			sourceInputCount: modelsDevSourceInputCount(modelsDev.modelsDevPayload),
			sourceRowStates: modelsDev.sourceRowStates,
		},
		{
			source: "agents_last_exam",
			fetchedAt: agentsLastExam.fetchedAt.agentsLastExam,
			sourceInputCount: agentsLastExam.agentsLastExamRows.length,
			sourceRowStates: agentsLastExam.sourceRowStates,
			fetchedAtKey: "agentsLastExam",
		},
		{
			source: "blueprint_bench_2",
			fetchedAt: blueprintBench.fetchedAt.blueprintBench,
			sourceInputCount: blueprintBench.blueprintBenchModelScoreRows.length,
			sourceRowStates: blueprintBench.sourceRowStates,
			fetchedAtKey: "blueprintBench",
		},
		{
			source: "browsecomp",
			fetchedAt: browseComp.fetchedAt.browseComp,
			sourceInputCount: browseComp.browseCompModelScoreRows.length,
			sourceRowStates: browseComp.sourceRowStates,
			fetchedAtKey: "browseComp",
		},
		{
			source: "cursorbench",
			fetchedAt: cursorBench.fetchedAt.cursorBench,
			sourceInputCount: cursorBench.cursorBenchModelScoreRows.length,
			sourceRowStates: cursorBench.sourceRowStates,
			fetchedAtKey: "cursorBench",
		},
		{
			source: "deep_swe",
			fetchedAt: deepSWE.fetchedAt.deepSWE,
			sourceInputCount: deepSWE.deepSWERawRows.length,
			sourceRowStates: deepSWE.sourceRowStates,
			fetchedAtKey: "deepSWE",
		},
		{
			source: "gdp_pdf",
			fetchedAt: gdpPdf.fetchedAt.gdpPdf,
			sourceInputCount: gdpPdf.gdpPdfModelScoreRows.length,
			sourceRowStates: gdpPdf.sourceRowStates,
			fetchedAtKey: "gdpPdf",
		},
		{
			source: "riemann_bench",
			fetchedAt: riemannBench.fetchedAt.riemannBench,
			sourceInputCount: riemannBench.riemannBenchModelScoreRows.length,
			sourceRowStates: riemannBench.sourceRowStates,
			fetchedAtKey: "riemannBench",
		},
		{
			source: "terminal_bench",
			fetchedAt: terminalBench.fetchedAt.terminalBench,
			sourceInputCount: terminalBench.terminalBenchRows.length,
			sourceRowStates: terminalBench.sourceRowStates,
			fetchedAtKey: "terminalBench",
		},
		{
			source: "toolathlon",
			fetchedAt: toolathlon.fetchedAt.toolathlon,
			sourceInputCount: toolathlon.toolathlonModelScoreRows.length,
			sourceRowStates: toolathlon.sourceRowStates,
			fetchedAtKey: "toolathlon",
		},
	];
}

function modelsDevRowsWithArtificialAnalysisRetainKeys(
	modelsDevPayload: ModelsDevPayload,
	artificialAnalysisSelectedRows: SourceSnapshots["artificialAnalysisSelectedRows"],
): SourceSnapshots["modelsDevModels"] {
	return processModelsDevPayload(
		modelsDevPayload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		buildArtificialAnalysisRetainKeys(artificialAnalysisSelectedRows),
	);
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
		modelsDev,
		agentsLastExam,
		blueprintBench,
		browseComp,
		cursorBench,
		deepSWE,
		gdpPdf,
		riemannBench,
		terminalBench,
		toolathlon,
	] = await Promise.all([
		artificialAnalysisSnapshot(
			db,
			sourceCache.artificial_analysis,
			options,
			scoringConfig,
			previousMissingSince.artificial_analysis,
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
		terminalBenchSnapshot(
			db,
			sourceCache.terminal_bench,
			options,
			previousMissingSince.terminal_bench,
			nowEpochSeconds,
		),
		toolathlonSnapshot(
			db,
			sourceCache.toolathlon,
			options,
			previousMissingSince.toolathlon,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = modelsDevRowsWithArtificialAnalysisRetainKeys(
		modelsDev.modelsDevPayload,
		artificialAnalysis.artificialAnalysisSelectedRows,
	);
	const sourceStatuses = sourceStatusesFromSnapshots({
		artificialAnalysis,
		modelsDev,
		agentsLastExam,
		blueprintBench,
		browseComp,
		cursorBench,
		deepSWE,
		gdpPdf,
		riemannBench,
		terminalBench,
		toolathlon,
	});
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	return {
		snapshots: {
			artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
			artificialAnalysisSelectedRows:
				artificialAnalysis.artificialAnalysisSelectedRows,
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
			deepSWEModelScoreRows: deepSWE.deepSWEModelScoreRows,
			deepSWESourceVersion: deepSWE.deepSWESourceVersion,
			gdpPdfModelScoreRows: gdpPdf.gdpPdfModelScoreRows,
			riemannBenchModelScoreRows: riemannBench.riemannBenchModelScoreRows,
			terminalBenchRows: terminalBench.terminalBenchRows,
			terminalBenchModelScores: terminalBench.terminalBenchModelScores,
			toolathlonModelScoreRows: toolathlon.toolathlonModelScoreRows,
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
