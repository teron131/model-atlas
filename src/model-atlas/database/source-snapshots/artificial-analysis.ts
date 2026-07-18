/** Artificial Analysis snapshots retain benchmark-carrier rows while projecting selected public model fields. */

import {
	ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
	artificialAnalysisModelId,
	getArtificialAnalysisLeaderboardRawStats,
	processArtificialAnalysisLeaderboardRows,
} from "../../scrapers/artificial-analysis/leaderboard";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	AGENTIC_INDEX_KEYS,
	INTELLIGENCE_INDEX_KEYS,
} from "../../stats/benchmarks";
import type { ScoringConfig } from "../../stats/types";
import type { readArtificialAnalysisRawCache } from "../cache";
import {
	mergeSourceEvidence,
	rowStringValue,
	snapshotRowsWithStates,
} from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../types";
import { shouldUseFetchedRows, snapshotFetchedAt } from "./model-score";

export type ArtificialAnalysisSnapshot = {
	artificialAnalysisRawRows: SourceSnapshots["artificialAnalysisRawRows"];
	artificialAnalysisSelectedRows: SourceSnapshots["artificialAnalysisSelectedRows"];
	sourceStatus: SourceSnapshotStatus;
};

const ARTIFICIAL_ANALYSIS_RESOURCE_SIGNAL_KEYS = [
	"cost_per_task",
	"seconds_per_task",
	"output_tokens_per_task",
] as const;

function camelMetricKey(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_match, char: string) =>
		char.toUpperCase(),
	);
}

function artificialAnalysisSignalKeys(
	scoringConfig: ScoringConfig,
): Set<string> {
	const keys = new Set<string>(ARTIFICIAL_ANALYSIS_RESOURCE_SIGNAL_KEYS);
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

function artificialAnalysisSignalCount(
	row: JsonObject,
	scoringConfig: ScoringConfig,
): number {
	const intelligence = asRecord(row.intelligence);
	const evaluations = asRecord(row.evaluations);
	const cost = asRecord(row.intelligence_index_cost);
	const signalKeys = artificialAnalysisSignalKeys(scoringConfig);
	return [...signalKeys].filter(
		(key) =>
			asFiniteNumber(row[key]) != null ||
			asFiniteNumber(intelligence[key]) != null ||
			asFiniteNumber(evaluations[key]) != null ||
			asFiniteNumber(cost[key]) != null,
	).length;
}

function isArtificialAnalysisRowUnavailable(row: JsonObject): boolean {
	const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
	return (
		row.deprecated === true ||
		name.includes("not currently available") ||
		name.includes("unavailable")
	);
}

function projectArtificialAnalysisRows(
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
		isArtificialAnalysisRowUnavailable(fetchedRow) &&
		artificialAnalysisSignalCount(cachedRow, scoringConfig) >
			artificialAnalysisSignalCount(fetchedRow, scoringConfig)
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
			artificialAnalysisSelectedRows: projectArtificialAnalysisRows(
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
	const hasUsableFetchedLeaderboardRows = shouldUseFetchedRows(
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
		hasUsableFetchedLeaderboardRows,
		cached?.fetchedAt,
		fetchedLeaderboardPayload.fetched_at_epoch_seconds,
	);
	return {
		artificialAnalysisRawRows: rowSnapshot.rows,
		artificialAnalysisSelectedRows: projectArtificialAnalysisRows(
			rowSnapshot.rows,
		),
		sourceStatus: {
			source: "artificial_analysis",
			fetchedAt,
			sourceInputCount: rowSnapshot.rows.length,
			sourceRowStates: rowSnapshot.states,
			fetchedAtKey: "artificialAnalysis",
		},
	};
}
