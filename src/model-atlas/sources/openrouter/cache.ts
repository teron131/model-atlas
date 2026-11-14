/** Rebuilds an OpenRouter payload from its raw rows in the SQLite checkpoint and decides whether those rows have the current stored shape. */

import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import {
  type CacheDbRow,
  type CacheRowSource,
  firstFetchedAt,
  sourceCacheRows,
} from "../cache/rows";
import { resolveOpenRouterPermaslugCandidates } from "./stats";
import type {
  OpenRouterFrontendModel,
  OpenRouterPerformance,
  OpenRouterRoutePrice,
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
  const fetchedAt = firstFetchedAt(cacheRows);
  if (fetchedAt == null) {
    return null;
  }
  const directory: OpenRouterFrontendModel[] = [];
  const modelIds: string[] = [];
  const rowsByModel = new Map<string, CacheDbRow[]>();
  for (const row of cacheRows) {
    if (row.row_kind === "directory_model") {
      directory.push({
        slug: asNonEmptyString(row.slug),
        permaslug: asNonEmptyString(row.permaslug),
      });
    }
    const modelId = asNonEmptyString(row.model_id);
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
    models: modelIds.map((modelId) =>
      openRouterSourceModelFromRows(modelId, rowsByModel.get(modelId)!),
    ),
  };
}

/** Validate summary presence, route prices, series weights, and candidate routes without reading unrelated time-series values from SQLite. */
export function openRouterCacheHasCurrentShape(cache: CacheRowSource): boolean {
  const cacheRows = sourceCacheRows(
    cache,
    `SELECT row_kind, model_id, selected_permaslug, slug, permaslug
     FROM openrouter_raw_rows
     WHERE row_kind IN ('directory_model', 'model_stats', 'endpoint_summary', 'permaslug_candidate', 'route_price')
     ORDER BY row_index`,
  );
  // Caches written before route prices were stored resolved routes without pricing any of them.
  if (
    cacheRows.some(
      (row) => row.row_kind === "model_stats" && asNonEmptyString(row.selected_permaslug) != null,
    ) &&
    !cacheRows.some((row) => row.row_kind === "route_price")
  ) {
    return false;
  }
  // Caches written before series weights had their own rows repeated each weight on every stat point and hold no weight rows.
  if (
    sourceCacheRows(
      cache,
      "SELECT row_kind, series_token_weight FROM openrouter_raw_rows WHERE row_kind = 'stat_point' AND series_token_weight IS NOT NULL LIMIT 1",
    ).some((row) => row.row_kind === "stat_point" && row.series_token_weight != null)
  ) {
    return false;
  }
  const summaryModelIds = new Set(
    cacheRows
      .filter((row) => row.row_kind === "endpoint_summary")
      .map((row) => asNonEmptyString(row.model_id))
      .filter((modelId): modelId is string => modelId != null),
  );
  if (
    cacheRows.some(
      (row) =>
        row.row_kind === "model_stats" &&
        asNonEmptyString(row.selected_permaslug) != null &&
        !summaryModelIds.has(asNonEmptyString(row.model_id) ?? ""),
    )
  ) {
    return false;
  }
  const permaslugBySlug = new Map<string, string>();
  for (const row of cacheRows) {
    if (row.row_kind !== "directory_model") {
      continue;
    }
    const slug = asNonEmptyString(row.slug);
    const permaslug = asNonEmptyString(row.permaslug);
    if (slug != null && permaslug != null) {
      permaslugBySlug.set(slug, permaslug);
    }
  }
  const availableSlugs = [...permaslugBySlug.keys()];
  const resolvedByModel = new Map<string, Set<string>>();
  const candidateRows = cacheRows.filter((row) => row.row_kind === "permaslug_candidate");
  // Candidates are checked with the fetch's own resolver, aliases included; one it would not pick now came from an older matcher.
  for (const row of candidateRows) {
    const modelId = asNonEmptyString(row.model_id);
    const permaslug = asNonEmptyString(row.permaslug);
    if (modelId == null || permaslug == null) {
      return false;
    }
    const resolved =
      resolvedByModel.get(modelId) ??
      new Set(resolveOpenRouterPermaslugCandidates(modelId, availableSlugs, permaslugBySlug));
    resolvedByModel.set(modelId, resolved);
    if (!resolved.has(permaslug)) {
      return false;
    }
  }
  return candidateRows.length > 0;
}

function openRouterSourceModelFromRows(modelId: string, rows: CacheDbRow[]): OpenRouterSourceModel {
  const candidateRows = rows.filter((row) => row.row_kind === "permaslug_candidate");
  const statRows = rows.filter((row) => row.row_kind === "stat_point");
  const summaryRow = rows.find((row) => row.row_kind === "endpoint_summary");
  const statsRow = rows.find((row) => row.row_kind === "model_stats");
  const selectedPermaslug =
    asNonEmptyString(statsRow?.selected_permaslug) ??
    asNonEmptyString(summaryRow?.selected_permaslug) ??
    asNonEmptyString(statRows[0]?.selected_permaslug) ??
    asNonEmptyString(candidateRows[0]?.selected_permaslug);
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
    throughput: openRouterSeriesResponseFromRows(
      statRows.filter((row) => row.metric === "throughput"),
    ),
    latency: openRouterSeriesResponseFromRows(statRows.filter((row) => row.metric === "latency")),
    latency_e2e: openRouterSeriesResponseFromRows(
      statRows.filter((row) => row.metric === "latency_e2e"),
    ),
    series_token_weights: seriesTokenWeights(
      rows.filter((row) => row.row_kind === "series_weight"),
    ),
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
      .map((row) => asNonEmptyString(row.permaslug))
      .filter((permaslug): permaslug is string => permaslug != null),
    performance,
    route_prices: rows.flatMap((row) => {
      const route = row.row_kind === "route_price" ? cachedRoutePrice(row) : null;
      return route == null ? [] : [route];
    }),
  };
}

function cachedRoutePrice(row: CacheDbRow): OpenRouterRoutePrice | null {
  const endpointId = asNonEmptyString(row.series);
  const tokens = asFiniteNumber(row.series_token_weight);
  const input = asFiniteNumber(row.input_price_per_1m);
  const output = asFiniteNumber(row.output_price_per_1m);
  if (endpointId == null || tokens == null || input == null || output == null) return null;
  return {
    endpoint_id: endpointId,
    tokens,
    input,
    output,
    cache_read: asFiniteNumber(row.cache_read_price_per_1m),
    cache_write: asFiniteNumber(row.cache_write_price_per_1m),
  };
}

function openRouterSeriesResponseFromRows(rowsToConvert: CacheDbRow[]): OpenRouterSeriesResponse {
  const pointsByX = new Map<string, { x: string | null; y: Record<string, number | null> }>();
  for (const [index, row] of rowsToConvert.entries()) {
    const series = asNonEmptyString(row.series);
    if (series == null) {
      continue;
    }
    const x = asNonEmptyString(row.x);
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

function seriesTokenWeights(weightRows: CacheDbRow[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const row of weightRows) {
    const series = asNonEmptyString(row.series);
    const weight = asFiniteNumber(row.series_token_weight);
    if (series != null && weight != null && weight > 0) {
      weights[series] = weight;
    }
  }
  return weights;
}
