/**
 * Row-level refresh policy for one source: how fetched rows merge into the cached rows, which cached rows a new published version supersedes, and how rows a source stops listing are quarantined and, after a grace period, withdrawn.
 * models.dev is the exception: its rows are quarantined but never withdrawn (see `buildModelsDevSourceStates`).
 */

import type { ModelsDevPayload } from "../models-dev/catalog";
import type { RawSourceName } from "../registry";
import type { SourceRefreshOptions, SourceRowState, SourceRowStatus } from "../types";

type SnapshotRowsConfig<T> = {
  source: RawSourceName;
  cachedRows: readonly T[] | undefined;
  fetchedRows: readonly T[];
  fetchedAtEpochSeconds: number | null;
  options: SourceRefreshOptions;
  rowKey: (row: T) => string | null;
  rowLabel: (row: T) => string | null;
  mergeRow?: (cachedRow: T, fetchedRow: T) => T;
  /** The URL or page a row was fetched from, for sources that combine several; defaults to one series. */
  seriesOf?: (row: T) => string;
  previousMissingSince: ReadonlyMap<string, number>;
  nowEpochSeconds: number;
};

type SnapshotRowsResult<T> = {
  rows: T[];
  states: SourceRowState[];
};

type RowStateContext = {
  hasUsableFetchedRows: boolean;
  fetchedKeys: ReadonlySet<string>;
  previousMissingSince: ReadonlyMap<string, number>;
  nowEpochSeconds: number;
  options: SourceRefreshOptions;
};

/** A row missing from a working fetch keeps scoring this long, so one partial page cannot erase it; after that the source has withdrawn it. */
const MISSING_ROW_GRACE_SECONDS = 24 * 60 * 60;

/** Stable source-row keys are persisted, so every caller must use the same empty-part normalization. */
export function sourceRowKey(...parts: (number | string | null | undefined)[]): string {
  return parts.map((part) => String(part ?? "")).join("|");
}

/** A fetched row replaces the cached row with its key unless `mergeRow` says otherwise; unkeyed rows stay in their original cache/fetch groups. */
export function mergeCachedSourceRows<T>(
  cachedRows: readonly T[],
  fetchedRows: readonly T[],
  rowKey: (row: T) => string | null,
  mergeRow: (cachedRow: T, fetchedRow: T) => T = (_cachedRow, fetchedRow) => fetchedRow,
): T[] {
  const keyedRows = new Map<string, T>();
  const unkeyedCachedRows: T[] = [];
  const unkeyedFetchedRows: T[] = [];

  for (const row of cachedRows) {
    const key = rowKey(row);
    if (key == null) {
      unkeyedCachedRows.push(row);
      continue;
    }
    const cachedRow = keyedRows.get(key);
    keyedRows.set(key, cachedRow == null ? row : mergeRow(cachedRow, row));
  }

  for (const row of fetchedRows) {
    const key = rowKey(row);
    if (key == null) {
      unkeyedFetchedRows.push(row);
      continue;
    }
    const cachedRow = keyedRows.get(key);
    keyedRows.set(key, cachedRow == null ? row : mergeRow(cachedRow, row));
  }

  return [...unkeyedCachedRows, ...keyedRows.values(), ...unkeyedFetchedRows];
}

/** An empty or failed refresh keeps the cached rows even under `replaceSourceRows`; a usable refresh merges into them by key, or replaces them outright under `replaceSourceRows`. */
export function snapshotRows<T>(
  cachedRows: readonly T[] | undefined,
  fetchedRows: readonly T[],
  fetchedAtEpochSeconds: number | null,
  options: SourceRefreshOptions,
  rowKey: (row: T) => string | null,
  mergeRow?: (cachedRow: T, fetchedRow: T) => T,
): T[] {
  if (fetchedAtEpochSeconds == null || fetchedRows.length === 0) {
    return cachedRows == null
      ? [...fetchedRows]
      : mergeCachedSourceRows(cachedRows, [], rowKey, mergeRow);
  }
  if (cachedRows == null || options.replaceSourceRows === true) {
    return [...fetchedRows];
  }
  return mergeCachedSourceRows(cachedRows, fetchedRows, rowKey, mergeRow);
}

/** Where a source's rows record their published version, and which rows share one, such as each benchmark of a multi-benchmark source; the whole source is one series by default. */
export type VersionRule<T> = {
  versionOf: (row: T) => unknown;
  seriesOf?: (row: T) => string;
};

/** A series whose refresh shares no published version with its cached rows is a new version, so its cached rows are dropped and the refresh replaces them instead of merging, keeping two versions off one scale. Rows without a version take no part, and a partial refresh of a multi-artifact source still shares a version, so it merges as usual. */
export function withoutSupersededVersions<T>(
  cachedRows: readonly T[],
  fetchedRows: readonly T[],
  { versionOf, seriesOf = () => "" }: VersionRule<T>,
): T[] {
  const versions = (rows: readonly T[], series: string) =>
    new Set(
      rows
        .filter((row) => seriesOf(row) === series)
        .map(versionOf)
        .filter((version) => version != null),
    );
  const supersededSeries = new Set(
    [...new Set(fetchedRows.map(seriesOf))].filter((series) => {
      const cached = versions(cachedRows, series);
      const fetched = versions(fetchedRows, series);
      return (
        cached.size > 0 && fetched.size > 0 && [...fetched].every((version) => !cached.has(version))
      );
    }),
  );
  return cachedRows.filter((row) => !supersededSeries.has(seriesOf(row)));
}

/** A row a working fetch omits is quarantined and keeps scoring for a grace period, then is dropped. A series the fetch returned nothing for, like a failed fetch, is no evidence of withdrawal, so its rows keep their state. */
export function snapshotRowsWithStates<T>(config: SnapshotRowsConfig<T>): SnapshotRowsResult<T> {
  const hasUsableFetchedRows =
    config.fetchedAtEpochSeconds != null && config.fetchedRows.length > 0;
  const rows = snapshotRows(
    config.cachedRows,
    config.fetchedRows,
    config.fetchedAtEpochSeconds,
    config.options,
    config.rowKey,
    config.mergeRow,
  );
  const fetchedKeys = new Set(
    hasUsableFetchedRows
      ? config.fetchedRows
          .map((row) => config.rowKey(row))
          .filter((key): key is string => key != null)
      : [],
  );
  const seriesOf = config.seriesOf ?? (() => "");
  const fetchedSeries = new Set(hasUsableFetchedRows ? config.fetchedRows.map(seriesOf) : []);
  const retained = rows.flatMap((row): { row: T; state: SourceRowState | null }[] => {
    const key = config.rowKey(row);
    if (key == null) return [{ row, state: null }];
    const seriesFetched = fetchedSeries.has(seriesOf(row));
    const state = sourceRowState(config.source, key, config.rowLabel(row), {
      hasUsableFetchedRows: seriesFetched,
      fetchedKeys,
      previousMissingSince: config.previousMissingSince,
      nowEpochSeconds: config.nowEpochSeconds,
      options: config.options,
    });
    const withdrawn =
      seriesFetched &&
      state.missing_from_source_since_epoch_seconds != null &&
      config.nowEpochSeconds - state.missing_from_source_since_epoch_seconds >=
        MISSING_ROW_GRACE_SECONDS;
    return withdrawn ? [] : [{ row, state }];
  });
  return {
    rows: retained.map(({ row }) => row),
    states: retained.flatMap(({ state }) => (state == null ? [] : [state])),
  };
}

/** A usable refresh that omits a row quarantines it, a failed refresh keeps an earlier quarantine, and a quarantined row keeps its first missing time. */
function sourceRowState(
  source: RawSourceName,
  rowKey: string,
  rowLabel: string | null,
  context: RowStateContext,
): SourceRowState {
  const isMissingNow =
    context.hasUsableFetchedRows &&
    !context.fetchedKeys.has(rowKey) &&
    context.options.replaceSourceRows !== true;
  const status: SourceRowStatus =
    isMissingNow || (!context.hasUsableFetchedRows && context.previousMissingSince.has(rowKey))
      ? "quarantined_missing_from_source"
      : "active";
  return {
    source,
    row_key: rowKey,
    row_label: rowLabel,
    status,
    missing_from_source_since_epoch_seconds:
      status === "quarantined_missing_from_source"
        ? (context.previousMissingSince.get(rowKey) ?? context.nowEpochSeconds)
        : null,
  };
}

/** Quarantine states for models.dev models, keyed by provider and model; nothing here withdraws a row after the grace period, and `modelsDevSnapshot` keeps omitted models in the payload. */
export function buildModelsDevSourceStates(
  payload: ModelsDevPayload,
  fetchedPayload: ModelsDevPayload | null,
  hasUsableFetchedRows: boolean,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
  options: SourceRefreshOptions,
): SourceRowState[] {
  const fetchedKeys = new Set<string>();
  if (hasUsableFetchedRows) {
    for (const [providerId, provider] of Object.entries(fetchedPayload ?? {})) {
      for (const modelId of Object.keys(provider.models ?? {})) {
        fetchedKeys.add(sourceRowKey(providerId, modelId));
      }
    }
  }
  const context = {
    hasUsableFetchedRows,
    fetchedKeys,
    previousMissingSince,
    nowEpochSeconds,
    options,
  };
  const states: SourceRowState[] = [];
  for (const [providerId, provider] of Object.entries(payload)) {
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      states.push(
        sourceRowState(
          "models_dev",
          sourceRowKey(providerId, modelId),
          typeof model.name === "string" && model.name.length > 0 ? model.name : modelId,
          context,
        ),
      );
    }
  }
  return states;
}
