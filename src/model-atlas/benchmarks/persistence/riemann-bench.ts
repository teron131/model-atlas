/** Riemann Bench persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES } from "../../ingest/source-registry";
import { sourceKey } from "../../ingest/source-snapshots/policy";
import { snapshotSourceRows } from "../../ingest/source-snapshots/row-snapshot";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../ingest/types";
import type { DatabaseWriter } from "../../ingest/writers/database";
import { asFiniteNumber } from "../../runtime";
import {
	getRiemannBenchStats,
	type RiemannBenchModelScoreRow,
} from "../scrapers/surge/riemann-bench";

export function readRiemannBenchRawCache(cache: CacheRowSource): {
	rows: RiemannBenchModelScoreRow[];
	fetchedAt: number | null;
	sourceUrl: string;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM riemann_bench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const sourceUrls = new Set(cacheRows.map((row) => stringValue(row.url)));
	if (sourceUrls.size !== 1 || sourceUrls.has(null)) {
		return null;
	}
	const sourceUrl = [...sourceUrls][0];
	if (sourceUrl == null) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						provider: stringValue(row.provider),
						model,
						score,
						last_updated: stringValue(row.last_updated),
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
		sourceUrl,
	};
}

type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchPersistenceUrl: string;
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Riemann Bench rows keyed by provider and model for cache row continuity. */
async function riemannBenchSnapshot(
	cached: ReturnType<typeof readRiemannBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<RiemannBenchSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "riemann_bench",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getRiemannBenchStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	if (snapshot.sourceUrl == null) {
		throw new Error("Riemann Bench snapshot is missing its source URL");
	}
	return {
		riemannBenchModelScoreRows: snapshot.rows,
		riemannBenchPersistenceUrl: snapshot.sourceUrl,
		sourceStatus: {
			source: "riemann_bench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "riemannBench",
		},
	};
}

function insertRiemannBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO riemann_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, provider,
			model, score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.riemannBenchModelScoreRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.riemannBench,
			snapshots.riemannBenchPersistenceUrl,
			row.provider,
			row.model,
			row.score,
			row.last_updated,
		);
	}
}

export const riemannBenchPersistence = {
	cacheKey: "riemannBench",
	source: "riemann_bench",
	table: SNAPSHOT_TABLES.riemann_bench,
	readCache: readRiemannBenchRawCache,
	snapshot: riemannBenchSnapshot,
	write: insertRiemannBenchRawRows,
} as const;
