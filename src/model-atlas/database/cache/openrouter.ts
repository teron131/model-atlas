/** OpenRouter raw-cache reconstruction and scoped route coverage checks. */

import type { DatabaseSync } from "node:sqlite";

import { isSameOpenRouterModelRoute } from "../../openrouter-routes";
import type {
	OpenRouterEffectivePricingResponse,
	OpenRouterFrontendModel,
	OpenRouterModelStats,
	OpenRouterRawScrapedModel,
	OpenRouterRawScrapedPayload,
	OpenRouterStatsResponse,
} from "../../scrapers/openrouter";
import { asFiniteNumber } from "../../shared";
import {
	firstEpochSecond,
	queryRawRows,
	type RawDbRow,
	stringValue,
} from "./source-readers";

export function openRouterCacheHasScopedCandidates(db: DatabaseSync): boolean {
	const candidateRows = queryRawRows(
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
			e2e_latency_seconds_median:
				asFiniteNumber(statsRow?.e2e_latency_seconds_median) ?? null,
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

/** Reassembles OpenRouter directory, permaslug, stat, and pricing rows. */
export function readOpenRouterRawCache(
	db: DatabaseSync,
): OpenRouterRawScrapedPayload | null {
	const rawRows = queryRawRows(
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
