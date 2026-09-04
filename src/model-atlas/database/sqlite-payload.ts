/** Checkpoint tooling reads SQLite rows through the shared payload assembler; application display reads use GCS. */

import { DatabaseSync } from "node:sqlite";

import { asRecord } from "../runtime";
import type { ModelAtlasPayload } from "../stats/types";
import {
  buildPayloadFromRows,
  buildPayloadRows,
  PAYLOAD_ROW_GROUPS,
  payloadFetchedAtFromRow,
  type PayloadRowGroup,
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

/** Read a consistent checkpoint for derivation, publication, and explicit inspection. */
export function readDatabasePayload(databasePath = DEFAULT_DATABASE_PATH): ModelAtlasPayload {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  let rows: ReturnType<typeof buildPayloadRows>;
  try {
    db.exec("BEGIN");
    const fetchedAt = payloadFetchedAtFromRow(db.prepare(SNAPSHOT_METADATA_SQL).get());
    rows = buildPayloadRows(
      fetchedAt,
      PAYLOAD_ROW_GROUPS.map((rowGroup) => [rowGroup.key, readPayloadRowGroup(db, rowGroup)]),
    );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  return buildPayloadFromRows(rows);
}
