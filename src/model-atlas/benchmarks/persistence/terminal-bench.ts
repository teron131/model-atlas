/** Terminal-Bench persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES, SOURCE_URLS } from "../../ingest/source-registry";
import {
	snapshotRows,
	snapshotRowsWithStates,
	sourceKey,
} from "../../ingest/source-snapshots/policy";
import {
	shouldUseFetchedRows,
	snapshotFetchedAt,
} from "../../ingest/source-snapshots/row-snapshot";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../ingest/types";
import type { DatabaseWriter } from "../../ingest/writers/database";
import { asFiniteNumber } from "../../runtime";
import {
	getTerminalBenchStats,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchTaskRow,
} from "../scrapers/vals/terminal-bench";

export function readTerminalBenchRawCache(cache: CacheRowSource): {
	rows: TerminalBenchTaskRow[];
	modelScores: TerminalBenchModelHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM vals_terminal_bench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vals_terminal_bench,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		if (
			task == null ||
			taskLabel == null ||
			modelId == null ||
			model == null ||
			score == null
		) {
			return [];
		}
		return [
			{
				task,
				task_label: taskLabel,
				source_model_id: stringValue(row.source_model_id) ?? modelId,
				model_id: modelId,
				model,
				provider: stringValue(row.provider),
				harness: stringValue(row.harness),
				score,
				cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
				seconds_per_task: asFiniteNumber(row.seconds_per_task),
			},
		];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

type TerminalBenchSnapshot = {
	terminalBenchRows: TerminalBenchTaskRow[];
	terminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Terminal-Bench rows while using overall model-harness rows for matching. */
async function terminalBenchSnapshot(
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

function insertTerminalBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_terminal_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, source_model_id, model_id, model, provider, harness, score,
			cost_per_task_usd, seconds_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.terminalBenchRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.terminalBench,
			SOURCE_URLS.vals_terminal_bench,
			row.task,
			row.task_label,
			row.task === "overall" ? "overall" : "component",
			row.source_model_id,
			row.model_id,
			row.model,
			row.provider,
			row.harness,
			row.score,
			row.cost_per_task_usd,
			row.seconds_per_task,
		);
	}
}

export const terminalBenchPersistence = {
	cacheKey: "terminalBench",
	source: "vals_terminal_bench",
	table: SNAPSHOT_TABLES.vals_terminal_bench,
	readCache: readTerminalBenchRawCache,
	snapshot: terminalBenchSnapshot,
	write: insertTerminalBenchRawRows,
} as const;
