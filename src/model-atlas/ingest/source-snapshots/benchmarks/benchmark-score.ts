/** Catalog-driven benchmark snapshots own generic score feeds declared by the benchmark registry. */

import { BENCHMARK_SCORE_SOURCE_BINDINGS } from "../../../benchmarks/registry";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../../../scrapers/benchmark-score";
import { benchmarkScoreSourceFetcher } from "../../assembly/load";
import type { readBenchmarkScoreRawCache } from "../../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../types";
import { benchmarkScoreRowKey, modelScoreSnapshot } from "../model-score";

type BenchmarkScoreSnapshot = {
	rows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

async function benchmarkScoreSnapshot(
	cached: { rows: BenchmarkScoreRow[]; fetchedAt: number | null } | null,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
	source: RawSourceName,
	fetchedAtKey: keyof SourceSnapshots["fetchedAt"],
	fetchRows: () => Promise<BenchmarkScorePayload>,
): Promise<BenchmarkScoreSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source,
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows,
		rowKey: benchmarkScoreRowKey,
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

/** Refresh every generic benchmark-score source declared by the benchmark catalog. */
export async function benchmarkScoreSnapshots(
	caches: Readonly<
		Record<string, ReturnType<typeof readBenchmarkScoreRawCache> | undefined>
	>,
	statuses: Record<RawSourceName, RawSourceCacheStatus>,
	options: DatabaseBuildOptions,
	previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
	nowEpochSeconds: number,
) {
	return Promise.all(
		BENCHMARK_SCORE_SOURCE_BINDINGS.map(async (binding) => {
			const source = binding.rawSource;
			const fetchRows = benchmarkScoreSourceFetcher(binding);
			return {
				binding,
				snapshot: await benchmarkScoreSnapshot(
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
