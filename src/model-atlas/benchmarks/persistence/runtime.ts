/** Benchmark source runtimes bind custom cache reads, snapshot refresh, and the complete raw-writer registry. */

import type { DatabaseSync } from "node:sqlite";
import type { CacheDbRow, CacheRowSource } from "../../ingest/cache/rows";
import type {
	RawSourceName,
	SnapshotTableName,
} from "../../ingest/source-registry";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../ingest/types";
import type { DatabaseWriter } from "../../ingest/writers/database";
import {
	BENCHMARK_OBSERVATION_RAW_TABLE,
	type BenchmarkRuntimeKeyFor,
} from "../registry";
import { agentArenaPersistence } from "./agent-arena";
import { agentsLastExamPersistence } from "./agents-last-exam";
import { aleBenchPersistence } from "./ale-bench";
import { blueprintBenchPersistence } from "./blueprint-bench";
import { cursorBenchPersistence } from "./cursorbench";
import { deepSWEPersistence } from "./deep-swe";
import { frontierCodePersistence } from "./frontier-code";
import { gdpPdfPersistence } from "./gdp-pdf";
import { harveyLabPersistence } from "./harvey-lab";
import { mercorApexAgentsPersistence } from "./mercor-apex-agents";
import { insertBenchmarkObservationRows } from "./observation";
import { riemannBenchPersistence } from "./riemann-bench";
import { terminalBenchPersistence } from "./terminal-bench";
import { valsIndexPersistence } from "./vals-index";
import { vendingBench2Persistence } from "./vending-bench-2";

type BenchmarkRuntime<
	CacheKey extends string,
	Source extends RawSourceName,
	Cached,
	Snapshot extends { sourceStatus: SourceSnapshotStatus },
> = {
	cacheKey: CacheKey;
	source: Source;
	table: SnapshotTableName;
	readCache: (cache: CacheRowSource) => Cached;
	snapshot: (
		cached: Cached,
		status: RawSourceCacheStatus,
		options: DatabaseBuildOptions,
		previousMissingSince: ReadonlyMap<string, number>,
		nowEpochSeconds: number,
	) => Promise<Snapshot>;
	write: (db: DatabaseWriter, snapshots: SourceSnapshots) => void;
};

function benchmarkRuntime<
	const CacheKey extends string,
	const Source extends RawSourceName,
	Cached,
	Snapshot extends { sourceStatus: SourceSnapshotStatus },
>(
	runtime: BenchmarkRuntime<CacheKey, Source, Cached, Snapshot>,
): BenchmarkRuntime<CacheKey, Source, Cached, Snapshot> {
	return runtime;
}

/** Sparse source runtimes share orchestration while retaining independent implementations. */
const SPARSE_BENCHMARK_RUNTIMES = {
	agent_arena: benchmarkRuntime(agentArenaPersistence),
	agents_last_exam: benchmarkRuntime(agentsLastExamPersistence),
	ale_bench: benchmarkRuntime(aleBenchPersistence),
	blueprint_bench_2: benchmarkRuntime(blueprintBenchPersistence),
	cursorbench: benchmarkRuntime(cursorBenchPersistence),
	deep_swe: benchmarkRuntime(deepSWEPersistence),
	frontier_code: benchmarkRuntime(frontierCodePersistence),
	mercor_apex_agents: benchmarkRuntime(mercorApexAgentsPersistence),
	vending_bench_2: benchmarkRuntime(vendingBench2Persistence),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"sparse">, object>;

const SURGE_BENCHMARK_RUNTIMES = {
	gdp_pdf: benchmarkRuntime(gdpPdfPersistence),
	riemann_bench: benchmarkRuntime(riemannBenchPersistence),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_BENCHMARK_RUNTIMES = {
	vals_harvey_lab: benchmarkRuntime(harveyLabPersistence),
	vals_terminal_bench: benchmarkRuntime(terminalBenchPersistence),
	vals_index: benchmarkRuntime(valsIndexPersistence),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"vals">, object>;

const BENCHMARK_RUNTIMES = {
	...SURGE_BENCHMARK_RUNTIMES,
	...VALS_BENCHMARK_RUNTIMES,
	...SPARSE_BENCHMARK_RUNTIMES,
} as const;

type BenchmarkRuntimes = typeof BENCHMARK_RUNTIMES;
type BenchmarkRuntimeKey = keyof BenchmarkRuntimes;
type BenchmarkRuntimeValue = BenchmarkRuntimes[BenchmarkRuntimeKey];

export type BenchmarkSnapshotCaches = {
	[Key in BenchmarkRuntimeKey as BenchmarkRuntimes[Key]["cacheKey"]]: ReturnType<
		BenchmarkRuntimes[Key]["readCache"]
	>;
};

type BenchmarkSnapshots = {
	[Key in BenchmarkRuntimeKey]: Awaited<
		ReturnType<BenchmarkRuntimes[Key]["snapshot"]>
	>;
};

type UnionToIntersection<Union> = (
	Union extends unknown
		? (value: Union) => void
		: never
) extends (value: infer Intersection) => void
	? Intersection
	: never;

type BenchmarkSnapshotRows = UnionToIntersection<
	{
		[Key in BenchmarkRuntimeKey]: Omit<BenchmarkSnapshots[Key], "sourceStatus">;
	}[BenchmarkRuntimeKey]
>;

/** Read every benchmark runtime cache through its source-group registry. */
export function readBenchmarkSnapshotCaches(
	db: DatabaseSync,
): BenchmarkSnapshotCaches {
	return readBenchmarkCaches(() => db);
}

/** Reconstruct every benchmark runtime cache from D1 rows through the same registry. */
export function benchmarkSnapshotCachesFromRows(
	rows: Record<RawSourceName, CacheDbRow[]>,
): BenchmarkSnapshotCaches {
	return readBenchmarkCaches((source) => rows[source]);
}

function readBenchmarkCaches(
	cacheForSource: (source: RawSourceName) => CacheRowSource,
): BenchmarkSnapshotCaches {
	return Object.fromEntries(
		Object.values(BENCHMARK_RUNTIMES).map((runtime) => [
			runtime.cacheKey,
			runtime.readCache(cacheForSource(runtime.source)),
		]),
	) as BenchmarkSnapshotCaches;
}

/** Refresh every benchmark through its registered source-specific implementation. */
export async function refreshBenchmarkSnapshots(
	caches: BenchmarkSnapshotCaches,
	statuses: Record<RawSourceName, RawSourceCacheStatus>,
	options: DatabaseBuildOptions,
	previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
	nowEpochSeconds: number,
): Promise<BenchmarkSnapshots> {
	const entries = await Promise.all(
		(
			Object.entries(BENCHMARK_RUNTIMES) as [
				BenchmarkRuntimeKey,
				BenchmarkRuntimeValue,
			][]
		).map(async ([key, runtime]) => [
			key,
			await runtime.snapshot(
				caches[runtime.cacheKey] as never,
				statuses[runtime.source],
				options,
				previousMissingSince[runtime.source],
				nowEpochSeconds,
			),
		]),
	);
	return Object.fromEntries(entries) as BenchmarkSnapshots;
}

/** Compose heterogeneous custom outputs into the common source-snapshot object. */
export function benchmarkSnapshotRows(
	snapshots: BenchmarkSnapshots,
): BenchmarkSnapshotRows {
	return Object.assign(
		{},
		...Object.values(snapshots).map(
			({ sourceStatus: _sourceStatus, ...rows }) => rows,
		),
	) as BenchmarkSnapshotRows;
}

type BenchmarkRawWriter = {
	table: SnapshotTableName;
	write: (db: DatabaseWriter, snapshots: SourceSnapshots) => void;
};

/** Compose custom-source and catalog-observation writers from the same runtime ownership map. */
export const BENCHMARK_RAW_WRITERS = [
	...Object.values(BENCHMARK_RUNTIMES).map(({ table, write }) => ({
		table,
		write,
	})),
	{
		table: BENCHMARK_OBSERVATION_RAW_TABLE,
		write: insertBenchmarkObservationRows,
	},
] satisfies readonly BenchmarkRawWriter[];

/** Write one benchmark raw table through its registered source runtime. */
export function insertBenchmarkRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
	table: SnapshotTableName,
): void {
	const writer = BENCHMARK_RAW_WRITERS.find(
		(candidate) => candidate.table === table,
	);
	if (writer == null) throw new Error(`Missing benchmark raw writer: ${table}`);
	writer.write(db, snapshots);
}
