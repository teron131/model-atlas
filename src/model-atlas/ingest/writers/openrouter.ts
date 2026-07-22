/** SQLite writer for OpenRouter directory, route, stat-point, and pricing source rows. */

import { asFiniteNumber, asRecord } from "../../runtime";
import type {
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../../scrapers/openrouter";
import {
	processOpenRouterModelStats,
	summarizeOpenRouterPerformanceEstimates,
} from "../../scrapers/openrouter";
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

function insertRawRow(
	statement: DatabaseStatement,
	row: OpenRouterRawRow,
): void {
	statement.run(
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

function statPointRows(
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

function insertDirectoryRows(
	statement: DatabaseStatement,
	rawPayload: OpenRouterRawScrapedPayload,
	rowIndex: number,
): number {
	for (const model of rawPayload.directory) {
		insertRawRow(statement, {
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

function insertPermaslugCandidateRows(
	statement: DatabaseStatement,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const [
		candidateIndex,
		permaslug,
	] of model.candidate_permaslugs.entries()) {
		insertRawRow(statement, {
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

function insertStatPointRows(
	statement: DatabaseStatement,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
		for (const point of statPointRows(
			model.performance[metric],
			model.performance.series_token_weights,
		)) {
			insertRawRow(statement, {
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

function insertPerformanceEstimateRows(
	statement: DatabaseStatement,
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
		insertRawRow(statement, {
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

function insertModelStatsRow(
	statement: DatabaseStatement,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	const normalizedModelStats = processOpenRouterModelStats(
		model.id,
		model.performance,
		model.pricing,
	);
	insertRawRow(statement, {
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
	rawPayload: OpenRouterRawScrapedPayload | null | undefined,
): void {
	if (rawPayload == null) {
		return;
	}
	const statement = db.prepare(`
		INSERT INTO openrouter_raw_rows (
			row_index, fetched_at_epoch_seconds, url, row_kind, model_id,
			slug, permaslug, candidate_index, selected_permaslug, metric, x, series,
			value, series_token_weight,
			throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, weighted_input_price_per_1m,
			weighted_output_price_per_1m
		) VALUES (${Array.from({ length: 19 }, () => "?").join(", ")})
	`);
	let rowIndex = insertDirectoryRows(statement, rawPayload, 0);
	for (const model of rawPayload.models) {
		rowIndex = insertPermaslugCandidateRows(
			statement,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
		rowIndex = insertStatPointRows(
			statement,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
		rowIndex = insertPerformanceEstimateRows(
			statement,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
		rowIndex = insertModelStatsRow(
			statement,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
	}
}
