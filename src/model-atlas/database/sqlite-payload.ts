/** Local SQLite payload reads adapt stored rows to the storage-independent payload assembler. */

import { DatabaseSync } from "node:sqlite";
import { asRecord } from "../runtime";
import type { ModelAtlasPayload } from "../stats/types";
import {
	buildPayloadFromRows,
	buildPayloadRows,
	PAYLOAD_ROW_GROUPS,
	type PayloadRowGroup,
	payloadFetchedAtFromRow,
	SNAPSHOT_METADATA_SQL,
} from "./payload-rows";
import { DEFAULT_DATABASE_PATH } from "./schema";

function readPayloadRowGroup(
	db: DatabaseSync,
	rowGroup: PayloadRowGroup,
): Record<string, unknown>[] {
	try {
		return db
			.prepare(rowGroup.sql)
			.all()
			.map((row) => asRecord(row));
	} catch (error) {
		if (rowGroup.optional === true) {
			return [];
		}
		throw error;
	}
}

/** Local SQLite payload reads the one atomically published snapshot. */
export function readDatabasePayload(
	databasePath = DEFAULT_DATABASE_PATH,
): ModelAtlasPayload {
	const db = new DatabaseSync(databasePath);
	try {
		const fetchedAt = payloadFetchedAtFromRow(
			db.prepare(SNAPSHOT_METADATA_SQL).get(),
		);
		return buildPayloadFromRows(
			buildPayloadRows(
				fetchedAt,
				PAYLOAD_ROW_GROUPS.map((rowGroup) => [
					rowGroup.key,
					readPayloadRowGroup(db, rowGroup),
				]),
			),
		);
	} finally {
		db.close();
	}
}
