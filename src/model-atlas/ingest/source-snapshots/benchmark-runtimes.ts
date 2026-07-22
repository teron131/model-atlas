/** Benchmark runtime orchestration binds source-specific snapshot loaders to caches and aggregate refresh. */

import type { DatabaseSync } from "node:sqlite";

import type { BenchmarkRuntimeKeyFor } from "../../benchmarks/registry";
import {
	readAgentArenaRawCache as readAgentArenaCache,
	readAgentsLastExamRawCache as readAgentsLastExamCache,
	readAleBenchRawCache as readAleBenchCache,
	readBlueprintBenchRawCache as readBlueprintBenchCache,
	readCursorBenchRawCache as readCursorBenchCache,
	readDeepSWERawCache as readDeepSWECache,
	readFrontierCodeRawCache as readFrontierCodeCache,
	readGdpPdfRawCache as readGdpPdfCache,
	readHarveyLabRawCache as readHarveyLabCache,
	readMercorApexAgentsRawCache as readMercorApexAgentsCache,
	readRiemannBenchRawCache as readRiemannBenchCache,
	readTerminalBenchRawCache as readTerminalBenchCache,
	readValsIndexRawCache as readValsIndexCache,
	readVendingBench2RawCache as readVendingBench2Cache,
} from "../cache";
import type { CacheDbRow, CacheRowSource } from "../cache/rows";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceSnapshotStatus,
} from "../types";
import {
	agentArenaSnapshot,
	agentsLastExamSnapshot,
	aleBenchSnapshot,
	blueprintBenchSnapshot,
	cursorBenchSnapshot,
	deepSWESnapshot,
	frontierCodeSnapshot,
	mercorApexAgentsSnapshot,
	vendingBench2Snapshot,
} from "./benchmarks/sparse";
import { gdpPdfSnapshot, riemannBenchSnapshot } from "./benchmarks/surge";
import {
	harveyLabSnapshot,
	terminalBenchSnapshot,
	valsIndexSnapshot,
} from "./benchmarks/vals";

type BenchmarkRuntime<
	CacheKey extends string,
	Source extends RawSourceName,
	Cached,
	Snapshot extends { sourceStatus: SourceSnapshotStatus },
> = {
	cacheKey: CacheKey;
	source: Source;
	readCache: (cache: CacheRowSource) => Cached;
	snapshot: (
		cached: Cached,
		status: RawSourceCacheStatus,
		options: DatabaseBuildOptions,
		previousMissingSince: ReadonlyMap<string, number>,
		nowEpochSeconds: number,
	) => Promise<Snapshot>;
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
	agent_arena: benchmarkRuntime({
		cacheKey: "agentArena",
		source: "agent_arena",
		readCache: readAgentArenaCache,
		snapshot: agentArenaSnapshot,
	}),
	agents_last_exam: benchmarkRuntime({
		cacheKey: "agentsLastExam",
		source: "agents_last_exam",
		readCache: readAgentsLastExamCache,
		snapshot: agentsLastExamSnapshot,
	}),
	ale_bench: benchmarkRuntime({
		cacheKey: "aleBench",
		source: "ale_bench",
		readCache: readAleBenchCache,
		snapshot: aleBenchSnapshot,
	}),
	blueprint_bench_2: benchmarkRuntime({
		cacheKey: "blueprintBench",
		source: "blueprint_bench_2",
		readCache: readBlueprintBenchCache,
		snapshot: blueprintBenchSnapshot,
	}),
	cursorbench: benchmarkRuntime({
		cacheKey: "cursorBench",
		source: "cursorbench",
		readCache: readCursorBenchCache,
		snapshot: cursorBenchSnapshot,
	}),
	deep_swe: benchmarkRuntime({
		cacheKey: "deepSWE",
		source: "deep_swe",
		readCache: readDeepSWECache,
		snapshot: deepSWESnapshot,
	}),
	frontier_code: benchmarkRuntime({
		cacheKey: "frontierCode",
		source: "frontier_code",
		readCache: readFrontierCodeCache,
		snapshot: frontierCodeSnapshot,
	}),
	mercor_apex_agents: benchmarkRuntime({
		cacheKey: "mercorApexAgents",
		source: "mercor_apex_agents",
		readCache: readMercorApexAgentsCache,
		snapshot: mercorApexAgentsSnapshot,
	}),
	vending_bench_2: benchmarkRuntime({
		cacheKey: "vendingBench2",
		source: "vending_bench_2",
		readCache: readVendingBench2Cache,
		snapshot: vendingBench2Snapshot,
	}),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"sparse">, object>;

const SURGE_BENCHMARK_RUNTIMES = {
	gdp_pdf: benchmarkRuntime({
		cacheKey: "gdpPdf",
		source: "gdp_pdf",
		readCache: readGdpPdfCache,
		snapshot: gdpPdfSnapshot,
	}),
	riemann_bench: benchmarkRuntime({
		cacheKey: "riemannBench",
		source: "riemann_bench",
		readCache: readRiemannBenchCache,
		snapshot: riemannBenchSnapshot,
	}),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_BENCHMARK_RUNTIMES = {
	vals_harvey_lab: benchmarkRuntime({
		cacheKey: "harveyLab",
		source: "vals_harvey_lab",
		readCache: readHarveyLabCache,
		snapshot: harveyLabSnapshot,
	}),
	vals_terminal_bench: benchmarkRuntime({
		cacheKey: "terminalBench",
		source: "vals_terminal_bench",
		readCache: readTerminalBenchCache,
		snapshot: terminalBenchSnapshot,
	}),
	vals_index: benchmarkRuntime({
		cacheKey: "valsIndex",
		source: "vals_index",
		readCache: readValsIndexCache,
		snapshot: valsIndexSnapshot,
	}),
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

export type BenchmarkSnapshots = {
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

export type BenchmarkSnapshotRows = UnionToIntersection<
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
