/** ALE-bench persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
	type AleBenchConfigurationRow,
	aleBenchModelEffort,
	getAleBenchStats,
	processAleBenchConfigurationRow,
} from "../scrapers/ale-bench";

function jsonValue(value: unknown): unknown | null {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

/** Reconstruct every ALE refinement configuration without accepting a partial raw cache. */
export function readAleBenchRawCache(cache: CacheRowSource): {
	rows: AleBenchConfigurationRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM ale_bench_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.ale_bench)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const detailPath = stringValue(row.detail_path);
		const numSelfRefine = asFiniteNumber(row.num_self_refine);
		if (model == null || detailPath == null || numSelfRefine == null) return [];
		const parsed = processAleBenchConfigurationRow(model, detailPath, {
			num_self_refine: numSelfRefine,
			rank: jsonValue(row.rank_json),
			performance: jsonValue(row.performance_json),
			input_tokens: jsonValue(row.input_tokens_json),
			output_tokens: jsonValue(row.output_tokens_json),
			total_tokens: jsonValue(row.total_tokens_json),
			cost: jsonValue(row.cost_json),
			results: jsonValue(row.results_json),
		});
		return parsed == null ? [] : [parsed];
	});
	return rows.length !== cacheRows.length
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

type AleBenchSnapshot = {
	aleBenchConfigurationRows: AleBenchConfigurationRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads all ALE refinement checkpoints while scoring remains restricted to the source-default row. */
async function aleBenchSnapshot(
	cached: ReturnType<typeof readAleBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AleBenchSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "ale_bench",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: async () => {
			const payload = await getAleBenchStats();
			return {
				fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
				data: payload.data,
			};
		},
		rowKey: (row) => sourceKey(row.model, row.num_self_refine),
		rowLabel: (row) => `${row.model} x${row.num_self_refine}`,
	});
	return {
		aleBenchConfigurationRows: snapshot.rows,
		sourceStatus: {
			source: "ale_bench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "aleBench",
		},
	};
}

/** Insert every ALE refinement checkpoint with scalar scoring resources and complete raw evidence. */
function insertAleBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO ale_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, base_model,
			reasoning_effort, detail_path, num_self_refine, performance_mean,
			performance_median, cost_per_task_usd, tokens_per_task,
			input_tokens_per_task, output_tokens_per_task, rank_json,
			performance_json, input_tokens_json, output_tokens_json,
			total_tokens_json, cost_json, results_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.aleBenchConfigurationRows.entries()) {
		const effort = aleBenchModelEffort(row.model);
		statement.run(
			index,
			snapshots.fetchedAt.aleBench,
			SOURCE_URLS.ale_bench,
			row.model,
			effort.baseModel,
			effort.reasoningEffort,
			row.detail_path,
			row.num_self_refine,
			row.performance.all.mean,
			row.performance.all.median,
			row.cost.all.mean,
			row.total_tokens.all.mean,
			row.input_tokens.all.mean,
			row.output_tokens.all.mean,
			JSON.stringify(row.rank),
			JSON.stringify(row.performance),
			JSON.stringify(row.input_tokens),
			JSON.stringify(row.output_tokens),
			JSON.stringify(row.total_tokens),
			JSON.stringify(row.cost),
			JSON.stringify(row.results),
		);
	}
}

export const aleBenchPersistence = {
	cacheKey: "aleBench",
	source: "ale_bench",
	table: SNAPSHOT_TABLES.ale_bench,
	readCache: readAleBenchRawCache,
	snapshot: aleBenchSnapshot,
	write: insertAleBenchRawRows,
} as const;
