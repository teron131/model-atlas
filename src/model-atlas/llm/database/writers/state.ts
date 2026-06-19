/** Source row availability state writer. */

import type { DatabaseSync } from "node:sqlite";

import type { LlmStatsSourceHealth } from "../../stats/types";
import type { SourceSnapshots } from "../types";

/** Insert source row states for one runtime snapshot. */
export function insertSourceRowStates(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO source_row_states (
			run_id, row_index, source, row_key, row_label, status,
			missing_from_source_since_epoch_seconds
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.sourceRowStates.entries()) {
		statement.run(
			runId,
			index,
			row.source,
			row.row_key,
			row.row_label,
			row.status,
			row.missing_from_source_since_epoch_seconds,
		);
	}
}

/** Insert source health summaries for one runtime snapshot. */
export function insertSourceHealth(
	db: DatabaseSync,
	runId: number,
	sourceHealth: LlmStatsSourceHealth,
): void {
	const statement = db.prepare(`
		INSERT INTO source_health (
			run_id, row_index, generated_at_epoch_seconds, source, status,
			last_fetch_epoch_seconds, source_input_count, cache_hit, refreshed,
			using_cached_rows, active_row_count, quarantined_row_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of Object.values(sourceHealth.sources).entries()) {
		statement.run(
			runId,
			index,
			sourceHealth.generated_at_epoch_seconds,
			row.source,
			row.status,
			row.last_fetch_epoch_seconds,
			row.source_input_count,
			row.cache_hit ? 1 : 0,
			row.refreshed ? 1 : 0,
			row.using_cached_rows ? 1 : 0,
			row.active_row_count,
			row.quarantined_row_count,
		);
	}
}
