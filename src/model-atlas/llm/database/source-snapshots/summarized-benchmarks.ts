/** Benchmark snapshots that preserve raw rows and derived model summaries together. */

import type { DatabaseSync } from "node:sqlite";

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
	summarizeDeepSWEDefaultModelScores,
} from "../../scrapers/deep-swe";
import {
	getTerminalBenchAgentModelAccuracyStats,
	summarizeTerminalBenchModelMedianAccuracy,
	type TerminalBenchAgentModelAccuracyRow,
	type TerminalBenchModelMedianAccuracyRow,
} from "../../scrapers/terminal-bench";
import {
	readAgentsLastExamRawCache,
	readDeepSWERawCache,
	readTerminalBenchRawCache,
} from "../cache";
import { snapshotRowsWithStates, sourceKey } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceRowState,
} from "../types";
import { shouldUseFetchedRows, snapshotFetchedAt } from "./model-score";

export type AgentsLastExamSnapshot = {
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { agentsLastExam: number | null };
};

export type DeepSWESnapshot = {
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWEModelScoreRows: ReturnType<typeof summarizeDeepSWEDefaultModelScores>;
	deepSWESourceVersion: DeepSWESourceVersion | null;
	sourceRowStates: SourceRowState[];
	fetchedAt: { deepSWE: number | null };
};

export type TerminalBenchSnapshot = {
	terminalBenchRows: TerminalBenchAgentModelAccuracyRow[];
	terminalBenchModelScores: TerminalBenchModelMedianAccuracyRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { terminalBench: number | null };
};

/** Preserves Agents Last Exam harness rows while returning summarized model scores. */
export async function agentsLastExamSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentsLastExamSnapshot> {
	const cached = readAgentsLastExamRawCache(db);
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
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { agentsLastExam: cached.fetchedAt },
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
	return {
		agentsLastExamRows: snapshot.rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
			snapshot.rows,
		),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			agentsLastExam: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

/** Preserves DeepSWE raw leaderboard rows and derives default-effort model scores. */
export async function deepSWESnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<DeepSWESnapshot> {
	const cached = readDeepSWERawCache(db);
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
			deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(
				preferredDeepSWELeaderboardRows(cachedSnapshot.rows),
			),
			deepSWESourceVersion: cached.sourceVersion,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { deepSWE: cached.fetchedAt },
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
	return {
		deepSWERawRows: snapshot.rows,
		deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(preferredRows),
		deepSWESourceVersion:
			preferredRows.length > 0
				? deepSWESourceVersionForRows(snapshot.rows)
				: (cached?.sourceVersion ?? null),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			deepSWE: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

/** Preserves Terminal Bench agent rows while returning per-model median accuracy. */
export async function terminalBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<TerminalBenchSnapshot> {
	const cached = readTerminalBenchRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "terminal_bench",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.agent, row.model),
			rowLabel: (row) => `${row.agent} ${row.model}`,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			terminalBenchRows: cachedSnapshot.rows,
			terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(
				cachedSnapshot.rows,
			),
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { terminalBench: cached.fetchedAt },
		};
	}
	const fetched = await getTerminalBenchAgentModelAccuracyStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "terminal_bench",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.agent, row.model),
		rowLabel: (row) => `${row.agent} ${row.model}`,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		terminalBenchRows: snapshot.rows,
		terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(
			snapshot.rows,
		),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			terminalBench: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}
