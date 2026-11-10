/** Relational writers persist final models, benchmark scores, and task metrics without nested storage. */

import { MODEL_ATLAS_BENCHMARK_KEYS } from "../../benchmarks/registry";
import type { ModelAtlasModel } from "../../stats/types";
import { type DatabaseWriter, sqliteBooleanValue, type SqlValue } from "./database";

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

/** Persists one scalar row per selected benchmark in deterministic portfolio order. */
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

/** Persists one scalar resource row per task-metric source in deterministic key order. */
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
