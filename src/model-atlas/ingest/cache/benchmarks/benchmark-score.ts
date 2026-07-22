/** Cache reconstruction for catalog-declared benchmark-score sources. */

import type { BENCHMARK_SCORE_SOURCE_BINDINGS } from "../../../benchmarks/registry";
import { asFiniteNumber } from "../../../runtime";
import type {
	BenchmarkScoreMetadata,
	BenchmarkScoreRow,
	BenchmarkScoreSource,
} from "../../../scrapers/benchmark-score";
import {
	booleanFromSql,
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../rows";

type BenchmarkScoreSourceBinding =
	(typeof BENCHMARK_SCORE_SOURCE_BINDINGS)[number];

function benchmarkScoreMetadata(value: unknown): BenchmarkScoreMetadata | null {
	if (typeof value !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed != null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as BenchmarkScoreMetadata)
			: null;
	} catch {
		return null;
	}
}

function readBenchmarkScoreRows(
	cache: CacheRowSource,
	table: string,
	benchmarkKey: string,
	expectedSource: BenchmarkScoreSource,
	expectedUrl?: string,
): {
	rows: BenchmarkScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		`SELECT * FROM ${table} ORDER BY row_index`,
	);
	if (cacheRows.length === 0) return null;
	const rows = cacheRows.flatMap((row) => {
		const rowBenchmarkKey = stringValue(row.benchmark_key);
		const source = stringValue(row.source);
		const sourceUrl = stringValue(row.url);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const score = asFiniteNumber(row.score);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const metadata = benchmarkScoreMetadata(row.metadata_json);
		if (
			rowBenchmarkKey !== benchmarkKey ||
			source !== expectedSource ||
			sourceUrl == null ||
			(expectedUrl != null && sourceUrl !== expectedUrl) ||
			model == null ||
			baseModel == null ||
			score == null ||
			scoreEligible == null ||
			metadata == null
		)
			return [];
		return [
			{
				benchmark_key: benchmarkKey,
				source: expectedSource,
				source_url: sourceUrl,
				model_id: stringValue(row.model_id),
				model,
				base_model: baseModel,
				reasoning_effort: stringValue(row.reasoning_effort),
				provider: stringValue(row.provider),
				rank: asFiniteNumber(row.rank),
				score,
				score_eligible: scoreEligible,
				standard_error: asFiniteNumber(row.standard_error),
				confidence_low: asFiniteNumber(row.confidence_low),
				confidence_high: asFiniteNumber(row.confidence_high),
				observed_at: stringValue(row.observed_at),
				metadata,
			},
		];
	});
	return rows.length === 0
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

/** Reconstruct one catalog-declared benchmark-score source from SQLite or collected rows. */
export function readBenchmarkScoreRawCache(
	cache: CacheRowSource,
	binding: BenchmarkScoreSourceBinding,
) {
	const expectedUrl =
		"sourceUrl" in binding.loader ? binding.loader.sourceUrl : undefined;
	return readBenchmarkScoreRows(
		cache,
		binding.rawTable,
		binding.benchmark,
		binding.source as BenchmarkScoreSource,
		expectedUrl,
	);
}
