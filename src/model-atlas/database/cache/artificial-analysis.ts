/** Artificial Analysis cache reconstruction from persisted raw source rows. */

import type { DatabaseSync } from "node:sqlite";

import type { ArtificialAnalysisEvaluationResourceRow } from "../../scrapers/artificial-analysis/benchmark-resources";
import { asFiniteNumber, type JsonObject } from "../../shared";
import {
	ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
	ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS,
} from "../../stats/benchmarks";
import {
	assignIfBoolean,
	assignIfNumber,
	assignIfString,
	type CacheDbRow,
	firstEpochSecond,
	latestTableRunId,
	nonEmptyRecord,
	queryCacheRows,
	queryLatestCacheRows,
	stringValue,
} from "./rows";

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
