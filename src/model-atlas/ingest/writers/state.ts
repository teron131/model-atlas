/** SQLite writer for source quarantines and per-source health summaries. */

import type { ModelAtlasSourceHealth, SourceSnapshots } from "../types";
import type { DatabaseWriter } from "./database";

export function insertSourceQuarantines(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO source_quarantines (
			source, row_key, missing_from_source_since_epoch_seconds
		) VALUES (?, ?, ?)
	`);
	for (const row of snapshots.sourceRowStates) {
		if (row.status !== "quarantined_missing_from_source") {
			continue;
		}
		statement.run(
			row.source,
			row.row_key,
			row.missing_from_source_since_epoch_seconds,
		);
	}
}

export function insertSourceHealth(
	db: DatabaseWriter,
	sourceHealth: ModelAtlasSourceHealth,
): void {
	const statement = db.prepare(`
		INSERT INTO source_health (
			row_index, source, status, last_fetch_epoch_seconds,
			source_input_count, active_row_count, quarantined_row_count
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, [source, row]] of Object.entries(
		sourceHealth.sources,
	).entries()) {
		statement.run(
			index,
			source,
			row.status,
			row.last_fetch_epoch_seconds,
			row.source_input_count,
			row.active_row_count,
			row.quarantined_row_count,
		);
	}
}
