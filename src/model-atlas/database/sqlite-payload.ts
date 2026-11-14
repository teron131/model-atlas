/** Reads the SQLite checkpoint back into the public payload inside one read transaction, for the refresh, the publisher, and the local-database display override; deployed display reads come from the published GCS artifacts instead. */

import { DatabaseSync } from "node:sqlite";

import { asRecord } from "../runtime";
import type { ModelAtlasPayload } from "../stats/types";
import { readCapabilityState } from "./capability-state";
import { listedChangeHistory } from "./change-log";
import { readCommunityRankings } from "./community-rankings";
import {
  buildPayloadFromRows,
  buildPayloadRows,
  PAYLOAD_ROW_GROUPS,
  type PayloadRowGroup,
  SNAPSHOT_METADATA_SQL,
} from "./payload-rows";
import { DEFAULT_DATABASE_PATH } from "./schema";
import type { SnapshotData } from "./snapshots/manifest";

/** Read a consistent checkpoint payload for derivation and explicit inspection. */
export function readDatabasePayload(databasePath = DEFAULT_DATABASE_PATH): ModelAtlasPayload {
  return readCheckpoint(databasePath, (db) => buildPayloadFromRows(readPayloadRows(db)));
}

/** Read the payload with the Intelligence Index, community history, and change history it is published beside. */
export function readDatabaseSnapshot(databasePath = DEFAULT_DATABASE_PATH): SnapshotData {
  return readCheckpoint(databasePath, (db) => {
    const rows = readPayloadRows(db);
    const payload = buildPayloadFromRows(rows);
    return {
      payload,
      timeline: readCapabilityState(db)?.dataset ?? null,
      communityRankings: readCommunityRankings(db),
      changeHistory: listedChangeHistory(rows, payload.models),
    };
  });
}

function readCheckpoint<T>(databasePath: string, read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("BEGIN");
    const result = read(db);
    db.exec("COMMIT");
    return result;
  } finally {
    db.close();
  }
}

function readPayloadRows(db: DatabaseSync) {
  return buildPayloadRows(
    db.prepare(SNAPSHOT_METADATA_SQL).get(),
    PAYLOAD_ROW_GROUPS.map((rowGroup) => [rowGroup.key, readPayloadRowGroup(db, rowGroup)]),
  );
}

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
    // An optional group reads as empty when its query fails, as for a table an older checkpoint lacks.
    if (rowGroup.optional === true) {
      return [];
    }
    throw error;
  }
}
