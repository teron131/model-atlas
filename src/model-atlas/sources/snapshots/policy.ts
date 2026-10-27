/** Source snapshot policy preserves cached evidence, quarantines missing rows, and reports source health. */

import type { DatabaseSync } from "node:sqlite";

import { asNonEmptyString, asRecord } from "../../runtime";
import type { ModelsDevPayload } from "../models-dev/catalog";
import { RAW_SOURCE_NAMES, type RawSourceName } from "../registry";
import type {
  ModelAtlasSourceHealth,
  ModelAtlasSourceHealthEntry,
  ModelAtlasSourceHealthStatus,
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceRowState,
  SourceRowStatus,
} from "../types";

type SnapshotRowsConfig<T> = {
  source: RawSourceName;
  cachedRows: readonly T[] | undefined;
  fetchedRows: readonly T[];
  fetchedAtEpochSeconds: number | null;
  options: SourceRefreshOptions;
  rowKey: (row: T) => string | null;
  rowLabel: (row: T) => string | null;
  mergeRow?: (cachedRow: T, fetchedRow: T) => T;
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

/** Stable source-row keys are persisted, so every caller must use the same empty-part normalization. */
export function sourceRowKey(...parts: (number | string | null | undefined)[]): string {
  return parts.map((part) => String(part ?? "")).join("|");
}

/** Existing source evidence is monotonic: refreshes fill missing values but do not rewrite populated facts. */
export function mergeSourceEvidence<T>(cachedValue: T, fetchedValue: T): T {
  if (cachedValue == null) {
    return fetchedValue;
  }
  if (fetchedValue == null) {
    return cachedValue;
  }
  if (Array.isArray(cachedValue) && Array.isArray(fetchedValue)) {
    return (cachedValue.length > 0 ? cachedValue : fetchedValue) as T;
  }
  if (
    typeof cachedValue === "object" &&
    typeof fetchedValue === "object" &&
    !Array.isArray(cachedValue) &&
    !Array.isArray(fetchedValue)
  ) {
    const cached = cachedValue as Record<string, unknown>;
    const fetched = fetchedValue as Record<string, unknown>;
    return Object.fromEntries(
      [...new Set([...Object.keys(cached), ...Object.keys(fetched)])].map((key) => [
        key,
        mergeSourceEvidence(cached[key], fetched[key]),
      ]),
    ) as T;
  }
  return cachedValue;
}

/** Fresh keyed rows fill cached keyed rows while unkeyed rows stay in their original cache/fetch groups. */
export function mergeCachedSourceRows<T>(
  cachedRows: readonly T[],
  fetchedRows: readonly T[],
  rowKey: (row: T) => string | null,
  mergeRow: (cachedRow: T, fetchedRow: T) => T = mergeSourceEvidence,
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

/** Empty or failed refreshes keep cached rows unless the caller explicitly replaces source state. */
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
export type EditionRule<T> = {
  editionOf: (row: T) => unknown;
  seriesOf?: (row: T) => string;
};

/** A series whose refresh shares no published edition with its cached rows is a new edition, so its cached rows are dropped and the refresh replaces them instead of merging, keeping two editions off one scale. Rows without an edition take no part, and a partial refresh of a multi-artifact source still shares an edition, so it merges as usual. */
export function withoutSupersededEditions<T>(
  cachedRows: readonly T[],
  fetchedRows: readonly T[],
  { editionOf, seriesOf = () => "" }: EditionRule<T>,
): T[] {
  const editions = (rows: readonly T[], series: string) =>
    new Set(
      rows
        .filter((row) => seriesOf(row) === series)
        .map(editionOf)
        .filter((edition) => edition != null),
    );
  const supersededSeries = new Set(
    [...new Set(fetchedRows.map(seriesOf))].filter((series) => {
      const cached = editions(cachedRows, series);
      const fetched = editions(fetchedRows, series);
      return (
        cached.size > 0 && fetched.size > 0 && [...fetched].every((edition) => !cached.has(edition))
      );
    }),
  );
  return cachedRows.filter((row) => !supersededSeries.has(seriesOf(row)));
}

/** Preservation state records which known rows vanished without deleting their cached evidence immediately. */
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
  const context = {
    hasUsableFetchedRows,
    fetchedKeys,
    previousMissingSince: config.previousMissingSince,
    nowEpochSeconds: config.nowEpochSeconds,
    options: config.options,
  };
  const states = rows.flatMap((row) => {
    const key = config.rowKey(row);
    return key == null ? [] : [sourceRowState(config.source, key, config.rowLabel(row), context)];
  });
  return { rows, states };
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

export function persistedSourceRowStates(db: DatabaseSync): SourceRowState[] {
  return sourceRowStatesFromRows(
    db
      .prepare(
        "SELECT source, row_key, row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines",
      )
      .all(),
  );
}

export function sourceRowStatesFromRows(
  rows: readonly Record<string, unknown>[],
): SourceRowState[] {
  return rows.flatMap((stateRow) => {
    const state = asRecord(stateRow);
    const source =
      typeof state.source === "string" && RAW_SOURCE_NAMES.includes(state.source as RawSourceName)
        ? (state.source as RawSourceName)
        : null;
    const rowKeyValue = asNonEmptyString(state.row_key);
    const status =
      state.status === "active" || state.status === "quarantined_missing_from_source"
        ? state.status
        : null;
    if (source == null || rowKeyValue == null || status == null) {
      return [];
    }
    return [
      {
        source,
        row_key: rowKeyValue,
        row_label: asNonEmptyString(state.row_label),
        status,
        missing_from_source_since_epoch_seconds:
          typeof state.missing_from_source_since_epoch_seconds === "number"
            ? state.missing_from_source_since_epoch_seconds
            : null,
      },
    ];
  });
}

/** Missing-since maps keep quarantine age stable across refreshes that still omit the same source rows. */
export function missingSinceBySource(
  states: readonly SourceRowState[],
): Record<RawSourceName, Map<string, number>> {
  const missingSince = Object.fromEntries(
    RAW_SOURCE_NAMES.map((source) => [source, new Map<string, number>()]),
  ) as Record<RawSourceName, Map<string, number>>;
  for (const state of states) {
    if (
      state.status !== "quarantined_missing_from_source" ||
      state.missing_from_source_since_epoch_seconds == null
    ) {
      continue;
    }
    missingSince[state.source].set(state.row_key, state.missing_from_source_since_epoch_seconds);
  }
  return missingSince;
}

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

export function buildSourceHealth({
  generatedAtEpochSeconds,
  sourceCacheStatuses,
  sourceRowStates,
}: {
  generatedAtEpochSeconds: number | null;
  sourceCacheStatuses: Record<RawSourceName, RawSourceCacheStatus>;
  sourceRowStates: readonly SourceRowState[];
}): ModelAtlasSourceHealth {
  return {
    generated_at_epoch_seconds: generatedAtEpochSeconds,
    sources: Object.fromEntries(
      RAW_SOURCE_NAMES.map((source): [RawSourceName, ModelAtlasSourceHealthEntry] => {
        const status = sourceCacheStatuses[source];
        const counts = rowStateCounts(source, sourceRowStates);
        return [
          source,
          {
            status: healthStatusFromCache(status),
            last_fetch_epoch_seconds: status.last_fetch_epoch_seconds,
            source_input_count: status.source_input_count,
            active_row_count: counts.active,
            quarantined_row_count: counts.quarantinedRows.length,
            quarantined_rows: counts.quarantinedRows,
          },
        ];
      }),
    ),
  };
}

/** Summarizes active rows while retaining actionable quarantine identities and age. */
function rowStateCounts(source: RawSourceName, sourceRowStates: readonly SourceRowState[]) {
  let active = 0;
  const quarantinedRows = [];
  for (const state of sourceRowStates) {
    if (state.source !== source) {
      continue;
    }
    if (state.status === "quarantined_missing_from_source") {
      quarantinedRows.push({
        row_key: state.row_key,
        row_label: state.row_label,
        missing_from_source_since_epoch_seconds: state.missing_from_source_since_epoch_seconds,
      });
    } else {
      active += 1;
    }
  }
  quarantinedRows.sort(
    (left, right) =>
      (left.missing_from_source_since_epoch_seconds ?? Number.MAX_SAFE_INTEGER) -
        (right.missing_from_source_since_epoch_seconds ?? Number.MAX_SAFE_INTEGER) ||
      left.row_key.localeCompare(right.row_key),
  );
  return { active, quarantinedRows };
}

function healthStatusFromCache(status: RawSourceCacheStatus): ModelAtlasSourceHealthStatus {
  if (status.source_input_count <= 0) {
    return "empty";
  }
  if (status.refreshed) {
    return "fresh";
  }
  if (status.cache_hit) {
    return "cache_hit";
  }
  return "using_cached_rows";
}
