/** Raw source cache readers reconstruct scraper-owned payload shapes from persisted SQLite source tables. */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { AgentsLastExamHarnessRow } from "../../scrapers/agents-last-exam";
import type { ArtificialAnalysisEvaluationResourceRow } from "../../scrapers/artificial-analysis/evaluation-resources";
import type { BlueprintBenchModelScoreRow } from "../../scrapers/blueprint-bench";
import type { BrowseCompModelScoreRow } from "../../scrapers/browsecomp";
import type { CursorBenchModelScoreRow } from "../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	type DeepSWERawLeaderboardRow,
	type DeepSWESourceVersion,
	deepSWESourceVersionForRows,
} from "../../scrapers/deep-swe";
import type { GdpPdfModelScoreRow } from "../../scrapers/gdp-pdf";
import type { ModelRecord, ModelsDevPayload } from "../../scrapers/models-dev";
import type { RiemannBenchModelScoreRow } from "../../scrapers/riemann-bench";
import type { ToolathlonModelScoreRow } from "../../scrapers/toolathlon";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../../scrapers/vals/terminal-bench";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
	ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
} from "../../stats/benchmarks";
import { quoteIdentifier } from "../schema";
import { SOURCE_URLS } from "../types";

export type CacheDbRow = JsonObject;

/** Cache readers normalize SQLite's loose row objects before source-specific reconstruction begins. */
export function queryCacheRows(
	db: DatabaseSync,
	sql: string,
	params: readonly SQLInputValue[] = [],
): CacheDbRow[] {
	return db
		.prepare(sql)
		.all(...params)
		.map((row) => asRecord(row));
}

export function latestTableRunId(
	db: DatabaseSync,
	table: string,
): number | null {
	const row = asRecord(
		db
			.prepare(`SELECT MAX(run_id) AS run_id FROM ${quoteIdentifier(table)}`)
			.get(),
	);
	return asFiniteNumber(row.run_id);
}

export function queryLatestCacheRows(
	db: DatabaseSync,
	table: string,
	sql: string,
): CacheDbRow[] {
	const runId = latestTableRunId(db, table);
	return runId == null ? [] : queryCacheRows(db, sql, [runId]);
}

/** Source cache freshness follows the persisted fetch timestamp carried by the source row set. */
export function firstEpochSecond(
	rowsToScan: readonly CacheDbRow[],
): number | null {
	for (const row of rowsToScan) {
		const fetchedAt = asFiniteNumber(row.fetched_at_epoch_seconds);
		if (fetchedAt != null) {
			return fetchedAt;
		}
	}
	return null;
}

export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function booleanFromSql(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

export function assignIfString(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = stringValue(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function assignIfNumber(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = asFiniteNumber(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function assignIfBoolean(
	target: JsonObject,
	key: string,
	value: unknown,
): void {
	const parsed = booleanFromSql(value);
	if (parsed != null) {
		target[key] = parsed;
	}
}

export function nonEmptyRecord(record: JsonObject): JsonObject | null {
	return Object.keys(record).length > 0 ? record : null;
}

export function modalityList(
	row: CacheDbRow,
	prefix: string,
	names: string[],
): string[] {
	return names.filter(
		(name) => booleanFromSql(row[`${prefix}_${name}`]) === true,
	);
}

const ARTIFICIAL_ANALYSIS_COST_KEYS = [
	"input_cost",
	"reasoning_cost",
	"output_cost",
	"total_cost",
	"input_tokens",
	"reasoning_tokens",
	"answer_tokens",
	"output_tokens",
	"total_tokens",
	"cost_per_task",
	"seconds_per_task",
	"output_tokens_per_task",
] as const;

/** Hidden retained Artificial Analysis rows prove the cache is new enough to preserve deprecated benchmark carriers. */
export function artificialAnalysisCacheHasHiddenRows(
	db: DatabaseSync,
): boolean {
	const cacheRows = queryCacheRows(
		db,
		`
			SELECT row_index
			FROM artificial_analysis_raw_models
			WHERE run_id = ?
				AND deprecated = 1
				AND (tau_banking IS NOT NULL OR terminalbench_v21 IS NOT NULL)
			LIMIT 1
		`,
		[latestTableRunId(db, "artificial_analysis_raw_models") ?? -1],
	);
	return cacheRows.length > 0;
}

function artificialAnalysisNestedNumbers(
	row: CacheDbRow,
	keys: readonly string[],
): JsonObject {
	const record: JsonObject = {};
	for (const key of keys) {
		assignIfNumber(record, key, row[key]);
	}
	return record;
}

function artificialAnalysisRawRow(row: CacheDbRow): JsonObject {
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
	assignIfString(rawRow, "reasoning_effort", row.reasoning_effort);
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
	for (const key of ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS) {
		assignIfNumber(rawRow, key, row[key]);
	}
	for (const key of ARTIFICIAL_ANALYSIS_EVALUATION_KEYS) {
		assignIfNumber(rawRow, key, row[key]);
	}
	for (const key of ARTIFICIAL_ANALYSIS_COST_KEYS) {
		assignIfNumber(rawRow, key, row[key]);
	}
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

function artificialAnalysisSelectedRow(row: CacheDbRow): JsonObject {
	const selectedRow: JsonObject = {};
	assignIfString(selectedRow, "model_id", row.model_id);
	assignIfString(selectedRow, "name", row.name);
	assignIfString(selectedRow, "model_url", row.model_url);
	assignIfString(selectedRow, "logo", row.logo_url);
	assignIfString(selectedRow, "reasoning_effort", row.reasoning_effort);
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
		ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
	);
	const evaluations = artificialAnalysisNestedNumbers(
		row,
		ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
	);
	const intelligenceIndexCost = artificialAnalysisNestedNumbers(
		row,
		ARTIFICIAL_ANALYSIS_COST_KEYS,
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
	artificialAnalysisRawRows: JsonObject[];
	artificialAnalysisSelectedRows: JsonObject[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"artificial_analysis_raw_models",
		"SELECT * FROM artificial_analysis_raw_models WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	return {
		artificialAnalysisRawRows: cacheRows.map((row) =>
			artificialAnalysisRawRow(row),
		),
		artificialAnalysisSelectedRows: cacheRows.map((row) =>
			artificialAnalysisSelectedRow(row),
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readArtificialAnalysisEvaluationResourceRawCache(
	db: DatabaseSync,
): {
	rows: ArtificialAnalysisEvaluationResourceRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"artificial_analysis_evaluations_raw_rows",
		"SELECT * FROM artificial_analysis_evaluations_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	return {
		rows: cacheRows.flatMap((row) => {
			const benchmarkKey = stringValue(row.benchmark_key);
			const sourceUrl = stringValue(row.url);
			const modelId = stringValue(row.model_id);
			const model = stringValue(row.model);
			const provider = stringValue(row.provider);
			const score = asFiniteNumber(row.score);
			const taskCount = asFiniteNumber(row.task_run_count);
			const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
			const secondsPerTask = asFiniteNumber(row.seconds_per_task);
			const tokensPerTask = asFiniteNumber(row.tokens_per_task);
			const inputTokensPerTask = asFiniteNumber(row.input_tokens_per_task);
			const outputTokensPerTask = asFiniteNumber(row.output_tokens_per_task);
			if (
				benchmarkKey == null ||
				sourceUrl == null ||
				modelId == null ||
				model == null ||
				provider == null ||
				score == null ||
				taskCount == null ||
				costPerTaskUsd == null ||
				secondsPerTask == null ||
				tokensPerTask == null ||
				inputTokensPerTask == null ||
				outputTokensPerTask == null
			) {
				return [];
			}
			return [
				{
					benchmark_key: benchmarkKey,
					source_url: sourceUrl,
					model_id: modelId,
					model,
					provider,
					provider_id: stringValue(row.provider_id),
					reasoning_effort: stringValue(row.reasoning_effort),
					score,
					task_run_count: taskCount,
					cost_per_task_usd: costPerTaskUsd,
					seconds_per_task: secondsPerTask,
					tokens_per_task: tokensPerTask,
					input_tokens_per_task: inputTokensPerTask,
					output_tokens_per_task: outputTokensPerTask,
					answer_tokens_per_task: asFiniteNumber(row.answer_tokens_per_task),
					reasoning_tokens_per_task: asFiniteNumber(
						row.reasoning_tokens_per_task,
					),
				},
			];
		}),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

function modelCost(row: CacheDbRow): ModelRecord["cost"] | undefined {
	const cost: NonNullable<ModelRecord["cost"]> = {};
	assignIfNumber(cost, "input", row.cost_input);
	assignIfNumber(cost, "output", row.cost_output);
	assignIfNumber(cost, "cache_read", row.cost_cache_read);
	assignIfNumber(cost, "cache_write", row.cost_cache_write);
	assignIfNumber(cost, "output_audio", row.cost_output_audio);
	return Object.keys(cost).length > 0 ? cost : undefined;
}

function modelLimit(row: CacheDbRow): ModelRecord["limit"] | undefined {
	const limit: NonNullable<ModelRecord["limit"]> = {};
	assignIfNumber(limit, "context", row.limit_context);
	assignIfNumber(limit, "output", row.limit_output);
	return Object.keys(limit).length > 0 ? limit : undefined;
}

function modelModalities(
	row: CacheDbRow,
): ModelRecord["modalities"] | undefined {
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

function modelsDevModelRecord(row: CacheDbRow): ModelRecord {
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
	const cacheRows = queryLatestCacheRows(
		db,
		"models_dev_raw_models",
		"SELECT * FROM models_dev_raw_models WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const payload: ModelsDevPayload = {};
	for (const row of cacheRows) {
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
		fetchedAt: firstEpochSecond(cacheRows),
		statusCode: asFiniteNumber(cacheRows[0]?.status_code),
	};
}

export function readAgentsLastExamRawCache(db: DatabaseSync): {
	rows: AgentsLastExamHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"agents_last_exam_raw_rows",
		"SELECT * FROM agents_last_exam_raw_rows WHERE run_id = ? AND row_kind = 'harness_score' ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	return {
		rows: cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readBlueprintBenchRawCache(db: DatabaseSync): {
	rows: BlueprintBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"blueprint_bench_2_raw_rows",
		"SELECT * FROM blueprint_bench_2_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.blueprint_bench_2,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readBrowseCompRawCache(db: DatabaseSync): {
	rows: BrowseCompModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"browsecomp_raw_rows",
		"SELECT * FROM browsecomp_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.browsecomp)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readCursorBenchRawCache(db: DatabaseSync): {
	rows: CursorBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"cursorbench_raw_rows",
		"SELECT * FROM cursorbench_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.cursorbench)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readDeepSWERawCache(db: DatabaseSync): {
	rows: DeepSWERawLeaderboardRow[];
	fetchedAt: number | null;
	sourceVersion: DeepSWESourceVersion | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"deep_swe_raw_rows",
		"SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const deepSweRows = cacheRows.flatMap((row) => {
		const parsedRow = asDeepSWERawLeaderboardRow(row);
		return parsedRow == null ? [] : [parsedRow];
	});
	return {
		rows: deepSweRows,
		fetchedAt: firstEpochSecond(cacheRows),
		sourceVersion: deepSWESourceVersionForRows(deepSweRows),
	};
}

export function readGdpPdfRawCache(db: DatabaseSync): {
	rows: GdpPdfModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"gdp_pdf_raw_rows",
		"SELECT * FROM gdp_pdf_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.gdp_pdf)) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readRiemannBenchRawCache(db: DatabaseSync): {
	rows: RiemannBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"riemann_bench_raw_rows",
		"SELECT * FROM riemann_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.riemann_bench)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readToolathlonRawCache(db: DatabaseSync): {
	rows: ToolathlonModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"toolathlon_raw_rows",
		"SELECT * FROM toolathlon_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.toolathlon)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
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
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readValsIndexRawCache(db: DatabaseSync): {
	rows: ValsIndexTaskScoreRow[];
	modelScores: ValsIndexModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"vals_index_raw_rows",
		"SELECT * FROM vals_index_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.vals_index)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return task != null &&
			taskLabel != null &&
			modelId != null &&
			model != null &&
			score != null
			? [
					{
						task,
						task_label: taskLabel,
						model_id: modelId,
						model,
						provider: stringValue(row.provider),
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
		modelScores: cachedRows.filter(
			(row): row is ValsIndexModelScoreRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readValsTerminalBenchRawCache(db: DatabaseSync): {
	rows: TerminalBenchTaskRow[];
	modelScores: TerminalBenchModelHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = queryLatestCacheRows(
		db,
		"vals_terminal_bench_raw_rows",
		"SELECT * FROM vals_terminal_bench_raw_rows WHERE run_id = ? ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vals_terminal_bench,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		if (
			task == null ||
			taskLabel == null ||
			modelId == null ||
			model == null ||
			score == null
		) {
			return [];
		}
		return [
			{
				task,
				task_label: taskLabel,
				source_model_id: stringValue(row.source_model_id) ?? modelId,
				model_id: modelId,
				model,
				provider: stringValue(row.provider),
				harness: stringValue(row.harness),
				score,
				cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
				seconds_per_task: asFiniteNumber(row.seconds_per_task),
			},
		];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}
