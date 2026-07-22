/** Cache reconstruction for Surge benchmark leaderboard rows. */

import { asFiniteNumber } from "../../../runtime";
import type { GdpPdfModelScoreRow } from "../../../scrapers/surge/gdp-pdf";
import type { RiemannBenchModelScoreRow } from "../../../scrapers/surge/riemann-bench";
import { SOURCE_URLS } from "../../types";
import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../rows";

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
