/** Read the latest SQLite selected rows as the payload consumed by the minimal UI. */

import { DatabaseSync } from "node:sqlite";

import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../scrapers/deep-swe";
import { asFiniteNumber, asRecord } from "../shared";
import {
	ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
	benchmarkRowsFromDb,
	MODEL_ATLAS_EVALUATION_KEYS,
} from "../stats/benchmarks";
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

export type PayloadRows = {
	run: {
		id: number;
		fetchedAt: number | null;
	};
	modelRows: DbRow[];
	sourceHealthRows: DbRow[];
	artificialAnalysisRows: DbRow[];
	agentsLastExamRows: DbRow[];
	blueprintBenchRows: DbRow[];
	browseCompRows: DbRow[];
	cursorBenchRows: DbRow[];
	deepSWERows: DbRow[];
	gdpPdfRows: DbRow[];
	riemannBenchRows: DbRow[];
	toolathlonRows: DbRow[];
	valsIndexRows: DbRow[];
	valsTerminalBenchRows: DbRow[];
};

type PayloadRowKey = Exclude<keyof PayloadRows, "run">;

export type PayloadRowGroup = {
	key: PayloadRowKey;
	sql: string;
	optional?: boolean;
};

export type PayloadRowReader = (
	rowGroup: PayloadRowGroup,
	runId: number,
) => Promise<DbRow[]>;

export const COMPLETED_RUN_SQL =
	"SELECT id, completed_at_epoch_seconds AS fetched_at_epoch_seconds FROM pipeline_runs WHERE completed_at_epoch_seconds IS NOT NULL ORDER BY id DESC LIMIT 1";

export const PAYLOAD_ROW_GROUPS: readonly PayloadRowGroup[] = [
	{
		key: "modelRows",
		sql: "SELECT * FROM processed_models WHERE run_id = ? AND stage = 'final' ORDER BY row_index",
	},
	{
		key: "sourceHealthRows",
		sql: "SELECT * FROM source_health WHERE run_id = ? ORDER BY row_index",
		optional: true,
	},
	{
		key: "artificialAnalysisRows",
		sql: "SELECT * FROM artificial_analysis_raw_models WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "agentsLastExamRows",
		sql: "SELECT * FROM agents_last_exam_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "blueprintBenchRows",
		sql: "SELECT * FROM blueprint_bench_2_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "browseCompRows",
		sql: "SELECT * FROM browsecomp_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "cursorBenchRows",
		sql: "SELECT * FROM cursorbench_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "deepSWERows",
		sql: "SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY pass_at_1 DESC, row_index",
	},
	{
		key: "gdpPdfRows",
		sql: "SELECT * FROM gdp_pdf_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "riemannBenchRows",
		sql: "SELECT * FROM riemann_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "toolathlonRows",
		sql: "SELECT * FROM toolathlon_raw_rows WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "valsIndexRows",
		sql: "SELECT * FROM vals_index_raw_rows WHERE run_id = ? ORDER BY row_index",
		optional: true,
	},
	{
		key: "valsTerminalBenchRows",
		sql: "SELECT * FROM vals_terminal_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
		optional: true,
	},
];

const INPUT_MODALITY_COLUMNS = [
	["input_modality_text", "text"],
	["input_modality_image", "image"],
	["input_modality_audio", "audio"],
	["input_modality_video", "video"],
] as const;

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

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

function taskMetricsFromJson(value: unknown): LlmStatsTaskMetrics {
	if (typeof value !== "string" || value.length === 0) {
		return null;
	}
	try {
		const taskMetrics = asRecord(JSON.parse(value));
		return hasFields(taskMetrics)
			? (taskMetrics as NonNullable<LlmStatsTaskMetrics>)
			: null;
	} catch {
		return null;
	}
}

function buildModalities(row: DbRow): LlmStatsModalities | null {
	const input = INPUT_MODALITY_COLUMNS.flatMap(([column, modality]) =>
		booleanValue(row[column]) === true ? [modality] : [],
	);
	return input.length > 0 ? { input } : null;
}

function buildContextWindow(row: DbRow): LlmStatsContextWindow {
	const contextWindow: NonNullable<LlmStatsContextWindow> = {};
	assignNumber(contextWindow, "context", row.context);
	assignNumber(contextWindow, "input", row.context_input);
	assignNumber(contextWindow, "output", row.context_output);
	return hasFields(contextWindow) ? contextWindow : null;
}

function buildSpeed(row: DbRow): LlmStatsSpeed {
	return {
		throughput_tokens_per_second_median:
			asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
		latency_seconds_median: asFiniteNumber(row.latency_seconds_median) ?? null,
		e2e_latency_seconds_median:
			asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
	};
}

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

function buildTaskMetrics(row: DbRow): LlmStatsTaskMetrics {
	const storedTaskMetrics = taskMetricsFromJson(row.task_metrics_json);
	if (storedTaskMetrics != null) {
		return storedTaskMetrics;
	}
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
	const artificialAnalysis: Record<string, number> = {};
	assignNumber(artificialAnalysis, "cost", row.artificial_analysis_task_cost);
	assignNumber(
		artificialAnalysis,
		"seconds",
		row.artificial_analysis_task_seconds,
	);
	assignNumber(
		artificialAnalysis,
		"output_tokens",
		row.artificial_analysis_task_output_tokens,
	);
	const automationBench: Record<string, number> = {};
	assignNumber(automationBench, "cost", row.automation_bench_task_cost);
	const cursorBench: Record<string, number> = {};
	assignNumber(cursorBench, "cost", row.cursorbench_task_cost);
	assignNumber(cursorBench, "tokens", row.cursorbench_task_tokens);
	const deepSWE: Record<string, number> = {};
	assignNumber(deepSWE, "cost", row.deep_swe_task_cost);
	assignNumber(deepSWE, "seconds", row.deep_swe_task_seconds);
	assignNumber(deepSWE, "output_tokens", row.deep_swe_task_output_tokens);
	const terminalBench: Record<string, number> = {};
	assignNumber(terminalBench, "cost", row.terminalbench_v21_task_cost);
	assignNumber(terminalBench, "seconds", row.terminalbench_v21_task_seconds);
	assignNumber(terminalBench, "tokens", row.terminalbench_v21_task_tokens);
	assignNumber(
		terminalBench,
		"input_tokens",
		row.terminalbench_v21_task_input_tokens,
	);
	assignNumber(
		terminalBench,
		"output_tokens",
		row.terminalbench_v21_task_output_tokens,
	);
	const taskMetrics: NonNullable<LlmStatsTaskMetrics> = {};
	if (hasFields(agentsLastExam)) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	if (hasFields(artificialAnalysis)) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	if (hasFields(automationBench)) {
		taskMetrics.automation_bench = automationBench;
	}
	if (hasFields(cursorBench)) {
		taskMetrics.cursorbench = cursorBench;
	}
	if (hasFields(deepSWE)) {
		taskMetrics.deep_swe = deepSWE;
	}
	if (hasFields(terminalBench)) {
		taskMetrics.terminalbench_v21 = terminalBench;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function buildScores(row: DbRow): LlmStatsNullableScores {
	return {
		intelligence_score: asFiniteNumber(row.raw_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.raw_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.raw_speed_score) ?? null,
		price_score: asFiniteNumber(row.raw_price_score) ?? null,
	};
}

function buildRelativeScores(row: DbRow): LlmStatsNullableRelativeScores {
	return {
		intelligence_score: asFiniteNumber(row.relative_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.relative_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.relative_speed_score) ?? null,
		time_efficiency_score:
			asFiniteNumber(row.relative_time_efficiency_score) ?? null,
		price_score: asFiniteNumber(row.relative_price_score) ?? null,
		cost_efficiency_score:
			asFiniteNumber(row.relative_cost_efficiency_score) ?? null,
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
		intelligence: numericObject<LlmStatsIntelligence>(
			row,
			ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
		),
		intelligence_index_cost: null,
		task_metrics: buildTaskMetrics(row),
		evaluations: numericObject<LlmStatsEvaluations>(
			row,
			MODEL_ATLAS_EVALUATION_KEYS,
		),
		scores: buildScores(row),
		relative_scores: buildRelativeScores(row),
	};
}

/** Converts local SQLite and D1 run rows into the payload run contract. */
export function payloadRunFromRow(row: unknown): PayloadRows["run"] | null {
	const record = asRecord(row);
	const id = asFiniteNumber(record.id);
	if (id == null) {
		return null;
	}
	return {
		id,
		fetchedAt: asFiniteNumber(record.fetched_at_epoch_seconds),
	};
}

function latestRun(db: DatabaseSync): PayloadRows["run"] {
	const run = payloadRunFromRow(db.prepare(COMPLETED_RUN_SQL).get());
	if (run == null) {
		throw new Error("No Model Atlas database run exists");
	}
	return run;
}

/** Keeps every storage adapter aligned on the row groups required by the public payload. */
function buildPayloadRows(
	run: PayloadRows["run"],
	rowGroups: ReadonlyArray<readonly [PayloadRowKey, DbRow[]]>,
): PayloadRows {
	const rows = new Map(rowGroups);
	return {
		run,
		modelRows: rows.get("modelRows") ?? [],
		sourceHealthRows: rows.get("sourceHealthRows") ?? [],
		artificialAnalysisRows: rows.get("artificialAnalysisRows") ?? [],
		agentsLastExamRows: rows.get("agentsLastExamRows") ?? [],
		blueprintBenchRows: rows.get("blueprintBenchRows") ?? [],
		browseCompRows: rows.get("browseCompRows") ?? [],
		cursorBenchRows: rows.get("cursorBenchRows") ?? [],
		deepSWERows: rows.get("deepSWERows") ?? [],
		gdpPdfRows: rows.get("gdpPdfRows") ?? [],
		riemannBenchRows: rows.get("riemannBenchRows") ?? [],
		toolathlonRows: rows.get("toolathlonRows") ?? [],
		valsIndexRows: rows.get("valsIndexRows") ?? [],
		valsTerminalBenchRows: rows.get("valsTerminalBenchRows") ?? [],
	};
}

function readPayloadRowGroup(
	db: DatabaseSync,
	rowGroup: PayloadRowGroup,
	runId: number,
): DbRow[] {
	try {
		return readRunRows(db, rowGroup.sql, runId);
	} catch (error) {
		if (rowGroup.optional === true) {
			return [];
		}
		throw error;
	}
}

function readPayloadRowGroups(
	db: DatabaseSync,
	runId: number,
): [PayloadRowKey, DbRow[]][] {
	return PAYLOAD_ROW_GROUPS.map((rowGroup) => [
		rowGroup.key,
		readPayloadRowGroup(db, rowGroup, runId),
	]);
}

/** Reads the row groups required by the public payload from any SQL storage adapter. */
export async function readPayloadRows(
	run: PayloadRows["run"],
	readRows: PayloadRowReader,
): Promise<PayloadRows> {
	const rowGroups = await Promise.all(
		PAYLOAD_ROW_GROUPS.map(async (rowGroup) => {
			return [rowGroup.key, await readRows(rowGroup, run.id)] as [
				PayloadRowKey,
				DbRow[],
			];
		}),
	);
	return buildPayloadRows(run, rowGroups);
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

/** Assembles the public Model Atlas payload from database row groups. */
export function buildPayloadFromRows(rows: PayloadRows): LlmStatsPayload {
	const models = rows.modelRows.map(modelFromRow);
	const sourceHealth = sourceHealthFromRows(rows.sourceHealthRows);
	const sourceRowsByKey = benchmarkRowsFromDb(rows);
	return {
		fetched_at_epoch_seconds: rows.run.fetchedAt,
		metadata: buildCurrentLlmStatsMetadata({
			models,
			healthModels: models,
			sourceHealth,
			sourceRowsByKey,
		}),
		deep_swe: {
			rows: preferredDeepSWELeaderboardRows(
				rows.deepSWERows.flatMap((row) => {
					const parsedRow = asDeepSWERawLeaderboardRow(row);
					return parsedRow == null ? [] : [parsedRow];
				}),
			),
		},
		models: models as LlmStatsPayload["models"],
	};
}

function readRunRows(db: DatabaseSync, sql: string, runId: number): DbRow[] {
	return db
		.prepare(sql)
		.all(runId)
		.map((row) => asRecord(row));
}

/** Read the UI payload from the latest SQLite selected rows. */
export function readDatabasePayload(
	databasePath = DEFAULT_DATABASE_PATH,
): LlmStatsPayload {
	const db = new DatabaseSync(databasePath);
	try {
		const run = latestRun(db);
		return buildPayloadFromRows(
			buildPayloadRows(run, readPayloadRowGroups(db, run.id)),
		);
	} finally {
		db.close();
	}
}
