/** Debug trace construction and persistence preserve matcher decisions for auditing snapshot joins. */

import {
	artificialAnalysisMatchSlug,
	hasVariantConflict,
	type MatchDiagnosticsPayload,
	type MatcherConfig,
} from "../identity";
import { publicOpenRouterModelId } from "../identity/openrouter";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import type { DebugTraceRow, SourceSnapshots } from "./types";
import type { DatabaseWriter } from "./writers/database";

/** Artificial Analysis raw indexes let debug traces point back to the scraped model row. */
function artificialAnalysisRowIndexById(
	snapshots: SourceSnapshots,
): Map<string, number> {
	const byModelId = new Map<string, number>();
	for (const [
		index,
		row,
	] of snapshots.artificialAnalysisSelectedRows.entries()) {
		if (typeof row.model_id === "string") {
			byModelId.set(row.model_id, index);
		}
	}
	return byModelId;
}

/** Models.dev raw indexes let debug traces point back to the catalog candidate row. */
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

function openRouterStatsRowIndexById(
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

/** Explains why a matcher candidate was selected, skipped, or rejected. */
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
	model: MatchDiagnosticsPayload["models"][number],
	artificialAnalysisRowById: Map<string, number>,
): DebugTraceRow {
	return {
		artificial_analysis_id: model.artificial_analysis_id,
		artificial_analysis_slug: model.artificial_analysis_slug,
		artificial_analysis_name: model.artificial_analysis_name,
		artificial_analysis_raw_row_index:
			artificialAnalysisRowById.get(model.artificial_analysis_id ?? "") ?? null,
		candidate_rank: null,
		candidate_model_id: null,
		candidate_provider_id: null,
		candidate_provider_name: null,
		candidate_name: null,
		candidate_score: null,
		selected: false,
		rejection_reason: "unmatched_or_voided",
		selected_model_id: null,
		models_dev_row_index: null,
		openrouter_model_id: null,
		openrouter_model_stats_row_index: null,
	};
}

export function buildDebugTraceRows(
	snapshots: SourceSnapshots,
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined,
	diagnostics: MatchDiagnosticsPayload,
	matcherConfig: MatcherConfig,
): DebugTraceRow[] {
	const artificialAnalysisRowById = artificialAnalysisRowIndexById(snapshots);
	const modelsDevRowByKey = modelsDevRowIndexByKey(snapshots);
	const openRouterStatsRowIndexes =
		openRouterStatsRowIndexById(openRouterRawPayload);
	const rows: DebugTraceRow[] = [];

	for (const model of diagnostics.models) {
		const selectedModelId = model.best_match?.model_id ?? null;
		const matchSlug = artificialAnalysisMatchSlug(
			model.artificial_analysis_slug,
		);
		if (model.candidates.length === 0) {
			rows.push(unmatchedDebugTraceRow(model, artificialAnalysisRowById));
			continue;
		}
		for (const [candidateIndex, candidate] of model.candidates.entries()) {
			const isSelected = candidate.model_id === selectedModelId;
			const variantRejected = hasVariantConflict(
				matchSlug,
				candidate.model_id,
				matcherConfig,
			);
			const openRouterModelId =
				candidate.provider_id === "openrouter"
					? (publicOpenRouterModelId(candidate.model_id) ?? candidate.model_id)
					: null;
			rows.push({
				artificial_analysis_id: model.artificial_analysis_id,
				artificial_analysis_slug: model.artificial_analysis_slug,
				artificial_analysis_name: model.artificial_analysis_name,
				artificial_analysis_raw_row_index:
					artificialAnalysisRowById.get(model.artificial_analysis_id ?? "") ??
					null,
				candidate_rank: candidateIndex,
				candidate_model_id: candidate.model_id,
				candidate_provider_id: candidate.provider_id,
				candidate_provider_name: candidate.provider_name,
				candidate_name: candidate.model_name,
				candidate_score: candidate.score,
				selected: isSelected,
				rejection_reason: debugRejectionReason(
					isSelected,
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
						: (openRouterStatsRowIndexes.get(openRouterModelId) ?? null),
			});
		}
	}

	return rows;
}

/** Persist matcher lineage with stable source indexes for later audit queries. */
export function insertDebugTraceRows(
	db: DatabaseWriter,
	rows: readonly DebugTraceRow[],
): void {
	const statement = db.prepare(`
		INSERT INTO model_match_debug (
			row_index, artificial_analysis_id,
			artificial_analysis_slug, artificial_analysis_name,
			artificial_analysis_raw_row_index, candidate_rank,
			candidate_model_id, candidate_provider_id, candidate_provider_name,
			candidate_name, candidate_score, selected, rejection_reason,
			selected_model_id, models_dev_row_index, openrouter_model_id,
			openrouter_model_stats_row_index
		) VALUES (${Array.from({ length: 17 }, () => "?").join(", ")})
	`);
	for (const [index, row] of rows.entries()) {
		statement.run(
			index,
			row.artificial_analysis_id,
			row.artificial_analysis_slug,
			row.artificial_analysis_name,
			row.artificial_analysis_raw_row_index,
			row.candidate_rank,
			row.candidate_model_id,
			row.candidate_provider_id,
			row.candidate_provider_name,
			row.candidate_name,
			row.candidate_score,
			row.selected ? 1 : 0,
			row.rejection_reason,
			row.selected_model_id,
			row.models_dev_row_index,
			row.openrouter_model_id,
			row.openrouter_model_stats_row_index,
		);
	}
}
