/** Benchmark runtime registry coordinates live loading, cache reconstruction, snapshot refresh, and raw persistence. */

import type { DatabaseSync } from "node:sqlite";

import {
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkRuntimeKey,
  type BenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { getAgentArenaStats } from "../../scrapers/benchmarks/agent-arena";
import { getAgentsLastExamStats } from "../../scrapers/benchmarks/agents-last-exam";
import { getAleBenchStats } from "../../scrapers/benchmarks/ale-bench";
import { getBlueprintBenchStats } from "../../scrapers/benchmarks/blueprint-bench";
import { getCursorBenchStats } from "../../scrapers/benchmarks/cursorbench";
import {
  getDeepSWELeaderboardStats,
  preferredDeepSWELeaderboardRows,
} from "../../scrapers/benchmarks/deep-swe";
import { getFrontierCodeStats } from "../../scrapers/benchmarks/frontier-code";
import { getMercorApexAgentsStats } from "../../scrapers/benchmarks/mercor-apex-agents";
import { getRiemannBenchStats } from "../../scrapers/benchmarks/surge/riemann-bench";
import { getTerminalBench4Stats } from "../../scrapers/benchmarks/terminal-bench-4";
import { getHarveyLabStats } from "../../scrapers/benchmarks/vals/harvey-lab";
import { getValsIndexStats } from "../../scrapers/benchmarks/vals/index-benchmark";
import { getVendingBench2Stats } from "../../scrapers/benchmarks/vending-bench-2";
import type { ModelAtlasSourceRows } from "../assembly/source-data";
import type { CacheDbRow, CacheRowSource } from "../cache/rows";
import type { RawSourceName, SnapshotTableName } from "../source-registry";
import type {
  DatabaseBuildOptions,
  RawSourceCacheStatus,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import type { DatabaseWriter } from "../writers/database";
import { agentArenaRuntime } from "./agent-arena";
import { agentsLastExamRuntime } from "./agents-last-exam";
import { aleBenchRuntime } from "./ale-bench";
import { blueprintBenchRuntime } from "./blueprint-bench";
import { cursorBenchRuntime } from "./cursorbench";
import { deepSWERuntime } from "./deep-swe";
import { frontierCodeRuntime } from "./frontier-code";
import { harveyLabRuntime } from "./harvey-lab";
import { mercorApexAgentsRuntime } from "./mercor-apex-agents";
import { insertBenchmarkObservationRows } from "./observation";
import { riemannBenchRuntime } from "./riemann-bench";
import { terminalBench4Runtime } from "./terminal-bench-4";
import { valsIndexRuntime } from "./vals-index";
import { vendingBench2Runtime } from "./vending-bench-2";

type BenchmarkRuntime<
  SourceRowsKey extends keyof ModelAtlasSourceRows,
  CacheKey extends string,
  Source extends RawSourceName,
  Cached,
  Snapshot extends { sourceStatus: SourceSnapshotStatus },
> = {
  sourceRowsKey: SourceRowsKey;
  loadSourceRows: () => Promise<ModelAtlasSourceRows[SourceRowsKey]>;
  sourceRowsFromSnapshots: (snapshots: SourceSnapshots) => ModelAtlasSourceRows[SourceRowsKey];
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

function defineBenchmarkRuntime<
  const SourceRowsKey extends keyof ModelAtlasSourceRows,
  const CacheKey extends string,
  const Source extends RawSourceName,
  Cached,
  Snapshot extends { sourceStatus: SourceSnapshotStatus },
>(
  runtime: BenchmarkRuntime<SourceRowsKey, CacheKey, Source, Cached, Snapshot>,
): BenchmarkRuntime<SourceRowsKey, CacheKey, Source, Cached, Snapshot> {
  return runtime;
}

/** Standalone source runtimes share orchestration while retaining independent implementations. */
const STANDALONE_BENCHMARK_RUNTIMES = {
  agent_arena: defineBenchmarkRuntime({
    ...agentArenaRuntime,
    sourceRowsKey: "agentArenaRows",
    loadSourceRows: async () => (await getAgentArenaStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.agentArenaModelScoreRows,
  }),
  agents_last_exam: defineBenchmarkRuntime({
    ...agentsLastExamRuntime,
    sourceRowsKey: "agentsLastExamRows",
    loadSourceRows: async () => (await getAgentsLastExamStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.agentsLastExamModelScores,
  }),
  ale_bench: defineBenchmarkRuntime({
    ...aleBenchRuntime,
    sourceRowsKey: "aleBenchConfigurationRows",
    loadSourceRows: async () => (await getAleBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.aleBenchConfigurationRows,
  }),
  blueprint_bench_2: defineBenchmarkRuntime({
    ...blueprintBenchRuntime,
    sourceRowsKey: "blueprintBenchRows",
    loadSourceRows: async () => (await getBlueprintBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.blueprintBenchModelScoreRows,
  }),
  cursorbench: defineBenchmarkRuntime({
    ...cursorBenchRuntime,
    sourceRowsKey: "cursorBenchRows",
    loadSourceRows: async () => (await getCursorBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.cursorBenchModelScoreRows,
  }),
  deep_swe: defineBenchmarkRuntime({
    ...deepSWERuntime,
    sourceRowsKey: "deepSWEEffortRows",
    loadSourceRows: async () => (await getDeepSWELeaderboardStats()).data,
    sourceRowsFromSnapshots: (snapshots) =>
      preferredDeepSWELeaderboardRows(snapshots.deepSWERawRows),
  }),
  frontier_code: defineBenchmarkRuntime({
    ...frontierCodeRuntime,
    sourceRowsKey: "frontierCodeRows",
    loadSourceRows: async () => (await getFrontierCodeStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.frontierCodeRows,
  }),
  mercor_apex_agents: defineBenchmarkRuntime({
    ...mercorApexAgentsRuntime,
    sourceRowsKey: "mercorApexAgentsRows",
    loadSourceRows: async () => (await getMercorApexAgentsStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.mercorApexAgentsRows,
  }),
  terminal_bench_4: defineBenchmarkRuntime({
    ...terminalBench4Runtime,
    sourceRowsKey: "terminalBench4Rows",
    loadSourceRows: async () => (await getTerminalBench4Stats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.terminalBench4Rows,
  }),
  vending_bench_2: defineBenchmarkRuntime({
    ...vendingBench2Runtime,
    sourceRowsKey: "vendingBench2Rows",
    loadSourceRows: async () => (await getVendingBench2Stats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.vendingBench2ModelScoreRows,
  }),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"standalone">, object>;

const SURGE_BENCHMARK_RUNTIMES = {
  riemann_bench: defineBenchmarkRuntime({
    ...riemannBenchRuntime,
    sourceRowsKey: "riemannBenchRows",
    loadSourceRows: async () => (await getRiemannBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.riemannBenchModelScoreRows,
  }),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_BENCHMARK_RUNTIMES = {
  vals_harvey_lab: defineBenchmarkRuntime({
    ...harveyLabRuntime,
    sourceRowsKey: "harveyLabRows",
    loadSourceRows: async () => (await getHarveyLabStats()).model_scores,
    sourceRowsFromSnapshots: (snapshots) => snapshots.harveyLabModelScoreRows,
  }),
  vals_index: defineBenchmarkRuntime({
    ...valsIndexRuntime,
    sourceRowsKey: "valsIndexRows",
    loadSourceRows: async () => (await getValsIndexStats()).model_scores,
    sourceRowsFromSnapshots: (snapshots) => snapshots.valsIndexModelScoreRows,
  }),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"vals">, object>;

const BENCHMARK_RUNTIMES = {
  ...SURGE_BENCHMARK_RUNTIMES,
  ...VALS_BENCHMARK_RUNTIMES,
  ...STANDALONE_BENCHMARK_RUNTIMES,
} as const;

type BenchmarkRuntimes = typeof BENCHMARK_RUNTIMES;
type BenchmarkRuntimeValue = BenchmarkRuntimes[BenchmarkRuntimeKey];
type BenchmarkSourceRowsKey = BenchmarkRuntimeValue["sourceRowsKey"];
type BenchmarkSourceRows = Pick<ModelAtlasSourceRows, BenchmarkSourceRowsKey>;

export type BenchmarkSnapshotCaches = {
  [Key in BenchmarkRuntimeKey as BenchmarkRuntimes[Key]["cacheKey"]]: ReturnType<
    BenchmarkRuntimes[Key]["readCache"]
  >;
};

type BenchmarkSnapshots = {
  [Key in BenchmarkRuntimeKey]: Awaited<ReturnType<BenchmarkRuntimes[Key]["snapshot"]>>;
};

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type BenchmarkSnapshotRows = UnionToIntersection<
  {
    [Key in BenchmarkRuntimeKey]: Omit<BenchmarkSnapshots[Key], "sourceStatus">;
  }[BenchmarkRuntimeKey]
>;

/** Fetch every custom benchmark through the registry that owns its ingest lifecycle. */
export async function fetchBenchmarkSourceRows(): Promise<BenchmarkSourceRows> {
  const entries = await Promise.all(
    Object.values(BENCHMARK_RUNTIMES).map(async (runtime) => [
      runtime.sourceRowsKey,
      await runtime.loadSourceRows(),
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkSourceRows;
}

/** Project persisted custom benchmark snapshots back into normalized source rows. */
export function benchmarkSourceRowsFromSnapshots(snapshots: SourceSnapshots): BenchmarkSourceRows {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [
      runtime.sourceRowsKey,
      runtime.sourceRowsFromSnapshots(snapshots),
    ]),
  ) as BenchmarkSourceRows;
}

/** Read every benchmark runtime cache through its source-group registry. */
export function readBenchmarkSnapshotCaches(db: DatabaseSync): BenchmarkSnapshotCaches {
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
    (Object.entries(BENCHMARK_RUNTIMES) as [BenchmarkRuntimeKey, BenchmarkRuntimeValue][]).map(
      async ([key, runtime]) => [
        key,
        await runtime.snapshot(
          caches[runtime.cacheKey] as never,
          statuses[runtime.source],
          options,
          previousMissingSince[runtime.source],
          nowEpochSeconds,
        ),
      ],
    ),
  );
  return Object.fromEntries(entries) as BenchmarkSnapshots;
}

/** Compose heterogeneous custom outputs into the common source-snapshot object. */
export function benchmarkSnapshotRows(snapshots: BenchmarkSnapshots): BenchmarkSnapshotRows {
  return Object.assign(
    {},
    ...Object.values(snapshots).map(({ sourceStatus: _sourceStatus, ...rows }) => rows),
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
  const writer = BENCHMARK_RAW_WRITERS.find((candidate) => candidate.table === table);
  if (writer == null) throw new Error(`Missing benchmark raw writer: ${table}`);
  writer.write(db, snapshots);
}
