/** OpenRouter route data owns free-route cost continuity for catalog rows and the route telemetry index, its lookups, and scoring anchors. */

import type { ScoringConfig } from "../config/stage";
import { normalizeProviderModelId } from "../identity/normalization";
import {
  isOpenRouterFreeRouteId,
  nonFreeOpenRouterModelId,
  publicOpenRouterModelId,
} from "../identity/openrouter";
import { asFiniteNumber, asRecord, type JsonObject } from "../runtime";
import { type OpenRouterSourcePayload, processOpenRouterModelStats } from "../sources/openrouter";
import { catalogRowRouteId } from "./model-catalog";
import type { ModelRow } from "./model-types";
import { deriveSpeedOutputTokenAnchors } from "./scores";

export type OpenRouterModelData = {
  speedByModelId: Map<string, JsonObject>;
  pricingByModelId: Map<string, JsonObject>;
  outputTokenAnchors: number[];
};

/** Normalize already-loaded route evidence; fetching and admission stay in the shared derivation workflow. */
export function prepareOpenRouterModelData(
  rows: readonly ModelRow[],
  scoringConfig: ScoringConfig,
  rawPayload: OpenRouterSourcePayload | null,
): OpenRouterModelData {
  const { speedById: speedByModelId, pricingById: pricingByModelId } = buildOpenRouterDataById(
    rows,
    rawPayload,
  );
  return {
    speedByModelId,
    pricingByModelId,
    outputTokenAnchors: deriveSpeedOutputTokenAnchors(speedByModelId, scoringConfig),
  };
}

/** A model's OpenRouter speed telemetry, trying its exact id before its normalized id and preferring whichever entry carries data. */
export function lookupOpenRouterSpeed(
  data: OpenRouterModelData,
  modelId: string | null,
): JsonObject | null {
  return lookupOpenRouterData(data.speedByModelId, modelId, hasSpeedData);
}

/** A model's effective OpenRouter pricing, looked up like `lookupOpenRouterSpeed`. */
export function lookupOpenRouterPricing(
  data: OpenRouterModelData,
  modelId: string | null,
): JsonObject | null {
  return lookupOpenRouterData(data.pricingByModelId, modelId, hasPricingData);
}

/** Free OpenRouter routes inherit the paid route's base costs so price comparisons keep a realistic fallback. */
export function backfillFreeModelCosts(rows: ModelRow[]): ModelRow[] {
  const nonFreeCostById = new Map<string, JsonObject>();
  for (const row of rows) {
    if (!row.id || isOpenRouterFreeRouteId(row.id)) {
      continue;
    }
    if (row.cost != null && hasPositiveCostFields(row.cost)) {
      nonFreeCostById.set(row.id, row.cost);
    }
  }

  return rows.map((row) => {
    if (!row.id) {
      return row;
    }
    const baseId = nonFreeOpenRouterModelId(row.id);
    if (!baseId) {
      return row;
    }
    const baseCost = nonFreeCostById.get(baseId);
    if (!baseCost) {
      return row;
    }
    return {
      ...row,
      cost: {
        ...baseCost,
      },
    };
  });
}

function buildOpenRouterDataById(
  rows: readonly ModelRow[],
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
  rows: readonly ModelRow[],
  speedById: Map<string, JsonObject>,
  pricingById: Map<string, JsonObject>,
): void {
  for (const row of rows) {
    const publicId = row.id || null;
    const openRouterId = catalogRowRouteId(row);
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

function lookupOpenRouterData(
  valuesById: Map<string, JsonObject>,
  modelId: string | null,
  hasData: (value: JsonObject) => boolean,
): JsonObject | null {
  if (modelId == null) {
    return null;
  }
  const exact = valuesById.get(modelId);
  const normalized = valuesById.get(normalizeProviderModelId(modelId));
  if (exact != null && hasData(exact)) {
    return exact;
  }
  if (normalized != null && hasData(normalized)) {
    return normalized;
  }
  return exact ?? normalized ?? null;
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
