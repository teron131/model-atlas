/** BlueprintBench persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
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
import type { DatabaseWriter } from "../../ingest/writers/database";
import { asFiniteNumber } from "../../runtime";
import {
	type BlueprintBenchModelScoreRow,
	getBlueprintBenchStats,
} from "../scrapers/blueprint-bench";

export function readBlueprintBenchRawCache(cache: CacheRowSource): {
	rows: BlueprintBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM blueprint_bench_2_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.blueprint_bench_2,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						model,
						score,
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

type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads BlueprintBench rows keyed by model name for cache and missing-row tracking. */
async function blueprintBenchSnapshot(
	cached: ReturnType<typeof readBlueprintBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BlueprintBenchSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "blueprint_bench_2",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getBlueprintBenchStats,
		rowKey: (row) => sourceKey(row.model),
		rowLabel: (row) => row.model,
	});
	return {
		blueprintBenchModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "blueprint_bench_2",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "blueprintBench",
		},
	};
}

function insertBlueprintBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO blueprint_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, score
		) VALUES (?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.blueprintBenchModelScoreRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.blueprintBench,
			SOURCE_URLS.blueprint_bench_2,
			row.model,
			row.score,
		);
	}
}

export const blueprintBenchPersistence = {
	cacheKey: "blueprintBench",
	source: "blueprint_bench_2",
	table: SNAPSHOT_TABLES.blueprint_bench_2,
	readCache: readBlueprintBenchRawCache,
	snapshot: blueprintBenchSnapshot,
	write: insertBlueprintBenchRawRows,
} as const;
