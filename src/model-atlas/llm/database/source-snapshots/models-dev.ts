/** Models.dev source snapshot merge policy and row-state preservation. */

import type { DatabaseSync } from "node:sqlite";

import {
	getModelsDevSourceStats,
	type ModelsDevPayload,
	type ProviderRecord,
} from "../../scrapers/models-dev";
import { readModelsDevRawCache } from "../cache";
import { sourceStatesForModelsDevPayload } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../types";
import { shouldUseFetchedRows, snapshotFetchedAt } from "./model-score";

export type ModelsDevSnapshot = Pick<
	SourceSnapshots,
	"modelsDevPayload" | "modelsDevFetchedAt" | "modelsDevStatusCode"
> & { sourceStatus: SourceSnapshotStatus };

function mergeModelsDevPayload(
	cachedPayload: ModelsDevPayload | undefined,
	fetchedPayload: ModelsDevPayload,
	options: DatabaseBuildOptions,
): ModelsDevPayload {
	if (cachedPayload == null || options.replaceSourceRows === true) {
		return fetchedPayload;
	}
	const mergedPayload: ModelsDevPayload = structuredClone(cachedPayload);
	for (const [providerId, fetchedProvider] of Object.entries(fetchedPayload)) {
		const cachedProvider = mergedPayload[providerId];
		const mergedProvider: ProviderRecord = {
			...cachedProvider,
			...fetchedProvider,
			models: {
				...(cachedProvider?.models ?? {}),
				...(fetchedProvider.models ?? {}),
			},
		};
		mergedPayload[providerId] = mergedProvider;
	}
	return mergedPayload;
}

/** Counts concrete Models.dev model entries for source freshness metadata. */
export function modelsDevSourceInputCount(
	payload: ModelsDevSnapshot["modelsDevPayload"],
): number {
	return Object.values(payload).reduce(
		(count, provider) => count + Object.keys(provider.models ?? {}).length,
		0,
	);
}

/** Merges refreshed Models.dev providers into cache while preserving per-model row state. */
export async function modelsDevSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ModelsDevSnapshot> {
	const cached = readModelsDevRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const sourceRowStates = sourceStatesForModelsDevPayload(
			cached.payload,
			null,
			false,
			previousMissingSince,
			nowEpochSeconds,
			options,
		);
		return {
			modelsDevPayload: cached.payload,
			modelsDevFetchedAt: cached.fetchedAt,
			modelsDevStatusCode: cached.statusCode,
			sourceStatus: {
				source: "models_dev",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: modelsDevSourceInputCount(cached.payload),
				sourceRowStates,
			},
		};
	}
	const fetched = await getModelsDevSourceStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		Object.keys(fetched.payload).length,
	);
	const payload = hasUsableFetchedRows
		? mergeModelsDevPayload(cached?.payload, fetched.payload, options)
		: (cached?.payload ?? fetched.payload);
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	const sourceRowStates = sourceStatesForModelsDevPayload(
		payload,
		fetched.payload,
		hasUsableFetchedRows,
		previousMissingSince,
		nowEpochSeconds,
		options,
	);
	return {
		modelsDevPayload: payload,
		modelsDevFetchedAt: fetchedAt,
		modelsDevStatusCode:
			hasUsableFetchedRows || cached?.statusCode == null
				? fetched.status_code
				: cached.statusCode,
		sourceStatus: {
			source: "models_dev",
			fetchedAt,
			sourceInputCount: modelsDevSourceInputCount(payload),
			sourceRowStates,
		},
	};
}
