/** OpenRouter source snapshots preserve cached coverage while refreshing requested model routes. */

import type { DatabaseSync } from "node:sqlite";

import { asFiniteNumber } from "../../runtime";
import {
  getOpenRouterRawScrapedStats,
  processOpenRouterModelStats,
} from "../../scrapers/openrouter";
import { readOpenRouterRawCache, readRawSourceCacheStatus, refreshedCacheStatus } from "../cache";
import type { DatabaseBuildOptions, RawSourceCacheStatus } from "../types";
import { mergeCachedSourceRows } from "./policy";

const PARTIAL_FETCH_TIMEOUT_MS = 10_000;
const PARTIAL_FETCH_MAX_RETRIES = 1;

export type OpenRouterRawCache = ReturnType<typeof readOpenRouterRawCache>;
type OpenRouterRawModel = NonNullable<OpenRouterRawCache>["models"][number];

/** A cached route is usable only when it can satisfy the leaderboard's required speed profile. */
function hasUsableOpenRouterSpeed(model: OpenRouterRawModel): boolean {
  const speed = processOpenRouterModelStats(model.id, model.performance, model.pricing).performance;
  return (
    asFiniteNumber(speed.throughput_tokens_per_second_median) != null &&
    (asFiniteNumber(speed.latency_seconds_median) != null ||
      asFiniteNumber(speed.e2e_latency_seconds_median) != null)
  );
}

/** Refreshes mutable route telemetry while retaining a usable cached field when its fetch failed. */
export function mergeOpenRouterModel(
  cachedModel: OpenRouterRawModel,
  fetchedModel: OpenRouterRawModel,
): OpenRouterRawModel {
  return {
    ...cachedModel,
    ...fetchedModel,
    candidate_permaslugs:
      fetchedModel.candidate_permaslugs.length > 0
        ? fetchedModel.candidate_permaslugs
        : cachedModel.candidate_permaslugs,
    selected_permaslug: fetchedModel.selected_permaslug ?? cachedModel.selected_permaslug,
    performance:
      Object.keys(fetchedModel.performance).length > 0
        ? fetchedModel.performance
        : cachedModel.performance,
    pricing: fetchedModel.pricing ?? cachedModel.pricing,
  };
}

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

/** Fresh OpenRouter caches retry uncovered or unusable model IDs; stale or explicitly replaced caches refresh the full requested set. */
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
  const cachedModelsById = new Map(cached.models.map((model) => [model.id, model]));
  return requestedModelIds.filter((modelId) => {
    const cachedModel = cachedModelsById.get(modelId);
    return cachedModel == null || !hasUsableOpenRouterSpeed(cachedModel);
  });
}

/** Keeps cached OpenRouter evidence only for current requested keys, while an empty request preserves all cached data. */
function scopeCachedModels(
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
  const scopedCache = scopeCachedModels(cached, requestedModelIds);
  const modelIdsToRefresh = openRouterModelIdsToRefresh(
    scopedCache,
    status,
    requestedModelIds,
    replaceSourceRows,
  );
  if (scopedCache != null && modelIdsToRefresh.length === 0 && !replaceSourceRows) {
    return {
      rawPayload: scopedCache,
      cacheStatus: {
        ...status,
        source_input_count: scopedCache.directory.length + scopedCache.models.length,
      },
    };
  }
  try {
    const isPartialRefresh = status.cache_hit && scopedCache != null && !replaceSourceRows;
    const fetchedPayload =
      modelIdsToRefresh.length === 0
        ? null
        : await getOpenRouterRawScrapedStats({
            modelIds: modelIdsToRefresh,
            concurrency: speedConcurrency,
            ...(isPartialRefresh
              ? {
                  timeoutMs: PARTIAL_FETCH_TIMEOUT_MS,
                  maxRetries: PARTIAL_FETCH_MAX_RETRIES,
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
                (cachedRow, fetchedRow) => ({ ...cachedRow, ...fetchedRow }),
              ),
              models: mergeCachedSourceRows(
                scopedCache.models,
                fetchedPayload.models,
                (row) => row.id,
                mergeOpenRouterModel,
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
          (scopedCache?.directory.length ?? 0) + (scopedCache?.models.length ?? 0),
      },
    };
  }
}
