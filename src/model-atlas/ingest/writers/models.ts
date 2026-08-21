/** Relational writers persist final models, benchmark benchmarks, and task metrics without nested storage. */

import { MODEL_ATLAS_BENCHMARK_KEYS } from "../../benchmarks/registry";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import {
  type DatabaseWriter,
  firstString,
  modalityFlagValue,
  sqliteBooleanValue,
  type SqlValue,
} from "./database";

function modelIdentityValues(model: JsonObject): SqlValue[] {
  const modelId = firstString(model, ["id"]);
  return [
    modelId,
    firstString(model, ["provider_id"]) ??
      firstString(model, ["provider"]) ??
      modelId?.split("/")[0] ??
      null,
    firstString(model, ["name"]),
    firstString(model, ["reasoning_effort"]),
    firstString(model, ["logo"]),
    sqliteBooleanValue(model.reasoning),
    firstString(model, ["release_date"]),
    sqliteBooleanValue(model.open_weights),
  ];
}

function modelContextValues(model: JsonObject): SqlValue[] {
  const context = asRecord(model.context_window);
  const limit = asRecord(model.limit);
  const modalities = asRecord(model.modalities);
  return [
    asFiniteNumber(context.context) ?? asFiniteNumber(limit.context),
    asFiniteNumber(context.input) ?? asFiniteNumber(limit.input),
    asFiniteNumber(context.output) ?? asFiniteNumber(limit.output),
    modalityFlagValue(modalities.input, "text"),
    modalityFlagValue(modalities.input, "image"),
    modalityFlagValue(modalities.input, "audio"),
    modalityFlagValue(modalities.input, "video"),
  ];
}

function modelSpeedAndCostValues(model: JsonObject): SqlValue[] {
  const speed = asRecord(model.speed);
  const cost = asRecord(model.cost);
  const contextOver200k = asRecord(cost.context_over_200k);
  return [
    asFiniteNumber(speed.throughput_tokens_per_second_median),
    asFiniteNumber(speed.latency_seconds_median),
    asFiniteNumber(speed.e2e_latency_seconds_median),
    asFiniteNumber(cost.input),
    asFiniteNumber(cost.output),
    asFiniteNumber(cost.cache_read),
    asFiniteNumber(cost.cache_write),
    asFiniteNumber(cost.weighted_input),
    asFiniteNumber(cost.weighted_output),
    asFiniteNumber(cost.blended_price),
    asFiniteNumber(contextOver200k.input),
    asFiniteNumber(contextOver200k.output),
    asFiniteNumber(contextOver200k.cache_read),
    asFiniteNumber(contextOver200k.cache_write),
  ];
}

function modelIntelligenceValues(model: JsonObject): SqlValue[] {
  const intelligence = asRecord(model.intelligence);
  return [
    asFiniteNumber(intelligence.intelligence_index),
    asFiniteNumber(intelligence.agentic_index),
    asFiniteNumber(intelligence.coding_index),
    asFiniteNumber(intelligence.omniscience_index),
    asFiniteNumber(intelligence.omniscience_accuracy),
  ];
}

function modelScoreValues(model: JsonObject): SqlValue[] {
  const componentScores = asRecord(model.component_scores);
  const scores = asRecord(model.scores);
  const confidence = asRecord(model.confidence);
  return [
    asFiniteNumber(componentScores.intelligence_score),
    asFiniteNumber(componentScores.agentic_score),
    asFiniteNumber(componentScores.speed_score),
    asFiniteNumber(scores.intelligence_score),
    asFiniteNumber(scores.agentic_score),
    asFiniteNumber(scores.speed_score),
    asFiniteNumber(scores.value_score),
    asFiniteNumber(confidence.intelligence),
    asFiniteNumber(confidence.agentic),
    asFiniteNumber(confidence.speed),
    asFiniteNumber(confidence.value),
    model.latest_change == null ? null : JSON.stringify(model.latest_change),
  ];
}

function requiredObservationDate(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing observation date for ${label}`);
}

export function insertModels(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT INTO models (
			row_index, model_id, provider_id, name,
			reasoning_effort, logo,
			reasoning, release_date,
			open_weights, context, context_input, context_output, input_modality_text,
			input_modality_image, input_modality_audio, input_modality_video,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, cost_input, cost_output, cost_cache_read,
			cost_cache_write, cost_weighted_input, cost_weighted_output,
			cost_blended_price, context_over_200k_input, context_over_200k_output,
			context_over_200k_cache_read, context_over_200k_cache_write,
			intelligence_index, agentic_index, coding_index, omniscience_index,
			omniscience_accuracy,
			component_intelligence_score, component_agentic_score, component_speed_score,
			intelligence_score, agentic_score,
			speed_score,
			value_score,
			intelligence_confidence, agentic_confidence, speed_confidence, value_confidence,
			latest_change_json
		) VALUES (${Array.from({ length: 47 }, () => "?").join(", ")})
	`);
  for (const [index, row] of rows.entries()) {
    const model = asRecord(row);
    statement.run(
      index,
      ...modelIdentityValues(model),
      ...modelContextValues(model),
      ...modelSpeedAndCostValues(model),
      ...modelIntelligenceValues(model),
      ...modelScoreValues(model),
    );
  }
}

/** Persists one scalar row per selected benchmark in deterministic portfolio order. */
export function insertModelBenchmarks(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT INTO model_benchmarks (
			model_row_index, benchmark_key, value, observed_at
		) VALUES (?, ?, ?, ?)
	`);
  for (const [modelRowIndex, row] of rows.entries()) {
    const model = asRecord(row);
    const benchmarks = asRecord(model.benchmarks);
    const benchmarkDates = asRecord(model.benchmark_dates);
    for (const benchmarkKey of MODEL_ATLAS_BENCHMARK_KEYS) {
      const value = asFiniteNumber(benchmarks[benchmarkKey]);
      if (value == null) {
        continue;
      }
      const observedAt = requiredObservationDate(
        benchmarkDates[benchmarkKey],
        `benchmark ${benchmarkKey}`,
      );
      statement.run(modelRowIndex, benchmarkKey, value, observedAt);
    }
  }
}

/** Persists one scalar resource row per task-metric source in deterministic key order. */
export function insertModelTaskMetrics(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT INTO model_task_metrics (
			model_row_index, source_key, cost, observed_cost, seconds, tokens,
			input_tokens, output_tokens, observed_at, cost_price_ratio
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [modelRowIndex, row] of rows.entries()) {
    const taskMetrics = asRecord(asRecord(row).task_metrics);
    for (const sourceKey of Object.keys(taskMetrics).sort()) {
      const sourceMetrics = taskMetrics[sourceKey];
      if (
        sourceMetrics == null ||
        typeof sourceMetrics !== "object" ||
        Array.isArray(sourceMetrics)
      ) {
        continue;
      }
      const metrics = asRecord(sourceMetrics);
      const observedAt = requiredObservationDate(metrics.observed_at, `task metric ${sourceKey}`);
      statement.run(
        modelRowIndex,
        sourceKey,
        asFiniteNumber(metrics.cost),
        asFiniteNumber(metrics.observed_cost) ?? asFiniteNumber(metrics.cost),
        asFiniteNumber(metrics.seconds),
        asFiniteNumber(metrics.tokens),
        asFiniteNumber(metrics.input_tokens),
        asFiniteNumber(metrics.output_tokens),
        observedAt,
        asFiniteNumber(metrics.cost_price_ratio) ??
          (asFiniteNumber(metrics.cost) == null ? null : 1),
      );
    }
  }
}

/** Appends dated benchmark revisions; the composite key makes refresh retries idempotent. */
export function insertBenchmarkVersionLog(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO benchmark_version_log (
			model_id, reasoning_effort, benchmark_key, metric_kind,
			version_date, change_kind, value_json
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
  for (const row of rows) {
    const revision = asRecord(row);
    statement.run(
      firstString(revision, ["model_id"]),
      typeof revision.reasoning_effort === "string" ? revision.reasoning_effort : "",
      firstString(revision, ["benchmark_key"]),
      firstString(revision, ["metric_kind"]),
      firstString(revision, ["version_date"]),
      firstString(revision, ["change_kind"]),
      typeof revision.value_json === "string" ? revision.value_json : null,
    );
  }
}

/** Appends one bounded summary for each refresh that reached publication. */
export function insertRefreshRuns(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO refresh_runs (
			refresh_id, previous_refresh_id, methodology_changed,
			model_change_count, score_change_count
		) VALUES (?, ?, ?, ?, ?)
	`);
  for (const row of rows) {
    const refresh = asRecord(row);
    statement.run(
      asFiniteNumber(refresh.refresh_id),
      asFiniteNumber(refresh.previous_refresh_id),
      sqliteBooleanValue(refresh.methodology_changed),
      asFiniteNumber(refresh.model_change_count),
      asFiniteNumber(refresh.score_change_count),
    );
  }
}

/** Appends only material score dimensions together with their bounded cause and rank-alignment evidence. */
export function insertModelScoreChanges(db: DatabaseWriter, rows: readonly unknown[]): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO model_score_changes (
			refresh_id, model_id, reasoning_effort, score_key,
			score_before, score_after, score_delta, rank_before, rank_after,
			confidence_before, confidence_after, causes_json, rank_drivers_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const row of rows) {
    const change = asRecord(row);
    statement.run(
      asFiniteNumber(change.refresh_id),
      firstString(change, ["model_id"]),
      typeof change.reasoning_effort === "string" ? change.reasoning_effort : "",
      firstString(change, ["dimension"]),
      asFiniteNumber(change.score_before),
      asFiniteNumber(change.score_after),
      asFiniteNumber(change.score_delta),
      asFiniteNumber(change.rank_before),
      asFiniteNumber(change.rank_after),
      asFiniteNumber(change.confidence_before),
      asFiniteNumber(change.confidence_after),
      JSON.stringify(Array.isArray(change.causes) ? change.causes : []),
      JSON.stringify(Array.isArray(change.rank_drivers) ? change.rank_drivers : []),
    );
  }
}
