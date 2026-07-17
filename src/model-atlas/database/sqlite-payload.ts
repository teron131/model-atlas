/** Local SQLite payload reads adapt stored rows to the storage-independent payload assembler. */

import { DatabaseSync } from "node:sqlite";

import { asRecord } from "../shared";
import type { LlmStatsPayload } from "../stats/types";
import {
	buildPayloadFromRows,
	buildPayloadRows,
	COMPLETED_RUN_SQL,
	PAYLOAD_ROW_GROUPS,
	type PayloadRowGroup,
	type PayloadRows,
	payloadRunFromRow,
} from "./payload";
import { DEFAULT_DATABASE_PATH } from "./types";

function latestRun(db: DatabaseSync): PayloadRows["run"] {
	const run = payloadRunFromRow(db.prepare(COMPLETED_RUN_SQL).get());
	if (run == null) {
		throw new Error("No Model Atlas database run exists");
	}
	return run;
}

function readPayloadRowGroup(
	db: DatabaseSync,
	rowGroup: PayloadRowGroup,
	runId: number,
): Record<string, unknown>[] {
	try {
		return db
			.prepare(rowGroup.sql)
			.all(runId)
			.map((row) => asRecord(row));
	} catch (error) {
		if (rowGroup.optional === true) {
			return [];
		}
		throw error;
	}
}

/** Local SQLite payload reads follow the same latest-completed-run boundary as D1. */
export function readDatabasePayload(
	databasePath = DEFAULT_DATABASE_PATH,
): LlmStatsPayload {
	const db = new DatabaseSync(databasePath);
	try {
		const run = latestRun(db);
		return buildPayloadFromRows(
			buildPayloadRows(
				run,
				PAYLOAD_ROW_GROUPS.map((rowGroup) => [
					rowGroup.key,
					readPayloadRowGroup(db, rowGroup, run.id),
				]),
			),
		);
	} finally {
		db.close();
	}
}
