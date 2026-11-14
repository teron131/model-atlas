/** Ingest contracts for raw caches, source snapshots, and the handoff into storage writers and payload readers. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import type { JsonObject } from "../runtime";
import type { ArtificialAnalysisBenchmarkResourceRow } from "./artificial-analysis/benchmark-resources";
import type { BenchmarkSnapshots } from "./benchmarks";
import type { ModelsDevFlatModel, ModelsDevPayload } from "./models-dev/catalog";
import type { RawSourceName } from "./registry";

export type ModelAtlasSourceHealthStatus = "cache_hit" | "fresh" | "using_cached_rows" | "empty";

export type ModelAtlasSourceQuarantine = {
  row_key: string;
  row_label: string | null;
  missing_from_source_since_epoch_seconds: number | null;
};

export type ModelAtlasSourceHealthEntry = {
  status: ModelAtlasSourceHealthStatus;
  last_fetch_epoch_seconds: number | null;
  source_input_count: number;
  active_row_count: number;
  quarantined_row_count: number;
  quarantined_rows: ModelAtlasSourceQuarantine[];
};

export type ModelAtlasSourceHealth = {
  generated_at_epoch_seconds: number | null;
  sources: Record<string, ModelAtlasSourceHealthEntry>;
};

export type SourceRefreshOptions = {
  /** Skip every cache hit, and let a usable fetch replace the cached rows instead of merging, so rows it omits are dropped rather than quarantined. */
  replaceSourceRows?: boolean;
};

/** `cache_hit` is read from the stored rows before any snapshot runs; `refreshed` is set from the snapshot's outcome. */
export type RawSourceCacheStatus = {
  last_fetch_epoch_seconds: number | null;
  source_input_count: number;
  cache_hit: boolean;
  refreshed: boolean;
};

export type SourceRowStatus = "active" | "quarantined_missing_from_source";

export type SourceRowState = {
  source: RawSourceName;
  row_key: string;
  row_label: string | null;
  status: SourceRowStatus;
  missing_from_source_since_epoch_seconds: number | null;
};

type BenchmarkObservationSnapshotRows = {
  [Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceRowsKey"]]: BenchmarkObservationRow[];
};

type BenchmarkObservationFetchedAt = {
  [Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceDataKey"]]:
    | number
    | null;
};

type SourceFetchedAt = BenchmarkObservationFetchedAt & {
  artificialAnalysis: number | null;
  artificialAnalysisBenchmarkResources: number | null;
};

export type SourceSnapshots = BenchmarkObservationSnapshotRows & {
  artificialAnalysisRawRows: JsonObject[];
  artificialAnalysisSelectedRows: JsonObject[];
  artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
  modelsDevPayload: ModelsDevPayload;
  modelsDevModels: ModelsDevFlatModel[];
  modelsDevFetchedAt: number | null;
  modelsDevStatusCode: number | null;
  benchmarks: BenchmarkSnapshots;
  sourceRowStates: SourceRowState[];
  fetchedAt: SourceFetchedAt;
};

export type SourceSnapshotStatus = {
  source: RawSourceName;
  fetchedAt: number | null;
  sourceInputCount: number;
  sourceRowStates: SourceRowState[];
  fetchedAtKey?: keyof SourceFetchedAt;
};
