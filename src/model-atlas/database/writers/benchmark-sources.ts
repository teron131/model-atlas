/** SQLite writers for benchmark-owned source rows that feed matcher and scoring refreshes. */

import { deepSWEUrlForSourceVersion } from "../../scrapers/deep-swe";
import { SOURCE_URLS, type SourceSnapshots } from "../types";
import { type DatabaseWriter, sqliteBooleanValue } from "./shared";

/** Insert Agent Arena's source identity and headline causal effect. */
export function insertAgentArenaRawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agent_arena_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.agentArenaModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.agentArena,
			SOURCE_URLS.agent_arena,
			row.rank,
			row.contender_name,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.organization,
			row.score,
		);
	}
}

/** Insert Mercor's Loop Pass@1 APEX rows used as calibrated AA fallbacks. */
export function insertMercorApexAgentsRawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO mercor_apex_agents_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, model_id, source_model,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.mercorApexAgentsRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.mercorApexAgents,
			SOURCE_URLS.mercor_apex_agents,
			row.model_id,
			row.source_model,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.organization,
			row.score,
		);
	}
}

/** Insert Agents' Last Exam raw harness rows and summarized model rows in one source table. */
export function insertAgentsLastExamRawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agents_last_exam_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, split, harness, model,
			harness_variant, runs, tasks, split_tasks, passes, accuracy, score,
			total_duration_seconds, total_input_tokens, total_output_tokens,
			total_cost_usd, cost_source,
			median_accuracy, mean_accuracy, median_score, mean_score,
			median_total_duration_seconds, mean_total_duration_seconds,
			median_total_input_tokens, mean_total_input_tokens,
			median_total_output_tokens, mean_total_output_tokens,
			median_duration_seconds_per_task, mean_duration_seconds_per_task,
			median_input_tokens_per_task, mean_input_tokens_per_task,
			median_output_tokens_per_task, mean_output_tokens_per_task,
			median_cost_usd_per_task, mean_cost_usd_per_task,
			frequency, row_kind
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
			row.total_cost_usd,
			row.cost_source,
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
			row.median_duration_seconds_per_task,
			row.mean_duration_seconds_per_task,
			row.median_input_tokens_per_task,
			row.mean_input_tokens_per_task,
			row.median_output_tokens_per_task,
			row.mean_output_tokens_per_task,
			row.median_cost_usd_per_task,
			row.mean_cost_usd_per_task,
			row.frequency,
			"model_score",
		);
		rowIndex += 1;
	}
}

export function insertBlueprintBenchRawRows(
	db: DatabaseWriter,
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
	db: DatabaseWriter,
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
			sqliteBooleanValue(row.verified),
			sqliteBooleanValue(row.self_reported),
		);
	}
}

export function insertCursorBenchRawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO cursorbench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, rank, model,
			base_model, reasoning_effort, score_eligible, score, cost_per_task_usd,
			tokens_per_task, steps_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
			sqliteBooleanValue(row.score_eligible),
			row.score,
			row.cost_per_task_usd,
			row.tokens_per_task,
			row.steps_per_task,
		);
	}
}

export function insertDeepSWERawRows(
	db: DatabaseWriter,
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
	db: DatabaseWriter,
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
	db: DatabaseWriter,
	runId: number,
	snapshots: Pick<
		SourceSnapshots,
		"riemannBenchModelScoreRows" | "riemannBenchSourceUrl"
	> & {
		fetchedAt: Pick<SourceSnapshots["fetchedAt"], "riemannBench">;
	},
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
			snapshots.riemannBenchSourceUrl,
			row.provider,
			row.model,
			row.score,
			row.last_updated,
		);
	}
}

export function insertToolathlonRawRows(
	db: DatabaseWriter,
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
			sqliteBooleanValue(row.verified),
			sqliteBooleanValue(row.self_reported),
			row.announcement_date ?? null,
		);
	}
}

export function insertValsIndexRawRows(
	db: DatabaseWriter,
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

/** Insert Vending-Bench 2 outcomes while retaining the official average daily balance curves. */
export function insertVendingBench2RawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vending_bench_2_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, data_url, rank, model,
			base_model, reasoning_effort, run_count, final_balance_usd, daily_balance_usd_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.vendingBench2ModelScoreRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.vendingBench2,
			SOURCE_URLS.vending_bench_2,
			snapshots.vendingBench2DataUrl,
			row.rank,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.run_count,
			row.final_balance_usd,
			JSON.stringify(row.daily_balance_usd),
		);
	}
}

export function insertValsTerminalBenchRawRows(
	db: DatabaseWriter,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_terminal_bench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, source_model_id, model_id, model, provider, harness, score,
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
			row.source_model_id,
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
