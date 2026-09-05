/** Models.dev source snapshot merge policy and row-state preservation. */

import { buildModelsDevSourceStates } from "../snapshots/policy";
import { shouldUseFetchedRows, snapshotFetchedAt } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import type { readModelsDevRawCache } from "./cache";
import {
  getModelsDevSourceStats,
  type ModelsDevPayload,
  type ModelsDevProviderRecord,
} from "./catalog";

type ModelsDevSnapshot = Pick<
  SourceSnapshots,
  "modelsDevPayload" | "modelsDevFetchedAt" | "modelsDevStatusCode"
> & { sourceStatus: SourceSnapshotStatus };

/** Refreshes returned catalog records while retaining providers and models omitted by the latest fetch. */
export function mergeModelsDevPayload(
  cachedPayload: ModelsDevPayload | undefined,
  fetchedPayload: ModelsDevPayload,
  options: SourceRefreshOptions,
): ModelsDevPayload {
  if (cachedPayload == null || options.replaceSourceRows === true) {
    return fetchedPayload;
  }
  const mergedPayload: ModelsDevPayload = structuredClone(cachedPayload);
  for (const [providerId, fetchedProvider] of Object.entries(fetchedPayload)) {
    const cachedProvider = mergedPayload[providerId];
    const cachedModels = cachedProvider?.models ?? {};
    const fetchedModels = fetchedProvider.models ?? {};
    const mergedModels = { ...cachedModels };
    for (const [modelId, fetchedModel] of Object.entries(fetchedModels)) {
      mergedModels[modelId] = {
        ...cachedModels[modelId],
        ...fetchedModel,
      };
    }
    const mergedProvider: ModelsDevProviderRecord = {
      ...cachedProvider,
      ...fetchedProvider,
      models: mergedModels,
    };
    mergedPayload[providerId] = mergedProvider;
  }
  return mergedPayload;
}

/** Merges refreshed Models.dev providers into cache while preserving per-model row state. */
export async function modelsDevSnapshot(
  cached: ReturnType<typeof readModelsDevRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<ModelsDevSnapshot> {
  if (status.cache_hit && cached != null && options.replaceSourceRows !== true) {
    const sourceRowStates = buildModelsDevSourceStates(
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
  const sourceRowStates = buildModelsDevSourceStates(
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
      hasUsableFetchedRows || cached?.statusCode == null ? fetched.status_code : cached.statusCode,
    sourceStatus: {
      source: "models_dev",
      fetchedAt,
      sourceInputCount: modelsDevSourceInputCount(payload),
      sourceRowStates,
    },
  };
}

/** Freshness counts concrete Models.dev model rows rather than provider wrapper objects. */
function modelsDevSourceInputCount(payload: ModelsDevSnapshot["modelsDevPayload"]): number {
  return Object.values(payload).reduce(
    (count, provider) => count + Object.keys(provider.models ?? {}).length,
    0,
  );
}
