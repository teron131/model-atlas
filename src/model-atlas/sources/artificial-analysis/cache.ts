/** Artificial Analysis cache reconstruction from persisted raw source rows. */

import type { DatabaseSync } from "node:sqlite";

import { ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS } from "../../benchmarks/field-keys";
import { ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS } from "../../benchmarks/registry";
import { asFiniteNumber, asNonEmptyString, type JsonObject } from "../../runtime";
import {
  assignIfBoolean,
  assignIfNumber,
  assignIfString,
  type CacheDbRow,
  firstFetchedAt,
  nonEmptyRecord,
  queryCacheRows,
} from "../cache/rows";
import type { ArtificialAnalysisBenchmarkResourceRow } from "./benchmark-resources";
import { parseArtificialAnalysisReasoningEffort } from "./model-labels";

const ARTIFICIAL_ANALYSIS_USAGE_KEYS = [
  "input_cost",
  "reasoning_cost",
  "output_cost",
  "total_cost",
  "input_tokens",
  "reasoning_tokens",
  "answer_tokens",
  "output_tokens",
  "total_tokens",
  "cost_per_task",
  "seconds_per_task",
  "output_tokens_per_task",
] as const;

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

function rawRowFromCache(row: CacheDbRow): JsonObject {
  const tokenCounts: JsonObject = {};
  assignIfNumber(tokenCounts, "inputTokens", row.input_tokens);
  assignIfNumber(tokenCounts, "reasoningTokens", row.reasoning_tokens);
  assignIfNumber(tokenCounts, "answerTokens", row.answer_tokens);
  assignIfNumber(tokenCounts, "outputTokens", row.output_tokens);
  const rawRow: JsonObject = {};
  assignIfString(rawRow, "model_id", row.model_id);
  assignIfString(rawRow, "name", row.name);
  assignIfString(rawRow, "shortName", row.short_name);
  assignIfString(rawRow, "model_url", row.model_url);
  assignIfString(rawRow, "releaseDate", row.release_date);
  assignIfString(rawRow, "logo_url", row.logo_url);
  assignIfString(rawRow, "reasoning_effort", cachedReasoningEffort(row));
  assignIfNumber(rawRow, "price1mInputTokens", row.price_1m_input_tokens);
  assignIfNumber(rawRow, "price1mOutputTokens", row.price_1m_output_tokens);
  assignIfNumber(rawRow, "median_output_speed", row.median_output_tokens_per_second);
  assignIfNumber(rawRow, "medianTimeToFirstTokenSeconds", row.median_time_to_first_token_seconds);
  assignIfNumber(
    rawRow,
    "medianEndToEndResponseTimeSeconds",
    row.median_end_to_end_response_time_seconds,
  );
  assignIfBoolean(rawRow, "deprecated", row.deprecated);
  assignIfBoolean(rawRow, "reasoningModel", row.reasoning_model);
  assignIfBoolean(rawRow, "isOpenWeights", row.open_weights);
  assignIfBoolean(rawRow, "commercialAllowed", row.commercial_allowed);
  assignIfBoolean(rawRow, "input_modality_text", row.input_modality_text);
  assignIfBoolean(rawRow, "input_modality_image", row.input_modality_image);
  assignIfBoolean(rawRow, "input_modality_video", row.input_modality_video);
  assignIfBoolean(rawRow, "input_modality_speech", row.input_modality_speech);
  assignIfBoolean(rawRow, "output_modality_text", row.output_modality_text);
  assignIfBoolean(rawRow, "output_modality_image", row.output_modality_image);
  assignIfBoolean(rawRow, "output_modality_video", row.output_modality_video);
  assignIfBoolean(rawRow, "output_modality_speech", row.output_modality_speech);
  for (const key of ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS) {
    assignIfNumber(rawRow, key, row[key]);
  }
  for (const key of ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS) {
    assignIfNumber(rawRow, key, row[key]);
  }
  for (const key of ARTIFICIAL_ANALYSIS_USAGE_KEYS) {
    assignIfNumber(rawRow, key, row[key]);
  }
  if (nonEmptyRecord(tokenCounts) != null) {
    rawRow.intelligenceIndexTokenCounts = tokenCounts;
  }
  const creator: JsonObject = {};
  assignIfString(creator, "name", row.creator_name);
  assignIfString(creator, "logo_url", row.logo_url);
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
