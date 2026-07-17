/** Benchmark snapshots preserve raw evidence and source-owned summaries needed by refresh. */

import {
	type AgentsLastExamHarnessRow,
	type AgentsLastExamModelScoreRow,
	getAgentsLastExamHarnessStats,
	summarizeAgentsLastExamModelScores,
} from "../../scrapers/agents-last-exam";
import {
	type DeepSWERawLeaderboardRow,
	type DeepSWESourceVersion,
	deepSWESourceVersionForRows,
	getDeepSWERawLeaderboardSourceRows,
	preferredDeepSWELeaderboardRows,
} from "../../scrapers/deep-swe";
import type { readAgentsLastExamRawCache, readDeepSWERawCache } from "../cache";
import { snapshotRowsWithStates, sourceKey } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
} from "../types";
import { shouldUseFetchedRows, snapshotFetchedAt } from "./model-score";

export type AgentsLastExamSnapshot = {
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type DeepSWESnapshot = {
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	sourceStatus: SourceSnapshotStatus;
};

/** Preserves Agents Last Exam harness rows while returning summarized model scores. */
export async function agentsLastExamSnapshot(
	cached: ReturnType<typeof readAgentsLastExamRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentsLastExamSnapshot> {
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "agents_last_exam",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(row.split, row.harness, row.model, row.harness_variant),
			rowLabel: (row) => `${row.model} ${row.split}`,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			agentsLastExamRows: cachedSnapshot.rows,
			agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
				cachedSnapshot.rows,
			),
			sourceStatus: {
				source: "agents_last_exam",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedSnapshot.rows.length,
				sourceRowStates: cachedSnapshot.states,
				fetchedAtKey: "agentsLastExam",
			},
		};
	}
	const fetched = await getAgentsLastExamHarnessStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "agents_last_exam",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) =>
			sourceKey(row.split, row.harness, row.model, row.harness_variant),
		rowLabel: (row) => `${row.model} ${row.split}`,
		previousMissingSince,
		nowEpochSeconds,
	});
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		agentsLastExamRows: snapshot.rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
			snapshot.rows,
		),
		sourceStatus: {
			source: "agents_last_exam",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "agentsLastExam",
		},
	};
}

/** Preserves DeepSWE raw leaderboard rows and records the preferred source version. */
export async function deepSWESnapshot(
	cached: ReturnType<typeof readDeepSWERawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<DeepSWESnapshot> {
	const cachedHasEffortMetadata = cached?.rows.some(
		(row) => row.reasoning_effort != null || row.config != null,
	);
	if (
		status.cache_hit &&
		cached != null &&
		cachedHasEffortMetadata &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "deep_swe",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(
					row.source_version,
					row.model,
					row.reasoning_effort,
					row.config,
				),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			deepSWERawRows: cachedSnapshot.rows,
			deepSWESourceVersion: cached.sourceVersion,
			sourceStatus: {
				source: "deep_swe",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedSnapshot.rows.length,
				sourceRowStates: cachedSnapshot.states,
				fetchedAtKey: "deepSWE",
			},
		};
	}
	const fetched = await getDeepSWERawLeaderboardSourceRows();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "deep_swe",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) =>
			sourceKey(
				row.source_version,
				row.model,
				row.reasoning_effort,
				row.config,
			),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	const preferredRows = preferredDeepSWELeaderboardRows(snapshot.rows);
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		deepSWERawRows: snapshot.rows,
		deepSWESourceVersion:
			preferredRows.length > 0
				? deepSWESourceVersionForRows(snapshot.rows)
				: (cached?.sourceVersion ?? null),
		sourceStatus: {
			source: "deep_swe",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "deepSWE",
		},
	};
}
