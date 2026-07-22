/** Cache reconstruction for catalog-declared benchmark-observation sources. */

import type {
	BenchmarkMetricUnit,
	BenchmarkObservationMetadata,
	BenchmarkObservationRow,
} from "../../../benchmarks/observation";
import type { BENCHMARK_OBSERVATION_BINDINGS } from "../../../benchmarks/registry";
import { asFiniteNumber } from "../../../runtime";
import {
	booleanFromSql,
	type CacheRowSource,
	firstEpochSecond,
	queryCacheRows,
	stringValue,
} from "../rows";

type BenchmarkObservationBinding =
	(typeof BENCHMARK_OBSERVATION_BINDINGS)[number];

function benchmarkObservationMetadata(
	value: unknown,
): BenchmarkObservationMetadata | null {
	if (typeof value !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed != null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as BenchmarkObservationMetadata)
			: null;
	} catch {
		return null;
	}
}

function benchmarkMetricUnit(value: unknown): BenchmarkMetricUnit | null {
	return value === "index" || value === "percent" || value === "proportion"
		? value
		: null;
}

function readBenchmarkObservationRows(
	cache: CacheRowSource,
	table: string,
	sourceKey: string,
	benchmarkKey: string,
	expectedUrl?: string,
): {
	rows: BenchmarkObservationRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = Array.isArray(cache)
		? cache.filter((row) => stringValue(row.source_key) === sourceKey)
		: queryCacheRows(
				cache,
				`SELECT * FROM ${table} WHERE source_key = ? ORDER BY row_index`,
				[sourceKey],
			);
	if (cacheRows.length === 0) return null;
	const rows = cacheRows.flatMap((row) => {
		const rowBenchmarkKey = stringValue(row.benchmark_key);
		const sourceUrl = stringValue(row.url);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const reportedValue = asFiniteNumber(row.reported_value);
		const reportedUnit = benchmarkMetricUnit(row.reported_unit);
		const canonicalValue = asFiniteNumber(row.canonical_value);
		const canonicalUnit = benchmarkMetricUnit(row.canonical_unit);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const metadata = benchmarkObservationMetadata(row.metadata_json);
		if (
			rowBenchmarkKey !== benchmarkKey ||
			sourceUrl == null ||
			(expectedUrl != null && sourceUrl !== expectedUrl) ||
			model == null ||
			baseModel == null ||
			reportedValue == null ||
			reportedUnit == null ||
			canonicalValue == null ||
			canonicalUnit == null ||
			scoreEligible == null ||
			metadata == null
		)
			return [];
		return [
			{
				benchmark_key: benchmarkKey,
				source_url: sourceUrl,
				model_id: stringValue(row.model_id),
				model,
				base_model: baseModel,
				reasoning_effort: stringValue(row.reasoning_effort),
				model_creator_id: stringValue(row.model_creator_id),
				model_creator: stringValue(row.model_creator),
				inference_provider: stringValue(row.inference_provider),
				rank: asFiniteNumber(row.rank),
				reported_value: reportedValue,
				reported_unit: reportedUnit,
				canonical_value: canonicalValue,
				canonical_unit: canonicalUnit,
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

/** Reconstruct one catalog-declared benchmark-observation source from SQLite or collected rows. */
export function readBenchmarkObservationRawCache(
	cache: CacheRowSource,
	binding: BenchmarkObservationBinding,
) {
	const expectedUrl =
		"sourceUrl" in binding.loader ? binding.loader.sourceUrl : undefined;
	return readBenchmarkObservationRows(
		cache,
		binding.rawTable,
		binding.rawSourceKey,
		binding.benchmark,
		expectedUrl,
	);
}
