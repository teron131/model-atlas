/** Checkpoint tooling reads SQLite rows through the shared payload assembler; application display reads use GCS. */

import { DatabaseSync } from "node:sqlite";

import { asRecord } from "../runtime";
import type { ModelAtlasPayload } from "../stats/types";
import { readCapabilityState } from "./capability-state";
import { readCommunityRankings } from "./community-rankings";
import {
  buildPayloadFromRows,
  buildPayloadRows,
  PAYLOAD_ROW_GROUPS,
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
  let timeline: ModelAtlasPayload["timeline"];
  let communityRankings: ModelAtlasPayload["community_rankings"];
  try {
    db.exec("BEGIN");
    rows = buildPayloadRows(
      db.prepare(SNAPSHOT_METADATA_SQL).get(),
      PAYLOAD_ROW_GROUPS.map((rowGroup) => [rowGroup.key, readPayloadRowGroup(db, rowGroup)]),
    );
    timeline = readCapabilityState(db)?.dataset;
    communityRankings = readCommunityRankings(db);
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  return {
    ...buildPayloadFromRows(rows),
    ...(timeline ? { timeline } : {}),
    ...(communityRankings.length ? { community_rankings: communityRankings } : {}),
  };
}
