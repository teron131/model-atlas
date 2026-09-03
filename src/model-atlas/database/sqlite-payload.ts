/** Local SQLite payload reads adapt stored rows to the storage-independent payload assembler. */

import { statSync } from "node:fs";
import { resolve } from "node:path";
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

let cachedRead: { fingerprint: string; payload: ModelAtlasPayload } | null = null;

/** Reuse only an unchanged local snapshot; WAL commits, replacements, and module reloads invalidate it without a freshness delay. */
export function readCachedDatabasePayload(databasePath = DEFAULT_DATABASE_PATH): ModelAtlasPayload {
  const fingerprint = databaseFingerprint(databasePath);
  if (cachedRead?.fingerprint === fingerprint) return cachedRead.payload;
  const payload = readDatabasePayload(databasePath);
  // A concurrent writer may commit during the read transaction; never cache that older view under the newer file state.
  cachedRead = fingerprint === databaseFingerprint(databasePath) ? { fingerprint, payload } : null;
  return payload;
}

function databaseFingerprint(databasePath: string): string {
  const path = resolve(databasePath);
  return [
    path,
    ...[path, `${path}-wal`].map((file) => {
      try {
        const stat = statSync(file, { bigint: true });
        return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      } catch (error) {
        if (file !== path && (error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
        throw error;
      }
    }),
  ].join("|");
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
    if (rowGroup.optional === true) {
      return [];
    }
    throw error;
  }
}

/** Local SQLite payload reads the one atomically published snapshot. */
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
