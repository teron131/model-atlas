/** Benchmark source runtimes bind live loading, cached projection, snapshot refresh, and raw persistence. */

import type { DatabaseSync } from "node:sqlite";

import type { ModelAtlasSourceRows } from "../../ingest/assembly/source-data";
import type { CacheDbRow, CacheRowSource } from "../../ingest/cache/rows";
import type { RawSourceName, SnapshotTableName } from "../../ingest/source-registry";
import type {
  DatabaseBuildOptions,
  RawSourceCacheStatus,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../../ingest/types";
import type { DatabaseWriter } from "../../ingest/writers/database";
import {
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkRuntimeKey,
  type BenchmarkRuntimeKeyFor,
} from "../registry";
import { getAgentArenaStats } from "../scrapers/agent-arena";
import { getAgentsLastExamStats } from "../scrapers/agents-last-exam";
import { getAleBenchStats } from "../scrapers/ale-bench";
import { getBlueprintBenchStats } from "../scrapers/blueprint-bench";
import { getCursorBenchStats } from "../scrapers/cursorbench";
import { getDeepSWELeaderboardStats, preferredDeepSWELeaderboardRows } from "../scrapers/deep-swe";
import { getFrontierBenchStats } from "../scrapers/frontier-bench";
import { getFrontierCodeStats } from "../scrapers/frontier-code";
import { getMercorApexAgentsStats } from "../scrapers/mercor-apex-agents";
import { getRiemannBenchStats } from "../scrapers/surge/riemann-bench";
import { getHarveyLabStats } from "../scrapers/vals/harvey-lab";
import { getValsIndexStats } from "../scrapers/vals/index-benchmark";
import { getVendingBench2Stats } from "../scrapers/vending-bench-2";
import { agentArenaPersistence } from "./agent-arena";
import { agentsLastExamPersistence } from "./agents-last-exam";
import { aleBenchPersistence } from "./ale-bench";
import { blueprintBenchPersistence } from "./blueprint-bench";
import { cursorBenchPersistence } from "./cursorbench";
import { deepSWEPersistence } from "./deep-swe";
import { frontierBenchPersistence } from "./frontier-bench";
import { frontierCodePersistence } from "./frontier-code";
import { harveyLabPersistence } from "./harvey-lab";
import { mercorApexAgentsPersistence } from "./mercor-apex-agents";
import { insertBenchmarkObservationRows } from "./observation";
import { riemannBenchPersistence } from "./riemann-bench";
import { valsIndexPersistence } from "./vals-index";
import { vendingBench2Persistence } from "./vending-bench-2";

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

function benchmarkRuntime<
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
  agent_arena: benchmarkRuntime({
    ...agentArenaPersistence,
    sourceRowsKey: "agentArenaRows",
    loadSourceRows: async () => (await getAgentArenaStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.agentArenaModelScoreRows,
  }),
  agents_last_exam: benchmarkRuntime({
    ...agentsLastExamPersistence,
    sourceRowsKey: "agentsLastExamRows",
    loadSourceRows: async () => (await getAgentsLastExamStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.agentsLastExamModelScores,
  }),
  ale_bench: benchmarkRuntime({
    ...aleBenchPersistence,
    sourceRowsKey: "aleBenchConfigurationRows",
    loadSourceRows: async () => (await getAleBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.aleBenchConfigurationRows,
  }),
  blueprint_bench_2: benchmarkRuntime({
    ...blueprintBenchPersistence,
    sourceRowsKey: "blueprintBenchRows",
    loadSourceRows: async () => (await getBlueprintBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.blueprintBenchModelScoreRows,
  }),
  cursorbench: benchmarkRuntime({
    ...cursorBenchPersistence,
    sourceRowsKey: "cursorBenchRows",
    loadSourceRows: async () => (await getCursorBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.cursorBenchModelScoreRows,
  }),
  deep_swe: benchmarkRuntime({
    ...deepSWEPersistence,
    sourceRowsKey: "deepSWEEffortRows",
    loadSourceRows: async () => (await getDeepSWELeaderboardStats()).data,
    sourceRowsFromSnapshots: (snapshots) =>
      preferredDeepSWELeaderboardRows(snapshots.deepSWERawRows),
  }),
  frontier_bench: benchmarkRuntime({
    ...frontierBenchPersistence,
    sourceRowsKey: "frontierBenchRows",
    loadSourceRows: async () => (await getFrontierBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.frontierBenchRows,
  }),
  frontier_code: benchmarkRuntime({
    ...frontierCodePersistence,
    sourceRowsKey: "frontierCodeRows",
    loadSourceRows: async () => (await getFrontierCodeStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.frontierCodeRows,
  }),
  mercor_apex_agents: benchmarkRuntime({
    ...mercorApexAgentsPersistence,
    sourceRowsKey: "mercorApexAgentsRows",
    loadSourceRows: async () => (await getMercorApexAgentsStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.mercorApexAgentsRows,
  }),
  vending_bench_2: benchmarkRuntime({
    ...vendingBench2Persistence,
    sourceRowsKey: "vendingBench2Rows",
    loadSourceRows: async () => (await getVendingBench2Stats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.vendingBench2ModelScoreRows,
  }),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"standalone">, object>;

const SURGE_BENCHMARK_RUNTIMES = {
  riemann_bench: benchmarkRuntime({
    ...riemannBenchPersistence,
    sourceRowsKey: "riemannBenchRows",
    loadSourceRows: async () => (await getRiemannBenchStats()).data,
    sourceRowsFromSnapshots: (snapshots) => snapshots.riemannBenchModelScoreRows,
  }),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_BENCHMARK_RUNTIMES = {
  vals_harvey_lab: benchmarkRuntime({
    ...harveyLabPersistence,
    sourceRowsKey: "harveyLabRows",
    loadSourceRows: async () => (await getHarveyLabStats()).model_scores,
    sourceRowsFromSnapshots: (snapshots) => snapshots.harveyLabModelScoreRows,
  }),
  vals_index: benchmarkRuntime({
    ...valsIndexPersistence,
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

/** Fetch every custom benchmark through the same registry that owns its persisted runtime. */
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
