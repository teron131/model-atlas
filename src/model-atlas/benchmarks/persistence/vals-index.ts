/** VALS Index persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
	getValsIndexStats,
	type ValsIndexModelScoreRow,
	type ValsIndexTaskScoreRow,
} from "../scrapers/vals/index-benchmark";

export function readValsIndexRawCache(cache: CacheRowSource): {
	rows: ValsIndexTaskScoreRow[];
	modelScores: ValsIndexModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM vals_index_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.vals_index)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return task != null &&
			taskLabel != null &&
			modelId != null &&
			model != null &&
			score != null
			? [
					{
						task,
						task_label: taskLabel,
						model_id: modelId,
						model,
						provider: stringValue(row.provider),
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
		modelScores: cachedRows.filter(
			(row): row is ValsIndexModelScoreRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

type ValsIndexSnapshot = {
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Vals Index task rows while using only overall rows for scoring health. */
async function valsIndexSnapshot(
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

function insertValsIndexRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_index_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, model_id, model, provider, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.valsIndexRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.valsIndex,
			SOURCE_URLS.vals_index,
			row.task,
			row.task_label,
			row.task === "overall" ? "overall" : "component",
			row.model_id,
			row.model,
			row.provider,
			row.score,
		);
	}
}

export const valsIndexPersistence = {
	cacheKey: "valsIndex",
	source: "vals_index",
	table: SNAPSHOT_TABLES.vals_index,
	readCache: readValsIndexRawCache,
	snapshot: valsIndexSnapshot,
	write: insertValsIndexRawRows,
} as const;
