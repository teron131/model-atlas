/** The shared snapshot recipe for a source whose rows are a flat list: reuse the rows cached in the SQLite checkpoint on a cache hit, otherwise fetch, drop cached rows a new version supersedes, merge, and record rows the fetch omitted. */

import type { RawSourceName } from "../registry";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceRowState,
  SourceSnapshotStatus,
} from "../types";
import { snapshotRowsWithStates, type VersionRule, withoutSupersededVersions } from "./policy";

export type RawRowsCache<Row> = {
  rows: Row[];
  fetchedAt: number | null;
  sourceUrl?: string;
};

type SourceRowsPayload<Row> = {
  fetched_at_epoch_seconds: number | null;
  source_url?: string;
  data: Row[];
};

type RowIdentity<Row> =
  | { rowKey: (row: Row) => string | null }
  /** Builds keys from the rows the source currently publishes: the fetched rows, or the cached rows when nothing usable was fetched. */
  | { rowKeyFor: (currentRows: readonly Row[]) => (row: Row) => string | null };

/** What a refresh hands one source: its cached rows and status plus the lifecycle inputs. */
export type SourceSnapshotRequest<Cached> = {
  source: RawSourceName;
  cached: Cached;
  status: RawSourceCacheStatus;
  options: SourceRefreshOptions;
  previousMissingSince: ReadonlyMap<string, number>;
  nowEpochSeconds: number;
};

type SourceRowSnapshotConfig<Row> = RowIdentity<Row> &
  SourceSnapshotRequest<RawRowsCache<Row> | null | undefined> & {
    fetchRows: () => Promise<SourceRowsPayload<Row>>;
    acceptsRefresh?: (cachedRows: readonly Row[], fetchedRows: readonly Row[]) => boolean;
    replaceRowsOnRefresh?: boolean;
    /** Omitted for sources that publish no version. */
    versions?: VersionRule<Row>;
    rowLabel: (row: Row) => string | null;
    mergeRow?: (cachedRow: Row, fetchedRow: Row) => Row;
    seriesOf?: (row: Row) => string;
  };

type SourceRowSnapshotResult<Row> = {
  rows: Row[];
  sourceRowStates: SourceRowState[];
  fetchedAt: number | null;
  sourceUrl: string | null;
};

/** A harness distinguishes runs only when the current rows publish one run under several harness labels, a missing label counting as one; elsewhere it describes the run, so a changed label revises the row instead of quarantining it beside its replacement. */
export function harnessDistinguishesRuns<Row>(
  rows: readonly Row[],
  runOf: (row: Row) => string,
  harnessOf: (row: Row) => unknown,
): boolean {
  const harnessByRun = new Map<string, unknown>();
  for (const row of rows) {
    const run = runOf(row);
    const harness = harnessOf(row) ?? null;
    if (harnessByRun.has(run) && harnessByRun.get(run) !== harness) return true;
    harnessByRun.set(run, harness);
  }
  return false;
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

/** A scraper that throws is treated like one that returned no rows, so a refresh falls back to its cached evidence and a live load continues without it instead of failing as a whole. */
export async function fetchRowsOrNone<Row>(
  fetchRows: () => Promise<SourceRowsPayload<Row>>,
): Promise<SourceRowsPayload<Row>> {
  try {
    return await fetchRows();
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

export function sourceSnapshotStatus(
  source: RawSourceName,
  snapshot: {
    rows: readonly unknown[];
    fetchedAt: number | null;
    sourceRowStates: SourceSnapshotStatus["sourceRowStates"];
  },
): SourceSnapshotStatus {
  return {
    source,
    fetchedAt: snapshot.fetchedAt,
    sourceInputCount: snapshot.rows.length,
    sourceRowStates: snapshot.sourceRowStates,
  };
}

/** Reuses the cached rows only when `status.cache_hit` holds, a cache was read, and `replaceSourceRows` is unset; a caller forces a refetch by passing a cleared `cache_hit` or no cache. */
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
      rowKey: resolveRowKey(config, config.cached.rows),
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

  const loaded = await fetchRowsOrNone(config.fetchRows);
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
    rowKey: resolveRowKey(
      config,
      hasUsableFetchedRows ? fetched.data : (config.cached?.rows ?? []),
    ),
    rowLabel: config.rowLabel,
    mergeRow: config.mergeRow,
    seriesOf: config.seriesOf,
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

function resolveRowKey<Row>(identity: RowIdentity<Row>, currentRows: readonly Row[]) {
  return "rowKey" in identity ? identity.rowKey : identity.rowKeyFor(currentRows);
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
