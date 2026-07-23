/** GDP.pdf persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

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
	type GdpPdfModelScoreRow,
	getGdpPdfStats,
} from "../scrapers/surge/gdp-pdf";

export function readGdpPdfRawCache(cache: CacheRowSource): {
	rows: GdpPdfModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM gdp_pdf_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.gdp_pdf)) {
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
	};
}

type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads GDP PDF rows keyed by provider and model for cache row continuity. */
async function gdpPdfSnapshot(
	cached: ReturnType<typeof readGdpPdfRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<GdpPdfSnapshot> {
	const snapshot = await snapshotSourceRows({
		source: "gdp_pdf",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getGdpPdfStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		gdpPdfModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "gdp_pdf",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "gdpPdf",
		},
	};
}

function insertGdpPdfRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO gdp_pdf_raw_rows (
			row_index, fetched_at_epoch_seconds, url, provider, model,
			score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.gdpPdfModelScoreRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.gdpPdf,
			SOURCE_URLS.gdp_pdf,
			row.provider,
			row.model,
			row.score,
			row.last_updated ?? null,
		);
	}
}

export const gdpPdfPersistence = {
	cacheKey: "gdpPdf",
	source: "gdp_pdf",
	table: SNAPSHOT_TABLES.gdp_pdf,
	readCache: readGdpPdfRawCache,
	snapshot: gdpPdfSnapshot,
	write: insertGdpPdfRawRows,
} as const;
