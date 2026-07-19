/** Storage-independent payload assembly enforces the public stats shape shared by local snapshots and D1. */

import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../scrapers/deep-swe";
import { asFiniteNumber, asRecord, canonicalReasoningEffort } from "../shared";
import {
	ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
	benchmarkRowsFromDb,
} from "../stats/benchmarks";
import { buildCurrentLlmStatsMetadata } from "../stats/metadata";
import { publicModelFromCandidate } from "../stats/selection";
import type {
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsModalities,
	LlmStatsNullableComponentScores,
	LlmStatsNullableScores,
	LlmStatsPayload,
	LlmStatsScoredCandidate,
	LlmStatsSourceHealth,
	LlmStatsSpeed,
	LlmStatsTaskMetrics,
	LlmStatsTaskMetricValues,
} from "../stats/types";

type DbRow = Record<string, unknown>;

export type PayloadRows = {
	run: {
		id: number;
		fetchedAt: number | null;
	};
	modelRows: DbRow[];
	modelEvaluationRows: DbRow[];
	modelTaskMetricRows: DbRow[];
	sourceHealthRows: DbRow[];
	artificialAnalysisRows: DbRow[];
	agentArenaRows: DbRow[];
	agentsLastExamRows: DbRow[];
	blueprintBenchRows: DbRow[];
	browseCompRows: DbRow[];
	chartographyRows: DbRow[];
	chessPuzzleRows: DbRow[];
	cursorBenchRows: DbRow[];
	deepSWERows: DbRow[];
	ebrBenchRows: DbRow[];
	enterpriseBenchCoreCraftRows: DbRow[];
	epochCapabilitiesIndexRows: DbRow[];
	frontierMathTier4Rows: DbRow[];
	gdpPdfRows: DbRow[];
	handbookMdRows: DbRow[];
	proofBenchRows: DbRow[];
	riemannBenchRows: DbRow[];
	valsTerminalBenchRows: DbRow[];
	toolathlonRows: DbRow[];
	valsIndexRows: DbRow[];
	vendingBench2Rows: DbRow[];
	weirdMlRows: DbRow[];
};

type PayloadRowKey = Exclude<keyof PayloadRows, "run">;

export type PayloadRowGroup = {
	key: PayloadRowKey;
	sql: string;
	sourceTable?: string;
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
		sql: "SELECT * FROM models WHERE run_id = ? ORDER BY row_index",
	},
	{
		key: "modelEvaluationRows",
		sql: "SELECT * FROM model_evaluations WHERE run_id = ? ORDER BY model_row_index, benchmark_key",
	},
	{
		key: "modelTaskMetricRows",
		sql: "SELECT * FROM model_task_metrics WHERE run_id = ? ORDER BY model_row_index, source_key",
	},
	{
		key: "sourceHealthRows",
		sql: "SELECT * FROM source_health WHERE run_id = ? ORDER BY row_index",
		optional: true,
	},
	{
		key: "artificialAnalysisRows",
		sql: "SELECT * FROM artificial_analysis_raw_models WHERE run_id = ? ORDER BY row_index",
		sourceTable: "artificial_analysis_raw_models",
	},
	{
		key: "agentArenaRows",
		sql: "SELECT * FROM agent_arena_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "agent_arena_raw_rows",
		optional: true,
	},
	{
		key: "agentsLastExamRows",
		sql: "SELECT * FROM agents_last_exam_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "agents_last_exam_raw_rows",
	},
	{
		key: "blueprintBenchRows",
		sql: "SELECT * FROM blueprint_bench_2_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "blueprint_bench_2_raw_rows",
	},
	{
		key: "browseCompRows",
		sql: "SELECT * FROM browsecomp_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "browsecomp_raw_rows",
	},
	{
		key: "chartographyRows",
		sql: "SELECT * FROM chartography_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "chartography_raw_rows",
		optional: true,
	},
	{
		key: "chessPuzzleRows",
		sql: "SELECT * FROM chess_puzzles_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "chess_puzzles_raw_rows",
		optional: true,
	},
	{
		key: "cursorBenchRows",
		sql: "SELECT * FROM cursorbench_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "cursorbench_raw_rows",
	},
	{
		key: "deepSWERows",
		sql: "SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY pass_at_1 DESC, row_index",
		sourceTable: "deep_swe_raw_rows",
	},
	{
		key: "ebrBenchRows",
		sql: "SELECT * FROM ebr_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "ebr_bench_raw_rows",
		optional: true,
	},
	{
		key: "enterpriseBenchCoreCraftRows",
		sql: "SELECT * FROM enterprisebench_corecraft_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "enterprisebench_corecraft_raw_rows",
		optional: true,
	},
	{
		key: "epochCapabilitiesIndexRows",
		sql: "SELECT * FROM epoch_capabilities_index_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "epoch_capabilities_index_raw_rows",
		optional: true,
	},
	{
		key: "frontierMathTier4Rows",
		sql: "SELECT * FROM frontiermath_tier_4_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "frontiermath_tier_4_raw_rows",
		optional: true,
	},
	{
		key: "gdpPdfRows",
		sql: "SELECT * FROM gdp_pdf_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "gdp_pdf_raw_rows",
	},
	{
		key: "handbookMdRows",
		sql: "SELECT * FROM handbook_md_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "handbook_md_raw_rows",
		optional: true,
	},
	{
		key: "proofBenchRows",
		sql: "SELECT * FROM proofbench_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "proofbench_raw_rows",
		optional: true,
	},
	{
		key: "riemannBenchRows",
		sql: "SELECT * FROM riemann_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "riemann_bench_raw_rows",
	},
	{
		key: "valsTerminalBenchRows",
		sql: "SELECT * FROM vals_terminal_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "vals_terminal_bench_raw_rows",
		optional: true,
	},
	{
		key: "toolathlonRows",
		sql: "SELECT * FROM toolathlon_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "toolathlon_raw_rows",
	},
	{
		key: "valsIndexRows",
		sql: "SELECT * FROM vals_index_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "vals_index_raw_rows",
		optional: true,
	},
	{
		key: "vendingBench2Rows",
		sql: "SELECT * FROM vending_bench_2_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "vending_bench_2_raw_rows",
		optional: true,
	},
	{
		key: "weirdMlRows",
		sql: "SELECT * FROM weirdml_raw_rows WHERE run_id = ? ORDER BY row_index",
		sourceTable: "weirdml_raw_rows",
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

function buildComponentScores(row: DbRow): LlmStatsNullableComponentScores {
	return {
		intelligence_score:
			asFiniteNumber(row.component_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.component_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.component_speed_score) ?? null,
	};
}

function buildScores(row: DbRow): LlmStatsNullableScores {
	return {
		intelligence_score: asFiniteNumber(row.intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.agentic_score) ?? null,
		speed_score: asFiniteNumber(row.speed_score) ?? null,
		value_score: asFiniteNumber(row.value_score) ?? null,
	};
}

/** One selected model row and its normalized child records become the public model contract. */
function modelFromRow(
	row: DbRow,
	evaluations: LlmStatsEvaluations | null,
	taskMetrics: LlmStatsTaskMetrics,
): LlmStatsScoredCandidate {
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
		reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
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
		task_metrics: taskMetrics,
		evaluations,
		component_scores: buildComponentScores(row),
		scores: buildScores(row),
	};
}

/** Run metadata is accepted only after the database marks the snapshot completed. */
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

/** Keeps every storage adapter aligned on the row groups required by the public payload. */
export function buildPayloadRows(
	run: PayloadRows["run"],
	rowGroups: ReadonlyArray<readonly [PayloadRowKey, DbRow[]]>,
): PayloadRows {
	const rows = new Map(rowGroups);
	return {
		run,
		modelRows: rows.get("modelRows") ?? [],
		modelEvaluationRows: rows.get("modelEvaluationRows") ?? [],
		modelTaskMetricRows: rows.get("modelTaskMetricRows") ?? [],
		sourceHealthRows: rows.get("sourceHealthRows") ?? [],
		artificialAnalysisRows: rows.get("artificialAnalysisRows") ?? [],
		agentArenaRows: rows.get("agentArenaRows") ?? [],
		agentsLastExamRows: rows.get("agentsLastExamRows") ?? [],
		blueprintBenchRows: rows.get("blueprintBenchRows") ?? [],
		browseCompRows: rows.get("browseCompRows") ?? [],
		chartographyRows: rows.get("chartographyRows") ?? [],
		chessPuzzleRows: rows.get("chessPuzzleRows") ?? [],
		cursorBenchRows: rows.get("cursorBenchRows") ?? [],
		deepSWERows: rows.get("deepSWERows") ?? [],
		ebrBenchRows: rows.get("ebrBenchRows") ?? [],
		enterpriseBenchCoreCraftRows:
			rows.get("enterpriseBenchCoreCraftRows") ?? [],
		epochCapabilitiesIndexRows: rows.get("epochCapabilitiesIndexRows") ?? [],
		frontierMathTier4Rows: rows.get("frontierMathTier4Rows") ?? [],
		gdpPdfRows: rows.get("gdpPdfRows") ?? [],
		handbookMdRows: rows.get("handbookMdRows") ?? [],
		proofBenchRows: rows.get("proofBenchRows") ?? [],
		riemannBenchRows: rows.get("riemannBenchRows") ?? [],
		valsTerminalBenchRows: rows.get("valsTerminalBenchRows") ?? [],
		toolathlonRows: rows.get("toolathlonRows") ?? [],
		valsIndexRows: rows.get("valsIndexRows") ?? [],
		vendingBench2Rows: rows.get("vendingBench2Rows") ?? [],
		weirdMlRows: rows.get("weirdMlRows") ?? [],
	};
}

function evaluationsByModelRow(
	rows: readonly DbRow[],
): Map<number, LlmStatsEvaluations> {
	const evaluationsByModel = new Map<number, LlmStatsEvaluations>();
	for (const row of rows) {
		const modelRowIndex = asFiniteNumber(row.model_row_index);
		const benchmarkKey = stringValue(row.benchmark_key);
		const value = asFiniteNumber(row.value);
		if (modelRowIndex == null || benchmarkKey == null || value == null) {
			continue;
		}
		const evaluations = evaluationsByModel.get(modelRowIndex) ?? {};
		evaluations[benchmarkKey] = value;
		evaluationsByModel.set(modelRowIndex, evaluations);
	}
	return evaluationsByModel;
}

function taskMetricsByModelRow(
	rows: readonly DbRow[],
): Map<number, NonNullable<LlmStatsTaskMetrics>> {
	const taskMetricsByModel = new Map<
		number,
		NonNullable<LlmStatsTaskMetrics>
	>();
	for (const row of rows) {
		const modelRowIndex = asFiniteNumber(row.model_row_index);
		const sourceKey = stringValue(row.source_key);
		if (modelRowIndex == null || sourceKey == null) {
			continue;
		}
		const metrics: LlmStatsTaskMetricValues = {};
		assignNumber(metrics, "cost", row.cost);
		assignNumber(metrics, "seconds", row.seconds);
		assignNumber(metrics, "tokens", row.tokens);
		assignNumber(metrics, "input_tokens", row.input_tokens);
		assignNumber(metrics, "output_tokens", row.output_tokens);
		const taskMetrics = taskMetricsByModel.get(modelRowIndex) ?? {};
		taskMetrics[sourceKey] = metrics;
		taskMetricsByModel.set(modelRowIndex, taskMetrics);
	}
	return taskMetricsByModel;
}

/** Payload row groups share one reader contract across local SQLite and Cloudflare D1. */
export async function readPayloadRows(
	run: PayloadRows["run"],
	readRows: PayloadRowReader,
): Promise<PayloadRows> {
	const rowGroups = await Promise.all(
		PAYLOAD_ROW_GROUPS.map(async (rowGroup) => {
			try {
				return [rowGroup.key, await readRows(rowGroup, run.id)] as [
					PayloadRowKey,
					DbRow[],
				];
			} catch (error) {
				if (rowGroup.optional === true) {
					return [rowGroup.key, []] as [PayloadRowKey, DbRow[]];
				}
				throw error;
			}
		}),
	);
	return buildPayloadRows(run, rowGroups);
}

function sourceHealthFromRows(
	rows: DbRow[],
	generatedAt: number | null,
): LlmStatsSourceHealth | undefined {
	if (rows.length === 0) {
		return undefined;
	}
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
							cache_hit: status === "cache_hit",
							refreshed: status === "fresh",
							using_cached_rows: status === "using_cached_rows",
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
	const evaluationsByModel = evaluationsByModelRow(rows.modelEvaluationRows);
	const taskMetricsByModel = taskMetricsByModelRow(rows.modelTaskMetricRows);
	const models = rows.modelRows.flatMap((row) => {
		const modelRowIndex = asFiniteNumber(row.row_index);
		const model = publicModelFromCandidate(
			modelFromRow(
				row,
				modelRowIndex == null
					? null
					: (evaluationsByModel.get(modelRowIndex) ?? null),
				modelRowIndex == null
					? null
					: (taskMetricsByModel.get(modelRowIndex) ?? null),
			),
		);
		return model == null ? [] : [model];
	});
	const sourceHealth = sourceHealthFromRows(
		rows.sourceHealthRows,
		rows.run.fetchedAt,
	);
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
		models,
	};
}
