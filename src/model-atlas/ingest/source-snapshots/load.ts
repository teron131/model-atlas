/** Source snapshots share one cache-aware workflow across local SQLite and production D1. */

import type { DatabaseSync } from "node:sqlite";
import { benchmarkObservationSnapshots } from "../../benchmarks/persistence/observation";
import {
	type BenchmarkSnapshotCaches,
	benchmarkSnapshotRows,
	readBenchmarkSnapshotCaches,
	refreshBenchmarkSnapshots,
} from "../../benchmarks/persistence/runtime";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../../benchmarks/registry";
import type { ScoringConfig } from "../../config/stage";
import { selectModelsDevRowsForArtificialAnalysis } from "../assembly/policy";
import {
	readArtificialAnalysisBenchmarkResourceRawCache,
	readArtificialAnalysisRawCache,
	readBenchmarkObservationRawCache,
	readModelsDevRawCache,
	readRawSourceCacheStatus,
} from "../cache";
import { RAW_SOURCE_NAMES, type RawSourceName } from "../source-registry";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceRowState,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../types";
import {
	artificialAnalysisBenchmarkResourceSnapshot,
	artificialAnalysisSnapshot,
} from "./artificial-analysis";
import { modelsDevSnapshot } from "./models-dev";
import { missingSinceBySource, persistedSourceRowStates } from "./policy";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

export type SourceSnapshotCaches = BenchmarkSnapshotCaches & {
	artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
	artificialAnalysisBenchmarkResources: ReturnType<
		typeof readArtificialAnalysisBenchmarkResourceRawCache
	>;
	modelsDev: ReturnType<typeof readModelsDevRawCache>;
	benchmarkObservations: Readonly<
		Record<
			string,
			ReturnType<typeof readBenchmarkObservationRawCache> | undefined
		>
	>;
};

function readSqliteSourceCaches(db: DatabaseSync): SourceSnapshotCaches {
	const benchmarkObservations = Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
			binding.sourceDataKey,
			readBenchmarkObservationRawCache(db, binding),
		]),
	);
	return {
		...readBenchmarkSnapshotCaches(db),
		artificialAnalysis: readArtificialAnalysisRawCache(db),
		artificialAnalysisBenchmarkResources:
			readArtificialAnalysisBenchmarkResourceRawCache(db),
		modelsDev: readModelsDevRawCache(db),
		benchmarkObservations,
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
		artificialAnalysisBenchmarkResources,
		modelsDev,
		benchmarks,
		benchmarkObservations,
	] = await Promise.all([
		artificialAnalysisSnapshot(
			caches.artificialAnalysis,
			sourceCache.artificial_analysis,
			options,
			scoringConfig,
			previousMissingSince.artificial_analysis,
			nowEpochSeconds,
		),
		artificialAnalysisBenchmarkResourceSnapshot(
			caches.artificialAnalysisBenchmarkResources,
			sourceCache.artificial_analysis_benchmark_resources,
			options,
			previousMissingSince.artificial_analysis_benchmark_resources,
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
		benchmarkObservationSnapshots(
			caches.benchmarkObservations,
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
	type BenchmarkObservationRowsKey =
		(typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
	const benchmarkObservationRows = Object.fromEntries(
		benchmarkObservations.map(({ binding, snapshot }) => [
			binding.sourceRowsKey,
			snapshot.rows,
		]),
	) as Pick<SourceSnapshots, BenchmarkObservationRowsKey>;
	const benchmarkRows = benchmarkSnapshotRows(benchmarks);
	const sourceStatuses: SourceSnapshotStatus[] = [
		artificialAnalysis.sourceStatus,
		artificialAnalysisBenchmarkResources.sourceStatus,
		modelsDev.sourceStatus,
		...Object.values(benchmarks).map((snapshot) => snapshot.sourceStatus),
		...benchmarkObservations.map(({ snapshot }) => snapshot.sourceStatus),
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	const snapshots = {
		artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
		artificialAnalysisSelectedRows:
			artificialAnalysis.artificialAnalysisSelectedRows,
		artificialAnalysisBenchmarkResourceRows:
			artificialAnalysisBenchmarkResources.artificialAnalysisBenchmarkResourceRows,
		modelsDevPayload: modelsDev.modelsDevPayload,
		modelsDevModels,
		modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
		modelsDevStatusCode: modelsDev.modelsDevStatusCode,
		...benchmarkRows,
		...benchmarkObservationRows,
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
