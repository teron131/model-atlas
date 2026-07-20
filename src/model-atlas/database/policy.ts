/** Source row policy preserves cached evidence while marking refreshed sources that stopped returning known rows. */

import type { DatabaseSync } from "node:sqlite";

import type { ModelsDevPayload } from "../scrapers/models-dev";
import { asRecord } from "../shared";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceName,
	type SourceRowState,
	type SourceRowStatus,
} from "./types";

/** Stable source-row keys are persisted, so every caller must use the same empty-part normalization. */
export function sourceKey(
	...parts: (number | string | null | undefined)[]
): string {
	return parts.map((part) => String(part ?? "")).join("|");
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function rowStringValue(
	row: Record<string, unknown>,
	key: string,
): string | null {
	return stringValue(row[key]);
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
			[...new Set([...Object.keys(cached), ...Object.keys(fetched)])].map(
				(key) => [key, mergeSourceEvidence(cached[key], fetched[key])],
			),
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
		if (!keyedRows.has(key)) {
			keyedRows.set(key, row);
		}
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
	options: DatabaseBuildOptions,
	rowKey: (row: T) => string | null,
	mergeRow?: (cachedRow: T, fetchedRow: T) => T,
): T[] {
	if (fetchedAtEpochSeconds == null || fetchedRows.length === 0) {
		return [...(cachedRows ?? fetchedRows)];
	}
	if (cachedRows == null || options.replaceSourceRows === true) {
		return [...fetchedRows];
	}
	return mergeCachedSourceRows(cachedRows, fetchedRows, rowKey, mergeRow);
}

type SnapshotRowsConfig<T> = {
	source: RawSourceName;
	cachedRows: readonly T[] | undefined;
	fetchedRows: readonly T[];
	fetchedAtEpochSeconds: number | null;
	options: DatabaseBuildOptions;
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

/** Preservation state records which known rows vanished without deleting their cached evidence immediately. */
export function snapshotRowsWithStates<T>(
	config: SnapshotRowsConfig<T>,
): SnapshotRowsResult<T> {
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
	const states = rows.flatMap((row) => {
		const key = config.rowKey(row);
		if (key == null) {
			return [];
		}
		const wasPreviouslyMissing = config.previousMissingSince.has(key);
		const isMissingNow =
			hasUsableFetchedRows &&
			!fetchedKeys.has(key) &&
			config.options.replaceSourceRows !== true;
		const status: SourceRowStatus =
			isMissingNow || (!hasUsableFetchedRows && wasPreviouslyMissing)
				? "quarantined_missing_from_source"
				: "active";
		const missingSince =
			status === "quarantined_missing_from_source"
				? (config.previousMissingSince.get(key) ?? config.nowEpochSeconds)
				: null;
		return [
			{
				source: config.source,
				row_key: key,
				row_label: config.rowLabel(row),
				status,
				missing_from_source_since_epoch_seconds: missingSince,
			},
		];
	});
	return { rows, states };
}

/** Persisted source-row state participates in the next preservation pass. */
export function persistedSourceRowStates(db: DatabaseSync): SourceRowState[] {
	return sourceRowStatesFromRows(
		db
			.prepare(
				"SELECT source, row_key, NULL AS row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines",
			)
			.all(),
	);
}

/** Decodes persisted source-row state independently of the storage transport. */
export function sourceRowStatesFromRows(
	rows: readonly Record<string, unknown>[],
): SourceRowState[] {
	return rows.flatMap((stateRow) => {
		const state = asRecord(stateRow);
		const source =
			typeof state.source === "string" &&
			RAW_SOURCE_NAMES.includes(state.source as RawSourceName)
				? (state.source as RawSourceName)
				: null;
		const rowKeyValue = stringValue(state.row_key);
		const status =
			state.status === "active" ||
			state.status === "quarantined_missing_from_source"
				? state.status
				: null;
		if (source == null || rowKeyValue == null || status == null) {
			return [];
		}
		return [
			{
				source,
				row_key: rowKeyValue,
				row_label: stringValue(state.row_label),
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
		missingSince[state.source].set(
			state.row_key,
			state.missing_from_source_since_epoch_seconds,
		);
	}
	return missingSince;
}

export function buildModelsDevSourceStates(
	payload: ModelsDevPayload,
	fetchedPayload: ModelsDevPayload | null,
	hasUsableFetchedRows: boolean,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
	options: DatabaseBuildOptions,
): SourceRowState[] {
	const fetchedKeys = new Set<string>();
	if (hasUsableFetchedRows) {
		for (const [providerId, provider] of Object.entries(fetchedPayload ?? {})) {
			for (const modelId of Object.keys(provider.models ?? {})) {
				fetchedKeys.add(sourceKey(providerId, modelId));
			}
		}
	}
	const states: SourceRowState[] = [];
	for (const [providerId, provider] of Object.entries(payload)) {
		for (const [modelId, model] of Object.entries(provider.models ?? {})) {
			const key = sourceKey(providerId, modelId);
			const wasPreviouslyMissing = previousMissingSince.has(key);
			const isMissingNow =
				hasUsableFetchedRows &&
				!fetchedKeys.has(key) &&
				options.replaceSourceRows !== true;
			const status: SourceRowStatus =
				isMissingNow || (!hasUsableFetchedRows && wasPreviouslyMissing)
					? "quarantined_missing_from_source"
					: "active";
			states.push({
				source: "models_dev",
				row_key: key,
				row_label:
					typeof model.name === "string" && model.name.length > 0
						? model.name
						: modelId,
				status,
				missing_from_source_since_epoch_seconds:
					status === "quarantined_missing_from_source"
						? (previousMissingSince.get(key) ?? nowEpochSeconds)
						: null,
			});
		}
	}
	return states;
}
