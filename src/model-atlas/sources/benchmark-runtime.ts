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
    options: SourceRefreshOptions,
    previousMissingSince: ReadonlyMap<string, number>,
    nowEpochSeconds: number,
  ) => Promise<Snapshot>;
  write: (db: DatabaseWriter, snapshots: SourceSnapshots) => void;
};

/** Preserve the source descriptor and bind correlated cache access before heterogeneous runtimes enter the registry. */
export function defineBenchmarkRuntime<
  const SourceRowsKey extends keyof ModelAtlasSourceRows,
  const CacheKey extends string,
  const Source extends RawSourceName,
  Cached,
  Snapshot extends { sourceStatus: SourceSnapshotStatus },
>(runtime: BenchmarkRuntime<SourceRowsKey, CacheKey, Source, Cached, Snapshot>) {
  return {
    ...runtime,
    refresh: (
      caches: Record<CacheKey, Cached>,
      statuses: Record<RawSourceName, RawSourceCacheStatus>,
      options: SourceRefreshOptions,
      previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
      nowEpochSeconds: number,
    ) =>
      runtime.snapshot(
        caches[runtime.cacheKey],
        statuses[runtime.source],
        options,
        previousMissingSince[runtime.source],
        nowEpochSeconds,
      ),
  } as const;
}
