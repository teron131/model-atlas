/** Artificial Analysis snapshots retain benchmark-carrier rows while projecting selected public model fields. */

import {
	AGENTIC_INDEX_KEYS,
	INTELLIGENCE_INDEX_KEYS,
} from "../../benchmarks/field-keys";
import {
	type ArtificialAnalysisBenchmarkResourceRow,
	getArtificialAnalysisBenchmarkResourceStats,
} from "../../benchmarks/scrapers/artificial-analysis/results";
import type { ScoringConfig } from "../../config/stage";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import {
	ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
	artificialAnalysisModelId,
	getArtificialAnalysisLeaderboardRawStats,
	processArtificialAnalysisLeaderboardRows,
} from "../../scrapers/artificial-analysis/leaderboard";
import type {
	readArtificialAnalysisBenchmarkResourceRawCache,
	readArtificialAnalysisRawCache,
} from "../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../types";
import {
	mergeSourceEvidence,
	rowStringValue,
	snapshotRowsWithStates,
	sourceKey,
} from "./policy";
import {
	shouldUseFetchedRows,
	snapshotFetchedAt,
	snapshotSourceRows,
} from "./row-snapshot";

type ArtificialAnalysisSnapshot = {
	artificialAnalysisRawRows: SourceSnapshots["artificialAnalysisRawRows"];
	artificialAnalysisSelectedRows: SourceSnapshots["artificialAnalysisSelectedRows"];
	sourceStatus: SourceSnapshotStatus;
};

type ArtificialAnalysisBenchmarkResourceSnapshot = {
	artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
	sourceStatus: SourceSnapshotStatus;
};

const RESOURCE_SIGNAL_KEYS = [
	"cost_per_task",
	"seconds_per_task",
	"output_tokens_per_task",
] as const;

function camelMetricKey(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_match, char: string) =>
		char.toUpperCase(),
	);
}

function signalKeys(scoringConfig: ScoringConfig): Set<string> {
	const keys = new Set<string>(RESOURCE_SIGNAL_KEYS);
	for (const key of [
		...INTELLIGENCE_INDEX_KEYS,
		...AGENTIC_INDEX_KEYS,
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]) {
		keys.add(key);
		keys.add(camelMetricKey(key));
	}
	return keys;
}

function signalCount(row: JsonObject, scoringConfig: ScoringConfig): number {
	const intelligence = asRecord(row.intelligence);
	const benchmarks = asRecord(row.benchmarks);
	const cost = asRecord(row.intelligence_index_cost);
	const keys = signalKeys(scoringConfig);
	return [...keys].filter(
		(key) =>
			asFiniteNumber(row[key]) != null ||
			asFiniteNumber(intelligence[key]) != null ||
			asFiniteNumber(benchmarks[key]) != null ||
			asFiniteNumber(cost[key]) != null,
	).length;
}

function isRowUnavailable(row: JsonObject): boolean {
	const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
	return (
		row.deprecated === true ||
		name.includes("not currently available") ||
		name.includes("unavailable")
	);
}

function projectLeaderboardRows(
	rows: SourceSnapshots["artificialAnalysisRawRows"],
): SourceSnapshots["artificialAnalysisSelectedRows"] {
	return processArtificialAnalysisLeaderboardRows(rows, {
		selectedColumns: [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
	});
}

/** Preserves stronger cached Artificial Analysis rows when refreshed rows lose signals. */
export function mergeArtificialAnalysisRow(
	cachedRow: JsonObject,
	fetchedRow: JsonObject,
	scoringConfig: ScoringConfig,
): JsonObject {
	if (
		isRowUnavailable(fetchedRow) &&
		signalCount(cachedRow, scoringConfig) >
			signalCount(fetchedRow, scoringConfig)
	) {
		return cachedRow;
	}
	return mergeSourceEvidence(cachedRow, fetchedRow);
}

/** Loads raw Artificial Analysis rows and projects the leaderboard rows consumed by stats. */
export async function artificialAnalysisSnapshot(
	cached: ReturnType<typeof readArtificialAnalysisRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	scoringConfig: ScoringConfig,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ArtificialAnalysisSnapshot> {
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedRowSnapshot = snapshotRowsWithStates({
			source: "artificial_analysis",
			cachedRows: cached.artificialAnalysisRawRows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: artificialAnalysisModelId,
			rowLabel: (row) => rowStringValue(row, "name"),
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			artificialAnalysisRawRows: cachedRowSnapshot.rows,
			artificialAnalysisSelectedRows: projectLeaderboardRows(
				cachedRowSnapshot.rows,
			),
			sourceStatus: {
				source: "artificial_analysis",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedRowSnapshot.rows.length,
				sourceRowStates: cachedRowSnapshot.states,
				fetchedAtKey: "artificialAnalysis",
			},
		};
	}
	const fetchedLeaderboardPayload =
		await getArtificialAnalysisLeaderboardRawStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetchedLeaderboardPayload.fetched_at_epoch_seconds,
		fetchedLeaderboardPayload.data.length,
	);
	const rowSnapshot = snapshotRowsWithStates({
		source: "artificial_analysis",
		cachedRows: cached?.artificialAnalysisRawRows,
		fetchedRows: fetchedLeaderboardPayload.data,
		fetchedAtEpochSeconds: fetchedLeaderboardPayload.fetched_at_epoch_seconds,
		options,
		rowKey: artificialAnalysisModelId,
		rowLabel: (row) => rowStringValue(row, "name"),
		mergeRow: (cachedRow, fetchedRow) =>
			mergeArtificialAnalysisRow(cachedRow, fetchedRow, scoringConfig),
		previousMissingSince,
		nowEpochSeconds,
	});
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetchedLeaderboardPayload.fetched_at_epoch_seconds,
	);
	return {
		artificialAnalysisRawRows: rowSnapshot.rows,
		artificialAnalysisSelectedRows: projectLeaderboardRows(rowSnapshot.rows),
		sourceStatus: {
			source: "artificial_analysis",
			fetchedAt,
			sourceInputCount: rowSnapshot.rows.length,
			sourceRowStates: rowSnapshot.states,
			fetchedAtKey: "artificialAnalysis",
		},
	};
}

/** Loads Artificial Analysis benchmark resources keyed by benchmark, source model, and effort. */
export async function artificialAnalysisBenchmarkResourceSnapshot(
	cached: ReturnType<typeof readArtificialAnalysisBenchmarkResourceRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ArtificialAnalysisBenchmarkResourceSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "artificial_analysis_benchmark_resources",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getArtificialAnalysisBenchmarkResourceStats,
		rowKey: artificialAnalysisBenchmarkResourceSourceKey,
		rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
	});
	return {
		artificialAnalysisBenchmarkResourceRows: snapshot.rows,
		sourceStatus: {
			source: "artificial_analysis_benchmark_resources",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "artificialAnalysisBenchmarkResources",
		},
	};
}

/** Builds a stable cache key that keeps benchmark reasoning-effort observations distinct. */
export function artificialAnalysisBenchmarkResourceSourceKey(
	row: ArtificialAnalysisBenchmarkResourceRow,
): string {
	return sourceKey(row.benchmark_key, row.model_id, row.reasoning_effort);
}
