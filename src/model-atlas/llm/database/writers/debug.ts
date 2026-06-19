/** Matcher and lineage debug writer. */

import type { DatabaseSync } from "node:sqlite";

import type { DebugTraceRow } from "../types";

/** Insert matcher and lineage debug trace rows. */
export function insertDebugTraceRows(
	db: DatabaseSync,
	runId: number,
	rows: readonly DebugTraceRow[],
): void {
	const statement = db.prepare(`
		INSERT INTO matcher_debug (
			run_id, row_index, trace_kind, aa_id, aa_slug, aa_name,
			aa_raw_row_index, candidate_rank, candidate_model_id,
			candidate_provider_id, candidate_provider_name, candidate_name,
			candidate_score, selected, rejected, rejection_reason,
			selected_model_id, models_dev_row_index, openrouter_model_id,
			openrouter_model_stats_row_index
		) VALUES (${Array.from({ length: 20 }, () => "?").join(", ")})
	`);
	for (const [index, row] of rows.entries()) {
		statement.run(
			runId,
			index,
			row.trace_kind,
			row.aa_id,
			row.aa_slug,
			row.aa_name,
			row.aa_raw_row_index,
			row.candidate_rank,
			row.candidate_model_id,
			row.candidate_provider_id,
			row.candidate_provider_name,
			row.candidate_name,
			row.candidate_score,
			row.selected ? 1 : 0,
			row.rejected ? 1 : 0,
			row.rejection_reason,
			row.selected_model_id,
			row.models_dev_row_index,
			row.openrouter_model_id,
			row.openrouter_model_stats_row_index,
		);
	}
}
