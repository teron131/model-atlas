/** SQLite cache readers for raw Model Atlas source tables. */

import type { DatabaseSync } from "node:sqlite";
import type { AgentsLastExamHarnessRow } from "../scrapers/agents-last-exam";
import type { BlueprintBenchModelScoreRow } from "../scrapers/blueprint-bench";
import type { BrowseCompModelScoreRow } from "../scrapers/browsecomp";
import type { CursorBenchModelScoreRow } from "../scrapers/cursorbench";
import type { DeepSWELeaderboardRow } from "../scrapers/deep-swe";
import type { GdpPdfModelScoreRow } from "../scrapers/gdp-pdf";
import type { ModelRecord, ModelsDevPayload } from "../scrapers/models-dev";
import type {
	OpenRouterEffectivePricingResponse,
	OpenRouterFrontendModel,
	OpenRouterModelStats,
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../scrapers/openrouter";
import type { TerminalBenchAgentModelAccuracyRow } from "../scrapers/terminal-bench";
import type { ToolathlonModelScoreRow } from "../scrapers/toolathlon";
import { asFiniteNumber, asRecord, type JsonObject } from "../shared";
import { isSameOpenRouterModelRoute } from "../stats/model-aliases";
import {
	RAW_SOURCE_CACHE_SECONDS,
	type RawSourceCacheStatus,
	type RawSourceName,
	SOURCE_URLS,
} from "./types";

const RAW_SOURCE_TABLES: Record<RawSourceName, string> = {
	artificial_analysis: "aa_raw_models",
	models_dev: "models_dev_raw_models",
	deep_swe: "deep_swe_raw_rows",
	terminal_bench: "terminal_bench_raw_rows",
	agents_last_exam: "agents_last_exam_raw_rows",
	blueprint_bench_2: "blueprint_bench_2_raw_rows",
	gdp_pdf: "gdp_pdf_raw_rows",
	browsecomp: "browsecomp_raw_rows",
	toolathlon: "toolathlon_raw_rows",
	cursorbench: "cursorbench_raw_rows",
	openrouter: "openrouter_raw_rows",
};

const AA_INTELLIGENCE_KEYS = [
	"intelligence_index",
	"agentic_index",
	"coding_index",
	"omniscience_index",
	"omniscience_accuracy",
	"omniscience_nonhallucination_rate",
] as const;

const AA_EVALUATION_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"ifbench",
	"lcr",
	"mmmu_pro",
	"scicode",
	"terminalbench_hard",
] as const;

const AA_COST_KEYS = [
	"input_cost",
	"reasoning_cost",
	"output_cost",
	"total_cost",
	"input_tokens",
	"reasoning_tokens",
	"answer_tokens",
	"output_tokens",
	"total_tokens",
] as const;

type RawDbRow = JsonObject;

function rows(db: DatabaseSync, sql: string): RawDbRow[] {
	return db
		.prepare(sql)
		.all()
		.map((row) => asRecord(row));
}

function firstEpochSecond(rowsToScan: readonly RawDbRow[]): number | null {
	for (const row of rowsToScan) {
		const fetchedAt = asFiniteNumber(row.fetched_at_epoch_seconds);
		if (fetchedAt != null) {
			return fetchedAt;
		}
	}
	return null;
}

function artificialAnalysisCacheHasHiddenRows(db: DatabaseSync): boolean {
	const row = asRecord(
		db
			.prepare(
				"SELECT COUNT(*) AS row_count FROM aa_raw_models WHERE deprecated = 1",
			)
			.get(),
	);
	return (asFiniteNumber(row.row_count) ?? 0) > 0;
}

function openRouterCacheHasScopedCandidates(db: DatabaseSync): boolean {
	const candidateRows = rows(
		db,
		"SELECT model_id, permaslug FROM openrouter_raw_rows WHERE row_kind = 'permaslug_candidate'",
	);
	for (const row of candidateRows) {
		const modelId = stringValue(row.model_id);
		const permaslug = stringValue(row.permaslug);
		if (
			modelId == null ||
			permaslug == null ||
			!isSameOpenRouterModelRoute(modelId, permaslug)
		) {
			return false;
		}
	}
	return candidateRows.length > 0;
}

function sourceCacheShapeIsCurrent(
	db: DatabaseSync,
	source: RawSourceName,
): boolean {
	if (source === "artificial_analysis") {
		return artificialAnalysisCacheHasHiddenRows(db);
	}
	if (source === "openrouter") {
		return openRouterCacheHasScopedCandidates(db);
	}
	return true;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanFromSql(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

function assignIfString(target: JsonObject, key: string, value: unknown): void {
	const parsed = stringValue(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

function assignIfNumber(target: JsonObject, key: string, value: unknown): void {
	const parsed = asFiniteNumber(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

function assignIfBoolean(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = booleanFromSql(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

function nonEmptyRecord(record: JsonObject): JsonObject | null {
	return Object.keys(record).length > 0 ? record : null;
}

function modalityList(
	row: RawDbRow,
	prefix: string,
	names: string[],
): string[] {
	return names.filter(
		(name) => booleanFromSql(row[`${prefix}_${name}`]) === true,
	);
}

function artificialAnalysisNestedNumbers(
	row: RawDbRow,
	keys: readonly string[],
): JsonObject {
	const record: JsonObject = {};
	for (const key of keys) {
		assignIfNumber(record, key, row[key]);
	}
	return record;
}

function artificialAnalysisRawRow(row: RawDbRow): JsonObject {
	const tokenCounts: JsonObject = {};
	assignIfNumber(tokenCounts, "inputTokens", row.input_tokens);
	assignIfNumber(tokenCounts, "reasoningTokens", row.reasoning_tokens);
	assignIfNumber(tokenCounts, "answerTokens", row.answer_tokens);
	assignIfNumber(tokenCounts, "outputTokens", row.output_tokens);
	const rawRow: JsonObject = {};
	assignIfString(rawRow, "model_id", row.model_id);
	assignIfString(rawRow, "name", row.name);
	assignIfString(rawRow, "shortName", row.short_name);
	assignIfString(rawRow, "model_url", row.model_url);
	assignIfString(rawRow, "releaseDate", row.release_date);
	assignIfString(rawRow, "logo_url", row.logo_url);
	assignIfNumber(
		rawRow,
		"median_output_speed",
		row.median_output_tokens_per_second,
	);
	assignIfNumber(
		rawRow,
		"medianTimeToFirstTokenSeconds",
		row.median_time_to_first_token_seconds,
	);
	assignIfNumber(
		rawRow,
		"medianEndToEndResponseTimeSeconds",
		row.median_end_to_end_response_time_seconds,
	);
	assignIfBoolean(rawRow, "deprecated", row.deprecated);
	assignIfBoolean(rawRow, "reasoningModel", row.reasoning_model);
	assignIfBoolean(rawRow, "isOpenWeights", row.open_weights);
	assignIfBoolean(rawRow, "commercialAllowed", row.commercial_allowed);
	assignIfBoolean(rawRow, "input_modality_text", row.input_modality_text);
	assignIfBoolean(rawRow, "input_modality_image", row.input_modality_image);
	assignIfBoolean(rawRow, "input_modality_video", row.input_modality_video);
	assignIfBoolean(rawRow, "input_modality_speech", row.input_modality_speech);
	assignIfBoolean(rawRow, "output_modality_text", row.output_modality_text);
	assignIfBoolean(rawRow, "output_modality_image", row.output_modality_image);
	assignIfBoolean(rawRow, "output_modality_video", row.output_modality_video);
	assignIfBoolean(rawRow, "output_modality_speech", row.output_modality_speech);
	if (nonEmptyRecord(tokenCounts) != null) {
		rawRow.intelligenceIndexTokenCounts = tokenCounts;
	}
	const creator: JsonObject = {};
	assignIfString(creator, "name", row.creator_name);
	assignIfString(creator, "logo_url", row.logo_url);
	if (nonEmptyRecord(creator) != null) {
		rawRow.creator = creator;
	}
	return rawRow;
}

function artificialAnalysisSelectedRow(row: RawDbRow): JsonObject {
	const selectedRow: JsonObject = {};
	assignIfString(selectedRow, "model_id", row.model_id);
	assignIfString(selectedRow, "name", row.name);
	assignIfString(selectedRow, "model_url", row.model_url);
	assignIfString(selectedRow, "logo", row.logo_url);
	assignIfNumber(
		selectedRow,
		"median_speed",
		row.median_output_tokens_per_second,
	);
	assignIfNumber(
		selectedRow,
		"median_time",
		row.median_time_to_first_token_seconds,
	);
	assignIfNumber(
		selectedRow,
		"median_end_to_end_response_time",
		row.median_end_to_end_response_time_seconds,
	);
	const intelligence = artificialAnalysisNestedNumbers(
		row,
		AA_INTELLIGENCE_KEYS,
	);
	const evaluations = artificialAnalysisNestedNumbers(row, AA_EVALUATION_KEYS);
	const intelligenceIndexCost = artificialAnalysisNestedNumbers(
		row,
		AA_COST_KEYS,
	);
	if (nonEmptyRecord(intelligence) != null) {
		selectedRow.intelligence = intelligence;
	}
	if (nonEmptyRecord(evaluations) != null) {
		selectedRow.evaluations = evaluations;
	}
	if (nonEmptyRecord(intelligenceIndexCost) != null) {
		selectedRow.intelligence_index_cost = intelligenceIndexCost;
	}
	return selectedRow;
}

export function readArtificialAnalysisRawCache(db: DatabaseSync): {
	aaRawRows: JsonObject[];
	aaSelectedRows: JsonObject[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(db, "SELECT * FROM aa_raw_models ORDER BY row_index");
	if (rawRows.length === 0) {
		return null;
	}
	return {
		aaRawRows: rawRows.map((row) => artificialAnalysisRawRow(row)),
		aaSelectedRows: rawRows.map((row) => artificialAnalysisSelectedRow(row)),
		fetchedAt: firstEpochSecond(rawRows),
	};
}

function modelCost(row: RawDbRow): ModelRecord["cost"] | undefined {
	const cost: NonNullable<ModelRecord["cost"]> = {};
	assignIfNumber(cost, "input", row.cost_input);
	assignIfNumber(cost, "output", row.cost_output);
	assignIfNumber(cost, "cache_read", row.cost_cache_read);
	assignIfNumber(cost, "cache_write", row.cost_cache_write);
	assignIfNumber(cost, "output_audio", row.cost_output_audio);
	return Object.keys(cost).length > 0 ? cost : undefined;
}

function modelLimit(row: RawDbRow): ModelRecord["limit"] | undefined {
	const limit: NonNullable<ModelRecord["limit"]> = {};
	assignIfNumber(limit, "context", row.limit_context);
	assignIfNumber(limit, "output", row.limit_output);
	return Object.keys(limit).length > 0 ? limit : undefined;
}

function modelModalities(row: RawDbRow): ModelRecord["modalities"] | undefined {
	const input = modalityList(row, "input_modality", [
		"text",
		"image",
		"audio",
		"video",
		"pdf",
	]);
	const output = modalityList(row, "output_modality", [
		"text",
		"image",
		"audio",
		"video",
	]);
	const modalities: NonNullable<ModelRecord["modalities"]> = {};
	if (input.length > 0) {
		modalities.input = input;
	}
	if (output.length > 0) {
		modalities.output = output;
	}
	return Object.keys(modalities).length > 0 ? modalities : undefined;
}

function modelsDevModelRecord(row: RawDbRow): ModelRecord {
	const model: ModelRecord = {};
	assignIfString(model, "id", row.model_id);
	assignIfString(model, "name", row.name);
	assignIfString(model, "family", row.family);
	assignIfString(model, "release_date", row.release_date);
	assignIfString(model, "last_updated", row.last_updated);
	assignIfBoolean(model, "open_weights", row.open_weights);
	assignIfBoolean(model, "reasoning", row.reasoning);
	assignIfBoolean(model, "tool_call", row.tool_call);
	const cost = modelCost(row);
	const limit = modelLimit(row);
	const modalities = modelModalities(row);
	if (cost != null) {
		model.cost = cost;
	}
	if (limit != null) {
		model.limit = limit;
	}
	if (modalities != null) {
		model.modalities = modalities;
	}
	return model;
}

export function readModelsDevRawCache(db: DatabaseSync): {
	payload: ModelsDevPayload;
	fetchedAt: number | null;
	statusCode: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM models_dev_raw_models ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	const payload: ModelsDevPayload = {};
	for (const row of rawRows) {
		const providerId = stringValue(row.provider_id);
		const modelId = stringValue(row.model_id);
		if (providerId == null || modelId == null) {
			continue;
		}
		const provider = payload[providerId] ?? {
			id: providerId,
			name: stringValue(row.provider_name) ?? providerId,
			api: stringValue(row.provider_api) ?? undefined,
			models: {},
		};
		provider.models ??= {};
		provider.models[modelId] = modelsDevModelRecord(row);
		payload[providerId] = provider;
	}
	return {
		payload,
		fetchedAt: firstEpochSecond(rawRows),
		statusCode: asFiniteNumber(rawRows[0]?.status_code),
	};
}

export function readDeepSWERawCache(db: DatabaseSync): {
	rows: DeepSWELeaderboardRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM deep_swe_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	return {
		rows: rawRows.flatMap((row) => {
			const model = stringValue(row.model);
			const reasoningEffort = stringValue(row.reasoning_effort);
			const config = stringValue(row.config);
			const passAt1 = asFiniteNumber(row.pass_at_1);
			const ciLo = asFiniteNumber(row.ci_lo);
			const ciHi = asFiniteNumber(row.ci_hi);
			const ciHalf = asFiniteNumber(row.ci_half);
			const meanCostUsd = asFiniteNumber(row.mean_cost_usd);
			const meanDurationSeconds = asFiniteNumber(row.mean_duration_seconds);
			const meanOutputTokens = asFiniteNumber(row.mean_output_tokens);
			return model != null &&
				passAt1 != null &&
				meanCostUsd != null &&
				meanDurationSeconds != null &&
				meanOutputTokens != null
				? [
						{
							model,
							reasoning_effort: reasoningEffort,
							config,
							pass_at_1: passAt1,
							ci_lo: ciLo,
							ci_hi: ciHi,
							ci_half: ciHalf,
							mean_cost_usd: meanCostUsd,
							mean_duration_seconds: meanDurationSeconds,
							mean_output_tokens: meanOutputTokens,
						},
					]
				: [];
		}),
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readTerminalBenchRawCache(db: DatabaseSync): {
	rows: TerminalBenchAgentModelAccuracyRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM terminal_bench_raw_rows WHERE row_kind = 'agent_accuracy' ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	return {
		rows: rawRows.flatMap((row) => {
			const agent = stringValue(row.agent);
			const model = stringValue(row.model);
			const accuracy = asFiniteNumber(row.accuracy);
			return agent != null && model != null && accuracy != null
				? [{ agent, model, accuracy }]
				: [];
		}),
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readAgentsLastExamRawCache(db: DatabaseSync): {
	rows: AgentsLastExamHarnessRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM agents_last_exam_raw_rows WHERE row_kind = 'harness_score' ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	return {
		rows: rawRows.flatMap((row) => {
			const split = stringValue(row.split);
			const harness = stringValue(row.harness);
			const model = stringValue(row.model);
			const runs = asFiniteNumber(row.runs);
			const tasks = asFiniteNumber(row.tasks);
			const splitTasks = asFiniteNumber(row.split_tasks);
			const passes = asFiniteNumber(row.passes);
			const accuracy = asFiniteNumber(row.accuracy);
			const score = asFiniteNumber(row.score);
			const totalDurationSeconds = asFiniteNumber(row.total_duration_seconds);
			const totalInputTokens = asFiniteNumber(row.total_input_tokens);
			const totalOutputTokens = asFiniteNumber(row.total_output_tokens);
			return split != null &&
				harness != null &&
				model != null &&
				runs != null &&
				tasks != null &&
				splitTasks != null &&
				passes != null &&
				accuracy != null &&
				score != null &&
				totalDurationSeconds != null &&
				totalInputTokens != null &&
				totalOutputTokens != null
				? [
						{
							split,
							harness,
							model,
							harness_variant: stringValue(row.harness_variant),
							runs,
							tasks,
							split_tasks: splitTasks,
							passes,
							accuracy,
							score,
							total_duration_seconds: totalDurationSeconds,
							total_input_tokens: totalInputTokens,
							total_output_tokens: totalOutputTokens,
						},
					]
				: [];
		}),
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readBrowseCompRawCache(db: DatabaseSync): {
	rows: BrowseCompModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM browsecomp_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	if (rawRows.some((row) => stringValue(row.url) !== SOURCE_URLS.browsecomp)) {
		return null;
	}
	const cachedRows = rawRows.flatMap((row) => {
		const model = stringValue(row.model);
		const provider = stringValue(row.provider);
		const score = asFiniteNumber(row.score);
		return model != null && provider != null && score != null
			? [
					{
						model,
						provider,
						provider_name: stringValue(row.provider_name),
						score,
						source_url: stringValue(row.source_url),
						analysis_method: stringValue(row.analysis_method),
						verified: booleanFromSql(row.verified),
						self_reported: booleanFromSql(row.self_reported),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readBlueprintBenchRawCache(db: DatabaseSync): {
	rows: BlueprintBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM blueprint_bench_2_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	if (
		rawRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.blueprint_bench_2,
		)
	) {
		return null;
	}
	const cachedRows = rawRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						model,
						score,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readGdpPdfRawCache(db: DatabaseSync): {
	rows: GdpPdfModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(db, "SELECT * FROM gdp_pdf_raw_rows ORDER BY row_index");
	if (rawRows.length === 0) {
		return null;
	}
	if (rawRows.some((row) => stringValue(row.url) !== SOURCE_URLS.gdp_pdf)) {
		return null;
	}
	const cachedRows = rawRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						provider: stringValue(row.provider),
						model,
						score,
						last_updated: stringValue(row.last_updated),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readToolathlonRawCache(db: DatabaseSync): {
	rows: ToolathlonModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM toolathlon_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	if (rawRows.some((row) => stringValue(row.url) !== SOURCE_URLS.toolathlon)) {
		return null;
	}
	const cachedRows = rawRows.flatMap((row) => {
		const model = stringValue(row.model);
		const provider = stringValue(row.provider);
		const score = asFiniteNumber(row.score);
		return model != null && provider != null && score != null
			? [
					{
						rank: asFiniteNumber(row.rank),
						model,
						provider,
						provider_name: stringValue(row.provider_name),
						score,
						source_url: stringValue(row.source_url),
						analysis_method: stringValue(row.analysis_method),
						verified: booleanFromSql(row.verified),
						self_reported: booleanFromSql(row.self_reported),
						announcement_date: stringValue(row.announcement_date),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(rawRows),
	};
}

export function readCursorBenchRawCache(db: DatabaseSync): {
	rows: CursorBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const rawRows = rows(
		db,
		"SELECT * FROM cursorbench_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	if (rawRows.some((row) => stringValue(row.url) !== SOURCE_URLS.cursorbench)) {
		return null;
	}
	const cachedRows = rawRows.flatMap((row) => {
		const rank = asFiniteNumber(row.rank);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const score = asFiniteNumber(row.score);
		const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
		const tokensPerTask = asFiniteNumber(row.tokens_per_task);
		const stepsPerTask = asFiniteNumber(row.steps_per_task);
		return rank != null &&
			model != null &&
			baseModel != null &&
			score != null &&
			costPerTaskUsd != null &&
			tokensPerTask != null &&
			stepsPerTask != null
			? [
					{
						rank,
						model,
						base_model: baseModel,
						reasoning_effort: stringValue(row.reasoning_effort),
						score,
						cost_per_task_usd: costPerTaskUsd,
						tokens_per_task: tokensPerTask,
						steps_per_task: stepsPerTask,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(rawRows),
	};
}

function openRouterStatsResponse(
	rowsToConvert: RawDbRow[],
): OpenRouterStatsResponse {
	const pointsByX = new Map<
		string,
		{ x: string | null; y: Record<string, number | null> }
	>();
	for (const [index, row] of rowsToConvert.entries()) {
		const series = stringValue(row.series);
		if (series == null) {
			continue;
		}
		const x = stringValue(row.x);
		const key = x ?? `__null_${index}`;
		const point = pointsByX.get(key) ?? { x, y: {} };
		point.y[series] = asFiniteNumber(row.value);
		pointsByX.set(key, point);
	}
	return {
		data: [...pointsByX.values()].map((point) => ({
			...(point.x != null ? { x: point.x } : {}),
			y: point.y,
		})),
	};
}

function openRouterPricing(
	row: RawDbRow | undefined,
): OpenRouterEffectivePricingResponse | null {
	if (row == null) {
		return null;
	}
	return {
		data: {
			weightedInputPrice: asFiniteNumber(row.weighted_input_price_per_1m),
			weightedOutputPrice: asFiniteNumber(row.weighted_output_price_per_1m),
		},
	};
}

function openRouterModelRows(
	modelId: string,
	rowsByKind: Map<string, RawDbRow[]>,
): OpenRouterRawScrapedModel {
	const candidateRows = (rowsByKind.get("permaslug_candidate") ?? []).filter(
		(row) => row.model_id === modelId,
	);
	const statRows = (rowsByKind.get("stat_point") ?? []).filter(
		(row) => row.model_id === modelId,
	);
	const statsRow = (rowsByKind.get("model_stats") ?? []).find(
		(row) => row.model_id === modelId,
	);
	const selectedPermaslug =
		stringValue(statsRow?.selected_permaslug) ??
		stringValue(statRows[0]?.selected_permaslug) ??
		stringValue(candidateRows[0]?.selected_permaslug);
	const performance: OpenRouterModelStats = {
		summary: {
			throughput_tokens_per_second_median:
				asFiniteNumber(statsRow?.throughput_tokens_per_second_median) ?? null,
			latency_seconds_median:
				asFiniteNumber(statsRow?.latency_seconds_median) ?? null,
			e2e_latency_seconds_median: null,
		},
		throughput: openRouterStatsResponse(
			statRows.filter((row) => row.metric === "throughput"),
		),
		latency: openRouterStatsResponse(
			statRows.filter((row) => row.metric === "latency"),
		),
		latency_e2e: openRouterStatsResponse(
			statRows.filter((row) => row.metric === "latency_e2e"),
		),
	};
	return {
		id: modelId,
		selected_permaslug: selectedPermaslug,
		candidate_permaslugs: candidateRows
			.sort(
				(left, right) =>
					(asFiniteNumber(left.candidate_index) ?? 0) -
					(asFiniteNumber(right.candidate_index) ?? 0),
			)
			.map((row) => stringValue(row.permaslug))
			.filter((permaslug): permaslug is string => permaslug != null),
		performance,
		pricing: openRouterPricing(statsRow),
	};
}

export function readOpenRouterRawCache(
	db: DatabaseSync,
): OpenRouterRawScrapedPayload | null {
	const rawRows = rows(
		db,
		"SELECT * FROM openrouter_raw_rows ORDER BY row_index",
	);
	if (rawRows.length === 0) {
		return null;
	}
	const fetchedAt = firstEpochSecond(rawRows);
	if (fetchedAt == null) {
		return null;
	}
	const rowsByKind = new Map<string, RawDbRow[]>();
	for (const row of rawRows) {
		const rowKind = stringValue(row.row_kind);
		if (rowKind == null) {
			continue;
		}
		const groupedRows = rowsByKind.get(rowKind) ?? [];
		groupedRows.push(row);
		rowsByKind.set(rowKind, groupedRows);
	}
	const directory: OpenRouterFrontendModel[] = (
		rowsByKind.get("directory_model") ?? []
	).map((row) => ({
		slug: stringValue(row.slug),
		permaslug: stringValue(row.permaslug),
	}));
	const modelIds = new Set<string>();
	for (const rowKind of ["permaslug_candidate", "stat_point", "model_stats"]) {
		for (const row of rowsByKind.get(rowKind) ?? []) {
			const modelId = stringValue(row.model_id);
			if (modelId != null) {
				modelIds.add(modelId);
			}
		}
	}
	return {
		fetched_at_epoch_seconds: fetchedAt,
		directory,
		models: [...modelIds].map((modelId) =>
			openRouterModelRows(modelId, rowsByKind),
		),
	};
}

export function readRawSourceCacheStatus(
	db: DatabaseSync,
	source: RawSourceName,
	nowEpochSeconds: number,
): RawSourceCacheStatus {
	const table = RAW_SOURCE_TABLES[source];
	const row = asRecord(
		db
			.prepare(
				`SELECT COUNT(*) AS row_count, MAX(fetched_at_epoch_seconds) AS last_fetch_epoch_seconds FROM ${table}`,
			)
			.get(),
	);
	const rowCount = asFiniteNumber(row.row_count) ?? 0;
	const lastFetch = asFiniteNumber(row.last_fetch_epoch_seconds);
	const cacheHit =
		rowCount > 0 &&
		lastFetch != null &&
		nowEpochSeconds - lastFetch >= 0 &&
		nowEpochSeconds - lastFetch <= RAW_SOURCE_CACHE_SECONDS &&
		sourceCacheShapeIsCurrent(db, source);
	return {
		last_fetch_epoch_seconds: lastFetch,
		source_input_count: rowCount,
		cache_hit: cacheHit,
		refreshed: false,
	};
}

export function refreshedCacheStatus(
	lastFetchEpochSeconds: number | null,
	sourceInputCount: number,
): RawSourceCacheStatus {
	return {
		last_fetch_epoch_seconds: lastFetchEpochSeconds,
		source_input_count: sourceInputCount,
		cache_hit: false,
		refreshed: true,
	};
}
