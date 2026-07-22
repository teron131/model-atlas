/** Source snapshots share one cache-aware workflow across local SQLite and production D1. */

import type { DatabaseSync } from "node:sqlite";

import { BENCHMARK_SCORE_SOURCE_BINDINGS } from "../../benchmarks/registry";
import type { ScoringConfig } from "../../config/stage";
import { selectModelsDevRowsForArtificialAnalysis } from "../assembly/policy";
import {
	readArtificialAnalysisEvaluationResourceRawCache,
	readArtificialAnalysisRawCache,
	readBenchmarkScoreRawCache,
	readModelsDevRawCache,
	readRawSourceCacheStatus,
} from "../cache";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
	type SourceSnapshotStatus,
	type SourceSnapshots,
} from "../types";
import {
	artificialAnalysisEvaluationResourceSnapshot,
	artificialAnalysisSnapshot,
} from "./artificial-analysis";
import {
	type BenchmarkSnapshotCaches,
	benchmarkSnapshotRows,
	readBenchmarkSnapshotCaches,
	refreshBenchmarkSnapshots,
} from "./benchmark-runtimes";
import { benchmarkScoreSnapshots } from "./benchmarks/benchmark-score";
import { modelsDevSnapshot } from "./models-dev";
import { missingSinceBySource, persistedSourceRowStates } from "./policy";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

export type SourceSnapshotCaches = BenchmarkSnapshotCaches & {
	artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
	artificialAnalysisEvaluationResources: ReturnType<
		typeof readArtificialAnalysisEvaluationResourceRawCache
	>;
	modelsDev: ReturnType<typeof readModelsDevRawCache>;
	benchmarkScores: Readonly<
		Record<string, ReturnType<typeof readBenchmarkScoreRawCache> | undefined>
	>;
};

function readSqliteSourceCaches(db: DatabaseSync): SourceSnapshotCaches {
	const benchmarkScores = Object.fromEntries(
		BENCHMARK_SCORE_SOURCE_BINDINGS.map((binding) => [
			binding.sourceDataKey,
			readBenchmarkScoreRawCache(db, binding),
		]),
	);
	return {
		...readBenchmarkSnapshotCaches(db),
		artificialAnalysis: readArtificialAnalysisRawCache(db),
		artificialAnalysisEvaluationResources:
			readArtificialAnalysisEvaluationResourceRawCache(db),
		modelsDev: readModelsDevRawCache(db),
		benchmarkScores,
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

function fetchedAtFromStatuses(
	sourceStatuses: SourceSnapshotStatus[],
): SourceSnapshots["fetchedAt"] {
	return Object.fromEntries(
		sourceStatuses.flatMap((sourceStatus) =>
			sourceStatus.fetchedAtKey == null
				? []
				: [[sourceStatus.fetchedAtKey, sourceStatus.fetchedAt]],
		),
	) as SourceSnapshots["fetchedAt"];
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
	caches: SourceSnapshotCaches,
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
		benchmarks,
		benchmarkScores,
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
		refreshBenchmarkSnapshots(
			caches,
			sourceCache,
			options,
			previousMissingSince,
			nowEpochSeconds,
		),
		benchmarkScoreSnapshots(
			caches.benchmarkScores,
			sourceCache,
			options,
			previousMissingSince,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDev.modelsDevPayload,
		artificialAnalysis.artificialAnalysisSelectedRows,
	);
	type BenchmarkScoreRowsKey =
		(typeof BENCHMARK_SCORE_SOURCE_BINDINGS)[number]["sourceRowsKey"];
	const benchmarkScoreRows = Object.fromEntries(
		benchmarkScores.map(({ binding, snapshot }) => [
			binding.sourceRowsKey,
			snapshot.rows,
		]),
	) as Pick<SourceSnapshots, BenchmarkScoreRowsKey>;
	const benchmarkRows = benchmarkSnapshotRows(benchmarks);
	const sourceStatuses: SourceSnapshotStatus[] = [
		artificialAnalysis.sourceStatus,
		artificialAnalysisEvaluationResources.sourceStatus,
		modelsDev.sourceStatus,
		...Object.values(benchmarks).map((snapshot) => snapshot.sourceStatus),
		...benchmarkScores.map(({ snapshot }) => snapshot.sourceStatus),
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	const snapshots = {
		artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
		artificialAnalysisSelectedRows:
			artificialAnalysis.artificialAnalysisSelectedRows,
		artificialAnalysisEvaluationResourceRows:
			artificialAnalysisEvaluationResources.artificialAnalysisEvaluationResourceRows,
		modelsDevPayload: modelsDev.modelsDevPayload,
		modelsDevModels,
		modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
		modelsDevStatusCode: modelsDev.modelsDevStatusCode,
		...benchmarkRows,
		...benchmarkScoreRows,
		sourceRowStates: sourceStatuses.flatMap(
			(sourceStatus) => sourceStatus.sourceRowStates,
		),
		fetchedAt: fetchedAtFromStatuses(sourceStatuses),
	} satisfies SourceSnapshots;
	return {
		snapshots,
		sourceCache,
	};
}
