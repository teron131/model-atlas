/** Model rows map models, their benchmark scores, and their task metrics to and from the `models`, `model_benchmarks`, and `model_task_metrics` tables. */

import { MODEL_ATLAS_BENCHMARK_KEYS } from "../benchmarks/registry";
import { canonicalReasoningEffort } from "../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../runtime";
import {
  booleanFromSql,
  type DatabaseWriter,
  type DbRow,
  sqliteBooleanValue,
  type SqlValue,
} from "../sqlite-utils";
import type {
  ModelAtlasBenchmarks,
  ModelAtlasContextWindow,
  ModelAtlasCost,
  ModelAtlasIntelligence,
  ModelAtlasModalities,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
} from "../stats/types";
import { scoreChangeFromJson } from "./change-log";

const MODEL_COLUMNS = [
  "row_index",
  "model_id",
  "provider_id",
  "name",
  "reasoning_effort",
  "logo",
  "reasoning",
  "release_date",
  "open_weights",
  "context",
  "context_input",
  "context_output",
  "input_modalities_json",
  "output_modalities_json",
  "throughput_tokens_per_second_median",
  "latency_seconds_median",
  "e2e_latency_seconds_median",
  "cost_input",
  "cost_output",
  "cost_cache_read",
  "cost_cache_write",
  "cost_weighted_input",
  "cost_weighted_output",
  "cost_weighted_cache_read",
  "cost_blended_price",
  "cost_blended_price_long_sessions",
  "cost_blended_price_short_tasks",
  "context_over_200k_input",
  "context_over_200k_output",
  "context_over_200k_cache_read",
  "context_over_200k_cache_write",
  "intelligence_index",
  "omniscience_index",
  "omniscience_accuracy",
  "component_intelligence_score",
  "component_agentic_score",
  "intelligence_score",
  "agentic_score",
  "speed_score",
  "value_score",
  "intelligence_confidence",
  "agentic_confidence",
  "speed_confidence",
  "value_confidence",
  "latest_change_json",
] as const;

export function insertModels(db: DatabaseWriter, models: readonly ModelAtlasModel[]): void {
  const statement = db.prepare(
    `INSERT INTO models (${MODEL_COLUMNS.join(", ")}) VALUES (${MODEL_COLUMNS.map(() => "?").join(", ")})`,
  );
  for (const [index, model] of models.entries()) {
    const values = modelColumnValues(model, index);
    statement.run(...MODEL_COLUMNS.map((column) => values[column]));
  }
}

/** Throws on a benchmark value without an observation date, so the checkpoint never stores an undated result. */
export function insertModelBenchmarks(
  db: DatabaseWriter,
  models: readonly ModelAtlasModel[],
): void {
  const statement = db.prepare(`
		INSERT INTO model_benchmarks (
			model_row_index, benchmark_key, value, observed_at
		) VALUES (?, ?, ?, ?)
	`);
  for (const [modelRowIndex, model] of models.entries()) {
    for (const benchmarkKey of MODEL_ATLAS_BENCHMARK_KEYS) {
      const value = model.benchmarks?.[benchmarkKey];
      if (value == null) {
        continue;
      }
      const observedAt = requiredObservationDate(
        model.benchmark_dates?.[benchmarkKey],
        `benchmark ${benchmarkKey}`,
      );
      statement.run(modelRowIndex, benchmarkKey, value, observedAt);
    }
  }
}

/** Throws on a metric without an observation date; a metric with only a cost stores it as its own observed cost at a cost-price ratio of 1. */
export function insertModelTaskMetrics(
  db: DatabaseWriter,
  models: readonly ModelAtlasModel[],
): void {
  const statement = db.prepare(`
		INSERT INTO model_task_metrics (
			model_row_index, source_key, quality, cost, observed_cost, seconds, tokens,
			input_tokens, output_tokens, observed_at, cost_price_ratio
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [modelRowIndex, model] of models.entries()) {
    const taskMetrics = model.task_metrics ?? {};
    for (const sourceKey of Object.keys(taskMetrics).sort()) {
      const metrics = taskMetrics[sourceKey];
      if (metrics == null) {
        continue;
      }
      const observedAt = requiredObservationDate(metrics.observed_at, `task metric ${sourceKey}`);
      statement.run(
        modelRowIndex,
        sourceKey,
        metrics.quality ?? null,
        metrics.cost ?? null,
        metrics.observed_cost ?? metrics.cost ?? null,
        metrics.seconds ?? null,
        metrics.tokens ?? null,
        metrics.input_tokens ?? null,
        metrics.output_tokens ?? null,
        observedAt,
        metrics.cost_price_ratio ?? (metrics.cost == null ? null : 1),
      );
    }
  }
}

/** Empty identity strings are stored as missing, as the reader expects. */
function modelColumnValues(
  model: ModelAtlasModel,
  rowIndex: number,
): Record<(typeof MODEL_COLUMNS)[number], SqlValue> {
  const modelId = model.id || null;
  const { context_window: context, speed, cost, intelligence, scores, confidence } = model;
  const contextOver200k = cost?.context_over_200k;
  return {
    row_index: rowIndex,
    model_id: modelId,
    provider_id: model.provider || (modelId?.split("/")[0] ?? null),
    name: model.name || null,
    reasoning_effort: model.reasoning_effort || null,
    logo: model.logo || null,
    reasoning: sqliteBooleanValue(model.reasoning),
    release_date: model.release_date || null,
    open_weights: sqliteBooleanValue(model.open_weights),
    context: context?.context ?? null,
    context_input: context?.input ?? null,
    context_output: context?.output ?? null,
    input_modalities_json: modalitiesJson(model.modalities?.input),
    output_modalities_json: modalitiesJson(model.modalities?.output),
    throughput_tokens_per_second_median: speed.throughput_tokens_per_second_median,
    latency_seconds_median: speed.latency_seconds_median,
    e2e_latency_seconds_median: speed.e2e_latency_seconds_median,
    cost_input: cost?.input ?? null,
    cost_output: cost?.output ?? null,
    cost_cache_read: cost?.cache_read ?? null,
    cost_cache_write: cost?.cache_write ?? null,
    cost_weighted_input: cost?.weighted_input ?? null,
    cost_weighted_output: cost?.weighted_output ?? null,
    cost_weighted_cache_read: cost?.weighted_cache_read ?? null,
    cost_blended_price: cost?.blended_price ?? null,
    cost_blended_price_long_sessions: cost?.blended_price_long_sessions ?? null,
    cost_blended_price_short_tasks: cost?.blended_price_short_tasks ?? null,
    context_over_200k_input: contextOver200k?.input ?? null,
    context_over_200k_output: contextOver200k?.output ?? null,
    context_over_200k_cache_read: contextOver200k?.cache_read ?? null,
    context_over_200k_cache_write: contextOver200k?.cache_write ?? null,
    intelligence_index: intelligence?.intelligence_index ?? null,
    omniscience_index: intelligence?.omniscience_index ?? null,
    omniscience_accuracy: intelligence?.omniscience_accuracy ?? null,
    component_intelligence_score: model.component_scores.intelligence_score,
    component_agentic_score: model.component_scores.agentic_score,
    intelligence_score: scores.intelligence_score,
    agentic_score: scores.agentic_score,
    speed_score: scores.speed_score,
    value_score: scores.value_score,
    intelligence_confidence: confidence.intelligence,
    agentic_confidence: confidence.agentic,
    speed_confidence: confidence.speed,
    value_confidence: confidence.value,
    latest_change_json: model.latest_change == null ? null : JSON.stringify(model.latest_change),
  };
}

/** Store a modality list verbatim, because the processed models mix source vocabularies such as `audio`, `speech`, and `pdf`. */
function modalitiesJson(values: readonly string[] | undefined): string | null {
  return values != null && values.length > 0 ? JSON.stringify(values) : null;
}

function requiredObservationDate(value: string | null | undefined, label: string): string {
  if (value != null && value.length > 0) {
    return value;
  }
  throw new Error(`Missing observation date for ${label}`);
}

const INTELLIGENCE_KEYS = [
  "intelligence_index",
  "omniscience_index",
  "omniscience_accuracy",
] as const satisfies readonly (keyof ModelAtlasIntelligence)[];

function hasFields(record: object): boolean {
  return Object.keys(record).length > 0;
}

function assignNumber(target: Record<string, unknown>, key: string, value: unknown): void {
  const numericValue = asFiniteNumber(value);
  if (numericValue != null) {
    target[key] = numericValue;
  }
}

function numericObject<T extends object>(row: DbRow, keys: readonly string[]): T | null {
  const record: Record<string, number> = {};
  for (const key of keys) {
    assignNumber(record, key, row[key]);
  }
  return hasFields(record) ? (record as T) : null;
}

function buildModalities(row: DbRow): ModelAtlasModalities | null {
  const input = modalitiesFromJson(row.input_modalities_json);
  const output = modalitiesFromJson(row.output_modalities_json);
  return input == null && output == null
    ? null
    : { ...(input == null ? {} : { input }), ...(output == null ? {} : { output }) };
}

function modalitiesFromJson(value: unknown): string[] | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((item) => typeof item === "string")
    ? parsed
    : null;
}

function buildContextWindow(row: DbRow): ModelAtlasContextWindow {
  const contextWindow: NonNullable<ModelAtlasContextWindow> = {};
  assignNumber(contextWindow, "context", row.context);
  assignNumber(contextWindow, "input", row.context_input);
  assignNumber(contextWindow, "output", row.context_output);
  return hasFields(contextWindow) ? contextWindow : null;
}

function buildCost(row: DbRow): ModelAtlasCost {
  const cost: Record<string, unknown> = {};
  assignNumber(cost, "input", row.cost_input);
  assignNumber(cost, "output", row.cost_output);
  assignNumber(cost, "cache_read", row.cost_cache_read);
  assignNumber(cost, "cache_write", row.cost_cache_write);
  assignNumber(cost, "weighted_input", row.cost_weighted_input);
  assignNumber(cost, "weighted_output", row.cost_weighted_output);
  assignNumber(cost, "weighted_cache_read", row.cost_weighted_cache_read);
  assignNumber(cost, "blended_price", row.cost_blended_price);
  assignNumber(cost, "blended_price_long_sessions", row.cost_blended_price_long_sessions);
  assignNumber(cost, "blended_price_short_tasks", row.cost_blended_price_short_tasks);
  const contextOver200k: Record<string, number> = {};
  assignNumber(contextOver200k, "input", row.context_over_200k_input);
  assignNumber(contextOver200k, "output", row.context_over_200k_output);
  assignNumber(contextOver200k, "cache_read", row.context_over_200k_cache_read);
  assignNumber(contextOver200k, "cache_write", row.context_over_200k_cache_write);
  if (hasFields(contextOver200k)) {
    cost.context_over_200k = contextOver200k;
  }
  return hasFields(cost) ? (cost as NonNullable<ModelAtlasCost>) : null;
}

export function scoredCandidateFromRow(
  row: DbRow,
  benchmarks: ModelAtlasBenchmarks | null,
  benchmarkDates: Record<string, string> | null,
  taskMetrics: ModelAtlasTaskMetrics,
): ModelAtlasScoredCandidate {
  const modelId = asNonEmptyString(row.model_id);
  const provider = asNonEmptyString(row.provider_id) ?? modelId?.split("/")[0] ?? null;
  return {
    id: modelId,
    name: asNonEmptyString(row.name),
    provider,
    logo: asNonEmptyString(row.logo) ?? "",
    reasoning: booleanFromSql(row.reasoning),
    reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
    release_date: asNonEmptyString(row.release_date),
    modalities: buildModalities(row),
    open_weights: booleanFromSql(row.open_weights),
    cost: buildCost(row),
    context_window: buildContextWindow(row),
    speed: {
      throughput_tokens_per_second_median:
        asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
      latency_seconds_median: asFiniteNumber(row.latency_seconds_median) ?? null,
      e2e_latency_seconds_median: asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
    },
    intelligence: numericObject<ModelAtlasIntelligence>(row, INTELLIGENCE_KEYS),
    task_metrics: taskMetrics,
    benchmarks,
    benchmark_dates: benchmarkDates,
    confidence: {
      intelligence: asFiniteNumber(row.intelligence_confidence) ?? null,
      agentic: asFiniteNumber(row.agentic_confidence) ?? null,
      speed: asFiniteNumber(row.speed_confidence) ?? null,
      value: asFiniteNumber(row.value_confidence) ?? null,
    },
    latest_change: scoreChangeFromJson(row.latest_change_json),
    component_scores: {
      intelligence_score: asFiniteNumber(row.component_intelligence_score) ?? null,
      agentic_score: asFiniteNumber(row.component_agentic_score) ?? null,
    },
    scores: {
      intelligence_score: asFiniteNumber(row.intelligence_score) ?? null,
      agentic_score: asFiniteNumber(row.agentic_score) ?? null,
      speed_score: asFiniteNumber(row.speed_score) ?? null,
      value_score: asFiniteNumber(row.value_score) ?? null,
    },
  };
}

export function benchmarksByModelRow(rows: readonly DbRow[]): Map<number, ModelAtlasBenchmarks> {
  const benchmarksByModel = new Map<number, ModelAtlasBenchmarks>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const benchmarkKey = asNonEmptyString(row.benchmark_key);
    const value = asFiniteNumber(row.value);
    if (modelRowIndex == null || benchmarkKey == null || value == null) {
      continue;
    }
    const benchmarks = benchmarksByModel.get(modelRowIndex) ?? {};
    benchmarks[benchmarkKey] = value;
    benchmarksByModel.set(modelRowIndex, benchmarks);
  }
  return benchmarksByModel;
}

export function benchmarkDatesByModelRow(
  rows: readonly DbRow[],
): Map<number, Record<string, string>> {
  const benchmarkDatesByModel = new Map<number, Record<string, string>>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const benchmarkKey = asNonEmptyString(row.benchmark_key);
    const observedAt = asNonEmptyString(row.observed_at);
    if (modelRowIndex == null || benchmarkKey == null || observedAt == null) {
      continue;
    }
    const dates = benchmarkDatesByModel.get(modelRowIndex) ?? {};
    dates[benchmarkKey] = observedAt;
    benchmarkDatesByModel.set(modelRowIndex, dates);
  }
  return benchmarkDatesByModel;
}

export function taskMetricsByModelRow(
  rows: readonly DbRow[],
): Map<number, NonNullable<ModelAtlasTaskMetrics>> {
  const taskMetricsByModel = new Map<number, NonNullable<ModelAtlasTaskMetrics>>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const sourceKey = asNonEmptyString(row.source_key);
    if (modelRowIndex == null || sourceKey == null) {
      continue;
    }
    const metrics: ModelAtlasTaskMetricValues = {};
    assignNumber(metrics, "quality", row.quality);
    assignNumber(metrics, "cost", row.cost);
    assignNumber(metrics, "observed_cost", row.observed_cost);
    assignNumber(metrics, "seconds", row.seconds);
    assignNumber(metrics, "tokens", row.tokens);
    assignNumber(metrics, "input_tokens", row.input_tokens);
    assignNumber(metrics, "output_tokens", row.output_tokens);
    assignNumber(metrics, "cost_price_ratio", row.cost_price_ratio);
    const observedAt = asNonEmptyString(row.observed_at);
    if (observedAt != null) {
      metrics.observed_at = observedAt;
    }
    const taskMetrics = taskMetricsByModel.get(modelRowIndex) ?? {};
    taskMetrics[sourceKey] = metrics;
    taskMetricsByModel.set(modelRowIndex, taskMetrics);
  }
  return taskMetricsByModel;
}
