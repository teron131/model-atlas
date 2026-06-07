/** Debug trace row construction for Model Atlas database snapshots. */

import {
	firstValidMatchId,
	hasVariantConflict,
} from "../llm-stats/match-stage";
import { publicOpenRouterModelId } from "../llm-stats/model-aliases";
import type { MatcherConfig } from "../llm-stats/types";
import type { LlmScraperFallbackMatchDiagnosticsPayload } from "../matcher";
import type { OpenRouterRawScrapedPayload } from "../sources/openrouter-scraper";
import type { DebugTraceRow, SourceSnapshots } from "./types";

/** Map AA model ids to raw table row indexes for debug joins. */
function aaRowIndexById(snapshots: SourceSnapshots): Map<string, number> {
	const byModelId = new Map<string, number>();
	for (const [index, row] of snapshots.aaSelectedRows.entries()) {
		if (typeof row.model_id === "string") {
			byModelId.set(row.model_id, index);
		}
	}
	return byModelId;
}

/** Map provider/model ids to models.dev raw table row indexes for debug joins. */
function modelsDevRowIndexByKey(
	snapshots: SourceSnapshots,
): Map<string, number> {
	const byKey = new Map<string, number>();
	let rowIndex = 0;
	for (const [providerId, provider] of Object.entries(
		snapshots.modelsDevPayload,
	)) {
		for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
			const modelId = model.id ?? modelKey;
			byKey.set(`${providerId}|${modelId}`, rowIndex);
			rowIndex += 1;
		}
	}
	return byKey;
}

function statsPointCount(
	model: OpenRouterRawScrapedPayload["models"][number],
): number {
	let count = 0;
	for (const metric of ["throughput", "latency", "latency_e2e"] as const) {
		for (const point of model.performance[metric]?.data ?? []) {
			count += Object.keys(point.y ?? {}).length;
		}
	}
	return count;
}

/** Map OpenRouter model ids to the model_stats raw table row index. */
function openRouterStatsRowById(
	rawPayload: OpenRouterRawScrapedPayload | null | undefined,
): Map<string, number> {
	const byModelId = new Map<string, number>();
	if (rawPayload == null) {
		return byModelId;
	}
	let rowIndex = rawPayload.directory.length;
	for (const model of rawPayload.models) {
		rowIndex += model.candidate_permaslugs.length;
		rowIndex += statsPointCount(model);
		byModelId.set(model.id, rowIndex);
		rowIndex += 1;
	}
	return byModelId;
}

function debugRejectionReason(
	isSelected: boolean,
	hasVariantRejection: boolean,
	selectedModelId: string | null,
): string {
	if (isSelected) {
		return "selected";
	}
	if (hasVariantRejection) {
		return "variant_conflict";
	}
	if (selectedModelId != null) {
		return "lower_rank";
	}
	return "not_selected";
}

function unmatchedDebugTraceRow(
	model: LlmScraperFallbackMatchDiagnosticsPayload["models"][number],
	aaRowById: Map<string, number>,
): DebugTraceRow {
	return {
		trace_kind: "matcher_candidate",
		aa_id: model.artificial_analysis_name,
		aa_slug: model.artificial_analysis_slug,
		aa_name: model.artificial_analysis_name,
		aa_raw_row_index:
			aaRowById.get(model.artificial_analysis_name ?? "") ?? null,
		candidate_rank: null,
		candidate_model_id: null,
		candidate_provider_id: null,
		candidate_provider_name: null,
		candidate_name: null,
		candidate_score: null,
		selected: false,
		rejected: true,
		rejection_reason: "unmatched_or_voided",
		selected_model_id: null,
		models_dev_row_index: null,
		openrouter_model_id: null,
		openrouter_model_stats_row_index: null,
	};
}

/** Build matcher candidate trace rows for debug lineage queries. */
export function buildDebugTraceRows(
	snapshots: SourceSnapshots,
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined,
	diagnostics: LlmScraperFallbackMatchDiagnosticsPayload,
	matcherConfig: MatcherConfig,
): DebugTraceRow[] {
	const aaRowById = aaRowIndexById(snapshots);
	const modelsDevRowByKey = modelsDevRowIndexByKey(snapshots);
	const openRouterRowById = openRouterStatsRowById(openRouterRawPayload);
	const rows: DebugTraceRow[] = [];

	for (const model of diagnostics.models) {
		const selectedModelId = firstValidMatchId(
			model.candidates,
			model.artificial_analysis_slug,
			matcherConfig,
		);
		if (model.candidates.length === 0) {
			rows.push(unmatchedDebugTraceRow(model, aaRowById));
			continue;
		}
		for (const [candidateIndex, candidate] of model.candidates.entries()) {
			const selected = candidate.model_id === selectedModelId;
			const variantRejected = hasVariantConflict(
				model.artificial_analysis_slug,
				candidate.model_id,
				matcherConfig,
			);
			const openRouterModelId =
				candidate.provider_id === "openrouter"
					? (publicOpenRouterModelId(candidate.model_id) ?? candidate.model_id)
					: null;
			rows.push({
				trace_kind: "matcher_candidate",
				aa_id: model.artificial_analysis_name,
				aa_slug: model.artificial_analysis_slug,
				aa_name: model.artificial_analysis_name,
				aa_raw_row_index:
					aaRowById.get(model.artificial_analysis_name ?? "") ?? null,
				candidate_rank: candidateIndex,
				candidate_model_id: candidate.model_id,
				candidate_provider_id: candidate.provider_id,
				candidate_provider_name: candidate.provider_name,
				candidate_name: candidate.model_name,
				candidate_score: candidate.score,
				selected,
				rejected: !selected,
				rejection_reason: debugRejectionReason(
					selected,
					variantRejected,
					selectedModelId,
				),
				selected_model_id: selectedModelId,
				models_dev_row_index:
					modelsDevRowByKey.get(
						`${candidate.provider_id}|${candidate.model_id}`,
					) ?? null,
				openrouter_model_id: openRouterModelId,
				openrouter_model_stats_row_index:
					openRouterModelId == null
						? null
						: (openRouterRowById.get(openRouterModelId) ?? null),
			});
		}
	}

	return rows;
}
