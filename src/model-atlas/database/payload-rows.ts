/** Storage-independent payload assembly enforces the public stats shape shared by local snapshots and D1. */

import { ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS } from "../benchmarks/field-keys";
import {
	ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
	BENCHMARK_OBSERVATION_BINDINGS,
	type PublicBenchmarkRuntimeKeyFor,
} from "../benchmarks/registry";
import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../benchmarks/scrapers/deep-swe";
import { canonicalReasoningEffort } from "../identity/normalization";
import {
	SNAPSHOT_TABLES,
	type SnapshotTableName,
} from "../ingest/source-registry";
import { benchmarkRowsFromDb } from "../pipeline/benchmark-rows";
import { publicModelFromCandidate } from "../pipeline/selection/public-list";
import { asFiniteNumber, asRecord } from "../runtime";
import { buildCurrentLlmStatsMetadata } from "../stats/payload/metadata";
import type {
	LlmStatsContextWindow,
	LlmStatsCost,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsModalities,
	LlmStatsPayload,
	LlmStatsScoredCandidate,
	LlmStatsSourceHealth,
	LlmStatsTaskMetrics,
	LlmStatsTaskMetricValues,
} from "../stats/types";

type DbRow = Record<string, unknown>;

export const SNAPSHOT_METADATA_SQL =
	"SELECT updated_at_epoch_seconds FROM snapshot_metadata LIMIT 1";

type PayloadRowGroupOptions = {
	columns?: readonly string[];
	optional?: boolean;
	sourceKey?: string | null;
};

/** Build one row-group entry so table identity and read SQL cannot drift. */
function payloadRowGroup<Key extends string>(
	key: Key,
	table: SnapshotTableName,
	orderBy: string,
	{
		columns = ["*"],
		optional = false,
		sourceKey = null,
	}: PayloadRowGroupOptions = {},
) {
	const sourcePredicate =
		sourceKey == null
			? ""
			: ` WHERE source_key = '${sourceKey.replaceAll("'", "''")}'`;
	return {
		key,
		table,
		sql: `SELECT ${columns.join(", ")} FROM ${table}${sourcePredicate} ORDER BY ${orderBy}`,
		optional,
		sourceKey,
	};
}

const BENCHMARK_OBSERVATION_PAYLOAD_COLUMNS = [
	"source_key",
	"row_index",
	"benchmark_key",
	"model_id",
	"model",
	"base_model",
	"reasoning_effort",
	"model_creator_id",
	"model_creator",
	"inference_provider",
	"canonical_value",
	"score_eligible",
] as const;

/** Sparse benchmarks retain distinct row contracts behind one catalog-keyed payload registry. */
const SPARSE_BENCHMARK_PAYLOAD_ROW_GROUPS = {
	agent_arena: payloadRowGroup(
		"agentArenaRows",
		SNAPSHOT_TABLES.agent_arena,
		"row_index",
		{
			columns: [
				"contender_name",
				"model",
				"base_model",
				"reasoning_effort",
				"organization",
				"score",
			],
			optional: true,
		},
	),
	agents_last_exam: payloadRowGroup(
		"agentsLastExamRows",
		SNAPSHOT_TABLES.agents_last_exam,
		"row_index",
		{ columns: ["model", "row_kind", "median_score", "mean_score"] },
	),
	ale_bench: payloadRowGroup(
		"aleBenchRows",
		SNAPSHOT_TABLES.ale_bench,
		"row_index",
		{
			columns: [
				"base_model",
				"reasoning_effort",
				"num_self_refine",
				"performance_mean",
			],
			optional: true,
		},
	),
	blueprint_bench_2: payloadRowGroup(
		"blueprintBenchRows",
		SNAPSHOT_TABLES.blueprint_bench_2,
		"row_index",
		{ columns: ["model", "score"] },
	),
	cursorbench: payloadRowGroup(
		"cursorBenchRows",
		SNAPSHOT_TABLES.cursorbench,
		"row_index",
		{ columns: ["base_model", "reasoning_effort", "score"] },
	),
	deep_swe: payloadRowGroup(
		"deepSWERows",
		SNAPSHOT_TABLES.deep_swe,
		"pass_at_1 DESC, row_index",
	),
	frontier_code: payloadRowGroup(
		"frontierCodeRows",
		SNAPSHOT_TABLES.frontier_code,
		"row_index",
		{
			columns: [
				"model",
				"base_model",
				"reasoning_effort",
				"score_eligible",
				"main_score",
			],
			optional: true,
		},
	),
	vending_bench_2: payloadRowGroup(
		"vendingBench2Rows",
		SNAPSHOT_TABLES.vending_bench_2,
		"row_index",
		{
			columns: ["model", "base_model", "reasoning_effort", "final_balance_usd"],
			optional: true,
		},
	),
} as const satisfies Record<
	PublicBenchmarkRuntimeKeyFor<"sparse">,
	ReturnType<typeof payloadRowGroup>
>;

const SURGE_BENCHMARK_PAYLOAD_ROW_GROUPS = {
	gdp_pdf: payloadRowGroup("gdpPdfRows", SNAPSHOT_TABLES.gdp_pdf, "row_index", {
		columns: ["model", "provider", "score"],
	}),
	riemann_bench: payloadRowGroup(
		"riemannBenchRows",
		SNAPSHOT_TABLES.riemann_bench,
		"row_index",
		{ columns: ["model", "provider", "score"] },
	),
} as const satisfies Record<
	PublicBenchmarkRuntimeKeyFor<"surge">,
	ReturnType<typeof payloadRowGroup>
>;

const VALS_BENCHMARK_PAYLOAD_ROW_GROUPS = {
	vals_harvey_lab: payloadRowGroup(
		"harveyLabRows",
		SNAPSHOT_TABLES.vals_harvey_lab,
		"row_index",
		{
			columns: ["model_id", "model", "provider", "row_kind", "score"],
			optional: true,
		},
	),
	vals_terminal_bench: payloadRowGroup(
		"terminalBenchRows",
		SNAPSHOT_TABLES.vals_terminal_bench,
		"row_index",
		{
			columns: ["model_id", "model", "provider", "row_kind", "score"],
			optional: true,
		},
	),
	vals_index: payloadRowGroup(
		"valsIndexRows",
		SNAPSHOT_TABLES.vals_index,
		"row_index",
		{
			columns: ["model_id", "model", "provider", "row_kind", "score"],
			optional: true,
		},
	),
} as const satisfies Record<
	PublicBenchmarkRuntimeKeyFor<"vals">,
	ReturnType<typeof payloadRowGroup>
>;

const BENCHMARK_SOURCE_PAYLOAD_ROW_GROUPS = {
	...SURGE_BENCHMARK_PAYLOAD_ROW_GROUPS,
	...VALS_BENCHMARK_PAYLOAD_ROW_GROUPS,
	...SPARSE_BENCHMARK_PAYLOAD_ROW_GROUPS,
} as const;

export const PAYLOAD_ROW_GROUPS = [
	payloadRowGroup("modelRows", SNAPSHOT_TABLES.models, "row_index"),
	payloadRowGroup(
		"modelEvaluationRows",
		SNAPSHOT_TABLES.model_evaluations,
		"model_row_index, benchmark_key",
	),
	payloadRowGroup(
		"modelTaskMetricRows",
		SNAPSHOT_TABLES.model_task_metrics,
		"model_row_index, source_key",
	),
	payloadRowGroup(
		"sourceHealthRows",
		SNAPSHOT_TABLES.source_health,
		"row_index",
		{ optional: true },
	),
	payloadRowGroup(
		"artificialAnalysisRows",
		SNAPSHOT_TABLES.artificial_analysis,
		"row_index",
		{
			columns: [
				"model_id",
				"name",
				"short_name",
				"reasoning_effort",
				...ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
			],
		},
	),
	...Object.values(BENCHMARK_SOURCE_PAYLOAD_ROW_GROUPS),
	...BENCHMARK_OBSERVATION_BINDINGS.map((binding) =>
		payloadRowGroup(binding.sourceRowsKey, binding.rawTable, "row_index", {
			columns: BENCHMARK_OBSERVATION_PAYLOAD_COLUMNS,
			optional: true,
			sourceKey: binding.rawSourceKey,
		}),
	),
] as const;

export type PayloadRowGroup = (typeof PAYLOAD_ROW_GROUPS)[number];
type PayloadRowKey = PayloadRowGroup["key"];
type PayloadRows = { fetchedAt: number | null } & Record<
	PayloadRowKey,
	DbRow[]
>;
type PayloadRowReader = (rowGroup: PayloadRowGroup) => Promise<DbRow[]>;

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
		reasoning: booleanValue(row.reasoning),
		reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
		release_date: stringValue(row.release_date),
		modalities: buildModalities(row),
		open_weights: booleanValue(row.open_weights),
		cost: buildCost(row),
		context_window: buildContextWindow(row),
		speed: {
			throughput_tokens_per_second_median:
				asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
			latency_seconds_median:
				asFiniteNumber(row.latency_seconds_median) ?? null,
			e2e_latency_seconds_median:
				asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
		},
		intelligence: numericObject<LlmStatsIntelligence>(
			row,
			ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
		),
		intelligence_index_cost: null,
		task_metrics: taskMetrics,
		evaluations,
		component_scores: {
			intelligence_score:
				asFiniteNumber(row.component_intelligence_score) ?? null,
			agentic_score: asFiniteNumber(row.component_agentic_score) ?? null,
			speed_score: asFiniteNumber(row.component_speed_score) ?? null,
		},
		scores: {
			intelligence_score: asFiniteNumber(row.intelligence_score) ?? null,
			agentic_score: asFiniteNumber(row.agentic_score) ?? null,
			speed_score: asFiniteNumber(row.speed_score) ?? null,
			value_score: asFiniteNumber(row.value_score) ?? null,
		},
	};
}

/** Reads the singleton snapshot publication timestamp. */
export function payloadFetchedAtFromRow(row: unknown): number | null {
	return asFiniteNumber(asRecord(row).updated_at_epoch_seconds);
}

/** Keeps every storage adapter aligned on the row groups required by the public payload. */
export function buildPayloadRows(
	fetchedAt: number | null,
	rowGroups: ReadonlyArray<readonly [PayloadRowKey, DbRow[]]>,
): PayloadRows {
	const rowsByKey = new Map(rowGroups);
	const rows = Object.fromEntries(
		PAYLOAD_ROW_GROUPS.map(({ key }) => [key, rowsByKey.get(key) ?? []]),
	) as Record<PayloadRowKey, DbRow[]>;
	return {
		fetchedAt,
		...rows,
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
	fetchedAt: number | null,
	readRows: PayloadRowReader,
): Promise<PayloadRows> {
	const rowGroups = await Promise.all(
		PAYLOAD_ROW_GROUPS.map(async (rowGroup) => {
			try {
				return [rowGroup.key, await readRows(rowGroup)] as [
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
	return buildPayloadRows(fetchedAt, rowGroups);
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
		rows.fetchedAt,
	);
	const sourceRowsByKey = benchmarkRowsFromDb(rows);
	return {
		fetched_at_epoch_seconds: rows.fetchedAt,
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
