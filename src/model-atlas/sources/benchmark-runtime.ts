/** Bind each custom source's typed cache to its refresh workflow so callers never pair unrelated cache shapes. */

import type { SnapshotTableName } from "../database/tables";
import type { DatabaseWriter } from "../database/writers/database";
import type { ModelAtlasSourceRows } from "./assembly/source-data";
import type { CacheRowSource } from "./cache/rows";
import type { RawSourceName } from "./registry";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "./types";

type BenchmarkRuntime<
  SourceRowsKey extends keyof ModelAtlasSourceRows,
  CacheKey extends keyof SourceSnapshots["fetchedAt"],
  Source extends RawSourceName,
  Cached,
  Snapshot extends { sourceStatus: SourceSnapshotStatus },
> = {
  sourceRowsKey: SourceRowsKey;
  fetchSourceRows: () => Promise<ModelAtlasSourceRows[SourceRowsKey]>;
  sourceRowsFromSnapshots: (snapshots: SourceSnapshots) => ModelAtlasSourceRows[SourceRowsKey];
  cacheKey: CacheKey;
  source: Source;
  table: SnapshotTableName;
  readCache: (cache: CacheRowSource) => Cached;
  snapshot: (
    cached: Cached,
    status: RawSourceCacheStatus,
    options: SourceRefreshOptions,
    previousMissingSince: ReadonlyMap<string, number>,
    nowEpochSeconds: number,
    context: BenchmarkSnapshotContext,
  ) => Promise<Snapshot>;
  write: (db: DatabaseWriter, snapshots: SourceSnapshots) => void;
};

export type BenchmarkSnapshotContext = {
  source: RawSourceName;
  sourceStatus: (snapshot: {
    rows: readonly unknown[];
    fetchedAt: number | null;
    sourceRowStates: SourceSnapshotStatus["sourceRowStates"];
  }) => SourceSnapshotStatus;
};

/** Preserve the source descriptor and bind correlated cache access before heterogeneous runtimes enter the registry. */
export function defineBenchmarkRuntime<
  const SourceRowsKey extends keyof ModelAtlasSourceRows,
  const CacheKey extends keyof SourceSnapshots["fetchedAt"],
  const Source extends RawSourceName,
  Cached,
  Snapshot extends { sourceStatus: SourceSnapshotStatus },
>(runtime: BenchmarkRuntime<SourceRowsKey, CacheKey, Source, Cached, Snapshot>) {
  const context: BenchmarkSnapshotContext = {
    source: runtime.source,
    sourceStatus: (snapshot) => ({
      source: runtime.source,
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: runtime.cacheKey,
    }),
  };
  const snapshot = (
    cached: Cached,
    status: RawSourceCacheStatus,
    options: SourceRefreshOptions,
    previousMissingSince: ReadonlyMap<string, number>,
    nowEpochSeconds: number,
  ) => runtime.snapshot(cached, status, options, previousMissingSince, nowEpochSeconds, context);
  return {
    ...runtime,
    snapshot,
    refresh: (
      caches: Record<CacheKey, Cached>,
      statuses: Record<RawSourceName, RawSourceCacheStatus>,
      options: SourceRefreshOptions,
      previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
      nowEpochSeconds: number,
    ) =>
      snapshot(
        caches[runtime.cacheKey],
        statuses[runtime.source],
        options,
        previousMissingSince[runtime.source],
        nowEpochSeconds,
      ),
  } as const;
}
