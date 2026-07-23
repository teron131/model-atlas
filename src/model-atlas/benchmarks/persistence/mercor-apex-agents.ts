/** Mercor APEX Agents persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
	getMercorApexAgentsStats,
	type MercorApexAgentsRow,
} from "../scrapers/mercor-apex-agents";

export function readMercorApexAgentsRawCache(cache: CacheRowSource): {
	rows: MercorApexAgentsRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM mercor_apex_agents_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.mercor_apex_agents,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const modelId = stringValue(row.model_id);
		const sourceModel = stringValue(row.source_model);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const organization = stringValue(row.organization);
		const score = asFiniteNumber(row.score);
		return modelId != null &&
			sourceModel != null &&
			model != null &&
			baseModel != null &&
			organization != null &&
			score != null
			? [
					{
						model_id: modelId,
						source_model: sourceModel,
						model,
						base_model: baseModel,
						reasoning_effort: stringValue(row.reasoning_effort),
						organization,
						score,
					},
				]
			: [];
	});
	return rows.length === 0
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

type MercorApexAgentsSnapshot = {
	mercorApexAgentsRows: MercorApexAgentsRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Mercor APEX rows keyed by its stable contender ID and effort. */
async function mercorApexAgentsSnapshot(
	cached: ReturnType<typeof readMercorApexAgentsRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<MercorApexAgentsSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "mercor_apex_agents",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getMercorApexAgentsStats,
		rowKey: (row) => sourceKey(row.model_id, row.reasoning_effort),
		rowLabel: (row) => row.source_model,
	});
	return {
		mercorApexAgentsRows: snapshot.rows,
		sourceStatus: {
			source: "mercor_apex_agents",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "mercorApexAgents",
		},
	};
}

/** Insert Mercor's Loop Pass@1 APEX rows used as calibrated AA fallbacks. */
function insertMercorApexAgentsRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO mercor_apex_agents_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model_id, source_model,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.mercorApexAgentsRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.mercorApexAgents,
			SOURCE_URLS.mercor_apex_agents,
			row.model_id,
			row.source_model,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.organization,
			row.score,
		);
	}
}

export const mercorApexAgentsPersistence = {
	cacheKey: "mercorApexAgents",
	source: "mercor_apex_agents",
	table: SNAPSHOT_TABLES.mercor_apex_agents,
	readCache: readMercorApexAgentsRawCache,
	snapshot: mercorApexAgentsSnapshot,
	write: insertMercorApexAgentsRawRows,
} as const;
