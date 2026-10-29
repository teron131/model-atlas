/** Artificial Analysis cache reconstruction from persisted raw source rows. */

import type { DatabaseSync } from "node:sqlite";

import { asFiniteNumber, asNonEmptyString, type JsonObject } from "../../runtime";
import {
  assignIfBoolean,
  assignIfNumber,
  assignIfString,
  type CacheDbRow,
  firstFetchedAt,
  jsonValue,
  nonEmptyRecord,
  queryCacheRows,
} from "../cache/rows";
import type { ArtificialAnalysisBenchmarkResourceRow } from "./benchmark-resources";
import { parseArtificialAnalysisReasoningEffort } from "./model-labels";

/** Hidden retained Artificial Analysis rows prove the cache is new enough to preserve deprecated benchmark carriers. */
export function artificialAnalysisCacheHasDeprecatedRows(db: DatabaseSync): boolean {
  return (
    queryCacheRows(db, "SELECT 1 FROM artificial_analysis_raw_models WHERE deprecated = 1 LIMIT 1")
      .length > 0
  );
}

export function readArtificialAnalysisRawCache(db: DatabaseSync): {
  rows: JsonObject[];
  fetchedAt: number | null;
} | null {
  const cacheRows = queryCacheRows(
    db,
    "SELECT * FROM artificial_analysis_raw_models ORDER BY row_index",
  );
  if (cacheRows.length === 0) {
    return null;
  }
  return {
    rows: cacheRows.map((row) => rawRowFromCache(row)),
    fetchedAt: firstFetchedAt(cacheRows),
  };
}

export function artificialAnalysisBenchmarkResourceRawCacheFromRows(cacheRows: CacheDbRow[]): {
  rows: ArtificialAnalysisBenchmarkResourceRow[];
  fetchedAt: number | null;
} | null {
  if (cacheRows.length === 0) {
    return null;
  }
  return {
    rows: cacheRows.flatMap((row) => {
      const benchmarkKey = asNonEmptyString(row.benchmark_key);
      const sourceUrl = asNonEmptyString(row.url);
      const modelId = asNonEmptyString(row.model_id);
      const model = asNonEmptyString(row.model);
      const provider = asNonEmptyString(row.provider);
      const score = asFiniteNumber(row.score);
      const taskCount = asFiniteNumber(row.task_run_count);
      const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
      const secondsPerTask = asFiniteNumber(row.seconds_per_task);
      const tokensPerTask = asFiniteNumber(row.tokens_per_task);
      const inputTokensPerTask = asFiniteNumber(row.input_tokens_per_task);
      const outputTokensPerTask = asFiniteNumber(row.output_tokens_per_task);
      if (
        benchmarkKey == null ||
        sourceUrl == null ||
        modelId == null ||
        model == null ||
        provider == null ||
        score == null ||
        taskCount == null
      ) {
        return [];
      }
      return [
        {
          benchmark_key: benchmarkKey,
          source_url: sourceUrl,
          benchmark_version: asNonEmptyString(row.benchmark_version),
          model_id: modelId,
          model,
          provider,
          provider_id: asNonEmptyString(row.provider_id),
          reasoning_effort: asNonEmptyString(row.reasoning_effort),
          score,
          task_run_count: taskCount,
          cost_per_task_usd: costPerTaskUsd,
          seconds_per_task: secondsPerTask,
          tokens_per_task: tokensPerTask,
          input_tokens_per_task: inputTokensPerTask,
          output_tokens_per_task: outputTokensPerTask,
          answer_tokens_per_task: asFiniteNumber(row.answer_tokens_per_task),
          reasoning_tokens_per_task: asFiniteNumber(row.reasoning_tokens_per_task),
        },
      ];
    }),
    fetchedAt: firstFetchedAt(cacheRows),
  };
}

export function readArtificialAnalysisBenchmarkResourceRawCache(db: DatabaseSync) {
  return artificialAnalysisBenchmarkResourceRawCacheFromRows(
    queryCacheRows(db, "SELECT * FROM artificial_analysis_benchmarks_raw_rows ORDER BY row_index"),
  );
}

/** Rows are rebuilt in the model page's own field names and nested shapes, so cached and fetched rows share one projection; only the derived model id and URL are stored flat. */
function rawRowFromCache(row: CacheDbRow): JsonObject {
  const rawRow: JsonObject = {};
  assignIfString(rawRow, "model_id", row.model_id);
  assignIfString(rawRow, "name", row.name);
  assignIfString(rawRow, "shortName", row.short_name);
  assignIfString(rawRow, "model_url", row.model_url);
  assignIfString(rawRow, "releaseDate", row.release_date);
  assignIfString(rawRow, "reasoning_effort", cachedReasoningEffort(row));
  assignIfNumber(rawRow, "price1mInputTokens", row.price_1m_input_tokens);
  assignIfNumber(rawRow, "price1mOutputTokens", row.price_1m_output_tokens);
  const timescaleData: JsonObject = {};
  assignIfNumber(timescaleData, "medianOutputSpeed", row.median_output_tokens_per_second);
  assignIfNumber(timescaleData, "medianTimeToFirstChunk", row.median_time_to_first_token_seconds);
  if (nonEmptyRecord(timescaleData) != null) rawRow.timescaleData = timescaleData;
  const endToEndResponseTime: JsonObject = {};
  assignIfNumber(endToEndResponseTime, "total", row.median_end_to_end_response_time_seconds);
  if (nonEmptyRecord(endToEndResponseTime) != null) {
    rawRow.endToEndResponseTime = endToEndResponseTime;
  }
  assignIfBoolean(rawRow, "deprecated", row.deprecated);
  assignIfBoolean(rawRow, "isReasoning", row.reasoning_model);
  assignIfBoolean(rawRow, "isOpenWeights", row.open_weights);
  assignIfBoolean(rawRow, "inputModalityText", row.input_modality_text);
  assignIfBoolean(rawRow, "inputModalityImage", row.input_modality_image);
  assignIfBoolean(rawRow, "inputModalityVideo", row.input_modality_video);
  assignIfBoolean(rawRow, "inputModalitySpeech", row.input_modality_speech);
  assignIfBoolean(rawRow, "outputModalityText", row.output_modality_text);
  assignIfBoolean(rawRow, "outputModalityImage", row.output_modality_image);
  assignIfBoolean(rawRow, "outputModalityVideo", row.output_modality_video);
  assignIfBoolean(rawRow, "outputModalitySpeech", row.output_modality_speech);
  assignIfNumber(rawRow, "intelligenceIndex", row.intelligence_index);
  assignIfNumber(rawRow, "omniscience", row.omniscience_index);
  assignIfString(rawRow, "intelligenceIndexVersion", row.intelligence_index_version);
  const components = jsonValue(row.intelligence_index_components);
  if (Array.isArray(components)) rawRow.intelligenceIndexComponents = components;
  const costPerTask = asFiniteNumber(row.cost_per_task);
  if (costPerTask != null) rawRow.intelligenceIndexCostPerTask = { cost: { total: costPerTask } };
  assignIfNumber(rawRow, "intelligenceIndexTimePerTask", row.seconds_per_task);
  const outputTokensPerTask = asFiniteNumber(row.output_tokens_per_task);
  if (outputTokensPerTask != null) {
    rawRow.intelligenceIndexOutputTokensPerTask = { output: outputTokensPerTask };
  }
  const creator: JsonObject = {};
  assignIfString(creator, "name", row.creator_name);
  assignIfString(creator, "logo", row.logo_url);
  if (nonEmptyRecord(creator) != null) {
    rawRow.creator = creator;
  }
  return rawRow;
}

function cachedReasoningEffort(row: CacheDbRow): string | null {
  return (
    asNonEmptyString(row.reasoning_effort) ??
    parseArtificialAnalysisReasoningEffort(row.name, row.short_name)
  );
}
