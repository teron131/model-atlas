/** Source row availability state writer. */

import type { DatabaseSync } from "node:sqlite";

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
