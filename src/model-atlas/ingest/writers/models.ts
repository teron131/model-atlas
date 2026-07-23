/** Relational writers persist final models, benchmark benchmarks, and task metrics without nested storage. */

import { MODEL_ATLAS_BENCHMARK_KEYS } from "../../benchmarks/registry";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import {
	type DatabaseWriter,
	firstString,
	modalityFlagValue,
	type SqlValue,
	sqliteBooleanValue,
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
	];
}

export function insertModels(
	db: DatabaseWriter,
	rows: readonly unknown[],
): void {
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
			intelligence_confidence, agentic_confidence
		) VALUES (${Array.from({ length: 44 }, () => "?").join(", ")})
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
export function insertModelBenchmarks(
	db: DatabaseWriter,
	rows: readonly unknown[],
): void {
	const statement = db.prepare(`
		INSERT INTO model_benchmarks (
			model_row_index, benchmark_key, value
		) VALUES (?, ?, ?)
	`);
	for (const [modelRowIndex, row] of rows.entries()) {
		const benchmarks = asRecord(asRecord(row).benchmarks);
		for (const benchmarkKey of MODEL_ATLAS_BENCHMARK_KEYS) {
			const value = asFiniteNumber(benchmarks[benchmarkKey]);
			if (value != null) {
				statement.run(modelRowIndex, benchmarkKey, value);
			}
		}
	}
}

/** Persists one scalar resource row per task-metric source in deterministic key order. */
export function insertModelTaskMetrics(
	db: DatabaseWriter,
	rows: readonly unknown[],
): void {
	const statement = db.prepare(`
		INSERT INTO model_task_metrics (
			model_row_index, source_key, cost, seconds, tokens,
			input_tokens, output_tokens
		) VALUES (?, ?, ?, ?, ?, ?, ?)
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
			statement.run(
				modelRowIndex,
				sourceKey,
				asFiniteNumber(metrics.cost),
				asFiniteNumber(metrics.seconds),
				asFiniteNumber(metrics.tokens),
				asFiniteNumber(metrics.input_tokens),
				asFiniteNumber(metrics.output_tokens),
			);
		}
	}
}
