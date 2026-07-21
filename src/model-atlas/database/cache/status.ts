/** Raw source cache freshness and persisted-shape status policy. */

import type { DatabaseSync } from "node:sqlite";

import { DEEP_SWE_PREFERRED_SOURCE_VERSION } from "../../scrapers/deep-swe";
import { asFiniteNumber, asRecord } from "../../shared";
import {
	RAW_SOURCE_CACHE_SECONDS,
	RAW_SOURCE_TABLES,
	type RawSourceCacheStatus,
	type RawSourceName,
} from "../types";
import { artificialAnalysisCacheHasHiddenRows } from "./artificial-analysis";
import { openRouterCacheHasScopedCandidates } from "./openrouter";
import { type CacheDbRow, firstEpochSecond } from "./rows";

/** Fallback DeepSWE rows remain usable evidence but cannot make the preferred source cache current. */
function hasPreferredDeepSWECacheVersion(db: DatabaseSync): boolean {
	return (
		db
			.prepare(
				"SELECT 1 FROM deep_swe_raw_rows WHERE source_version = ? LIMIT 1",
			)
			.get(DEEP_SWE_PREFERRED_SOURCE_VERSION) != null
	);
}

/** Checks whether a source cache has the current persisted row shape. */
function isSourceCacheShapeCurrent(
	db: DatabaseSync,
	source: RawSourceName,
): boolean {
	if (source === "artificial_analysis") {
		return artificialAnalysisCacheHasHiddenRows(db);
	}
	if (source === "deep_swe") {
		return hasPreferredDeepSWECacheVersion(db);
	}
	if (source === "openrouter") {
		return openRouterCacheHasScopedCandidates(db);
	}
	return true;
}

/** Cache hits require populated rows, a nonfuture fetch time, freshness, and the source's current persisted shape. */
export function readRawSourceCacheStatus(
	db: DatabaseSync,
	source: RawSourceName,
	nowEpochSeconds: number,
): RawSourceCacheStatus {
	const table = RAW_SOURCE_TABLES[source];
	const row = asRecord(
		db
			.prepare(
				`SELECT COUNT(*) AS row_count, MAX(fetched_at_epoch_seconds) AS last_fetch_epoch_seconds FROM ${table}`,
			)
			.get(),
	);
	const rowCount = asFiniteNumber(row.row_count) ?? 0;
	const lastFetch = asFiniteNumber(row.last_fetch_epoch_seconds);
	const cacheHit =
		rowCount > 0 &&
		lastFetch != null &&
		nowEpochSeconds - lastFetch >= 0 &&
		nowEpochSeconds - lastFetch <= RAW_SOURCE_CACHE_SECONDS &&
		isSourceCacheShapeCurrent(db, source);
	return {
		last_fetch_epoch_seconds: lastFetch,
		source_input_count: rowCount,
		cache_hit: cacheHit,
		refreshed: false,
	};
}

export function refreshedCacheStatus(
	lastFetchEpochSeconds: number | null,
	sourceInputCount: number,
): RawSourceCacheStatus {
	return {
		last_fetch_epoch_seconds: lastFetchEpochSeconds,
		source_input_count: sourceInputCount,
		cache_hit: false,
		refreshed: true,
	};
}

function rowsHaveCurrentShape(
	source: RawSourceName,
	rows: readonly CacheDbRow[],
): boolean {
	if (source === "artificial_analysis") {
		return rows.some(
			(row) =>
				row.deprecated === 1 &&
				(row.tau_banking != null || row.terminalbench_v21 != null),
		);
	}
	if (source === "deep_swe") {
		return rows.some(
			(row) => row.source_version === DEEP_SWE_PREFERRED_SOURCE_VERSION,
		);
	}
	if (source === "openrouter") {
		return openRouterCacheHasScopedCandidates([...rows]);
	}
	return true;
}

/** Computes source freshness from D1 rows without a local database. */
export function rawSourceCacheStatusFromRows(
	source: RawSourceName,
	rows: readonly CacheDbRow[],
	nowEpochSeconds: number,
	persistedStatus?: Pick<
		RawSourceCacheStatus,
		"last_fetch_epoch_seconds" | "source_input_count"
	>,
): RawSourceCacheStatus {
	const lastFetch =
		persistedStatus == null
			? firstEpochSecond(rows)
			: persistedStatus.last_fetch_epoch_seconds;
	const sourceInputCount =
		persistedStatus == null ? rows.length : persistedStatus.source_input_count;
	return {
		last_fetch_epoch_seconds: lastFetch,
		source_input_count: sourceInputCount,
		cache_hit:
			rows.length > 0 &&
			sourceInputCount > 0 &&
			lastFetch != null &&
			nowEpochSeconds - lastFetch >= 0 &&
			nowEpochSeconds - lastFetch <= RAW_SOURCE_CACHE_SECONDS &&
			rowsHaveCurrentShape(source, rows),
		refreshed: false,
	};
}
