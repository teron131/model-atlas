/** Generic source snapshot lifecycle for one-score benchmark row sources. */

import { snapshotRowsWithStates } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceRowState,
} from "../types";

type RawRowsCache<Row> = {
	rows: Row[];
	fetchedAt: number | null;
};

type ModelScoreRowsPayload<Row> = {
	fetched_at_epoch_seconds: number | null;
	data: Row[];
};

type ModelScoreSnapshotConfig<Row> = {
	source: RawSourceName;
	cached: RawRowsCache<Row> | null | undefined;
	status: RawSourceCacheStatus;
	options: DatabaseBuildOptions;
	previousMissingSince: ReadonlyMap<string, number>;
	nowEpochSeconds: number;
	fetchRows: () => Promise<ModelScoreRowsPayload<Row>>;
	rowKey: (row: Row) => string | null;
	rowLabel: (row: Row) => string | null;
};

type ModelScoreSnapshotResult<Row> = {
	rows: Row[];
	sourceRowStates: SourceRowState[];
	fetchedAt: number | null;
};

/** Decides whether fetched rows should replace cached source rows. */
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
	return hasUsableFetchedRows || cachedFetchedAt == null
		? fetchedAtEpochSeconds
		: cachedFetchedAt;
}

/** Loads one-score source rows from cache or fetches them while preserving missing-row state. */
export async function modelScoreSnapshot<Row>(
	config: ModelScoreSnapshotConfig<Row>,
): Promise<ModelScoreSnapshotResult<Row>> {
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
			previousMissingSince: config.previousMissingSince,
			nowEpochSeconds: config.nowEpochSeconds,
		});
		return {
			rows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: config.cached.fetchedAt,
		};
	}

	const fetched = await config.fetchRows();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: config.source,
		cachedRows: config.cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options: config.options,
		rowKey: config.rowKey,
		rowLabel: config.rowLabel,
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
	};
}
