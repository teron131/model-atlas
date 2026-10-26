/** Live stats coordinates source refresh and scoring, retaining current metadata when a failed refresh yields an empty payload. */

import { STAGE_CONFIG } from "../config";
import { benchmarkRowsFromSourceData } from "../pipeline/benchmark-rows";
import { deriveModelStats } from "../pipeline/derivation";
import { nowEpochSeconds } from "../runtime";
import { fetchSourceData } from "../sources/assembly";
import { getOpenRouterRawScrapedStats, type OpenRouterSourcePayload } from "../sources/openrouter";
import { buildCurrentModelAtlasMetadata } from "./payload/metadata";
import type { ModelAtlasOptions, ModelAtlasPayload } from "./types";

/** Build live scores and metadata, returning an empty payload with no fetch timestamp if any refresh stage fails. */
export async function getLiveModelAtlasPayload(
  options: ModelAtlasOptions = {},
): Promise<ModelAtlasPayload> {
  try {
    const modelId = options.id ?? null;
    const sourceData = await fetchSourceData();
    const { benchmarkObservations, modelRows, models } = await deriveModelStats(sourceData, {
      modelId,
      loadOpenRouter: loadLiveOpenRouterStats,
    });
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      models,
      benchmark_observations: benchmarkObservations,
      metadata: buildCurrentModelAtlasMetadata({
        models: modelRows,
        resourceModels: models,
        healthModels: models,
        sourceRowsByKey: benchmarkRowsFromSourceData(sourceData),
      }),
    };
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      models: [],
      metadata: buildCurrentModelAtlasMetadata({ models: [] }),
    };
  }
}

/** Scrape route telemetry directly, skipping an empty cohort; a failed scrape scores without route data instead of failing the live payload. */
export async function loadLiveOpenRouterStats(
  modelIds: string[],
): Promise<{ rawPayload: OpenRouterSourcePayload | null }> {
  return {
    rawPayload:
      modelIds.length === 0
        ? null
        : await getOpenRouterRawScrapedStats({
            modelIds,
            concurrency: STAGE_CONFIG.openrouter.speedConcurrency,
          }).catch(() => null),
  };
}
