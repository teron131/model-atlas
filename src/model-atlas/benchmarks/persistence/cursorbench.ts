/** CursorBench persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	booleanFromSql,
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES, SOURCE_URLS } from "../../ingest/source-registry";
import { sourceKey } from "../../ingest/source-snapshots/policy";
import { snapshotSourceRows } from "../../ingest/source-snapshots/row-snapshot";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../ingest/types";
import {
	type DatabaseWriter,
	sqliteBooleanValue,
} from "../../ingest/writers/database";
import { asFiniteNumber } from "../../runtime";
import {
	type CursorBenchModelScoreRow,
	getCursorBenchStats,
} from "../scrapers/cursorbench";

export function readCursorBenchRawCache(cache: CacheRowSource): {
	rows: CursorBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM cursorbench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.cursorbench)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const rank = asFiniteNumber(row.rank);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const score = asFiniteNumber(row.score);
		const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
		const tokensPerTask = asFiniteNumber(row.tokens_per_task);
		const stepsPerTask = asFiniteNumber(row.steps_per_task);
		return rank != null &&
			model != null &&
			baseModel != null &&
			scoreEligible != null &&
			score != null &&
			costPerTaskUsd != null &&
			tokensPerTask != null &&
			stepsPerTask != null
			? [
					{
						rank,
						model,
						base_model: baseModel,
						reasoning_effort: stringValue(row.reasoning_effort),
						score_eligible: scoreEligible,
						score,
						cost_per_task_usd: costPerTaskUsd,
						tokens_per_task: tokensPerTask,
						steps_per_task: stepsPerTask,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads CursorBench rows keyed by model, base model, and reasoning effort. */
async function cursorBenchSnapshot(
	cached: ReturnType<typeof readCursorBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<CursorBenchSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "cursorbench",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getCursorBenchStats,
		rowKey: (row) => sourceKey(row.model, row.base_model, row.reasoning_effort),
		rowLabel: (row) => row.model,
	});
	return {
		cursorBenchModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "cursorbench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "cursorBench",
		},
	};
}

function insertCursorBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO cursorbench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, model,
			base_model, reasoning_effort, score_eligible, score, cost_per_task_usd,
			tokens_per_task, steps_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.cursorBenchModelScoreRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.cursorBench,
			SOURCE_URLS.cursorbench,
			row.rank,
			row.model,
			row.base_model,
			row.reasoning_effort,
			sqliteBooleanValue(row.score_eligible),
			row.score,
			row.cost_per_task_usd,
			row.tokens_per_task,
			row.steps_per_task,
		);
	}
}

export const cursorBenchPersistence = {
	cacheKey: "cursorBench",
	source: "cursorbench",
	table: SNAPSHOT_TABLES.cursorbench,
	readCache: readCursorBenchRawCache,
	snapshot: cursorBenchSnapshot,
	write: insertCursorBenchRawRows,
} as const;
