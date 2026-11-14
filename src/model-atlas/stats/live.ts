/** Builds a payload by fetching every source and scoring in-process, with no database or snapshot in between. */

import { STAGE_CONFIG } from "../config";
import { deriveModelStats } from "../pipeline/derivation";
import { nowEpochSeconds } from "../runtime";
import { fetchSourceData } from "../sources/assembly";
import { getOpenRouterStats, type OpenRouterSourcePayload } from "../sources/openrouter";
import { buildCurrentModelAtlasMetadata } from "./payload/metadata";
import type { ModelAtlasOptions, ModelAtlasPayload } from "./types";

/** Any failure, in fetching or in scoring, returns no models and a null fetch time with metadata built for an empty cohort; the error itself is discarded. */
export async function getLiveModelAtlasPayload(
  options: ModelAtlasOptions = {},
): Promise<ModelAtlasPayload> {
  try {
    const modelId = options.id ?? null;
    const sourceData = await fetchSourceData();
    const { benchmarkObservations, benchmarkRows, modelRows, models } = await deriveModelStats(
      sourceData,
      {
        modelId,
        loadOpenRouter: loadLiveOpenRouterStats,
      },
    );
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      models,
      benchmark_observations: benchmarkObservations,
      metadata: buildCurrentModelAtlasMetadata({
        models: modelRows,
        resourceModels: models,
        healthModels: models,
        sourceRowsByKey: benchmarkRows,
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

/** Scrape OpenRouter telemetry directly, skipping an empty cohort; a failed scrape scores without OpenRouter data instead of failing the live payload. */
export async function loadLiveOpenRouterStats(
  modelIds: string[],
): Promise<{ rawPayload: OpenRouterSourcePayload | null }> {
  return {
    rawPayload:
      modelIds.length === 0
        ? null
        : await getOpenRouterStats({
            modelIds,
            concurrency: STAGE_CONFIG.openrouter.speedConcurrency,
          }).catch(() => null),
  };
}
