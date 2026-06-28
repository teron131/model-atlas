/** SQLite writer for OpenRouter directory, route, stat-point, and pricing source rows. */

import type { DatabaseSync, StatementSync } from "node:sqlite";
import type {
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../../scrapers/openrouter";
import { processOpenRouterModelStats } from "../../scrapers/openrouter";
import { asFiniteNumber, asRecord } from "../../shared";
import { SOURCE_URLS } from "../types";

type OpenRouterPointRow = {
	x: string | null;
	series: string;
	value: number | null;
};

function openRouterStatPointRows(
	response: OpenRouterStatsResponse | null | undefined,
): OpenRouterPointRow[] {
	const rows: OpenRouterPointRow[] = [];
	for (const point of response?.data ?? []) {
		for (const [series, value] of Object.entries(asRecord(point.y))) {
			rows.push({
				x: typeof point.x === "string" ? point.x : null,
				series,
				value: asFiniteNumber(value),
			});
		}
	}
	return rows;
}

function insertOpenRouterDirectoryRows(
	statement: StatementSync,
	runId: number,
	rawPayload: OpenRouterRawScrapedPayload,
	rowIndex: number,
): number {
	for (const model of rawPayload.directory) {
		statement.run(
			runId,
			rowIndex,
			rawPayload.fetched_at_epoch_seconds,
			SOURCE_URLS.openrouter_models,
			"directory_model",
			null,
			model.slug ?? null,
			model.permaslug ?? null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
		);
		rowIndex += 1;
	}
	return rowIndex;
}

function insertOpenRouterPermaslugCandidateRows(
	statement: StatementSync,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const [
		candidateIndex,
		permaslug,
	] of model.candidate_permaslugs.entries()) {
		statement.run(
			runId,
			rowIndex,
			fetchedAtEpochSeconds,
			SOURCE_URLS.openrouter_stats,
			"permaslug_candidate",
			model.id,
			null,
			permaslug,
			candidateIndex,
			model.selected_permaslug,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
		);
		rowIndex += 1;
	}
	return rowIndex;
}

function insertOpenRouterStatPointRows(
	statement: StatementSync,
	runId: number,
	model: OpenRouterRawScrapedModel,
	fetchedAtEpochSeconds: number,
	rowIndex: number,
): number {
	for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
		for (const point of openRouterStatPointRows(model.performance[metric])) {
			statement.run(
				runId,
				rowIndex,
				fetchedAtEpochSeconds,
				SOURCE_URLS.openrouter_stats,
				"stat_point",
				model.id,
				null,
				model.selected_permaslug,
				null,
				model.selected_permaslug,
				metric,
				point.x,
				point.series,
				point.value,
				null,
				null,
				null,
				null,
				null,
			);
			rowIndex += 1;
		}
	}
	return rowIndex;
}

function insertOpenRouterModelStatsRow(
	statement: StatementSync,
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
	statement.run(
		runId,
		rowIndex,
		fetchedAtEpochSeconds,
		SOURCE_URLS.openrouter_stats,
		"model_stats",
		model.id,
		null,
		model.selected_permaslug,
		null,
		model.selected_permaslug,
		null,
		null,
		null,
		null,
		normalizedModelStats.performance.throughput_tokens_per_second_median,
		normalizedModelStats.performance.latency_seconds_median,
		normalizedModelStats.performance.e2e_latency_seconds_median,
		normalizedModelStats.pricing.weighted_input_price_per_1m,
		normalizedModelStats.pricing.weighted_output_price_per_1m,
	);
	return rowIndex + 1;
}

/** Insert OpenRouter raw directory rows, candidate rows, stat points, and model summaries in one source table. */
export function insertOpenRouterRawRows(
	db: DatabaseSync,
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
			value, throughput_tokens_per_second_median, latency_seconds_median,
			e2e_latency_seconds_median, weighted_input_price_per_1m,
			weighted_output_price_per_1m
		) VALUES (${Array.from({ length: 19 }, () => "?").join(", ")})
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
		rowIndex = insertOpenRouterModelStatsRow(
			statement,
			runId,
			model,
			rawPayload.fetched_at_epoch_seconds,
			rowIndex,
		);
	}
}
