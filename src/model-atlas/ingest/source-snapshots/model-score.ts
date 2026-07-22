/** Generic source snapshot lifecycle for one-score benchmark row sources. */

import type { BenchmarkObservationRow } from "../../scrapers/benchmark-observation";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceRowState,
} from "../types";
import { snapshotRowsWithStates, sourceKey } from "./policy";

type RawRowsCache<Row> = {
	rows: Row[];
	fetchedAt: number | null;
	sourceUrl?: string;
};

type ModelScoreRowsPayload<Row> = {
	fetched_at_epoch_seconds: number | null;
	source_url?: string;
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
	sourceUrl: string | null;
};

/** Builds stable identity across benchmark task, track, harness, run, model, and effort variants. */
export function benchmarkObservationRowKey(
	row: BenchmarkObservationRow,
): string {
	const metadataIdentity = (key: string): string | number | null => {
		const value = row.metadata[key];
		return typeof value === "string" || typeof value === "number"
			? value
			: null;
	};
	return sourceKey(
		row.benchmark_key,
		metadataIdentity("task"),
		metadataIdentity("track"),
		metadataIdentity("harness"),
		metadataIdentity("source_model_id") ?? metadataIdentity("source_model"),
		metadataIdentity("run_id"),
		row.model_id ?? row.model,
		row.model_creator_id ?? row.model_creator ?? row.inference_provider,
		row.reasoning_effort,
	);
}

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
			sourceUrl: config.cached.sourceUrl ?? null,
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
		sourceUrl: snapshotSourceUrl(
			hasUsableFetchedRows,
			config.cached?.sourceUrl,
			fetched.source_url,
		),
	};
}
