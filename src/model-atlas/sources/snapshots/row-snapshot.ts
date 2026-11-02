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

type RowIdentity<Row> =
  | { rowKey: (row: Row) => string | null }
  /** Builds keys from the rows the source currently publishes: the fetched rows, or the cached rows when nothing usable was fetched. */
  | { rowKeyFor: (currentRows: readonly Row[]) => (row: Row) => string | null };

type SourceRowSnapshotConfig<Row> = RowIdentity<Row> & {
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

/** Applies the harness rule per source series, since one benchmark can combine sources with different harness practices. The rule reads only the current rows, so a partial fetch that omits a multi-harness model merges that model's cached harness rows until a full fetch restores them. */
export function benchmarkObservationRowKeyFor(
  rows: readonly BenchmarkObservationRow[],
): (row: BenchmarkObservationRow) => string {
  const harnessSeries = new Set(
    [...new Set(rows.map((row) => row.source_url))].filter((sourceUrl) =>
      harnessDistinguishesRuns(
        rows.filter((row) => row.source_url === sourceUrl),
        (row) => benchmarkObservationRowKey(row, { harness: false }),
        (row) => row.metadata.harness,
      ),
    ),
  );
  return (row) => benchmarkObservationRowKey(row, { harness: harnessSeries.has(row.source_url) });
}

/** Uses stable model identity rather than mutable source labels across benchmark row variants. */
export function benchmarkObservationRowKey(
  row: BenchmarkObservationRow,
  { harness = true }: { harness?: boolean } = {},
): string {
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
    harness ? metadataIdentity("harness") : null,
    metadataIdentity("source_model_id") ??
      metadataIdentity("source_model") ??
      metadataIdentity("internal_model_name"),
    metadataIdentity("run_id"),
    row.model_id ?? baseModel,
    row.model_creator,
    row.reasoning_effort ?? parsedModel.reasoningEffort,
  );
}

/** Retain cached evidence while adopting the current source's normalized display identity; a row reported under another harness is a rerun, so it replaces the cached row. */
export function mergeBenchmarkObservationRow(
  cachedRow: BenchmarkObservationRow,
  fetchedRow: BenchmarkObservationRow,
): BenchmarkObservationRow {
  if ((cachedRow.metadata.harness ?? null) !== (fetchedRow.metadata.harness ?? null)) {
    return fetchedRow;
  }
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
