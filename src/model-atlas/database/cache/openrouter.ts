/** OpenRouter raw-cache reconstruction and scoped route coverage checks. */

import type { DatabaseSync } from "node:sqlite";

import { isSameOpenRouterModelRoute } from "../../openrouter-routes";
import {
	type OpenRouterEffectivePricingResponse,
	type OpenRouterFrontendModel,
	type OpenRouterModelStats,
	type OpenRouterRawScrapedModel,
	type OpenRouterRawScrapedPayload,
	type OpenRouterStatsResponse,
	sanitizeModelId,
} from "../../scrapers/openrouter";
import { asFiniteNumber } from "../../shared";
import {
	type CacheDbRow,
	firstEpochSecond,
	queryLatestCacheRows,
	stringValue,
} from "./rows";

type CacheSource = DatabaseSync | CacheDbRow[];

function openRouterCacheRows(cache: CacheSource): CacheDbRow[] {
	return Array.isArray(cache)
		? cache
		: queryLatestCacheRows(
				cache,
				"openrouter_raw_rows",
				"SELECT * FROM openrouter_raw_rows WHERE run_id = ? ORDER BY row_index",
			);
}

/** Confirms persisted candidates still map to the requested model route through the catalog slug. */
export function openRouterCacheHasScopedCandidates(
	cache: CacheSource,
): boolean {
	const cacheRows = openRouterCacheRows(cache);
	const slugByPermaslug = new Map<string, string>();
	for (const row of cacheRows) {
		if (row.row_kind !== "directory_model") {
			continue;
		}
		const slug = stringValue(row.slug);
		const permaslug = stringValue(row.permaslug);
		if (slug != null && permaslug != null) {
			slugByPermaslug.set(permaslug, slug);
		}
	}
	const candidateRows = cacheRows.filter(
		(row) => row.row_kind === "permaslug_candidate",
	);
	for (const row of candidateRows) {
		const modelId = stringValue(row.model_id);
		const permaslug = stringValue(row.permaslug);
		const candidateRoute =
			permaslug == null ? null : (slugByPermaslug.get(permaslug) ?? permaslug);
		if (
			modelId == null ||
			candidateRoute == null ||
			!isSameOpenRouterModelRoute(
				sanitizeModelId(modelId),
				sanitizeModelId(candidateRoute),
			)
		) {
			return false;
		}
	}
	return candidateRows.length > 0;
}

function openRouterStatsResponse(
	rowsToConvert: CacheDbRow[],
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

function openRouterSeriesTokenWeights(
	statRows: CacheDbRow[],
): Record<string, number> {
	const weights: Record<string, number> = {};
	for (const row of statRows) {
		const series = stringValue(row.series);
		const weight = asFiniteNumber(row.series_token_weight);
		if (series != null && weight != null && weight > 0) {
			weights[series] = weight;
		}
	}
	return weights;
}

function openRouterPricing(
	row: CacheDbRow | undefined,
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

function openRouterAggregateEstimate(
	estimateRows: CacheDbRow[],
	metric: string,
	fallbackValue: unknown,
): number | null {
	if (estimateRows.length === 0) {
		return asFiniteNumber(fallbackValue);
	}
	return asFiniteNumber(
		estimateRows.find(
			(row) => row.metric === metric && row.series === "openrouter_aggregate",
		)?.value,
	);
}

function openRouterModelRows(
	modelId: string,
	rowsByKind: Map<string, CacheDbRow[]>,
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
	const estimateRows = (rowsByKind.get("performance_estimate") ?? []).filter(
		(row) => row.model_id === modelId,
	);
	const selectedPermaslug =
		stringValue(statsRow?.selected_permaslug) ??
		stringValue(statRows[0]?.selected_permaslug) ??
		stringValue(candidateRows[0]?.selected_permaslug);
	const performance: OpenRouterModelStats = {
		summary: {
			throughput_tokens_per_second_median: openRouterAggregateEstimate(
				estimateRows,
				"throughput",
				statsRow?.throughput_tokens_per_second_median,
			),
			latency_seconds_median: openRouterAggregateEstimate(
				estimateRows,
				"latency",
				statsRow?.latency_seconds_median,
			),
			e2e_latency_seconds_median: openRouterAggregateEstimate(
				estimateRows,
				"latency_e2e",
				statsRow?.e2e_latency_seconds_median,
			),
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
		series_token_weights: openRouterSeriesTokenWeights(statRows),
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

/** Reassembles OpenRouter directory, permaslug, stat, and pricing rows. */
export function readOpenRouterRawCache(
	cache: CacheSource,
): OpenRouterRawScrapedPayload | null {
	const cacheRows = openRouterCacheRows(cache);
	if (cacheRows.length === 0) {
		return null;
	}
	const fetchedAt = firstEpochSecond(cacheRows);
	if (fetchedAt == null) {
		return null;
	}
	const rowsByKind = new Map<string, CacheDbRow[]>();
	for (const row of cacheRows) {
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
