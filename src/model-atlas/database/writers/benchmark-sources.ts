/** SQLite writers for benchmark-owned source rows that feed matcher and scoring refreshes. */

import { aleBenchModelEffort } from "../../scrapers/ale-bench";
import type { BenchmarkScoreRow } from "../../scrapers/benchmark-score";
import { deepSWEUrlForSourceVersion } from "../../scrapers/deep-swe";
import type { FrontierCodeSubsetMetrics } from "../../scrapers/frontier-code";
import { SOURCE_URLS, type SourceSnapshots } from "../types";
import { type DatabaseWriter, sqliteBooleanValue } from "./shared";

type AleBenchSourceSnapshot = Pick<
	SourceSnapshots,
	"aleBenchConfigurationRows"
> & {
	fetchedAt: Pick<SourceSnapshots["fetchedAt"], "aleBench">;
};

type FrontierCodeSourceSnapshot = Pick<SourceSnapshots, "frontierCodeRows"> & {
	fetchedAt: Pick<SourceSnapshots["fetchedAt"], "frontierCode">;
};

/** Restore Cognition's source field names inside the persisted subset evidence JSON. */
function frontierCodeSourceSubset(metrics: FrontierCodeSubsetMetrics) {
	return {
		correct: metrics.pass_rate,
		new_score: metrics.score,
		cost: metrics.cost_per_task_usd,
		tokens: metrics.tokens_per_task,
		tool_calls: metrics.tool_calls_per_task,
		steps: metrics.steps_per_task,
		ote: metrics.output_token_equivalent_per_task,
	};
}

function insertBenchmarkScoreRows(
	db: DatabaseWriter,
	table: string,
	rows: readonly BenchmarkScoreRow[],
	fetchedAt: number | null,
): void {
	const statement = db.prepare(`
		INSERT INTO ${table} (
			row_index, fetched_at_epoch_seconds, benchmark_key, source, url,
			model_id, model, base_model, reasoning_effort, provider, rank, score,
			score_eligible, standard_error, confidence_low, confidence_high,
			observed_at, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of rows.entries()) {
		statement.run(
			index,
			fetchedAt,
			row.benchmark_key,
			row.source,
			row.source_url,
			row.model_id,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.provider,
			row.rank,
			row.score,
			sqliteBooleanValue(row.score_eligible),
			row.standard_error,
			row.confidence_low,
			row.confidence_high,
			row.observed_at,
			JSON.stringify(row.metadata),
		);
	}
} /** Insert Agent Arena's source identity and headline causal effect. */
export function insertAgentArenaRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agent_arena_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, contender_name,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.agentArenaModelScoreRows.entries()) {
		statement.run(
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

/** Insert Agents' Last Exam raw harness rows and summarized model rows in one source table. */
export function insertAgentsLastExamRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agents_last_exam_raw_rows (
			row_index, fetched_at_epoch_seconds, url, split, harness, model,
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
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	let rowIndex = 0;
	for (const row of snapshots.agentsLastExamRows) {
		statement.run(
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

/** Insert every ALE refinement checkpoint with scalar scoring resources and complete raw evidence. */
export function insertAleBenchRawRows(
	db: DatabaseWriter,
	snapshots: AleBenchSourceSnapshot,
): void {
	const statement = db.prepare(`
		INSERT INTO ale_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, base_model,
			reasoning_effort, detail_path, num_self_refine, performance_mean,
			performance_median, cost_per_task_usd, tokens_per_task,
			input_tokens_per_task, output_tokens_per_task, rank_json,
			performance_json, input_tokens_json, output_tokens_json,
			total_tokens_json, cost_json, results_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.aleBenchConfigurationRows.entries()) {
		const effort = aleBenchModelEffort(row.model);
		statement.run(
			index,
			snapshots.fetchedAt.aleBench,
			SOURCE_URLS.ale_bench,
			row.model,
			effort.baseModel,
			effort.reasoningEffort,
			row.detail_path,
			row.num_self_refine,
			row.performance.all.mean,
			row.performance.all.median,
			row.cost.all.mean,
			row.total_tokens.all.mean,
			row.input_tokens.all.mean,
			row.output_tokens.all.mean,
			JSON.stringify(row.rank),
			JSON.stringify(row.performance),
			JSON.stringify(row.input_tokens),
			JSON.stringify(row.output_tokens),
			JSON.stringify(row.total_tokens),
			JSON.stringify(row.cost),
			JSON.stringify(row.results),
		);
	}
}

export function insertBlueprintBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO blueprint_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, score
		) VALUES (?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.blueprintBenchModelScoreRows.entries()) {
		statement.run(
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
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO browsecomp_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model, provider,
			provider_name, score, source_url, analysis_method, verified, self_reported
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.browseCompModelScoreRows.entries()) {
		statement.run(
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

/** Insert Chartography evidence through its source table. */
export function insertChartographyRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"chartography_raw_rows",
		snapshots.chartographyRows,
		snapshots.fetchedAt.chartography,
	);
}

/** Insert Chess Puzzles evidence through its source table. */
export function insertChessPuzzlesRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"chess_puzzles_raw_rows",
		snapshots.chessPuzzleRows,
		snapshots.fetchedAt.chessPuzzles,
	);
}

export function insertCursorBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO cursorbench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, model,
			base_model, reasoning_effort, score_eligible, score, cost_per_task_usd,
			tokens_per_task, steps_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.cursorBenchModelScoreRows.entries()) {
		statement.run(
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
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO deep_swe_raw_rows (
			row_index, fetched_at_epoch_seconds, url, source_version, model,
			reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
			n_tasks_attempted, mean_cost_usd, mean_duration_seconds, mean_output_tokens
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.deepSWERawRows.entries()) {
		statement.run(
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

/** Insert EBR-Bench evidence through its source table. */
export function insertEbrBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"ebr_bench_raw_rows",
		snapshots.ebrBenchRows,
		snapshots.fetchedAt.ebrBench,
	);
}

/** Insert EnterpriseBench CoreCraft evidence through its source table. */
export function insertEnterpriseBenchCoreCraftRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"enterprisebench_corecraft_raw_rows",
		snapshots.enterpriseBenchCoreCraftRows,
		snapshots.fetchedAt.enterpriseBenchCoreCraft,
	);
}

/** Insert Epoch Capabilities Index evidence through its source table. */
export function insertEpochCapabilitiesIndexRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"epoch_capabilities_index_raw_rows",
		snapshots.epochCapabilitiesIndexRows,
		snapshots.fetchedAt.epochCapabilitiesIndex,
	);
}

/** Insert all FrontierCode effort and subset evidence while retaining the Main scoring projection. */
export function insertFrontierCodeRawRows(
	db: DatabaseWriter,
	snapshots: FrontierCodeSourceSnapshot,
): void {
	const statement = db.prepare(`
		INSERT INTO frontier_code_raw_rows (
			row_index, fetched_at_epoch_seconds, url, revision, model, base_model,
			source_effort, reasoning_effort, harness, score_eligible,
			official_rank, official_best_effort, main_score, main_pass_rate,
			main_cost_per_task_usd, main_tokens_per_task, extended_score,
			extended_pass_rate, main_json, extended_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.frontierCodeRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.frontierCode,
			SOURCE_URLS.frontier_code,
			row.revision,
			row.model,
			row.base_model,
			row.source_effort,
			row.reasoning_effort,
			row.harness,
			sqliteBooleanValue(row.score_eligible),
			row.official_rank,
			sqliteBooleanValue(row.official_best_effort),
			row.main.score,
			row.main.pass_rate,
			row.main.cost_per_task_usd,
			row.main.tokens_per_task,
			row.extended.score,
			row.extended.pass_rate,
			JSON.stringify(frontierCodeSourceSubset(row.main)),
			JSON.stringify(frontierCodeSourceSubset(row.extended)),
		);
	}
}

/** Insert FrontierMath Tier 4 evidence through its source table. */
export function insertFrontierMathTier4RawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"frontiermath_tier_4_raw_rows",
		snapshots.frontierMathTier4Rows,
		snapshots.fetchedAt.frontierMathTier4,
	);
}

export function insertGdpPdfRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO gdp_pdf_raw_rows (
			row_index, fetched_at_epoch_seconds, url, provider, model,
			score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.gdpPdfModelScoreRows.entries()) {
		statement.run(
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

/** Insert HANDBOOK.md evidence through its source table. */
export function insertHandbookMdRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"handbook_md_raw_rows",
		snapshots.handbookMdRows,
		snapshots.fetchedAt.handbookMd,
	);
}

/** Insert Mercor's Loop Pass@1 APEX rows used as calibrated AA fallbacks. */
export function insertMercorApexAgentsRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO mercor_apex_agents_raw_rows (
			row_index, fetched_at_epoch_seconds, url, model_id, source_model,
			model, base_model, reasoning_effort, organization, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.mercorApexAgentsRows.entries()) {
		statement.run(
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

/** Insert Vals ProofBench evidence through its independent source table. */
export function insertProofBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"proofbench_raw_rows",
		snapshots.proofBenchRows,
		snapshots.fetchedAt.proofBench,
	);
}

export function insertRiemannBenchRawRows(
	db: DatabaseWriter,
	snapshots: Pick<
		SourceSnapshots,
		"riemannBenchModelScoreRows" | "riemannBenchSourceUrl"
	> & {
		fetchedAt: Pick<SourceSnapshots["fetchedAt"], "riemannBench">;
	},
): void {
	const statement = db.prepare(`
		INSERT INTO riemann_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, provider,
			model, score, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.riemannBenchModelScoreRows.entries()) {
		statement.run(
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

export function insertValsTerminalBenchRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_terminal_bench_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, source_model_id, model_id, model, provider, harness, score,
			cost_per_task_usd, seconds_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.valsTerminalBenchRows.entries()) {
		statement.run(
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

export function insertToolathlonRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO toolathlon_raw_rows (
			row_index, fetched_at_epoch_seconds, url, rank, model, provider,
			provider_name, score, source_url, analysis_method, verified,
			self_reported, announcement_date
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.toolathlonModelScoreRows.entries()) {
		statement.run(
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
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_index_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label,
			row_kind, model_id, model, provider, score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.valsIndexRows.entries()) {
		statement.run(
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
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vending_bench_2_raw_rows (
			row_index, fetched_at_epoch_seconds, url, data_url, rank, model,
			base_model, reasoning_effort, run_count, final_balance_usd, daily_balance_usd_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.vendingBench2ModelScoreRows.entries()) {
		statement.run(
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

/** Insert WeirdML evidence through its independent source table. */
export function insertWeirdMlRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	insertBenchmarkScoreRows(
		db,
		"weirdml_raw_rows",
		snapshots.weirdMlRows,
		snapshots.fetchedAt.weirdMl,
	);
}
