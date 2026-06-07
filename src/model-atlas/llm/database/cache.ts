/** SQLite cache readers for raw Model Atlas source tables. */

import type { DatabaseSync } from "node:sqlite";

import { isSameOpenRouterModelRoute } from "../llm-stats/model-aliases";
import { asFiniteNumber, asRecord, type JsonObject } from "../shared";
import type { DeepSWELeaderboardRow } from "../sources/deep-swe-scraper";
import type { ModelRecord, ModelsDevPayload } from "../sources/models-dev";
import type {
	OpenRouterEffectivePricingResponse,
	OpenRouterFrontendModel,
	OpenRouterModelStats,
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../sources/openrouter-scraper";
import type { TerminalBenchAgentModelAccuracyRow } from "../sources/terminal-bench-scraper";
import {
	RAW_SOURCE_CACHE_SECONDS,
	type RawSourceCacheStatus,
	type RawSourceName,
} from "./types";

const RAW_SOURCE_TABLES: Record<RawSourceName, string> = {
	artificial_analysis: "aa_raw_models",
	models_dev: "models_dev_raw_models",
	deep_swe: "deep_swe_raw_rows",
	terminal_bench: "terminal_bench_raw_rows",
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
