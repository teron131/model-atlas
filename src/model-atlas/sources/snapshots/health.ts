/** Source health and quarantine records: reads and writes the quarantine table that carries a missing row's age across refreshes, and builds and stores the per-source health report. */

import type { DatabaseSync } from "node:sqlite";

import { asNonEmptyString, asRecord } from "../../runtime";
import type { DatabaseWriter } from "../../sqlite-utils";
import { RAW_SOURCE_NAMES, type RawSourceName } from "../registry";
import type {
  ModelAtlasSourceHealth,
  ModelAtlasSourceHealthEntry,
  ModelAtlasSourceHealthStatus,
  RawSourceCacheStatus,
  SourceRowState,
  SourceSnapshots,
} from "../types";

export function persistedSourceRowStates(db: DatabaseSync): SourceRowState[] {
  return sourceRowStatesFromRows(
    db
      .prepare(
        "SELECT source, row_key, row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines",
      )
      .all(),
  );
}

function sourceRowStatesFromRows(rows: readonly Record<string, unknown>[]): SourceRowState[] {
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

export function insertSourceQuarantines(db: DatabaseWriter, snapshots: SourceSnapshots): void {
  const statement = db.prepare(`
		INSERT INTO source_quarantines (
			source, row_key, row_label, missing_from_source_since_epoch_seconds
		) VALUES (?, ?, ?, ?)
	`);
  for (const row of snapshots.sourceRowStates) {
    if (row.status !== "quarantined_missing_from_source") {
      continue;
    }
    statement.run(
      row.source,
      row.row_key,
      row.row_label,
      row.missing_from_source_since_epoch_seconds,
    );
  }
}

/** Keep source-health row ordering aligned with the checkpoint's source registry. */
export function insertSourceHealth(db: DatabaseWriter, sourceHealth: ModelAtlasSourceHealth): void {
  const statement = db.prepare(`
		INSERT INTO source_health (
			row_index, source, status, last_fetch_epoch_seconds,
			source_input_count, active_row_count, quarantined_row_count
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, [source, row]] of Object.entries(sourceHealth.sources).entries()) {
    statement.run(
      index,
      source,
      row.status,
      row.last_fetch_epoch_seconds,
      row.source_input_count,
      row.active_row_count,
      row.quarantined_row_count,
    );
  }
}
