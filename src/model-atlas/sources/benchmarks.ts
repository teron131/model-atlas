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
import { frontierCodeRuntime } from "./frontier-code/runtime";
import { insertBenchmarkObservationRows } from "./observations/cache";
import type { RawSourceName } from "./registry";
import { riemannBenchRuntime } from "./surge/riemann-runtime";
import { terminalBench4Runtime } from "./terminal-bench-4/runtime";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshots } from "./types";
import { valsIndexRuntime } from "./vals/index-runtime";
import { vendingBench2Runtime } from "./vending-bench-2/runtime";

type RuntimesBySource<Source extends BenchmarkRuntimeKey> = { [Key in Source]: { source: Key } };

const STANDALONE_BENCHMARK_RUNTIMES = {
  agents_last_exam: agentsLastExamRuntime,
  ale_bench: aleBenchRuntime,
  arena_agent: arenaAgentRuntime,
  frontier_code: frontierCodeRuntime,
  terminal_bench_4: terminalBench4Runtime,
  vending_bench_2: vendingBench2Runtime,
} as const satisfies RuntimesBySource<BenchmarkRuntimeKeyFor<"standalone">>;

const SURGE_BENCHMARK_RUNTIMES = {
  riemann_bench: riemannBenchRuntime,
} as const satisfies RuntimesBySource<BenchmarkRuntimeKeyFor<"surge">>;

const VALS_BENCHMARK_RUNTIMES = {
  vals_index: valsIndexRuntime,
} as const satisfies RuntimesBySource<BenchmarkRuntimeKeyFor<"vals">>;

const BENCHMARK_RUNTIMES = {
  ...SURGE_BENCHMARK_RUNTIMES,
  ...VALS_BENCHMARK_RUNTIMES,
  ...STANDALONE_BENCHMARK_RUNTIMES,
} as const;

type BenchmarkRuntimes = typeof BENCHMARK_RUNTIMES;

export type BenchmarkSnapshotCaches = {
  [Source in BenchmarkRuntimeKey]: ReturnType<BenchmarkRuntimes[Source]["readCache"]>;
};

export type BenchmarkSnapshots = {
  [Source in BenchmarkRuntimeKey]: Awaited<ReturnType<BenchmarkRuntimes[Source]["snapshot"]>>;
};

export type BenchmarkSourceRows = {
  [Source in BenchmarkRuntimeKey as BenchmarkRuntimes[Source]["rowsKey"]]: Awaited<
    ReturnType<BenchmarkRuntimes[Source]["fetchRows"]>
  >;
};

export type BenchmarkSourceData = {
  [Source in BenchmarkRuntimeKey as BenchmarkRuntimes[Source]["key"]]: ReturnType<
    BenchmarkRuntimes[Source]["sourceData"]
  >;
};

type BenchmarkRawWriter = {
  table: SnapshotTableName;
  write: (db: DatabaseWriter, snapshots: SourceSnapshots) => void;
};

/** Compose custom-source and catalog-observation writers from the same runtime ownership map. */
export const BENCHMARK_RAW_WRITERS = [
  ...Object.values(BENCHMARK_RUNTIMES).map((runtime) => ({
    table: runtime.table,
    write: (db: DatabaseWriter, snapshots: SourceSnapshots) =>
      runtime.write(db, snapshots.benchmarks),
  })),
  {
    table: BENCHMARK_OBSERVATION_RAW_TABLE,
    write: insertBenchmarkObservationRows,
  },
] satisfies readonly BenchmarkRawWriter[];

export async function fetchBenchmarkSourceRows(): Promise<BenchmarkSourceRows> {
  const entries = await Promise.all(
    Object.values(BENCHMARK_RUNTIMES).map(async (runtime) => [
      runtime.rowsKey,
      // A runtime whose scraper throws contributes no rows, matching the snapshot path's fallback in snapshotSourceRows.
      await runtime.fetchRows().catch(() => []),
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkSourceRows;
}

export function benchmarkSourceRowsFromSnapshots(
  snapshots: BenchmarkSnapshots,
): BenchmarkSourceRows {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [
      runtime.rowsKey,
      snapshots[runtime.source].rows,
    ]),
  ) as BenchmarkSourceRows;
}

export function buildBenchmarkSourceData(rows: BenchmarkSourceRows): BenchmarkSourceData {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [runtime.key, runtime.sourceData(rows)]),
  ) as BenchmarkSourceData;
}

export function readBenchmarkSnapshotCaches(db: DatabaseSync): BenchmarkSnapshotCaches {
  return Object.fromEntries(
    Object.values(BENCHMARK_RUNTIMES).map((runtime) => [runtime.source, runtime.readCache(db)]),
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
    Object.values(BENCHMARK_RUNTIMES).map(async (runtime) => [
      runtime.source,
      await runtime.refresh(caches, statuses, options, previousMissingSince, nowEpochSeconds),
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkSnapshots;
}
