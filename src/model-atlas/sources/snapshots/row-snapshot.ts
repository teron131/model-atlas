/** Generic source-row snapshot lifecycle for cache-aware fetched payloads. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { parseModelEffort } from "../../identity/normalization";
import type { RawSourceName } from "../registry";
import type { RawSourceCacheStatus, SourceRefreshOptions, SourceRowState } from "../types";
import {
  mergeSourceEvidence,
  snapshotRowsWithStates,
  sourceRowKey,
  type VersionRule,
  withoutSupersededVersions,
} from "./policy";

type RawRowsCache<Row> = {
  rows: Row[];
  fetchedAt: number | null;
  sourceUrl?: string;
};

type SourceRowsPayload<Row> = {
  fetched_at_epoch_seconds: number | null;
  source_url?: string;
  data: Row[];
};

type SourceRowSnapshotConfig<Row> = {
  source: RawSourceName;
  cached: RawRowsCache<Row> | null | undefined;
  status: RawSourceCacheStatus;
  options: SourceRefreshOptions;
  previousMissingSince: ReadonlyMap<string, number>;
  nowEpochSeconds: number;
  fetchRows: () => Promise<SourceRowsPayload<Row>>;
  acceptsRefresh?: (cachedRows: readonly Row[], fetchedRows: readonly Row[]) => boolean;
  replaceRowsOnRefresh?: boolean;
  /** Omitted for sources that publish no version. */
  versions?: VersionRule<Row>;
  rowKey: (row: Row) => string | null;
  rowLabel: (row: Row) => string | null;
  mergeRow?: (cachedRow: Row, fetchedRow: Row) => Row;
};

type SourceRowSnapshotResult<Row> = {
  rows: Row[];
  sourceRowStates: SourceRowState[];
  fetchedAt: number | null;
  sourceUrl: string | null;
};

/** Uses stable model identity rather than mutable source labels across benchmark row variants. */
export function benchmarkObservationRowKey(row: BenchmarkObservationRow): string {
  const parsedModel = parseModelEffort(row.model);
  const baseModel = row.base_model === row.model ? parsedModel.baseModel : row.base_model;
  const metadataIdentity = (key: string): string | number | null => {
    const value = row.metadata[key];
    return typeof value === "string" || typeof value === "number" ? value : null;
  };
  return sourceRowKey(
    row.benchmark_key,
    metadataIdentity("task"),
    metadataIdentity("track"),
    metadataIdentity("harness"),
    metadataIdentity("source_model_id") ??
      metadataIdentity("source_model") ??
      metadataIdentity("internal_model_name"),
    metadataIdentity("run_id"),
    row.model_id ?? baseModel,
    row.model_creator,
    row.reasoning_effort ?? parsedModel.reasoningEffort,
  );
}

/** Retain cached evidence while adopting the current source's normalized display identity. */
export function mergeBenchmarkObservationRow(
  cachedRow: BenchmarkObservationRow,
  fetchedRow: BenchmarkObservationRow,
): BenchmarkObservationRow {
  return {
    ...mergeSourceEvidence(cachedRow, fetchedRow),
    model: fetchedRow.model,
    base_model: fetchedRow.base_model,
    reasoning_effort: fetchedRow.reasoning_effort,
  };
}

export function shouldUseFetchedRows(
  fetchedAtEpochSeconds: number | null,
  rowCount: number,
): boolean {
  return fetchedAtEpochSeconds != null && rowCount > 0;
}

/** Preserve cached timestamps when a refresh fails to return usable rows. */
export function snapshotFetchedAt(
  hasUsableFetchedRows: boolean,
  cachedFetchedAt: number | null | undefined,
  fetchedAtEpochSeconds: number | null,
): number | null {
  return hasUsableFetchedRows || cachedFetchedAt == null ? fetchedAtEpochSeconds : cachedFetchedAt;
}

/** Loads one row source from cache or fetches it while preserving missing-row state. */
export async function snapshotSourceRows<Row>(
  config: SourceRowSnapshotConfig<Row>,
): Promise<SourceRowSnapshotResult<Row>> {
  if (
    config.status.cache_hit &&
    config.cached != null &&
    config.options.replaceSourceRows !== true
  ) {
    const cachedSnapshot = snapshotRowsWithStates({
      source: config.source,
      cachedRows: config.cached.rows,
      fetchedRows: [],
      fetchedAtEpochSeconds: null,
      options: config.options,
      rowKey: config.rowKey,
      rowLabel: config.rowLabel,
      mergeRow: config.mergeRow,
      previousMissingSince: config.previousMissingSince,
      nowEpochSeconds: config.nowEpochSeconds,
    });
    return {
      rows: cachedSnapshot.rows,
      sourceRowStates: cachedSnapshot.states,
      fetchedAt: config.cached.fetchedAt,
      sourceUrl: config.cached.sourceUrl ?? null,
    };
  }

  // A scraper that throws is treated like one that returned no rows, so it falls back to its cached evidence instead of failing the whole refresh.
  const loaded = await config
    .fetchRows()
    .catch((): SourceRowsPayload<Row> => ({ fetched_at_epoch_seconds: null, data: [] }));
  // A delayed alternate publication must not make newer cached evidence disappear or look newly fetched.
  const fetched: SourceRowsPayload<Row> =
    config.cached != null &&
    shouldUseFetchedRows(loaded.fetched_at_epoch_seconds, loaded.data.length) &&
    config.acceptsRefresh?.(config.cached.rows, loaded.data) === false
      ? { fetched_at_epoch_seconds: null, data: [] }
      : loaded;
  const hasUsableFetchedRows = shouldUseFetchedRows(
    fetched.fetched_at_epoch_seconds,
    fetched.data.length,
  );
  const snapshot = snapshotRowsWithStates({
    source: config.source,
    cachedRows:
      hasUsableFetchedRows && config.cached != null && config.versions != null
        ? withoutSupersededVersions(config.cached.rows, fetched.data, config.versions)
        : config.cached?.rows,
    fetchedRows: fetched.data,
    fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
    options:
      hasUsableFetchedRows && config.replaceRowsOnRefresh
        ? { ...config.options, replaceSourceRows: true }
        : config.options,
    rowKey: config.rowKey,
    rowLabel: config.rowLabel,
    mergeRow: config.mergeRow,
    previousMissingSince: config.previousMissingSince,
    nowEpochSeconds: config.nowEpochSeconds,
  });
  return {
    rows: snapshot.rows,
    sourceRowStates: snapshot.states,
    fetchedAt: snapshotFetchedAt(
      hasUsableFetchedRows,
      config.cached?.fetchedAt,
      fetched.fetched_at_epoch_seconds,
    ),
    sourceUrl: snapshotSourceUrl(
      hasUsableFetchedRows,
      config.cached?.sourceUrl,
      fetched.source_url,
    ),
  };
}

/** Keep provenance aligned with the source rows selected for the snapshot. */
function snapshotSourceUrl(
  hasUsableFetchedRows: boolean,
  cachedSourceUrl: string | undefined,
  fetchedSourceUrl: string | undefined,
): string | null {
  return hasUsableFetchedRows || cachedSourceUrl == null
    ? (fetchedSourceUrl ?? null)
    : cachedSourceUrl;
}
