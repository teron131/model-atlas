/** Raw source cache freshness and persisted-shape status policy. */

import type { DatabaseSync } from "node:sqlite";

import { asFiniteNumber, asRecord } from "../../shared";
import {
	RAW_SOURCE_CACHE_SECONDS,
	type RawSourceCacheStatus,
	type RawSourceName,
} from "../types";
import { openRouterCacheHasScopedCandidates } from "./openrouter";
import { artificialAnalysisCacheHasHiddenRows } from "./source-readers";

const RAW_SOURCE_TABLES: Record<RawSourceName, string> = {
	artificial_analysis: "aa_raw_models",
	models_dev: "models_dev_raw_models",
	deep_swe: "deep_swe_raw_rows",
	terminal_bench: "terminal_bench_raw_rows",
	agents_last_exam: "agents_last_exam_raw_rows",
	blueprint_bench_2: "blueprint_bench_2_raw_rows",
	gdp_pdf: "gdp_pdf_raw_rows",
	riemann_bench: "riemann_bench_raw_rows",
	browsecomp: "browsecomp_raw_rows",
	toolathlon: "toolathlon_raw_rows",
	cursorbench: "cursorbench_raw_rows",
	openrouter: "openrouter_raw_rows",
};

/** Checks whether a source cache has the current persisted row shape. */
function sourceCacheShapeIsCurrent(
	db: DatabaseSync,
	source: RawSourceName,
): boolean {
	if (source === "artificial_analysis") {
		return artificialAnalysisCacheHasHiddenRows(db);
	}
	if (source === "openrouter") {
		return openRouterCacheHasScopedCandidates(db);
	}
	return true;
}

/** Reports whether a raw-source cache table is populated and still fresh. */
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
		sourceCacheShapeIsCurrent(db, source);
	return {
		last_fetch_epoch_seconds: lastFetch,
		source_input_count: rowCount,
		cache_hit: cacheHit,
		refreshed: false,
	};
}

/** Builds cache status metadata for freshly fetched source rows. */
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
