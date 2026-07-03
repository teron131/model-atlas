/** SQLite writers for benchmark-owned source rows that feed matcher and scoring refreshes. */

import type { DatabaseSync } from "node:sqlite";

import { deepSWEUrlForSourceVersion } from "../../scrapers/deep-swe";
import { SOURCE_URLS, type SourceSnapshots } from "../types";
import { booleanValue } from "./shared";

/** Insert Agents' Last Exam raw harness rows and summarized model rows in one source table. */
export function insertAgentsLastExamRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agents_last_exam_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, split, harness, model,
			harness_variant, runs, tasks, split_tasks, passes, accuracy, score,
			total_duration_seconds, total_input_tokens, total_output_tokens,
			median_accuracy, mean_accuracy, median_score, mean_score,
			median_total_duration_seconds, mean_total_duration_seconds,
			median_total_input_tokens, mean_total_input_tokens,
			median_total_output_tokens, mean_total_output_tokens,
			median_duration_seconds_per_run, mean_duration_seconds_per_run,
			median_input_tokens_per_run, mean_input_tokens_per_run,
			median_output_tokens_per_run, mean_output_tokens_per_run,
			frequency, row_kind
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	let rowIndex = 0;
	for (const row of snapshots.agentsLastExamRows) {
		statement.run(
			runId,
			rowIndex,
			snapshots.fetchedAt.agentsLastExam,
			SOURCE_URLS.agents_last_exam,
			row.split,
			row.harness,
			row.model,
			row.harness_variant,
			row.runs,
			row.tasks,
			row.split_tasks,
			row.passes,
			row.accuracy,
			row.score,
			row.total_duration_seconds,
			row.total_input_tokens,
			row.total_output_tokens,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			"harness_score",
		);
		rowIndex += 1;
	}
	for (const row of snapshots.agentsLastExamModelScores) {
		statement.run(
			runId,
			rowIndex,
			snapshots.fetchedAt.agentsLastExam,
			SOURCE_URLS.agents_last_exam,
			row.split,
			null,
			row.model,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			row.median_accuracy,
			row.mean_accuracy,
			row.median_score,
			row.mean_score,
			row.median_total_duration_seconds,
			row.mean_total_duration_seconds,
			row.median_total_input_tokens,
			row.mean_total_input_tokens,
			row.median_total_output_tokens,
			row.mean_total_output_tokens,
			row.median_duration_seconds_per_run,
			row.mean_duration_seconds_per_run,
			row.median_input_tokens_per_run,
			row.mean_input_tokens_per_run,
			row.median_output_tokens_per_run,
			row.mean_output_tokens_per_run,
			row.frequency,
			"model_score",
		);
		rowIndex += 1;
	}
}

export function insertBlueprintBenchRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO blueprint_bench_2_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, model, score
		) VALUES (?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.blueprintBenchModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.blueprintBench,
			SOURCE_URLS.blueprint_bench_2,
			row.model,
			row.score,
		);
	}
}

export function insertBrowseCompRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO browsecomp_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, model, provider,
			provider_name, score, source_url, analysis_method, verified, self_reported
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.browseCompModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.browseComp,
			SOURCE_URLS.browsecomp,
			row.model,
			row.provider,
			row.provider_name ?? null,
			row.score,
			row.source_url ?? null,
			row.analysis_method ?? null,
			booleanValue(row.verified),
			booleanValue(row.self_reported),
		);
	}
}

export function insertCursorBenchRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO cursorbench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, rank, model,
			base_model, reasoning_effort, score, cost_per_task_usd,
			tokens_per_task, steps_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.cursorBenchModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.cursorBench,
			SOURCE_URLS.cursorbench,
			row.rank,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.score,
			row.cost_per_task_usd,
			row.tokens_per_task,
			row.steps_per_task,
		);
	}
}

export function insertDeepSWERawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO deep_swe_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, source_version, model,
			reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
			n_tasks_attempted, mean_cost_usd, mean_duration_seconds, mean_output_tokens
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.deepSWERawRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.deepSWE,
			deepSWEUrlForSourceVersion(row.source_version),
			row.source_version,
			row.model,
			row.reasoning_effort,
			row.config,
			row.pass_at_1,
			row.ci_lo,
			row.ci_hi,
			row.ci_half,
			row.n_tasks_attempted,
			row.mean_cost_usd,
			row.mean_duration_seconds,
			row.mean_output_tokens,
		);
	}
}

export function insertGdpPdfRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO gdp_pdf_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, provider, model,
			score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.gdpPdfModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.gdpPdf,
			SOURCE_URLS.gdp_pdf,
			row.provider,
			row.model,
			row.score,
			row.last_updated ?? null,
		);
	}
}

export function insertRiemannBenchRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO riemann_bench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, provider,
			model, score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.riemannBenchModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.riemannBench,
			SOURCE_URLS.riemann_bench,
			row.provider,
			row.model,
			row.score,
			row.last_updated,
		);
	}
}

export function insertToolathlonRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO toolathlon_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, rank, model, provider,
			provider_name, score, source_url, analysis_method, verified,
			self_reported, announcement_date
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.toolathlonModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.toolathlon,
			SOURCE_URLS.toolathlon,
			row.rank,
			row.model,
			row.provider,
			row.provider_name ?? null,
			row.score,
			row.source_url ?? null,
			row.analysis_method ?? null,
			booleanValue(row.verified),
			booleanValue(row.self_reported),
			row.announcement_date ?? null,
		);
	}
}

export function insertValsIndexRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_index_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, model_id, model, provider, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.valsIndexRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.valsIndex,
			SOURCE_URLS.vals_index,
			row.task,
			row.task_label,
			row.task === "overall" ? "overall" : "component",
			row.model_id,
			row.model,
			row.provider,
			row.score,
		);
	}
}

export function insertValsTerminalBenchRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_terminal_bench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, raw_model_id, model_id, model, provider, harness, score,
			cost_per_task_usd, seconds_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.valsTerminalBenchRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.valsTerminalBench,
			SOURCE_URLS.vals_terminal_bench,
			row.task,
			row.task_label,
			row.task === "overall" ? "overall" : "component",
			row.raw_model_id,
			row.model_id,
			row.model,
			row.provider,
			row.harness,
			row.score,
			row.cost_per_task_usd,
			row.seconds_per_task,
		);
	}
}
