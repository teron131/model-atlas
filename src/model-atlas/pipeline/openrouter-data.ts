/** OpenRouter model data prepares route telemetry, scoring anchors, and free-route cost continuity. */

import type { ScoringConfig } from "../config/stage";
import { normalizeProviderModelId } from "../identity/normalization";
import {
  isOpenRouterFreeRouteId,
  nonFreeOpenRouterModelId,
  publicOpenRouterModelId,
} from "../identity/openrouter";
import { asFiniteNumber, asRecord, type JsonObject } from "../runtime";
import { type OpenRouterSourcePayload, processOpenRouterModelStats } from "../sources/openrouter";
import { deriveSpeedOutputTokenAnchors } from "./scores";

export type OpenRouterModelData = {
  modelRows: Record<string, unknown>[];
  speedByModelId: Map<string, JsonObject>;
  pricingByModelId: Map<string, JsonObject>;
  outputTokenAnchors: number[];
};

/** Normalize already-loaded route evidence; fetching and admission stay in the shared derivation workflow. */
export function prepareOpenRouterModelData(
  rows: Record<string, unknown>[],
  scoringConfig: ScoringConfig,
  rawPayload: OpenRouterSourcePayload | null,
): OpenRouterModelData {
  const costBackfilledRows = backfillFreeModelCosts(rows);
  const { speedById: speedByModelId, pricingById: pricingByModelId } = buildOpenRouterDataById(
    costBackfilledRows,
    rawPayload,
  );
  const outputTokenAnchors = deriveSpeedOutputTokenAnchors(speedByModelId, scoringConfig);
  return {
    modelRows: costBackfilledRows,
    speedByModelId,
    pricingByModelId,
    outputTokenAnchors,
  };
}

/** Free OpenRouter routes inherit the paid route's base costs so price comparisons keep a realistic fallback. */
function backfillFreeModelCosts(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const nonFreeCostById = new Map<string, JsonObject>();
  for (const row of rows) {
    const rowRecord = asRecord(row);
    const id = typeof rowRecord.id === "string" ? rowRecord.id : null;
    if (!id || isOpenRouterFreeRouteId(id)) {
      continue;
    }
    const cost = asRecord(rowRecord.cost);
    if (hasPositiveCostFields(cost)) {
      nonFreeCostById.set(id, cost);
    }
  }

  return rows.map((row) => {
    const rowRecord = asRecord(row);
    const id = typeof rowRecord.id === "string" ? rowRecord.id : null;
    if (!id) {
      return row;
    }
    const baseId = nonFreeOpenRouterModelId(id);
    if (!baseId) {
      return row;
    }
    const baseCost = nonFreeCostById.get(baseId);
    if (!baseCost) {
      return row;
    }
    return {
      ...rowRecord,
      cost: {
        ...baseCost,
      },
    };
  });
}

function buildOpenRouterDataById(
  rows: Record<string, unknown>[],
  rawPayload: OpenRouterSourcePayload | null,
): {
  speedById: Map<string, JsonObject>;
  pricingById: Map<string, JsonObject>;
} {
  if (rawPayload == null || rows.length === 0) {
    return { speedById: new Map(), pricingById: new Map() };
  }
  try {
    const speedById = new Map<string, JsonObject>();
    const pricingById = new Map<string, JsonObject>();
    for (const rawModel of rawPayload.models) {
      const model = processOpenRouterModelStats(
        rawModel.id,
        rawModel.performance,
        rawModel.pricing,
      );
      const speed = normalizeSpeed(model.performance);
      const pricing = normalizePricing(model.pricing);
      indexOpenRouterRouteData(speedById, model.id, speed, hasSpeedData);
      indexOpenRouterRouteData(pricingById, model.id, pricing, hasPricingData);
    }
    indexPublicRouteData(rows, speedById, pricingById);
    return { speedById, pricingById };
  } catch {
    return {
      speedById: new Map(),
      pricingById: new Map(),
    };
  }
}

function hasPositiveCostFields(cost: JsonObject): boolean {
  const input = asFiniteNumber(cost.input);
  const output = asFiniteNumber(cost.output);
  return input != null && input > 0 && output != null && output > 0;
}

function normalizeSpeed(performance: unknown): JsonObject {
  const parsed = asRecord(performance);
  return {
    throughput_tokens_per_second_median: asFiniteNumber(parsed.throughput_tokens_per_second_median),
    latency_seconds_median: asFiniteNumber(parsed.latency_seconds_median),
    e2e_latency_seconds_median: asFiniteNumber(parsed.e2e_latency_seconds_median),
  };
}

function normalizePricing(pricing: unknown): JsonObject {
  const parsed = asRecord(pricing);
  return {
    weighted_input: asFiniteNumber(parsed.weighted_input_price_per_1m),
    weighted_output: asFiniteNumber(parsed.weighted_output_price_per_1m),
  };
}

function indexOpenRouterRouteData(
  map: Map<string, JsonObject>,
  modelId: string,
  value: JsonObject,
  hasData: (value: JsonObject) => boolean,
): void {
  indexRouteData(map, modelId, value, hasData);
  const publicId = publicOpenRouterModelId(modelId);
  if (publicId != null && publicId !== modelId) {
    indexRouteData(map, publicId, value, hasData);
  }
}

function hasSpeedData(speed: JsonObject): boolean {
  return (
    asFiniteNumber(speed.throughput_tokens_per_second_median) != null ||
    asFiniteNumber(speed.latency_seconds_median) != null ||
    asFiniteNumber(speed.e2e_latency_seconds_median) != null
  );
}

function hasPricingData(pricing: JsonObject): boolean {
  const input = asFiniteNumber(pricing.weighted_input);
  const output = asFiniteNumber(pricing.weighted_output);
  return (input != null && input >= 0) || (output != null && output >= 0);
}

function indexPublicRouteData(
  rows: Record<string, unknown>[],
  speedById: Map<string, JsonObject>,
  pricingById: Map<string, JsonObject>,
): void {
  for (const row of rows) {
    const publicId = rowModelId(row);
    const openRouterId = rowOpenRouterModelId(row);
    if (publicId == null || openRouterId == null || publicId === openRouterId) {
      continue;
    }
    const speed = findRouteData(speedById, openRouterId);
    if (speed != null) {
      indexRouteData(speedById, publicId, speed, hasSpeedData);
    }
    const pricing = findRouteData(pricingById, openRouterId);
    if (pricing != null) {
      indexRouteData(pricingById, publicId, pricing, hasPricingData);
    }
  }
}

function indexRouteData(
  map: Map<string, JsonObject>,
  modelId: string,
  value: JsonObject,
  hasData: (value: JsonObject) => boolean,
): void {
  indexPreferredRouteData(map, modelId, value, hasData);
  const normalizedId = normalizeProviderModelId(modelId);
  if (normalizedId !== modelId) {
    indexPreferredRouteData(map, normalizedId, value, hasData);
  }
}

function rowModelId(row: Record<string, unknown>): string | null {
  const id = asRecord(row).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function rowOpenRouterModelId(row: Record<string, unknown>): string | null {
  const rowRecord = asRecord(row);
  const openRouterId = rowRecord.openrouter_id;
  if (typeof openRouterId === "string" && openRouterId.length > 0 && openRouterId.includes("/")) {
    return openRouterId;
  }
  return (
    rowModelId(row) ??
    (typeof openRouterId === "string" && openRouterId.length > 0 ? openRouterId : null)
  );
}

function findRouteData(map: Map<string, JsonObject>, modelId: string): JsonObject | null {
  return map.get(modelId) ?? map.get(normalizeProviderModelId(modelId)) ?? null;
}

function indexPreferredRouteData(
  map: Map<string, JsonObject>,
  key: string,
  value: JsonObject,
  hasData: (value: JsonObject) => boolean,
): void {
  const existing = map.get(key);
  if (existing == null || (!hasData(existing) && hasData(value))) {
    map.set(key, value);
  }
}
