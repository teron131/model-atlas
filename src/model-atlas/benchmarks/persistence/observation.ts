/** Generic benchmark-observation persistence owns cache reconstruction, catalog-driven snapshots, and raw-row serialization. */

import { benchmarkObservationSourceFetcher } from "../../ingest/assembly/load";
import {
	booleanFromSql,
	type CacheRowSource,
	firstEpochSecond,
	queryCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import type { RawSourceName } from "../../ingest/source-registry";
import {
	benchmarkObservationRowKey,
	snapshotSourceRows,
} from "../../ingest/source-snapshots/row-snapshot";
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
import type {
	BenchmarkMetricUnit,
	BenchmarkObservationMetadata,
	BenchmarkObservationPayload,
	BenchmarkObservationRow,
} from "../observation";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../registry";

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

type BenchmarkObservationSnapshot = {
	rows: BenchmarkObservationRow[];
	sourceStatus: SourceSnapshotStatus;
};

async function benchmarkObservationSnapshot(
	cached: { rows: BenchmarkObservationRow[]; fetchedAt: number | null } | null,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
	source: RawSourceName,
	fetchedAtKey: keyof SourceSnapshots["fetchedAt"],
	fetchRows: () => Promise<BenchmarkObservationPayload>,
): Promise<BenchmarkObservationSnapshot> {
	const snapshot = await snapshotSourceRows({
		source,
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows,
		rowKey: benchmarkObservationRowKey,
		rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
	});
	return {
		rows: snapshot.rows,
		sourceStatus: {
			source,
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey,
		},
	};
}

/** Refresh every generic benchmark-observation source declared by the benchmark catalog. */
export async function benchmarkObservationSnapshots(
	caches: Readonly<
		Record<
			string,
			ReturnType<typeof readBenchmarkObservationRawCache> | undefined
		>
	>,
	statuses: Record<RawSourceName, RawSourceCacheStatus>,
	options: DatabaseBuildOptions,
	previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
	nowEpochSeconds: number,
) {
	return Promise.all(
		BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => {
			const source = binding.rawSourceKey;
			const fetchRows = benchmarkObservationSourceFetcher(binding);
			return {
				binding,
				snapshot: await benchmarkObservationSnapshot(
					caches[binding.sourceDataKey] ?? null,
					statuses[source],
					options,
					previousMissingSince[source],
					nowEpochSeconds,
					source,
					binding.sourceDataKey,
					fetchRows,
				),
			};
		}),
	);
}

/** Insert a catalog-declared benchmark-observation snapshot through its shared row contract. */
export function insertBenchmarkObservationRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO ${BENCHMARK_OBSERVATION_RAW_TABLE} (
			source_key, row_index, fetched_at_epoch_seconds, benchmark_key, url,
			model_id, model, base_model, reasoning_effort, model_creator_id,
			model_creator, inference_provider, rank,
			reported_value, reported_unit, canonical_value, canonical_unit,
			score_eligible, standard_error, confidence_low, confidence_high,
			observed_at, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const binding of BENCHMARK_OBSERVATION_BINDINGS) {
		const rows = snapshots[
			binding.sourceRowsKey
		] as readonly BenchmarkObservationRow[];
		const fetchedAt = snapshots.fetchedAt[binding.sourceDataKey];
		for (const [index, row] of rows.entries()) {
			statement.run(
				binding.rawSourceKey,
				index,
				fetchedAt,
				row.benchmark_key,
				row.source_url,
				row.model_id,
				row.model,
				row.base_model,
				row.reasoning_effort,
				row.model_creator_id,
				row.model_creator,
				row.inference_provider,
				row.rank,
				row.reported_value,
				row.reported_unit,
				row.canonical_value,
				row.canonical_unit,
				sqliteBooleanValue(row.score_eligible),
				row.standard_error,
				row.confidence_low,
				row.confidence_high,
				row.observed_at,
				JSON.stringify(row.metadata),
			);
		}
	}
}
