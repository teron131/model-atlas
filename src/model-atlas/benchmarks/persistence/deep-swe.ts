/** DeepSWE persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES } from "../../ingest/source-registry";
import {
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
import {
	asDeepSWERawLeaderboardRow,
	type DeepSWERawLeaderboardRow,
	deepSWEUrlForSourceVersion,
	getDeepSWERawLeaderboardSourceRows,
} from "../scrapers/deep-swe";

export function readDeepSWERawCache(cache: CacheRowSource): {
	rows: DeepSWERawLeaderboardRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM deep_swe_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const deepSweRows = cacheRows.flatMap((row) => {
		const parsedRow = asDeepSWERawLeaderboardRow(row);
		return parsedRow == null ? [] : [parsedRow];
	});
	return {
		rows: deepSweRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

type DeepSWESnapshot = {
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Preserve DeepSWE raw leaderboard rows across cache hits and source refreshes. */
async function deepSWESnapshot(
	cached: ReturnType<typeof readDeepSWERawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<DeepSWESnapshot> {
	const hasCachedEffortMetadata = cached?.rows.some(
		(row) => row.reasoning_effort != null || row.config != null,
	);
	if (
		status.cache_hit &&
		cached != null &&
		hasCachedEffortMetadata &&
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
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		deepSWERawRows: snapshot.rows,
		sourceStatus: {
			source: "deep_swe",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "deepSWE",
		},
	};
}

function insertDeepSWERawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO deep_swe_raw_rows (
			row_index, fetched_at_epoch_seconds, url, source_version, model,
			reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
			n_tasks_attempted, mean_cost_usd, mean_duration_seconds, mean_output_tokens
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.deepSWERawRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.deepSWE,
			deepSWEUrlForSourceVersion(row.source_version),
			row.source_version,
			row.model,
			row.reasoning_effort,
			row.config,
			row.pass_at_1,
			row.ci_lo,
			row.ci_hi,
			row.ci_half,
			row.n_tasks_attempted,
			row.mean_cost_usd,
			row.mean_duration_seconds,
			row.mean_output_tokens,
		);
	}
}

export const deepSWEPersistence = {
	cacheKey: "deepSWE",
	source: "deep_swe",
	table: SNAPSHOT_TABLES.deep_swe,
	readCache: readDeepSWERawCache,
	snapshot: deepSWESnapshot,
	write: insertDeepSWERawRows,
} as const;
