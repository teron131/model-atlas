/** FrontierCode persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
	FRONTIER_CODE_SOURCE_REVISION,
	type FrontierCodeModelEffortRow,
	type FrontierCodeSubsetMetrics,
	getFrontierCodeStats,
	processFrontierCodeSubsetMetrics,
} from "../scrapers/frontier-code";

function jsonValue(value: unknown): unknown | null {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

/** Restore Cognition's source field names inside the persisted subset evidence JSON. */
function frontierCodePersistenceSubset(metrics: FrontierCodeSubsetMetrics) {
	return {
		correct: metrics.pass_rate,
		new_score: metrics.score,
		cost: metrics.cost_per_task_usd,
		tokens: metrics.tokens_per_task,
		tool_calls: metrics.tool_calls_per_task,
		steps: metrics.steps_per_task,
		ote: metrics.output_token_equivalent_per_task,
	};
}

/** Reconstruct every FrontierCode effort only when the persisted revision and both subsets are complete. */
export function readFrontierCodeRawCache(cache: CacheRowSource): {
	rows: FrontierCodeModelEffortRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM frontier_code_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) =>
				stringValue(row.url) !== SOURCE_URLS.frontier_code ||
				stringValue(row.revision) !== FRONTIER_CODE_SOURCE_REVISION,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap<FrontierCodeModelEffortRow>((row) => {
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const sourceEffort = stringValue(row.source_effort);
		const harness = stringValue(row.harness);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const officialRank = asFiniteNumber(row.official_rank);
		const officialBestEffort = booleanFromSql(row.official_best_effort);
		const main = processFrontierCodeSubsetMetrics(jsonValue(row.main_json));
		const extended = processFrontierCodeSubsetMetrics(
			jsonValue(row.extended_json),
		);
		if (
			model == null ||
			baseModel == null ||
			sourceEffort == null ||
			harness == null ||
			scoreEligible == null ||
			officialRank == null ||
			officialBestEffort == null ||
			main == null ||
			extended == null
		) {
			return [];
		}
		return [
			{
				revision: FRONTIER_CODE_SOURCE_REVISION,
				model,
				base_model: baseModel,
				source_effort: sourceEffort,
				reasoning_effort: stringValue(row.reasoning_effort),
				harness,
				score_eligible: scoreEligible,
				official_rank: officialRank,
				official_best_effort: officialBestEffort,
				main,
				extended,
				score: main.score,
				cost_per_task_usd: main.cost_per_task_usd,
				tokens_per_task: main.tokens_per_task,
			},
		];
	});
	return rows.length !== cacheRows.length
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

type FrontierCodeSnapshot = {
	frontierCodeRows: FrontierCodeModelEffortRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads every FrontierCode effort while keeping source effort labels in the persisted row identity. */
async function frontierCodeSnapshot(
	cached: ReturnType<typeof readFrontierCodeRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<FrontierCodeSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "frontier_code",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getFrontierCodeStats,
		rowKey: (row) => sourceKey(row.base_model, row.source_effort),
		rowLabel: (row) => `${row.model}: ${row.harness}`,
	});
	return {
		frontierCodeRows: snapshot.rows,
		sourceStatus: {
			source: "frontier_code",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "frontierCode",
		},
	};
}

/** Insert all FrontierCode effort and subset evidence while retaining the Main scoring projection. */
function insertFrontierCodeRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO frontier_code_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			source_effort, reasoning_effort, harness, score_eligible,
			official_rank, official_best_effort, main_score, main_pass_rate,
			main_cost_per_task_usd, main_tokens_per_task, extended_score,
			extended_pass_rate, main_json, extended_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.frontierCodeRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.frontierCode,
			SOURCE_URLS.frontier_code,
			row.revision,
			row.model,
			row.base_model,
			row.source_effort,
			row.reasoning_effort,
			row.harness,
			sqliteBooleanValue(row.score_eligible),
			row.official_rank,
			sqliteBooleanValue(row.official_best_effort),
			row.main.score,
			row.main.pass_rate,
			row.main.cost_per_task_usd,
			row.main.tokens_per_task,
			row.extended.score,
			row.extended.pass_rate,
			JSON.stringify(frontierCodePersistenceSubset(row.main)),
			JSON.stringify(frontierCodePersistenceSubset(row.extended)),
		);
	}
}

export const frontierCodePersistence = {
	cacheKey: "frontierCode",
	source: "frontier_code",
	table: SNAPSHOT_TABLES.frontier_code,
	readCache: readFrontierCodeRawCache,
	snapshot: frontierCodeSnapshot,
	write: insertFrontierCodeRawRows,
} as const;
