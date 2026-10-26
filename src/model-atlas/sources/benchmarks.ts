/** Benchmark runtime registry coordinates live loading, cache reconstruction, snapshot refresh, and raw persistence. */

import type { DatabaseSync } from "node:sqlite";

import {
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkRuntimeKey,
  type BenchmarkRuntimeKeyFor,
} from "../benchmarks/registry";
import type { SnapshotTableName } from "../database/tables";
import type { DatabaseWriter } from "../database/writers/database";
import { agentsLastExamRuntime } from "./agents-last-exam/runtime";
import { aleBenchRuntime } from "./ale-bench/runtime";
import { arenaAgentRuntime } from "./arena/agent-runtime";
import type { ModelAtlasSourceRows } from "./assembly/source-data";
import { blueprintBenchRuntime } from "./blueprint-bench/runtime";
import { deepSWERuntime } from "./deep-swe/runtime";
import { frontierCodeRuntime } from "./frontier-code/runtime";
import { insertBenchmarkObservationRows } from "./observations/cache";
import type { RawSourceName } from "./registry";
import { riemannBenchRuntime } from "./surge/riemann-runtime";
import { terminalBench4Runtime } from "./terminal-bench-4/runtime";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshots } from "./types";
import { valsIndexRuntime } from "./vals/index-runtime";
import { vendingBench2Runtime } from "./vending-bench-2/runtime";

const STANDALONE_BENCHMARK_RUNTIMES = {
  agents_last_exam: agentsLastExamRuntime,
  ale_bench: aleBenchRuntime,
  arena_agent: arenaAgentRuntime,
  blueprint_bench_2: blueprintBenchRuntime,
  deep_swe: deepSWERuntime,
  frontier_code: frontierCodeRuntime,
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

export async function fetchBenchmarkSourceRows(): Promise<BenchmarkSourceRows> {
  const entries = await Promise.all(
    Object.values(BENCHMARK_RUNTIMES).map(async (runtime) => [
      runtime.sourceRowsKey,
      await runtime.loadSourceRows(),
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkSourceRows;
}

export function benchmarkSourceRowsFromSnapshots(snapshots: SourceSnapshots): BenchmarkSourceRows {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [
      runtime.sourceRowsKey,
      runtime.sourceRowsFromSnapshots(snapshots),
    ]),
  ) as BenchmarkSourceRows;
}

export function readBenchmarkSnapshotCaches(db: DatabaseSync): BenchmarkSnapshotCaches {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [runtime.cacheKey, runtime.readCache(db)]),
  ) as BenchmarkSnapshotCaches;
}

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

export function benchmarkSnapshotRows(snapshots: BenchmarkSnapshots): BenchmarkSnapshotRows {
  return Object.assign(
    {},
    ...Object.values(snapshots).map(({ sourceStatus: _sourceStatus, ...rows }) => rows),
  ) as BenchmarkSnapshotRows;
}
