/** SQLite row writers for grouped raw sources and processed Model Atlas rows. */

import type { DatabaseSync, StatementSync } from "node:sqlite";

import { asFiniteNumber, asRecord, type JsonObject } from "../shared";
import type { ModelsDevPayload } from "../sources/models-dev";
import type {
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../sources/openrouter-scraper";
import { processOpenRouterModelStats } from "../sources/openrouter-scraper";
import type { DebugTraceRow } from "./types";
import { SOURCE_URLS, type SourceSnapshots } from "./types";

const ARTIFICIAL_ANALYSIS_ORIGIN = "https://artificialanalysis.ai";

type SqlValue = string | number | null;
type ProcessedStage = "matched" | "catalog" | "enriched" | "final";

/** Convert a boolean-ish value to SQLite integer storage. */
function booleanValue(value: unknown): number | null {
	return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

/** Return whether a list contains a modality. */
function hasModality(values: unknown, modality: string): number {
	return Array.isArray(values) && values.includes(modality) ? 1 : 0;
}

/** Read the first string value from a row. */
function firstString(row: JsonObject, keys: readonly string[]): string | null {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}
	return null;
}

/** Read the first finite number from a row. */
function firstNumber(row: JsonObject, keys: readonly string[]): number | null {
	for (const key of keys) {
		const value = asFiniteNumber(row[key]);
		if (value != null) {
			return value;
		}
	}
	return null;
}

/** Return an absolute Artificial Analysis URL from a relative or absolute path. */
function absoluteArtificialAnalysisUrl(value: string | null): string | null {
	if (value == null) {
		return null;
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	return value.startsWith("/")
		? `${ARTIFICIAL_ANALYSIS_ORIGIN}${value}`
		: `${ARTIFICIAL_ANALYSIS_ORIGIN}/${value}`;
}

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

/** Build identity and model metadata values for one Artificial Analysis raw row. */
function artificialAnalysisIdentityValues(
	row: JsonObject,
	selectedRow: JsonObject,
	creator: JsonObject,
): SqlValue[] {
	const modelId =
		typeof selectedRow.model_id === "string"
			? selectedRow.model_id
			: firstString(row, ["model_id", "model_url", "id"]);
	return [
		modelId,
		firstString(row, ["name"]),
		firstString(row, ["shortName", "short_name"]),
		firstString(creator, ["name"]) ?? firstString(row, ["modelCreatorName"]),
		absoluteArtificialAnalysisUrl(
			firstString(selectedRow, ["model_url"]) ??
				firstString(row, ["model_url"]),
		),
		firstString(row, ["releaseDate", "release_date"]),
		booleanValue(row.deprecated),
		booleanValue(row.reasoningModel),
		booleanValue(row.isOpenWeights),
		booleanValue(row.commercialAllowed),
	];
}

/** Build modality values for one Artificial Analysis raw row. */
function artificialAnalysisModalityValues(row: JsonObject): SqlValue[] {
	return [
		booleanValue(row.input_modality_text ?? row.inputModalityText),
		booleanValue(row.input_modality_image ?? row.inputModalityImage),
		booleanValue(row.input_modality_video ?? row.inputModalityVideo),
		booleanValue(row.input_modality_speech ?? row.inputModalitySpeech),
		booleanValue(row.output_modality_text ?? row.outputModalityText),
		booleanValue(row.output_modality_image ?? row.outputModalityImage),
		booleanValue(row.output_modality_video ?? row.outputModalityVideo),
		booleanValue(row.output_modality_speech ?? row.outputModalitySpeech),
	];
}

/** Build benchmark metric values for one Artificial Analysis row pair. */
function artificialAnalysisBenchmarkValues(
	row: JsonObject,
	selectedRow: JsonObject,
): SqlValue[] {
	const intelligence = asRecord(selectedRow.intelligence);
	const evaluations = asRecord(selectedRow.evaluations);
	return [
		firstNumber(row, ["median_output_speed", "medianOutputTokensPerSecond"]),
		firstNumber(row, [
			"median_time_to_first_chunk",
			"medianTimeToFirstTokenSeconds",
		]),
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
	];
}

/** Build cost, token, and logo values for one Artificial Analysis raw row. */
function artificialAnalysisCostAndLogoValues(
	row: JsonObject,
	selectedRow: JsonObject,
	creator: JsonObject,
): SqlValue[] {
	const intelligenceIndexCost = asRecord(selectedRow.intelligence_index_cost);
	const tokenCounts = asRecord(row.intelligenceIndexTokenCounts);
	return [
		asFiniteNumber(intelligenceIndexCost.input_cost),
		asFiniteNumber(intelligenceIndexCost.reasoning_cost),
		asFiniteNumber(intelligenceIndexCost.output_cost),
		asFiniteNumber(intelligenceIndexCost.total_cost),
		asFiniteNumber(tokenCounts.inputTokens),
		asFiniteNumber(tokenCounts.reasoningTokens),
		asFiniteNumber(tokenCounts.answerTokens),
		asFiniteNumber(tokenCounts.outputTokens),
		asFiniteNumber(intelligenceIndexCost.total_tokens),
		firstString(selectedRow, ["logo"]) ??
			firstString(row, [
				"logo_small_url",
				"logo_url",
				"logoSmall",
				"logo_small",
				"modelCreatorLogo",
			]) ??
			firstString(creator, [
				"logo_small_url",
				"logo_url",
				"logo_small",
				"logo",
			]),
	];
}

/** Insert Artificial Analysis raw model rows with selected scalar metrics. */
export function insertArtificialAnalysisRawModels(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO aa_raw_models (
			run_id, row_index, fetched_at_epoch_seconds, url, model_id, name,
			short_name, creator_name, model_url, release_date, deprecated,
			reasoning_model, open_weights, commercial_allowed, input_modality_text,
			input_modality_image, input_modality_video, input_modality_speech,
			output_modality_text, output_modality_image, output_modality_video,
			output_modality_speech,
			median_output_tokens_per_second,
			median_time_to_first_token_seconds, intelligence_index, agentic_index,
			coding_index, omniscience_index, omniscience_accuracy,
			omniscience_nonhallucination_rate, apex_agents, critpt,
			gdpval_normalized, gpqa, hle, ifbench, lcr, mmmu_pro, scicode,
			terminalbench_hard, input_cost, reasoning_cost, output_cost, total_cost,
			input_tokens, reasoning_tokens, answer_tokens, output_tokens,
			total_tokens, logo_url
		) VALUES (${Array.from({ length: 50 }, () => "?").join(", ")})
	`);
	for (const [index, row] of snapshots.aaRawRows.entries()) {
		const selectedRow = snapshots.aaSelectedRows[index] ?? {};
		const creator = {
			...asRecord(row.creator),
			...asRecord(row.model_creators),
		};
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.artificialAnalysis,
			SOURCE_URLS.artificial_analysis,
			...artificialAnalysisIdentityValues(row, selectedRow, creator),
			...artificialAnalysisModalityValues(row),
			...artificialAnalysisBenchmarkValues(row, selectedRow),
			...artificialAnalysisCostAndLogoValues(row, selectedRow, creator),
		);
	}
}

/** Insert models.dev raw model rows with provider, cost, limit, and modality fields. */
export function insertModelsDevRawModels(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO models_dev_raw_models (
			run_id, row_index, fetched_at_epoch_seconds, status_code, url,
			provider_id, provider_name, provider_api, model_id, name, family,
			release_date, last_updated, open_weights, reasoning, tool_call,
			cost_input, cost_output, cost_cache_read, cost_cache_write,
			cost_output_audio, limit_context, limit_output, input_modality_text,
			input_modality_image, input_modality_audio, input_modality_video,
			input_modality_pdf, output_modality_text, output_modality_image,
			output_modality_audio, output_modality_video
		) VALUES (${Array.from({ length: 32 }, () => "?").join(", ")})
	`);
	let rowIndex = 0;
	for (const [providerId, provider] of Object.entries(
		snapshots.modelsDevPayload as ModelsDevPayload,
	)) {
		for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
			const cost = model.cost ?? {};
			const limit = model.limit ?? {};
			const inputModalities = model.modalities?.input ?? [];
			const outputModalities = model.modalities?.output ?? [];
			statement.run(
				runId,
				rowIndex,
				snapshots.modelsDevFetchedAt,
				snapshots.modelsDevStatusCode,
				SOURCE_URLS.models_dev,
				providerId,
				provider.name ?? providerId,
				provider.api ?? null,
				model.id ?? modelKey,
				model.name ?? null,
				model.family ?? null,
				model.release_date ?? null,
				model.last_updated ?? null,
				booleanValue(model.open_weights),
				booleanValue(model.reasoning),
				booleanValue(model.tool_call),
				cost.input ?? null,
				cost.output ?? null,
				cost.cache_read ?? null,
				cost.cache_write ?? null,
				cost.output_audio ?? null,
				limit.context ?? null,
				limit.output ?? null,
				hasModality(inputModalities, "text"),
				hasModality(inputModalities, "image"),
				hasModality(inputModalities, "audio"),
				hasModality(inputModalities, "video"),
				hasModality(inputModalities, "pdf"),
				hasModality(outputModalities, "text"),
				hasModality(outputModalities, "image"),
				hasModality(outputModalities, "audio"),
				hasModality(outputModalities, "video"),
			);
			rowIndex += 1;
		}
	}
}

/** Insert DeepSWE raw rows and mark summarized default scoring rows. */
export function insertDeepSWERawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const defaultScoreKeys = new Set(
		snapshots.deepSWEModelScoreRows.map((row) =>
			[
				row.model,
				row.pass_at_1,
				row.mean_cost_usd,
				row.mean_duration_seconds,
				row.mean_output_tokens,
			].join("|"),
		),
	);
	const statement = db.prepare(`
		INSERT INTO deep_swe_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, model,
			reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
			mean_cost_usd, mean_duration_seconds, mean_output_tokens,
			is_best_model_score
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.deepSWERawRows.entries()) {
		const scoreKey = [
			row.model,
			row.pass_at_1,
			row.mean_cost_usd,
			row.mean_duration_seconds,
			row.mean_output_tokens,
		].join("|");
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.deepSWE,
			SOURCE_URLS.deep_swe,
			row.model,
			row.reasoning_effort,
			row.config,
			row.pass_at_1,
			row.ci_lo,
			row.ci_hi,
			row.ci_half,
			row.mean_cost_usd,
			row.mean_duration_seconds,
			row.mean_output_tokens,
			defaultScoreKeys.has(scoreKey) ? 1 : 0,
		);
	}
}

/** Insert Terminal-Bench raw agent rows and summarized model rows in one source table. */
export function insertTerminalBenchRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO terminal_bench_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, agent, model,
			accuracy, median_accuracy, mean_accuracy, frequency, row_kind
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	let rowIndex = 0;
	for (const row of snapshots.terminalBenchRows) {
		statement.run(
			runId,
			rowIndex,
			snapshots.fetchedAt.terminalBench,
			SOURCE_URLS.terminal_bench,
			row.agent,
			row.model,
			row.accuracy,
			null,
			null,
			null,
			"agent_accuracy",
		);
		rowIndex += 1;
	}
	for (const row of snapshots.terminalBenchModelScores) {
		statement.run(
			runId,
			rowIndex,
			snapshots.fetchedAt.terminalBench,
			SOURCE_URLS.terminal_bench,
			null,
			row.model,
			null,
			row.median_accuracy,
			row.mean_accuracy,
			row.frequency,
			"model_score",
		);
		rowIndex += 1;
	}
}

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
			median_total_output_tokens, mean_total_output_tokens, frequency, row_kind
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
			row.frequency,
			"model_score",
		);
		rowIndex += 1;
	}
}

type OpenRouterPointRow = {
	x: string | null;
	series: string;
	value: number | null;
};

/** Build scalar OpenRouter stat point rows from one metric response. */
function openRouterStatPointRows(
	response: OpenRouterStatsResponse | null | undefined,
): OpenRouterPointRow[] {
	const rows: OpenRouterPointRow[] = [];
	for (const point of response?.data ?? []) {
		for (const [series, value] of Object.entries(asRecord(point.y))) {
			rows.push({
				x: typeof point.x === "string" ? point.x : null,
				series,
				value: asFiniteNumber(value),
			});
		}
	}
	return rows;
}

/** Insert OpenRouter directory rows and return the next row index. */
function insertOpenRouterDirectoryRows(
	statement: StatementSync,
	runId: number,
	rawPayload: OpenRouterRawScrapedPayload,
	rowIndex: number,
): number {
	for (const model of rawPayload.directory) {
		statement.run(
			runId,
			rowIndex,
			rawPayload.fetched_at_epoch_seconds,
			SOURCE_URLS.openrouter_models,
			"directory_model",
			null,
			model.slug ?? null,
			model.permaslug ?? null,
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
		);
		rowIndex += 1;
	}
	return rowIndex;
}

/** Insert OpenRouter permaslug candidate rows and return the next row index. */
function insertOpenRouterPermaslugCandidateRows(
	statement: StatementSync,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const [
		candidateIndex,
		permaslug,
	] of model.candidate_permaslugs.entries()) {
		statement.run(
			runId,
			rowIndex,
			fetchedAtEpochSeconds,
			SOURCE_URLS.openrouter_stats,
			"permaslug_candidate",
			model.id,
			null,
			permaslug,
			candidateIndex,
			model.selected_permaslug,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
		);
		rowIndex += 1;
	}
	return rowIndex;
}

/** Insert OpenRouter daily stat point rows and return the next row index. */
function insertOpenRouterStatPointRows(
	statement: StatementSync,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
		for (const point of openRouterStatPointRows(model.performance[metric])) {
			statement.run(
				runId,
				rowIndex,
				fetchedAtEpochSeconds,
				SOURCE_URLS.openrouter_stats,
				"stat_point",
				model.id,
				null,
				model.selected_permaslug,
				null,
				model.selected_permaslug,
				metric,
				point.x,
				point.series,
				point.value,
				null,
				null,
				null,
				null,
				null,
			);
			rowIndex += 1;
		}
	}
	return rowIndex;
}

/** Insert one OpenRouter model summary row and return the next row index. */
function insertOpenRouterModelStatsRow(
	statement: StatementSync,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	const normalizedModelStats = processOpenRouterModelStats(
		model.id,
		model.performance,
		model.pricing,
	);
	statement.run(
		runId,
		rowIndex,
		fetchedAtEpochSeconds,
		SOURCE_URLS.openrouter_stats,
		"model_stats",
		model.id,
		null,
		model.selected_permaslug,
		null,
		model.selected_permaslug,
		null,
		null,
		null,
		null,
		normalizedModelStats.performance.throughput_tokens_per_second_median,
		normalizedModelStats.performance.latency_seconds_median,
		normalizedModelStats.performance.e2e_latency_seconds_median,
		normalizedModelStats.pricing.weighted_input_price_per_1m,
		normalizedModelStats.pricing.weighted_output_price_per_1m,
	);
	return rowIndex + 1;
}

/** Insert OpenRouter raw directory rows, candidate rows, stat points, and model summaries in one source table. */
export function insertOpenRouterRawRows(
	db: DatabaseSync,
	runId: number,
	rawPayload: OpenRouterRawScrapedPayload | null | undefined,
): void {
	if (rawPayload == null) {
		return;
	}
	const statement = db.prepare(`
		INSERT INTO openrouter_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, row_kind, model_id,
			slug, permaslug, candidate_index, selected_permaslug, metric, x, series,
			value, throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, weighted_input_price_per_1m,
			weighted_output_price_per_1m
		) VALUES (${Array.from({ length: 19 }, () => "?").join(", ")})
	`);
	let rowIndex = insertOpenRouterDirectoryRows(statement, runId, rawPayload, 0);
	for (const model of rawPayload.models) {
		rowIndex = insertOpenRouterPermaslugCandidateRows(
			statement,
			runId,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
		rowIndex = insertOpenRouterStatPointRows(
			statement,
			runId,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
		rowIndex = insertOpenRouterModelStatsRow(
			statement,
			runId,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
	}
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
			aa_task_cost, aa_task_seconds, aa_task_output_tokens,
			deep_swe_task_cost, deep_swe_task_seconds, deep_swe_task_output_tokens,
			agents_last_exam_task_cost, agents_last_exam_task_seconds,
			agents_last_exam_task_input_tokens,
			agents_last_exam_task_output_tokens,
			raw_intelligence_score, raw_agentic_score, raw_speed_score,
			raw_value_score, relative_intelligence_score, relative_agentic_score,
			relative_speed_score, relative_value_score, relative_overall_score
		) VALUES (${Array.from({ length: 73 }, () => "?").join(", ")})
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

/** Insert matcher and lineage debug trace rows. */
export function insertDebugTraceRows(
	db: DatabaseSync,
	runId: number,
	rows: readonly DebugTraceRow[],
): void {
	const statement = db.prepare(`
		INSERT INTO debug (
			run_id, row_index, trace_kind, aa_id, aa_slug, aa_name,
			aa_raw_row_index, candidate_rank, candidate_model_id,
			candidate_provider_id, candidate_provider_name, candidate_name,
			candidate_score, selected, rejected, rejection_reason,
			selected_model_id, models_dev_row_index, openrouter_model_id,
			openrouter_model_stats_row_index
		) VALUES (${Array.from({ length: 20 }, () => "?").join(", ")})
	`);
	for (const [index, row] of rows.entries()) {
		statement.run(
			runId,
			index,
			row.trace_kind,
			row.aa_id,
			row.aa_slug,
			row.aa_name,
			row.aa_raw_row_index,
			row.candidate_rank,
			row.candidate_model_id,
			row.candidate_provider_id,
			row.candidate_provider_name,
			row.candidate_name,
			row.candidate_score,
			row.selected ? 1 : 0,
			row.rejected ? 1 : 0,
			row.rejection_reason,
			row.selected_model_id,
			row.models_dev_row_index,
			row.openrouter_model_id,
			row.openrouter_model_stats_row_index,
		);
	}
}

/** Count source rows by table for a concise result. */
export function tableCounts(db: DatabaseSync): Record<string, number> {
	const rows = db
		.prepare(`
			SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`)
		.all();
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const name = typeof row.name === "string" ? row.name : null;
		if (name == null) {
			continue;
		}
		const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get();
		counts[name] = Number(countRow?.count ?? 0);
	}
	return counts;
}
