/** Artificial Analysis source snapshot retention and selected-row projection. */

import type { DatabaseSync } from "node:sqlite";

import {
	ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS,
	getArtificialAnalysisScrapedRawStats,
	processArtificialAnalysisScrapedRows,
} from "../../scrapers/artificial-analysis-evals";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	AGENTIC_INDEX_KEYS,
	INTELLIGENCE_INDEX_KEYS,
} from "../../stats/scores/benchmark-imputation";
import type { ScoringConfig } from "../../stats/types";
import { readArtificialAnalysisRawCache } from "../cache";
import { rowStringValue, snapshotRowsWithStates } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceRowState,
	SourceSnapshots,
} from "../types";
import { shouldUseFetchedRows, snapshotFetchedAt } from "./model-score";

export type ArtificialAnalysisSnapshot = {
	artificialAnalysisRawRows: SourceSnapshots["artificialAnalysisRawRows"];
	artificialAnalysisSelectedRows: SourceSnapshots["artificialAnalysisSelectedRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { artificialAnalysis: number | null };
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

function artificialAnalysisScoreSignalCount(
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

function artificialAnalysisRowIsUnavailable(row: JsonObject): boolean {
	const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
	return (
		row.deprecated === true ||
		name.includes("not currently available") ||
		name.includes("unavailable")
	);
}

function selectedArtificialAnalysisRows(
	rows: SourceSnapshots["artificialAnalysisRawRows"],
): SourceSnapshots["artificialAnalysisSelectedRows"] {
	return processArtificialAnalysisScrapedRows(rows, {
		selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
	});
}

/** Preserves stronger cached Artificial Analysis rows when refreshed rows lose signals. */
export function mergeArtificialAnalysisRow(
	cachedRow: JsonObject,
	fetchedRow: JsonObject,
	scoringConfig: ScoringConfig,
): JsonObject {
	if (
		artificialAnalysisRowIsUnavailable(fetchedRow) &&
		artificialAnalysisScoreSignalCount(cachedRow, scoringConfig) >
			artificialAnalysisScoreSignalCount(fetchedRow, scoringConfig)
	) {
		return cachedRow;
	}
	return fetchedRow;
}

/** Loads raw Artificial Analysis rows and projects the eval-only rows consumed by stats. */
export async function artificialAnalysisSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	scoringConfig: ScoringConfig,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ArtificialAnalysisSnapshot> {
	const cached = readArtificialAnalysisRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "artificial_analysis",
			cachedRows: cached.artificialAnalysisRawRows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => rowStringValue(row, "model_id"),
			rowLabel: (row) => rowStringValue(row, "name"),
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			artificialAnalysisRawRows: cachedSnapshot.rows,
			artificialAnalysisSelectedRows: selectedArtificialAnalysisRows(
				cachedSnapshot.rows,
			),
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { artificialAnalysis: cached.fetchedAt },
		};
	}
	const fetched = await getArtificialAnalysisScrapedRawStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "artificial_analysis",
		cachedRows: cached?.artificialAnalysisRawRows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => rowStringValue(row, "model_id"),
		rowLabel: (row) => rowStringValue(row, "name"),
		mergeRow: (cachedRow, fetchedRow) =>
			mergeArtificialAnalysisRow(cachedRow, fetchedRow, scoringConfig),
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		artificialAnalysisRawRows: snapshot.rows,
		artificialAnalysisSelectedRows: selectedArtificialAnalysisRows(
			snapshot.rows,
		),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			artificialAnalysis: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}
