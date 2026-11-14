/** Bind each custom source's cache, snapshot, raw writer, and source-data lookup to its own slice of the shared records, so the registry derives every shared slot from the definition. */

import type { BenchmarkRuntimeKey } from "../benchmarks/registry";
import type { DatabaseWriter } from "../sqlite-utils";
import type { CacheRowSource } from "./cache/rows";
import { RAW_SOURCE_TABLES, type RawSourceName } from "./registry";
import type { SourceSnapshotRequest } from "./snapshots/row-snapshot";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceSnapshotStatus } from "./types";

/** `rows` are what matching reads; any other field is raw evidence only the runtime's own writer persists. */
export type BenchmarkSnapshot<Row> = {
  rows: Row[];
  sourceStatus: SourceSnapshotStatus;
};

type BenchmarkRuntime<
  Source extends BenchmarkRuntimeKey,
  Key extends string,
  Row,
  Cached,
  Snapshot extends BenchmarkSnapshot<Row>,
  Data,
> = {
  source: Source;
  key: Key;
  fetchRows: () => Promise<Row[]>;
  readCache: (cache: CacheRowSource) => Cached;
  snapshot: (request: SourceSnapshotRequest<Cached>) => Promise<Snapshot>;
  write: (db: DatabaseWriter, snapshot: Snapshot) => void;
  sourceData: (rows: Row[]) => Data;
};

/** Lift a runtime's per-source functions to the registry's shared records: caches and snapshots are keyed by source, live and restored rows by `${key}Rows`, source data by `key`. */
export function defineBenchmarkRuntime<
  const Source extends BenchmarkRuntimeKey,
  const Key extends string,
  Row,
  Cached,
  Snapshot extends BenchmarkSnapshot<Row>,
  Data,
>(runtime: BenchmarkRuntime<Source, Key, Row, Cached, Snapshot, Data>) {
  const rowsKey = `${runtime.key}Rows` as const;
  const snapshot = (
    cached: Cached,
    status: RawSourceCacheStatus,
    options: SourceRefreshOptions,
    previousMissingSince: ReadonlyMap<string, number>,
    nowEpochSeconds: number,
  ) =>
    runtime.snapshot({
      source: runtime.source,
      cached,
      status,
      options,
      previousMissingSince,
      nowEpochSeconds,
    });
  return {
    source: runtime.source,
    key: runtime.key,
    rowsKey,
    table: RAW_SOURCE_TABLES[runtime.source],
    fetchRows: runtime.fetchRows,
    readCache: runtime.readCache,
    snapshot,
    refresh: (
      caches: Record<Source, Cached>,
      statuses: Record<RawSourceName, RawSourceCacheStatus>,
      options: SourceRefreshOptions,
      previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
      nowEpochSeconds: number,
    ) =>
      snapshot(
        caches[runtime.source],
        statuses[runtime.source],
        options,
        previousMissingSince[runtime.source],
        nowEpochSeconds,
      ),
    write: (db: DatabaseWriter, snapshots: Record<Source, Snapshot>) =>
      runtime.write(db, snapshots[runtime.source]),
    sourceData: (rows: Record<typeof rowsKey, Row[]>) => runtime.sourceData(rows[rowsKey]),
  } as const;
}
