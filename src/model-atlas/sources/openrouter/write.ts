/** SQLite writer for OpenRouter directory, route, stat-point, series-weight, route-price, and model summary source rows; it alone decides each row's `row_index`, which the match debug trace points at. */

import { asFiniteNumber, asRecord } from "../../runtime";
import type { DatabaseWriter } from "../../sqlite-utils";
import { SOURCE_URLS } from "../registry";
import { processOpenRouterModelStats } from "./stats";
import type { OpenRouterSeriesResponse, OpenRouterSourcePayload } from "./types";

type OpenRouterPointRow = {
  x: string | null;
  series: string;
  value: number | null;
};

type OpenRouterRawRowKind =
  | "directory_model"
  | "endpoint_summary"
  | "permaslug_candidate"
  | "stat_point"
  | "series_weight"
  | "route_price"
  | "model_stats";

type OpenRouterRawRow = {
  fetchedAtEpochSeconds: number | null;
  url: string;
  rowKind: OpenRouterRawRowKind;
  modelId?: string | null;
  slug?: string | null;
  permaslug?: string | null;
  candidateIndex?: number | null;
  selectedPermaslug?: string | null;
  metric?: string | null;
  x?: string | null;
  series?: string | null;
  value?: number | null;
  seriesTokenWeight?: number | null;
  throughput?: number | null;
  latency?: number | null;
  e2eLatency?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  cacheReadPrice?: number | null;
  cacheWritePrice?: number | null;
};

export function insertOpenRouterRawRows(
  db: DatabaseWriter,
  rawPayload: OpenRouterSourcePayload | null | undefined,
): void {
  if (rawPayload == null) {
    return;
  }
  const statement = db.prepare(`
		INSERT INTO openrouter_raw_rows (
			row_index, fetched_at_epoch_seconds, url, row_kind, model_id,
			slug, permaslug, candidate_index, selected_permaslug, metric, x, series,
			value, series_token_weight,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, input_price_per_1m, output_price_per_1m,
			cache_read_price_per_1m, cache_write_price_per_1m
		) VALUES (${Array.from({ length: 21 }, () => "?").join(", ")})
	`);
  let rowIndex = 0;
  for (const row of rawRows(rawPayload)) {
    statement.run(
      rowIndex,
      row.fetchedAtEpochSeconds,
      row.url,
      row.rowKind,
      row.modelId ?? null,
      row.slug ?? null,
      row.permaslug ?? null,
      row.candidateIndex ?? null,
      row.selectedPermaslug ?? null,
      row.metric ?? null,
      row.x ?? null,
      row.series ?? null,
      row.value ?? null,
      row.seriesTokenWeight ?? null,
      row.throughput ?? null,
      row.latency ?? null,
      row.e2eLatency ?? null,
      row.inputPrice ?? null,
      row.outputPrice ?? null,
      row.cacheReadPrice ?? null,
      row.cacheWritePrice ?? null,
    );
    rowIndex += 1;
  }
}

/** The `row_index` the writer gives each model's `model_stats` row, by model id. */
export function openRouterModelStatsRowIndexes(
  rawPayload: OpenRouterSourcePayload,
): Map<string, number> {
  const indexes = new Map<string, number>();
  let rowIndex = 0;
  for (const row of rawRows(rawPayload)) {
    if (row.rowKind === "model_stats" && row.modelId != null) indexes.set(row.modelId, rowIndex);
    rowIndex += 1;
  }
  return indexes;
}

/** Every stored row in `row_index` order: the directory, then each model's candidates, endpoint summary, stat points, series weights, route prices, and last its `model_stats` row. */
function* rawRows(rawPayload: OpenRouterSourcePayload): Generator<OpenRouterRawRow> {
  const fetchedAtEpochSeconds = rawPayload.fetched_at_epoch_seconds;
  for (const model of rawPayload.directory) {
    yield {
      fetchedAtEpochSeconds,
      url: SOURCE_URLS.openrouter_models,
      rowKind: "directory_model",
      slug: model.slug ?? null,
      permaslug: model.permaslug ?? null,
    };
  }
  for (const model of rawPayload.models) {
    const modelRow = {
      fetchedAtEpochSeconds,
      url: SOURCE_URLS.openrouter_stats,
      modelId: model.id,
    };
    for (const [candidateIndex, permaslug] of model.candidate_permaslugs.entries()) {
      yield {
        ...modelRow,
        rowKind: "permaslug_candidate",
        permaslug,
        candidateIndex,
        selectedPermaslug: model.selected_permaslug,
      };
    }
    if (model.selected_permaslug != null) {
      yield {
        ...modelRow,
        rowKind: "endpoint_summary",
        permaslug: model.selected_permaslug,
        selectedPermaslug: model.selected_permaslug,
        latency: model.performance.summary?.latency_seconds_median,
      };
    }
    for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
      for (const point of statPointRows(model.performance[metric])) {
        yield {
          ...modelRow,
          rowKind: "stat_point",
          permaslug: model.selected_permaslug,
          selectedPermaslug: model.selected_permaslug,
          metric,
          x: point.x,
          series: point.series,
          value: point.value,
        };
      }
    }
    // Token weights drift with every fetch, so each series stores its weight once rather than on every daily point, which would rewrite the whole series each refresh.
    for (const [series, weight] of Object.entries(model.performance.series_token_weights ?? {})) {
      const tokens = asFiniteNumber(weight);
      if (tokens == null) continue;
      yield { ...modelRow, rowKind: "series_weight", series, seriesTokenWeight: tokens };
    }
    for (const route of model.route_prices) {
      yield {
        ...modelRow,
        rowKind: "route_price",
        series: route.endpoint_id,
        seriesTokenWeight: route.tokens,
        inputPrice: route.input,
        outputPrice: route.output,
        cacheReadPrice: route.cache_read,
        cacheWritePrice: route.cache_write,
      };
    }
    const { performance } = processOpenRouterModelStats(
      model.id,
      model.performance,
      model.route_prices,
    );
    yield {
      ...modelRow,
      rowKind: "model_stats",
      permaslug: model.selected_permaslug,
      selectedPermaslug: model.selected_permaslug,
      throughput: performance.throughput_tokens_per_second_median,
      latency: performance.latency_seconds_median,
      e2eLatency: performance.e2e_latency_seconds_median,
    };
  }
}

function statPointRows(
  response: OpenRouterSeriesResponse | null | undefined,
): OpenRouterPointRow[] {
  const rows: OpenRouterPointRow[] = [];
  for (const point of response?.data ?? []) {
    for (const [series, value] of Object.entries(asRecord(point.y))) {
      rows.push({
        x: typeof point.x === "string" ? point.x : null,
        series,
        value: asFiniteNumber(value),
      });
    }
  }
  return rows;
}
