/** SQLite writer for OpenRouter directory, route, stat-point, and pricing source rows. */

import type {
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../../scrapers/openrouter";
import {
	processOpenRouterModelStats,
	summarizeOpenRouterPerformanceEstimates,
} from "../../scrapers/openrouter";
import { asFiniteNumber, asRecord } from "../../shared";
import { SOURCE_URLS } from "../types";
import type { DatabaseStatement, DatabaseWriter } from "./shared";

type OpenRouterPointRow = {
	x: string | null;
	series: string;
	value: number | null;
	tokenWeight: number | null;
};

type OpenRouterRawRowKind =
	| "directory_model"
	| "permaslug_candidate"
	| "stat_point"
	| "performance_estimate"
	| "model_stats";

type OpenRouterRawRow = {
	runId: number;
	rowIndex: number;
	fetchedAtEpochSeconds: number | null;
	url: string;
	rowKind: OpenRouterRawRowKind;
	modelId?: string | null;
	slug?: string | null;
	permaslug?: string | null;
	candidateIndex?: number | null;
	selectedPermaslug?: string | null;
	metric?: string | null;
	x?: string | null;
	series?: string | null;
	value?: number | null;
	seriesTokenWeight?: number | null;
	throughput?: number | null;
	latency?: number | null;
	e2eLatency?: number | null;
	weightedInput?: number | null;
	weightedOutput?: number | null;
};

function insertOpenRouterRawRow(
	statement: DatabaseStatement,
	row: OpenRouterRawRow,
): void {
	statement.run(
		row.runId,
		row.rowIndex,
		row.fetchedAtEpochSeconds,
		row.url,
		row.rowKind,
		row.modelId ?? null,
		row.slug ?? null,
		row.permaslug ?? null,
		row.candidateIndex ?? null,
		row.selectedPermaslug ?? null,
		row.metric ?? null,
		row.x ?? null,
		row.series ?? null,
		row.value ?? null,
		row.seriesTokenWeight ?? null,
		row.throughput ?? null,
		row.latency ?? null,
		row.e2eLatency ?? null,
		row.weightedInput ?? null,
		row.weightedOutput ?? null,
	);
}

function openRouterStatPointRows(
	response: OpenRouterStatsResponse | null | undefined,
	seriesTokenWeights: Record<string, number | null> | null | undefined,
): OpenRouterPointRow[] {
	const rows: OpenRouterPointRow[] = [];
	for (const point of response?.data ?? []) {
		for (const [series, value] of Object.entries(asRecord(point.y))) {
			rows.push({
				x: typeof point.x === "string" ? point.x : null,
				series,
				value: asFiniteNumber(value),
				tokenWeight: asFiniteNumber(seriesTokenWeights?.[series]),
			});
		}
	}
	return rows;
}

function insertOpenRouterDirectoryRows(
	statement: DatabaseStatement,
	runId: number,
	rawPayload: OpenRouterRawScrapedPayload,
	rowIndex: number,
): number {
	for (const model of rawPayload.directory) {
		insertOpenRouterRawRow(statement, {
			runId,
			rowIndex,
			fetchedAtEpochSeconds: rawPayload.fetched_at_epoch_seconds,
			url: SOURCE_URLS.openrouter_models,
			rowKind: "directory_model",
			slug: model.slug ?? null,
			permaslug: model.permaslug ?? null,
		});
		rowIndex += 1;
	}
	return rowIndex;
}

function insertOpenRouterPermaslugCandidateRows(
	statement: DatabaseStatement,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const [
		candidateIndex,
		permaslug,
	] of model.candidate_permaslugs.entries()) {
		insertOpenRouterRawRow(statement, {
			runId,
			rowIndex,
			fetchedAtEpochSeconds,
			url: SOURCE_URLS.openrouter_stats,
			rowKind: "permaslug_candidate",
			modelId: model.id,
			permaslug,
			candidateIndex,
			selectedPermaslug: model.selected_permaslug,
		});
		rowIndex += 1;
	}
	return rowIndex;
}

function insertOpenRouterStatPointRows(
	statement: DatabaseStatement,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
		for (const point of openRouterStatPointRows(
			model.performance[metric],
			model.performance.series_token_weights,
		)) {
			insertOpenRouterRawRow(statement, {
				runId,
				rowIndex,
				fetchedAtEpochSeconds,
				url: SOURCE_URLS.openrouter_stats,
				rowKind: "stat_point",
				modelId: model.id,
				permaslug: model.selected_permaslug,
				selectedPermaslug: model.selected_permaslug,
				metric,
				x: point.x,
				series: point.series,
				value: point.value,
				seriesTokenWeight: point.tokenWeight,
			});
			rowIndex += 1;
		}
	}
	return rowIndex;
}

function insertOpenRouterPerformanceEstimateRows(
	statement: DatabaseStatement,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const estimate of summarizeOpenRouterPerformanceEstimates(
		model.performance,
	)) {
		if (estimate.value == null) {
			continue;
		}
		insertOpenRouterRawRow(statement, {
			runId,
			rowIndex,
			fetchedAtEpochSeconds,
			url: SOURCE_URLS.openrouter_stats,
			rowKind: "performance_estimate",
			modelId: model.id,
			permaslug: model.selected_permaslug,
			selectedPermaslug: model.selected_permaslug,
			metric: estimate.metric,
			series: estimate.estimate_kind,
			value: estimate.value,
		});
		rowIndex += 1;
	}
	return rowIndex;
}

function insertOpenRouterModelStatsRow(
	statement: DatabaseStatement,
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
	insertOpenRouterRawRow(statement, {
		runId,
		rowIndex,
		fetchedAtEpochSeconds,
		url: SOURCE_URLS.openrouter_stats,
		rowKind: "model_stats",
		modelId: model.id,
		permaslug: model.selected_permaslug,
		selectedPermaslug: model.selected_permaslug,
		throughput:
			normalizedModelStats.performance.throughput_tokens_per_second_median,
		latency: normalizedModelStats.performance.latency_seconds_median,
		e2eLatency: normalizedModelStats.performance.e2e_latency_seconds_median,
		weightedInput: normalizedModelStats.pricing.weighted_input_price_per_1m,
		weightedOutput: normalizedModelStats.pricing.weighted_output_price_per_1m,
	});
	return rowIndex + 1;
}

/** Insert OpenRouter raw directory rows, candidate rows, stat points, and model summaries in one source table. */
export function insertOpenRouterRawRows(
	db: DatabaseWriter,
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
			value, series_token_weight,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, weighted_input_price_per_1m,
			weighted_output_price_per_1m
		) VALUES (${Array.from({ length: 20 }, () => "?").join(", ")})
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
		rowIndex = insertOpenRouterPerformanceEstimateRows(
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
