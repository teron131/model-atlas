/** VALS snapshots preserve task-level rows while exposing overall model scores to downstream matching. */

import {
	getHarveyLabStats,
	type HarveyLabModelScoreRow,
	type HarveyLabTaskRow,
} from "../../../scrapers/vals/harvey-lab";
import {
	getValsIndexStats,
	type ValsIndexModelScoreRow,
	type ValsIndexTaskScoreRow,
} from "../../../scrapers/vals/index-benchmark";
import {
	getTerminalBenchStats,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchTaskRow,
} from "../../../scrapers/vals/terminal-bench";
import type {
	readHarveyLabRawCache,
	readTerminalBenchRawCache,
	readValsIndexRawCache,
} from "../../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
} from "../../types";
import { snapshotRows, snapshotRowsWithStates, sourceKey } from "../policy";
import { shouldUseFetchedRows, snapshotFetchedAt } from "../row-snapshot";

type HarveyLabSnapshot = {
	harveyLabRows: HarveyLabTaskRow[];
	harveyLabModelScoreRows: HarveyLabModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type TerminalBenchSnapshot = {
	terminalBenchRows: TerminalBenchTaskRow[];
	terminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	sourceStatus: SourceSnapshotStatus;
};

type ValsIndexSnapshot = {
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Harvey LAB rows while using strict overall task resolution for scoring. */
export async function harveyLabSnapshot(
	cached: ReturnType<typeof readHarveyLabRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<HarveyLabSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getHarveyLabStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.model_id, row.reasoning_effort),
	);
	const modelScores = rows.filter(
		(row): row is HarveyLabModelScoreRow =>
			row.task === "overall" && row.metric === "task_resolution",
	);
	const states = snapshotRowsWithStates({
		source: "vals_harvey_lab",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.model_id, row.reasoning_effort),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		harveyLabRows: rows,
		harveyLabModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_harvey_lab",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "harveyLab",
		},
	};
}

/** Loads Terminal-Bench rows while using overall model-harness rows for matching. */
export async function terminalBenchSnapshot(
	cached: ReturnType<typeof readTerminalBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<TerminalBenchSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getTerminalBenchStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.source_model_id, row.harness ?? "default"),
	);
	const modelScores = rows.filter(
		(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
	);
	const states = snapshotRowsWithStates({
		source: "vals_terminal_bench",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.source_model_id, row.harness ?? "default"),
		rowLabel: (row) =>
			row.harness == null ? row.model : `${row.model} ${row.harness}`,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		terminalBenchRows: rows,
		terminalBenchModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_terminal_bench",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "terminalBench",
		},
	};
}

/** Loads Vals Index task rows while using only overall rows for scoring health. */
export async function valsIndexSnapshot(
	cached: ReturnType<typeof readValsIndexRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ValsIndexSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getValsIndexStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.model_id),
	);
	const modelScores = rows.filter(
		(row): row is ValsIndexModelScoreRow => row.task === "overall",
	);
	const states = snapshotRowsWithStates({
		source: "vals_index",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.model_id),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		valsIndexRows: rows,
		valsIndexModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_index",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "valsIndex",
		},
	};
}
