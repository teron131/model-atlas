/** OpenRouter raw-cache reconstruction and scoped route coverage checks. */

import { isSameOpenRouterModelRoute } from "../../identity/openrouter";
import { asFiniteNumber } from "../../runtime";
import {
  type CacheDbRow,
  type CacheRowSource,
  firstEpochSecond,
  sourceCacheRows,
  stringValue,
} from "../cache/rows";
import { sanitizeModelId } from "./stats";
import type {
  OpenRouterEffectivePricingResponse,
  OpenRouterFrontendModel,
  OpenRouterPerformance,
  OpenRouterSeriesResponse,
  OpenRouterSourceModel,
  OpenRouterSourcePayload,
} from "./types";

/** Index rows once by model while preserving directory order, model order, and per-model source evidence. */
export function readOpenRouterRawCache(cache: CacheRowSource): OpenRouterSourcePayload | null {
  const cacheRows = sourceCacheRows(cache, "SELECT * FROM openrouter_raw_rows ORDER BY row_index");
  if (cacheRows.length === 0) {
    return null;
  }
  const fetchedAt = firstEpochSecond(cacheRows);
  if (fetchedAt == null) {
    return null;
  }
  const directory: OpenRouterFrontendModel[] = [];
  const modelIds: string[] = [];
  const rowsByModel = new Map<string, CacheDbRow[]>();
  for (const row of cacheRows) {
    if (row.row_kind === "directory_model") {
      directory.push({
        slug: stringValue(row.slug),
        permaslug: stringValue(row.permaslug),
      });
    }
    const modelId = stringValue(row.model_id);
    if (modelId == null) {
      continue;
    }
    if (row.row_kind === "model_stats") {
      modelIds.push(modelId);
    }
    const groupedRows = rowsByModel.get(modelId) ?? [];
    groupedRows.push(row);
    rowsByModel.set(modelId, groupedRows);
  }
  return {
    fetched_at_epoch_seconds: fetchedAt,
    directory,
    models: modelIds.map((modelId) => openRouterModelRows(modelId, rowsByModel.get(modelId)!)),
  };
}

/** Validate summary presence and candidate routes without reading unrelated time-series values from SQLite. */
export function openRouterCacheHasCurrentShape(cache: CacheRowSource): boolean {
  const cacheRows = sourceCacheRows(
    cache,
    `SELECT row_kind, model_id, selected_permaslug, slug, permaslug
     FROM openrouter_raw_rows
     WHERE row_kind IN ('directory_model', 'model_stats', 'endpoint_summary', 'permaslug_candidate')
     ORDER BY row_index`,
  );
  const summaryModelIds = new Set(
    cacheRows
      .filter((row) => row.row_kind === "endpoint_summary")
      .map((row) => stringValue(row.model_id))
      .filter((modelId): modelId is string => modelId != null),
  );
  if (
    cacheRows.some(
      (row) =>
        row.row_kind === "model_stats" &&
        stringValue(row.selected_permaslug) != null &&
        !summaryModelIds.has(stringValue(row.model_id) ?? ""),
    )
  ) {
    return false;
  }
  const slugByPermaslug = new Map<string, string>();
  for (const row of cacheRows) {
    if (row.row_kind !== "directory_model") {
      continue;
    }
    const slug = stringValue(row.slug);
    const permaslug = stringValue(row.permaslug);
    if (slug != null && permaslug != null) {
      slugByPermaslug.set(permaslug, slug);
    }
  }
  const candidateRows = cacheRows.filter((row) => row.row_kind === "permaslug_candidate");
  for (const row of candidateRows) {
    const modelId = stringValue(row.model_id);
    const permaslug = stringValue(row.permaslug);
    const candidateRoute = permaslug == null ? null : (slugByPermaslug.get(permaslug) ?? permaslug);
    if (
      modelId == null ||
      candidateRoute == null ||
      !isSameOpenRouterModelRoute(sanitizeModelId(modelId), sanitizeModelId(candidateRoute))
    ) {
      return false;
    }
  }
  return candidateRows.length > 0;
}

function openRouterModelRows(modelId: string, rows: CacheDbRow[]): OpenRouterSourceModel {
  const candidateRows = rows.filter((row) => row.row_kind === "permaslug_candidate");
  const statRows = rows.filter((row) => row.row_kind === "stat_point");
  const summaryRow = rows.find((row) => row.row_kind === "endpoint_summary");
  const statsRow = rows.find((row) => row.row_kind === "model_stats");
  const selectedPermaslug =
    stringValue(statsRow?.selected_permaslug) ??
    stringValue(summaryRow?.selected_permaslug) ??
    stringValue(statRows[0]?.selected_permaslug) ??
    stringValue(candidateRows[0]?.selected_permaslug);
  const performance: OpenRouterPerformance = {
    ...(summaryRow == null
      ? {}
      : {
          summary: {
            throughput_tokens_per_second_median: asFiniteNumber(
              summaryRow.throughput_tokens_per_second_median,
            ),
            latency_seconds_median: asFiniteNumber(summaryRow.latency_seconds_median),
            e2e_latency_seconds_median: asFiniteNumber(summaryRow.e2e_latency_seconds_median),
          },
        }),
    throughput: openRouterStatsResponse(statRows.filter((row) => row.metric === "throughput")),
    latency: openRouterStatsResponse(statRows.filter((row) => row.metric === "latency")),
    latency_e2e: openRouterStatsResponse(statRows.filter((row) => row.metric === "latency_e2e")),
    series_token_weights: seriesTokenWeights(statRows),
  };
  return {
    id: modelId,
    selected_permaslug: selectedPermaslug,
    candidate_permaslugs: candidateRows
      .sort(
        (left, right) =>
          (asFiniteNumber(left.candidate_index) ?? 0) -
          (asFiniteNumber(right.candidate_index) ?? 0),
      )
      .map((row) => stringValue(row.permaslug))
      .filter((permaslug): permaslug is string => permaslug != null),
    performance,
    pricing: cachedProviderWeightedPricing(statsRow),
  };
}

function openRouterStatsResponse(rowsToConvert: CacheDbRow[]): OpenRouterSeriesResponse {
  const pointsByX = new Map<string, { x: string | null; y: Record<string, number | null> }>();
  for (const [index, row] of rowsToConvert.entries()) {
    const series = stringValue(row.series);
    if (series == null) {
      continue;
    }
    const x = stringValue(row.x);
    const key = x ?? `__null_${index}`;
    const point = pointsByX.get(key) ?? { x, y: {} };
    point.y[series] = asFiniteNumber(row.value);
    pointsByX.set(key, point);
  }
  return {
    data: [...pointsByX.values()].map((point) => ({
      ...(point.x != null ? { x: point.x } : {}),
      y: point.y,
    })),
  };
}

function seriesTokenWeights(statRows: CacheDbRow[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const row of statRows) {
    const series = stringValue(row.series);
    const weight = asFiniteNumber(row.series_token_weight);
    if (series != null && weight != null && weight > 0) {
      weights[series] = weight;
    }
  }
  return weights;
}

/** Rehydrate already-weighted cached sides as one normalized unit for source-shape processing. */
function cachedProviderWeightedPricing(
  row: CacheDbRow | undefined,
): OpenRouterEffectivePricingResponse | null {
  if (row == null) {
    return null;
  }
  const weightedInput = asFiniteNumber(row.weighted_input_price_per_1m);
  const weightedOutput = asFiniteNumber(row.weighted_output_price_per_1m);
  if (weightedInput == null && weightedOutput == null) {
    return null;
  }
  return {
    data: {
      providerSummaries: [
        {
          effectiveInputPrice: weightedInput,
          effectiveOutputPrice: weightedOutput,
          totalTokens: 1,
        },
      ],
    },
  };
}
