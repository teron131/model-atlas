/** Live stats coordinates source refresh and scoring, retaining current metadata when a failed refresh yields an empty payload. */

import { benchmarkRowsFromSourceData } from "../pipeline/benchmark-rows";
import { deriveModelStats } from "../pipeline/derivation";
import { nowEpochSeconds } from "../runtime";
import { fetchSourceData } from "../sources/assembly";
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
