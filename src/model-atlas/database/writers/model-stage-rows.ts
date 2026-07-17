/** SQLite writer for matched, enriched, and final model rows after source data has been joined. */

import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	type DatabaseWriter,
	firstString,
	modalityFlagValue,
	type SqlValue,
	sqliteBooleanValue,
} from "./shared";

type ModelStage = "matched" | "catalog" | "enriched" | "final";

function modelStageIdentityValues(model: JsonObject): SqlValue[] {
	const modelId = firstString(model, ["id"]);
	return [
		modelId,
		firstString(model, ["provider_id"]) ??
			firstString(model, ["provider"]) ??
			modelId?.split("/")[0] ??
			null,
		firstString(model, ["openrouter_id"]),
		firstString(model, ["name"]),
		firstString(model, ["artificial_analysis_id"]),
		firstString(model, ["reasoning_effort"]),
		firstString(model, ["family"]),
		firstString(model, ["logo"]),
		sqliteBooleanValue(model.attachment),
		sqliteBooleanValue(model.reasoning),
		firstString(model, ["release_date"]),
		sqliteBooleanValue(model.open_weights),
	];
}

function modelStageContextValues(model: JsonObject): SqlValue[] {
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

function modelStageSpeedAndCostValues(model: JsonObject): SqlValue[] {
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

function modelStageBenchmarkValues(model: JsonObject): SqlValue[] {
	const intelligence = asRecord(model.intelligence);
	const evaluations = asRecord(model.evaluations);
	return [
		asFiniteNumber(intelligence.intelligence_index),
		asFiniteNumber(intelligence.agentic_index),
		asFiniteNumber(intelligence.coding_index),
		asFiniteNumber(intelligence.omniscience_index),
		asFiniteNumber(intelligence.omniscience_accuracy),
		asFiniteNumber(evaluations.agents_last_exam),
		asFiniteNumber(evaluations.apex_agents),
		asFiniteNumber(evaluations.automation_bench),
		asFiniteNumber(evaluations.blueprint_bench_2),
		asFiniteNumber(evaluations.briefcase),
		asFiniteNumber(evaluations.browsecomp),
		asFiniteNumber(evaluations.critpt),
		asFiniteNumber(evaluations.cursorbench),
		asFiniteNumber(evaluations.deep_swe),
		asFiniteNumber(evaluations.gdp_pdf),
		asFiniteNumber(evaluations.gdpval_normalized),
		asFiniteNumber(evaluations.gpqa),
		asFiniteNumber(evaluations.harvey_lab),
		asFiniteNumber(evaluations.hle),
		asFiniteNumber(evaluations.itbench_sre),
		asFiniteNumber(evaluations.lcr),
		asFiniteNumber(evaluations.mmmu_pro),
		asFiniteNumber(evaluations.riemann_bench),
		asFiniteNumber(evaluations.scicode),
		asFiniteNumber(evaluations.tau_banking),
		asFiniteNumber(evaluations.terminalbench_v21),
		asFiniteNumber(evaluations.toolathlon),
		asFiniteNumber(evaluations.vals_index),
	];
}

function modelStageScoreValues(model: JsonObject): SqlValue[] {
	const taskMetrics = asRecord(model.task_metrics);
	const artificialAnalysisTask = asRecord(taskMetrics.artificial_analysis);
	const terminalBenchTask = asRecord(taskMetrics.terminalbench_v21);
	const agentsLastExamTask = asRecord(taskMetrics.agents_last_exam);
	const automationBenchTask = asRecord(taskMetrics.automation_bench);
	const cursorBenchTask = asRecord(taskMetrics.cursorbench);
	const deepSWETask = asRecord(taskMetrics.deep_swe);
	const componentScores = asRecord(model.component_scores);
	const scores = asRecord(model.scores);
	return [
		Object.keys(taskMetrics).length > 0 ? JSON.stringify(taskMetrics) : null,
		asFiniteNumber(agentsLastExamTask.cost),
		asFiniteNumber(agentsLastExamTask.seconds),
		asFiniteNumber(agentsLastExamTask.input_tokens),
		asFiniteNumber(agentsLastExamTask.output_tokens),
		asFiniteNumber(artificialAnalysisTask.cost),
		asFiniteNumber(artificialAnalysisTask.seconds),
		asFiniteNumber(artificialAnalysisTask.output_tokens),
		asFiniteNumber(automationBenchTask.cost),
		asFiniteNumber(cursorBenchTask.cost),
		asFiniteNumber(cursorBenchTask.tokens),
		asFiniteNumber(deepSWETask.cost),
		asFiniteNumber(deepSWETask.seconds),
		asFiniteNumber(deepSWETask.output_tokens),
		asFiniteNumber(terminalBenchTask.cost),
		asFiniteNumber(terminalBenchTask.seconds),
		asFiniteNumber(terminalBenchTask.tokens),
		asFiniteNumber(terminalBenchTask.input_tokens),
		asFiniteNumber(terminalBenchTask.output_tokens),
		asFiniteNumber(componentScores.intelligence_score),
		asFiniteNumber(componentScores.agentic_score),
		asFiniteNumber(componentScores.speed_score),
		asFiniteNumber(scores.intelligence_score),
		asFiniteNumber(scores.agentic_score),
		asFiniteNumber(scores.speed_score),
		asFiniteNumber(scores.value_score),
		asFiniteNumber(scores.overall_score),
	];
}

export function insertModelStageRows(
	db: DatabaseWriter,
	runId: number,
	stage: ModelStage,
	rows: readonly unknown[],
): void {
	const statement = db.prepare(`
		INSERT INTO model_stage_rows (
			run_id, stage, row_index, model_id, provider_id, openrouter_id, name,
			artificial_analysis_id, reasoning_effort, family, logo, attachment,
			reasoning, release_date,
			open_weights, context, context_input, context_output, input_modality_text,
			input_modality_image, input_modality_audio, input_modality_video,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, cost_input, cost_output, cost_cache_read,
			cost_cache_write, cost_weighted_input, cost_weighted_output,
			cost_blended_price, context_over_200k_input, context_over_200k_output,
			context_over_200k_cache_read, context_over_200k_cache_write,
			intelligence_index, agentic_index, coding_index, omniscience_index,
			omniscience_accuracy, agents_last_exam, apex_agents, automation_bench,
			blueprint_bench_2, briefcase, browsecomp, critpt, cursorbench, deep_swe,
			gdp_pdf, gdpval_normalized, gpqa, harvey_lab, hle, itbench_sre, lcr,
			mmmu_pro,
			riemann_bench, scicode, tau_banking, terminalbench_v21, toolathlon,
			vals_index,
			task_metrics_json,
			agents_last_exam_task_cost, agents_last_exam_task_seconds,
			agents_last_exam_task_input_tokens,
			agents_last_exam_task_output_tokens,
			artificial_analysis_task_cost, artificial_analysis_task_seconds,
			artificial_analysis_task_output_tokens,
			automation_bench_task_cost,
			cursorbench_task_cost, cursorbench_task_tokens,
			deep_swe_task_cost, deep_swe_task_seconds, deep_swe_task_output_tokens,
			terminalbench_v21_task_cost, terminalbench_v21_task_seconds,
			terminalbench_v21_task_tokens, terminalbench_v21_task_input_tokens,
			terminalbench_v21_task_output_tokens,
			component_intelligence_score, component_agentic_score, component_speed_score,
			intelligence_score, agentic_score,
			speed_score,
			value_score,
			overall_score
		) VALUES (${Array.from({ length: 91 }, () => "?").join(", ")})
	`);
	for (const [index, row] of rows.entries()) {
		const model = asRecord(row);
		statement.run(
			runId,
			stage,
			index,
			...modelStageIdentityValues(model),
			...modelStageContextValues(model),
			...modelStageSpeedAndCostValues(model),
			...modelStageBenchmarkValues(model),
			...modelStageScoreValues(model),
		);
	}
}
