/** OpenRouter raw-cache loading and targeted refresh policy. */

import type { DatabaseSync } from "node:sqlite";

import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import {
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	refreshedCacheStatus,
} from "./cache";
import { mergeCachedSourceRows } from "./policy";
import type { DatabaseBuildOptions, RawSourceCacheStatus } from "./types";

const PARTIAL_OPENROUTER_TIMEOUT_MS = 10_000;
const PARTIAL_OPENROUTER_MAX_RETRIES = 1;

export type OpenRouterRawCache = ReturnType<typeof readOpenRouterRawCache>;

/** Load OpenRouter raw stats from SQLite when fresh and complete for the current matched model ids. */
export async function loadOpenRouterRawPayload(
	db: DatabaseSync,
	modelIds: string[],
	speedConcurrency: number,
	nowEpochSeconds: number,
	options: DatabaseBuildOptions = {},
): Promise<{
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
	cacheStatus: RawSourceCacheStatus;
}> {
	return refreshOpenRouterRawPayload(
		readOpenRouterRawCache(db),
		readRawSourceCacheStatus(db, "openrouter", nowEpochSeconds),
		modelIds,
		speedConcurrency,
		options,
	);
}

/** Fresh OpenRouter caches fetch only uncovered model IDs; stale or explicitly replaced caches refresh the full requested set. */
export function openRouterModelIdsToRefresh(
	cached: OpenRouterRawCache,
	status: RawSourceCacheStatus,
	modelIds: readonly string[],
	replaceSourceRows: boolean,
): string[] {
	const requestedModelIds = [...new Set(modelIds)];
	if (cached == null || !status.cache_hit || replaceSourceRows) {
		return requestedModelIds;
	}
	const cachedModelIds = new Set(cached.models.map((model) => model.id));
	return requestedModelIds.filter((modelId) => !cachedModelIds.has(modelId));
}

/** Keeps cached OpenRouter evidence only for current requested keys, while an empty request preserves all cached data. */
function reconcileOpenRouterCacheModels(
	cached: OpenRouterRawCache,
	requestedModelIds: readonly string[],
): OpenRouterRawCache {
	if (cached == null || requestedModelIds.length === 0) {
		return cached;
	}
	const requestedModelIdSet = new Set(requestedModelIds);
	return {
		...cached,
		models: cached.models.filter((model) => requestedModelIdSet.has(model.id)),
	};
}

/** Refreshes OpenRouter data from a storage-independent cache value. */
export async function refreshOpenRouterRawPayload(
	cached: OpenRouterRawCache,
	status: RawSourceCacheStatus,
	modelIds: string[],
	speedConcurrency: number,
	options: DatabaseBuildOptions = {},
): Promise<{
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
	cacheStatus: RawSourceCacheStatus;
}> {
	const replaceSourceRows = options.replaceSourceRows === true;
	const requestedModelIds = [...new Set(modelIds)];
	const scopedCache = reconcileOpenRouterCacheModels(cached, requestedModelIds);
	const modelIdsToRefresh = openRouterModelIdsToRefresh(
		scopedCache,
		status,
		requestedModelIds,
		replaceSourceRows,
	);
	if (
		scopedCache != null &&
		modelIdsToRefresh.length === 0 &&
		!replaceSourceRows
	) {
		return {
			rawPayload: scopedCache,
			cacheStatus: {
				...status,
				source_input_count:
					scopedCache.directory.length + scopedCache.models.length,
			},
		};
	}
	try {
		const useCachedDirectory =
			status.cache_hit && scopedCache != null && !replaceSourceRows;
		const fetchedPayload =
			modelIdsToRefresh.length === 0
				? null
				: await getOpenRouterRawScrapedStats({
						modelIds: modelIdsToRefresh,
						concurrency: speedConcurrency,
						...(useCachedDirectory
							? {
									modelDirectory: scopedCache.directory,
									timeoutMs: PARTIAL_OPENROUTER_TIMEOUT_MS,
									maxRetries: PARTIAL_OPENROUTER_MAX_RETRIES,
								}
							: {}),
					});
		const rawPayload =
			fetchedPayload == null
				? scopedCache
				: scopedCache == null || replaceSourceRows
					? fetchedPayload
					: {
							fetched_at_epoch_seconds: fetchedPayload.fetched_at_epoch_seconds,
							directory: mergeCachedSourceRows(
								scopedCache.directory,
								fetchedPayload.directory,
								(row) => row.permaslug ?? row.slug ?? null,
							),
							models: mergeCachedSourceRows(
								scopedCache.models,
								fetchedPayload.models,
								(row) => row.id,
							),
						};
		return {
			rawPayload,
			cacheStatus: refreshedCacheStatus(
				rawPayload?.fetched_at_epoch_seconds ?? null,
				(rawPayload?.directory.length ?? 0) + (rawPayload?.models.length ?? 0),
			),
		};
	} catch {
		return {
			rawPayload: scopedCache,
			cacheStatus: {
				...status,
				source_input_count:
					(scopedCache?.directory.length ?? 0) +
					(scopedCache?.models.length ?? 0),
			},
		};
	}
}
