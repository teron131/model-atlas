/** Benchmark runtime registry coordinates live loading, cache reconstruction, snapshot refresh, and raw persistence. */

import type { DatabaseSync } from "node:sqlite";

import {
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkRuntimeKey,
  type BenchmarkRuntimeKeyFor,
} from "../benchmarks/registry";
import type { SnapshotTableName } from "../database/tables";
import type { DatabaseWriter } from "../database/writers/database";
import { agentArenaRuntime } from "./agent-arena/runtime";
import { agentsLastExamRuntime } from "./agents-last-exam/runtime";
import { aleBenchRuntime } from "./ale-bench/runtime";
import type { ModelAtlasSourceRows } from "./assembly/source-data";
import { blueprintBenchRuntime } from "./blueprint-bench/runtime";
import { cursorBenchRuntime } from "./cursorbench/runtime";
import { deepSWERuntime } from "./deep-swe/runtime";
import { frontierCodeRuntime } from "./frontier-code/runtime";
import { mercorApexAgentsRuntime } from "./mercor-apex-agents/runtime";
import { insertBenchmarkObservationRows } from "./observations/cache";
import type { RawSourceName } from "./registry";
import { riemannBenchRuntime } from "./surge/riemann-runtime";
import { terminalBench4Runtime } from "./terminal-bench-4/runtime";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshots } from "./types";
import { valsIndexRuntime } from "./vals/index-runtime";
import { vendingBench2Runtime } from "./vending-bench-2/runtime";

/** Standalone source runtimes share orchestration while retaining independent implementations. */
const STANDALONE_BENCHMARK_RUNTIMES = {
  agent_arena: agentArenaRuntime,
  agents_last_exam: agentsLastExamRuntime,
  ale_bench: aleBenchRuntime,
  blueprint_bench_2: blueprintBenchRuntime,
  cursorbench: cursorBenchRuntime,
  deep_swe: deepSWERuntime,
  frontier_code: frontierCodeRuntime,
  mercor_apex_agents: mercorApexAgentsRuntime,
  terminal_bench_4: terminalBench4Runtime,
  vending_bench_2: vendingBench2Runtime,
} as const satisfies Record<BenchmarkRuntimeKeyFor<"standalone">, object>;

const SURGE_BENCHMARK_RUNTIMES = {
  riemann_bench: riemannBenchRuntime,
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_BENCHMARK_RUNTIMES = {
  vals_index: valsIndexRuntime,
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
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [runtime.cacheKey, runtime.readCache(db)]),
  ) as BenchmarkSnapshotCaches;
}

/** Refresh every benchmark through its registered source-specific implementation. */
export async function refreshBenchmarkSnapshots(
  caches: BenchmarkSnapshotCaches,
  statuses: Record<RawSourceName, RawSourceCacheStatus>,
  options: SourceRefreshOptions,
  previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
  nowEpochSeconds: number,
): Promise<BenchmarkSnapshots> {
  const entries = await Promise.all(
    (Object.entries(BENCHMARK_RUNTIMES) as [BenchmarkRuntimeKey, BenchmarkRuntimeValue][]).map(
      async ([key, runtime]) => [
        key,
        await runtime.refresh(caches, statuses, options, previousMissingSince, nowEpochSeconds),
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
