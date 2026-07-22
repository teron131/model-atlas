/** Catalog-driven benchmark snapshots own generic observation feeds declared by the benchmark registry. */

import type {
	BenchmarkObservationPayload,
	BenchmarkObservationRow,
} from "../../../benchmarks/observation";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../../../benchmarks/registry";
import { benchmarkObservationSourceFetcher } from "../../assembly/load";
import type { readBenchmarkObservationRawCache } from "../../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../types";
import {
	benchmarkObservationRowKey,
	snapshotSourceRows,
} from "../row-snapshot";

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
