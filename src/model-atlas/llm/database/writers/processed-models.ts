/** Processed model row writer. */

import type { DatabaseSync } from "node:sqlite";

import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	booleanValue,
	firstString,
	hasModality,
	type SqlValue,
} from "./shared";

type ProcessedStage = "matched" | "catalog" | "enriched" | "final";

/** Build identity and display values for one processed model row. */
function processedIdentityValues(model: JsonObject): SqlValue[] {
	const modelId = firstString(model, ["id"]);
	return [
		modelId,
		firstString(model, ["provider_id"]) ??
			firstString(model, ["provider"]) ??
			modelId?.split("/")[0] ??
			null,
		firstString(model, ["openrouter_id"]),
		firstString(model, ["name"]),
		firstString(model, ["aa_id"]),
		firstString(model, ["family"]),
		firstString(model, ["logo"]),
		booleanValue(model.attachment),
		booleanValue(model.reasoning),
		firstString(model, ["release_date"]),
		booleanValue(model.open_weights),
	];
}

/** Build context and input-modality values for one processed model row. */
function processedContextValues(model: JsonObject): SqlValue[] {
	const context = asRecord(model.context_window);
	const limit = asRecord(model.limit);
	const modalities = asRecord(model.modalities);
	return [
		asFiniteNumber(context.context) ?? asFiniteNumber(limit.context),
		asFiniteNumber(context.input) ?? asFiniteNumber(limit.input),
		asFiniteNumber(context.output) ?? asFiniteNumber(limit.output),
		hasModality(modalities.input, "text"),
		hasModality(modalities.input, "image"),
		hasModality(modalities.input, "audio"),
		hasModality(modalities.input, "video"),
	];
}

/** Build speed and cost values for one processed model row. */
function processedSpeedAndCostValues(model: JsonObject): SqlValue[] {
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

/** Build benchmark metric values for one processed model row. */
function processedBenchmarkValues(model: JsonObject): SqlValue[] {
	const intelligence = asRecord(model.intelligence);
	const evaluations = asRecord(model.evaluations);
	return [
		asFiniteNumber(intelligence.intelligence_index),
		asFiniteNumber(intelligence.agentic_index),
		asFiniteNumber(intelligence.coding_index),
		asFiniteNumber(intelligence.omniscience_index),
		asFiniteNumber(intelligence.omniscience_accuracy),
		asFiniteNumber(intelligence.omniscience_nonhallucination_rate),
		asFiniteNumber(evaluations.apex_agents),
		asFiniteNumber(evaluations.critpt),
		asFiniteNumber(evaluations.gdpval_normalized),
		asFiniteNumber(evaluations.gpqa),
		asFiniteNumber(evaluations.hle),
		asFiniteNumber(evaluations.ifbench),
		asFiniteNumber(evaluations.lcr),
		asFiniteNumber(evaluations.mmmu_pro),
		asFiniteNumber(evaluations.scicode),
		asFiniteNumber(evaluations.terminalbench_hard),
		asFiniteNumber(evaluations.deep_swe),
		asFiniteNumber(evaluations.terminal_bench_2),
		asFiniteNumber(evaluations.agents_last_exam),
		asFiniteNumber(evaluations.browsecomp),
	];
}

/** Build task-metric and score values for one processed model row. */
function processedScoreValues(model: JsonObject): SqlValue[] {
	const taskMetrics = asRecord(model.task_metrics);
	const artificialAnalysisTask = asRecord(taskMetrics.artificial_analysis);
	const deepSWETask = asRecord(taskMetrics.deep_swe);
	const agentsLastExamTask = asRecord(taskMetrics.agents_last_exam);
	const scores = asRecord(model.scores);
	const relativeScores = asRecord(model.relative_scores);
	return [
		asFiniteNumber(artificialAnalysisTask.cost),
		asFiniteNumber(artificialAnalysisTask.seconds),
		asFiniteNumber(artificialAnalysisTask.output_tokens),
		asFiniteNumber(deepSWETask.cost),
		asFiniteNumber(deepSWETask.seconds),
		asFiniteNumber(deepSWETask.output_tokens),
		asFiniteNumber(agentsLastExamTask.cost),
		asFiniteNumber(agentsLastExamTask.seconds),
		asFiniteNumber(agentsLastExamTask.input_tokens),
		asFiniteNumber(agentsLastExamTask.output_tokens),
		asFiniteNumber(scores.intelligence_score),
		asFiniteNumber(scores.agentic_score),
		asFiniteNumber(scores.speed_score),
		asFiniteNumber(scores.value_score),
		asFiniteNumber(relativeScores.intelligence_score),
		asFiniteNumber(relativeScores.agentic_score),
		asFiniteNumber(relativeScores.speed_score),
		asFiniteNumber(relativeScores.value_score),
		asFiniteNumber(relativeScores.overall_score),
	];
}

/** Insert matched, enriched, or final processed model rows. */
export function insertProcessedModelRows(
	db: DatabaseSync,
	runId: number,
	stage: ProcessedStage,
	rows: readonly unknown[],
): void {
	const statement = db.prepare(`
		INSERT INTO processed_models (
			run_id, stage, row_index, model_id, provider_id, openrouter_id, name,
			aa_id, family, logo, attachment, reasoning, release_date,
			open_weights, context, context_input, context_output, input_modality_text,
			input_modality_image, input_modality_audio, input_modality_video,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, cost_input, cost_output, cost_cache_read,
			cost_cache_write, cost_weighted_input, cost_weighted_output,
			cost_blended_price, context_over_200k_input, context_over_200k_output,
			context_over_200k_cache_read, context_over_200k_cache_write,
			intelligence_index, agentic_index, coding_index, omniscience_index,
			omniscience_accuracy, omniscience_nonhallucination_rate, apex_agents,
			critpt, gdpval_normalized, gpqa, hle, ifbench, lcr, mmmu_pro, scicode,
			terminalbench_hard, deep_swe, terminal_bench_2, agents_last_exam,
			browsecomp,
			aa_task_cost, aa_task_seconds, aa_task_output_tokens,
			deep_swe_task_cost, deep_swe_task_seconds, deep_swe_task_output_tokens,
			agents_last_exam_task_cost, agents_last_exam_task_seconds,
			agents_last_exam_task_input_tokens,
			agents_last_exam_task_output_tokens,
			raw_intelligence_score, raw_agentic_score, raw_speed_score,
			raw_value_score, relative_intelligence_score, relative_agentic_score,
			relative_speed_score, relative_value_score, relative_overall_score
		) VALUES (${Array.from({ length: 74 }, () => "?").join(", ")})
	`);
	for (const [index, row] of rows.entries()) {
		const model = asRecord(row);
		statement.run(
			runId,
			stage,
			index,
			...processedIdentityValues(model),
			...processedContextValues(model),
			...processedSpeedAndCostValues(model),
			...processedBenchmarkValues(model),
			...processedScoreValues(model),
		);
	}
}
