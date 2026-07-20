/** SQLite writer for matcher lineage rows used to explain why source candidates did or did not join. */

import type { DebugTraceRow } from "../types";
import type { DatabaseWriter } from "./shared";

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
