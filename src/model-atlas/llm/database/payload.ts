/** Read the latest SQLite selected rows as the payload consumed by the minimal UI. */

import { DatabaseSync } from "node:sqlite";

import type { DeepSWELeaderboardRow } from "../scrapers/deep-swe";
import { asFiniteNumber, asRecord } from "../shared";
import {
	ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS,
	appendBenchmarkUpdateOfficialRow,
	type BenchmarkUpdateOfficialRow,
	type BenchmarkUpdateOfficialRowsByKey,
} from "../stats/health";
import { buildCurrentLlmStatsMetadata } from "../stats/metadata";
import type {
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsModalities,
	LlmStatsNullableRelativeScores,
	LlmStatsNullableScores,
	LlmStatsPayload,
	LlmStatsScoredCandidate,
	LlmStatsSourceHealth,
	LlmStatsSpeed,
	LlmStatsTaskMetrics,
} from "../stats/types";
import { DEFAULT_DATABASE_PATH } from "./types";

type DbRow = Record<string, unknown>;

const INTELLIGENCE_KEYS = [
	"intelligence_index",
	"agentic_index",
	"coding_index",
	"omniscience_index",
	"omniscience_accuracy",
] as const;

const EVALUATION_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"lcr",
	"mmmu_pro",
	"scicode",
	"tau_banking",
	"terminalbench_v21",
	"deep_swe",
	"terminal_bench_2",
	"agents_last_exam",
	"automation_bench",
	"blueprint_bench_2",
	"gdp_pdf",
	"riemann_bench",
	"browsecomp",
	"toolathlon",
	"cursorbench",
] as const;

const INPUT_MODALITY_COLUMNS = [
	["input_modality_text", "text"],
	["input_modality_image", "image"],
	["input_modality_audio", "audio"],
	["input_modality_video", "video"],
] as const;

/** Return a non-empty string value from SQLite. */
function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Convert SQLite integer booleans back to booleans. */
function booleanValue(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

/** Return whether an object has at least one own field. */
function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

/** Assign a finite numeric field when present. */
function assignNumber(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const numericValue = asFiniteNumber(value);
	if (numericValue != null) {
		target[key] = numericValue;
	}
}

/** Build an object from row columns with identical output keys. */
function numericObject<T extends object>(
	row: DbRow,
	keys: readonly string[],
): T | null {
	const record: Record<string, number> = {};
	for (const key of keys) {
		assignNumber(record, key, row[key]);
	}
	return hasFields(record) ? (record as T) : null;
}

/** Build the modalities object from scalar input-modality columns. */
function buildModalities(row: DbRow): LlmStatsModalities | null {
	const input = INPUT_MODALITY_COLUMNS.flatMap(([column, modality]) =>
		booleanValue(row[column]) === true ? [modality] : [],
	);
	return input.length > 0 ? { input } : null;
}

/** Build the context window object from scalar columns. */
function buildContextWindow(row: DbRow): LlmStatsContextWindow {
	const contextWindow: NonNullable<LlmStatsContextWindow> = {};
	assignNumber(contextWindow, "context", row.context);
	assignNumber(contextWindow, "input", row.context_input);
	assignNumber(contextWindow, "output", row.context_output);
	return hasFields(contextWindow) ? contextWindow : null;
}

/** Build the speed object from scalar columns. */
function buildSpeed(row: DbRow): LlmStatsSpeed {
	return {
		throughput_tokens_per_second_median:
			asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
		latency_seconds_median: asFiniteNumber(row.latency_seconds_median) ?? null,
		e2e_latency_seconds_median:
			asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
	};
}

/** Build the cost object from scalar columns. */
function buildCost(row: DbRow): LlmStatsCost {
	const cost: Record<string, unknown> = {};
	assignNumber(cost, "input", row.cost_input);
	assignNumber(cost, "output", row.cost_output);
	assignNumber(cost, "cache_read", row.cost_cache_read);
	assignNumber(cost, "cache_write", row.cost_cache_write);
	assignNumber(cost, "weighted_input", row.cost_weighted_input);
	assignNumber(cost, "weighted_output", row.cost_weighted_output);
	assignNumber(cost, "blended_price", row.cost_blended_price);
	const contextOver200k: Record<string, number> = {};
	assignNumber(contextOver200k, "input", row.context_over_200k_input);
	assignNumber(contextOver200k, "output", row.context_over_200k_output);
	assignNumber(contextOver200k, "cache_read", row.context_over_200k_cache_read);
	assignNumber(
		contextOver200k,
		"cache_write",
		row.context_over_200k_cache_write,
	);
	if (hasFields(contextOver200k)) {
		cost.context_over_200k = contextOver200k;
	}
	return hasFields(cost) ? (cost as NonNullable<LlmStatsCost>) : null;
}

/** Build the task metrics object from scalar columns. */
function buildTaskMetrics(row: DbRow): LlmStatsTaskMetrics {
	const artificialAnalysis: Record<string, number> = {};
	assignNumber(artificialAnalysis, "cost", row.aa_task_cost);
	assignNumber(artificialAnalysis, "seconds", row.aa_task_seconds);
	assignNumber(artificialAnalysis, "output_tokens", row.aa_task_output_tokens);
	const deepSWE: Record<string, number> = {};
	assignNumber(deepSWE, "cost", row.deep_swe_task_cost);
	assignNumber(deepSWE, "seconds", row.deep_swe_task_seconds);
	assignNumber(deepSWE, "output_tokens", row.deep_swe_task_output_tokens);
	const automationBench: Record<string, number> = {};
	assignNumber(automationBench, "cost", row.automation_bench_task_cost);
	const agentsLastExam: Record<string, number> = {};
	assignNumber(agentsLastExam, "cost", row.agents_last_exam_task_cost);
	assignNumber(agentsLastExam, "seconds", row.agents_last_exam_task_seconds);
	assignNumber(
		agentsLastExam,
		"input_tokens",
		row.agents_last_exam_task_input_tokens,
	);
	assignNumber(
		agentsLastExam,
		"output_tokens",
		row.agents_last_exam_task_output_tokens,
	);
	const taskMetrics: NonNullable<LlmStatsTaskMetrics> = {};
	if (hasFields(artificialAnalysis)) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	if (hasFields(deepSWE)) {
		taskMetrics.deep_swe = deepSWE;
	}
	if (hasFields(automationBench)) {
		taskMetrics.automation_bench = automationBench;
	}
	if (hasFields(agentsLastExam)) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

/** Build nullable raw score fields from scalar columns. */
function buildScores(row: DbRow): LlmStatsNullableScores {
	return {
		intelligence_score: asFiniteNumber(row.raw_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.raw_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.raw_speed_score) ?? null,
		value_score: asFiniteNumber(row.raw_value_score) ?? null,
	};
}

/** Build nullable relative score fields from scalar columns. */
function buildRelativeScores(row: DbRow): LlmStatsNullableRelativeScores {
	return {
		intelligence_score: asFiniteNumber(row.relative_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.relative_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.relative_speed_score) ?? null,
		value_score: asFiniteNumber(row.relative_value_score) ?? null,
		overall_score: asFiniteNumber(row.relative_overall_score) ?? null,
	};
}

/** Convert one SQLite selected row into the model payload shape. */
function modelFromRow(row: DbRow): LlmStatsScoredCandidate {
	const modelId = stringValue(row.model_id);
	const provider =
		stringValue(row.provider_id) ?? modelId?.split("/")[0] ?? null;
	return {
		id: modelId,
		name: stringValue(row.name),
		provider,
		logo: stringValue(row.logo) ?? "",
		attachment: booleanValue(row.attachment),
		reasoning: booleanValue(row.reasoning),
		release_date: stringValue(row.release_date),
		modalities: buildModalities(row),
		open_weights: booleanValue(row.open_weights),
		cost: buildCost(row),
		context_window: buildContextWindow(row),
		speed: buildSpeed(row),
		intelligence: numericObject<LlmStatsIntelligence>(row, INTELLIGENCE_KEYS),
		intelligence_index_cost: null,
		task_metrics: buildTaskMetrics(row),
		evaluations: numericObject<LlmStatsEvaluations>(row, EVALUATION_KEYS),
		scores: buildScores(row),
		relative_scores: buildRelativeScores(row),
	};
}

/** Read the latest completed run id from SQLite. */
function latestRun(db: DatabaseSync): { id: number; fetchedAt: number | null } {
	const row = asRecord(
		db
			.prepare(
				"SELECT id, completed_at_epoch_seconds AS fetched_at_epoch_seconds FROM pipeline_runs WHERE completed_at_epoch_seconds IS NOT NULL ORDER BY id DESC LIMIT 1",
			)
			.get(),
	);
	const id = asFiniteNumber(row.id);
	if (id == null) {
		throw new Error("No Model Atlas database run exists");
	}
	return {
		id,
		fetchedAt: asFiniteNumber(row.fetched_at_epoch_seconds),
	};
}

function sourceHealthFromRows(rows: DbRow[]): LlmStatsSourceHealth | undefined {
	if (rows.length === 0) {
		return undefined;
	}
	const generatedAt = asFiniteNumber(rows[0]?.generated_at_epoch_seconds);
	return {
		generated_at_epoch_seconds: generatedAt,
		sources: Object.fromEntries(
			rows.flatMap((row) => {
				const source = stringValue(row.source);
				const status = stringValue(row.status);
				if (
					source == null ||
					(status !== "cache_hit" &&
						status !== "fresh" &&
						status !== "using_cached_rows" &&
						status !== "empty")
				) {
					return [];
				}
				return [
					[
						source,
						{
							source,
							status,
							last_fetch_epoch_seconds: asFiniteNumber(
								row.last_fetch_epoch_seconds,
							),
							source_input_count: asFiniteNumber(row.source_input_count) ?? 0,
							cache_hit: booleanValue(row.cache_hit) ?? false,
							refreshed: booleanValue(row.refreshed) ?? false,
							using_cached_rows: booleanValue(row.using_cached_rows) ?? false,
							active_row_count: asFiniteNumber(row.active_row_count) ?? 0,
							quarantined_row_count:
								asFiniteNumber(row.quarantined_row_count) ?? 0,
						},
					],
				];
			}),
		),
	};
}

function officialRowsFromRows(
	aaRows: DbRow[],
	browseCompRows: DbRow[],
): BenchmarkUpdateOfficialRowsByKey {
	const rowsByKey: Record<string, BenchmarkUpdateOfficialRow[]> = {};
	for (const row of aaRows) {
		const modelId = stringValue(row.model_id);
		const label =
			stringValue(row.name) ?? stringValue(row.short_name) ?? modelId;
		if (label == null) {
			continue;
		}
		for (const key of ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS) {
			const value = asFiniteNumber(row[key]);
			if (value == null) {
				continue;
			}
			appendBenchmarkUpdateOfficialRow(rowsByKey, key, {
				id: modelId,
				label,
				provider: null,
				value,
			});
		}
	}
	for (const row of browseCompRows) {
		const label = stringValue(row.model);
		const value = asFiniteNumber(row.score);
		if (label == null || value == null) {
			continue;
		}
		appendBenchmarkUpdateOfficialRow(rowsByKey, "browsecomp", {
			id: null,
			label,
			provider: stringValue(row.provider),
			value,
		});
	}
	return rowsByKey;
}

type DeepSWEPayloadRow = DeepSWELeaderboardRow & {
	source_version: string | null;
};

/** Return the latest available DeepSWE artifact rows for graph-only display. */
function deepSWERowsFromRows(rows: DbRow[]): DeepSWELeaderboardRow[] {
	const parsedRows = rows.flatMap((row): DeepSWEPayloadRow[] => {
		const record = asRecord(row);
		const model = stringValue(record.model);
		const passAt1 = asFiniteNumber(record.pass_at_1);
		const tasksAttempted = asFiniteNumber(record.n_tasks_attempted);
		const meanCostUsd = asFiniteNumber(record.mean_cost_usd);
		const meanDurationSeconds = asFiniteNumber(record.mean_duration_seconds);
		const meanOutputTokens = asFiniteNumber(record.mean_output_tokens);
		return model != null &&
			passAt1 != null &&
			tasksAttempted != null &&
			tasksAttempted > 0 &&
			meanCostUsd != null &&
			meanDurationSeconds != null &&
			meanOutputTokens != null
			? [
					{
						model,
						reasoning_effort: stringValue(record.reasoning_effort),
						config: stringValue(record.config),
						pass_at_1: passAt1,
						ci_lo: asFiniteNumber(record.ci_lo),
						ci_hi: asFiniteNumber(record.ci_hi),
						ci_half: asFiniteNumber(record.ci_half),
						n_tasks_attempted: tasksAttempted,
						mean_cost_usd: meanCostUsd,
						mean_duration_seconds: meanDurationSeconds,
						mean_output_tokens: meanOutputTokens,
						source_version: stringValue(record.source_version),
					},
				]
			: [];
	});
	const v11Rows = parsedRows.filter((row) => row.source_version === "v1.1");
	const preferredRows = v11Rows.length > 0 ? v11Rows : parsedRows;
	return preferredRows.map(({ source_version: _sourceVersion, ...row }) => row);
}

export type ModelAtlasPayloadRows = {
	run: {
		id: number;
		fetchedAt: number | null;
	};
	modelRows: DbRow[];
	sourceHealthRows: DbRow[];
	aaRows: DbRow[];
	browseCompRows: DbRow[];
	deepSWERows: DbRow[];
};

export function buildModelAtlasPayloadFromRows(
	rows: ModelAtlasPayloadRows,
): LlmStatsPayload {
	const models = rows.modelRows.map(modelFromRow);
	const sourceHealth = sourceHealthFromRows(rows.sourceHealthRows);
	const officialRowsByKey = officialRowsFromRows(
		rows.aaRows,
		rows.browseCompRows,
	);
	return {
		fetched_at_epoch_seconds: rows.run.fetchedAt,
		metadata: buildCurrentLlmStatsMetadata({
			models,
			healthModels: models,
			sourceHealth,
			officialRowsByKey,
		}),
		deep_swe: {
			rows: deepSWERowsFromRows(rows.deepSWERows),
		},
		models: models as LlmStatsPayload["models"],
	};
}

function readSourceHealthRows(db: DatabaseSync, runId: number): DbRow[] {
	try {
		return readRunRows(
			db,
			"SELECT * FROM source_health WHERE run_id = ? ORDER BY row_index",
			runId,
		);
	} catch {
		return [];
	}
}

function readRunRows(db: DatabaseSync, sql: string, runId: number): DbRow[] {
	return db
		.prepare(sql)
		.all(runId)
		.map((row) => asRecord(row));
}

/** Read the UI payload from the latest SQLite selected rows. */
export function readModelAtlasDatabasePayload(
	databasePath = DEFAULT_DATABASE_PATH,
): LlmStatsPayload {
	const db = new DatabaseSync(databasePath);
	try {
		const run = latestRun(db);
		const modelRows = readRunRows(
			db,
			"SELECT * FROM processed_models WHERE run_id = ? AND stage = 'final' ORDER BY row_index",
			run.id,
		);
		return buildModelAtlasPayloadFromRows({
			run,
			modelRows,
			sourceHealthRows: readSourceHealthRows(db, run.id),
			aaRows: readRunRows(
				db,
				"SELECT * FROM aa_raw_models WHERE run_id = ? ORDER BY row_index",
				run.id,
			),
			browseCompRows: readRunRows(
				db,
				"SELECT * FROM browsecomp_raw_rows WHERE run_id = ? ORDER BY row_index",
				run.id,
			),
			deepSWERows: readRunRows(
				db,
				"SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY pass_at_1 DESC, row_index",
				run.id,
			),
		});
	} finally {
		db.close();
	}
}
