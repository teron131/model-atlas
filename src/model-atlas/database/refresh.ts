/** Refresh the SQLite checkpoint while retaining source caches and append-only audit history. */

import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../config";
import { nowEpochSeconds } from "../runtime";
import { loadOpenRouterRawPayload } from "../sources/openrouter/snapshot";
import type { RawSourceName } from "../sources/registry";
import { loadSourceSnapshots } from "../sources/snapshots/load";
import type {
  ModelAtlasSourceHealth,
  RawSourceCacheStatus,
  SourceRefreshOptions,
} from "../sources/types";
import type { ModelAtlasPayload } from "../stats/types";
import { archiveCheckpoint } from "./archive";
import { readCapabilityState, writeCapabilityState } from "./capability-state";
import { deriveDatabaseSnapshot, writeCheckpoint } from "./checkpoint";
import { DEFAULT_DATABASE_PATH, openDatabase, removeDatabaseFiles } from "./schema";
import { sqlStringLiteral } from "./schema-reconciliation";
import { readDatabasePayload } from "./sqlite-payload";

export type DatabaseRefreshResult = {
  path: string;
  table_row_counts: Record<string, number>;
  source_cache: Record<RawSourceName, RawSourceCacheStatus>;
  source_health: ModelAtlasSourceHealth;
  final_model_count: number;
};

/** Refresh the local checkpoint; the GCS publisher owns making it visible to runtime readers. */
export async function refreshDatabase(
  outputPath = DEFAULT_DATABASE_PATH,
  options: SourceRefreshOptions & { previousPayload?: ModelAtlasPayload | null } = {},
): Promise<DatabaseRefreshResult> {
  const startedAtEpochSeconds = nowEpochSeconds();
  const existed = existsSync(outputPath);
  let db: DatabaseSync | null = await openDatabase(outputPath);

  try {
    const previousPayload =
      options.previousPayload ?? (existed ? readDatabasePayload(outputPath) : null);
    const capabilityState = readCapabilityState(db);
    const { snapshots, sourceCacheStatuses } = await loadSourceSnapshots(
      db,
      startedAtEpochSeconds,
      STAGE_CONFIG.scoring,
      options,
    );
    const derived = await deriveDatabaseSnapshot(
      startedAtEpochSeconds,
      snapshots,
      sourceCacheStatuses,
      (modelIds) =>
        loadOpenRouterRawPayload(
          db as DatabaseSync,
          modelIds,
          STAGE_CONFIG.openrouter.speedConcurrency,
          startedAtEpochSeconds,
          options,
        ),
      {
        previousPayload,
        previousRefreshId: latestRefreshId(db),
        capabilityState: capabilityState ?? undefined,
        replaceSourceRows: options.replaceSourceRows,
      },
    );

    const activeDb = db;
    runInTransaction(activeDb, () => {
      writeCheckpoint(activeDb, derived.rows);
      if (derived.rows.capabilityState)
        writeCapabilityState(activeDb, derived.rows.capabilityState);
      archiveCheckpoint(activeDb);
    });
    if (activeDb.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") {
      throw new Error("Refusing to publish a SQLite checkpoint that failed its integrity check");
    }
    const result = {
      path: outputPath,
      table_row_counts: countTableRows(activeDb),
      source_cache: derived.sourceCacheStatuses,
      source_health: derived.rows.sourceHealth,
      final_model_count: derived.rows.finalModelRows.length,
    };
    await compactDatabaseFile(activeDb, outputPath);
    db = null;
    return result;
  } finally {
    db?.close();
  }
}

/** The newest audited refresh produced the checkpoint's current rows, so it is the previous run of this refresh. */
function latestRefreshId(db: DatabaseSync): number | null {
  const row = db.prepare("SELECT MAX(refresh_id) AS refresh_id FROM refresh_runs").get();
  return typeof row?.refresh_id === "number" ? row.refresh_id : null;
}

/** Wrap the synchronous checkpoint writes so a partial refresh rolls back together on failure. */
function runInTransaction<T>(db: DatabaseSync, write: () => T): T {
  db.exec("BEGIN");
  try {
    const result = write();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function countTableRows(db: DatabaseSync): Record<string, number> {
  const rows = db
    .prepare(`
			SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`)
    .all();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name : null;
    if (name == null) {
      continue;
    }
    const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get();
    counts[name] = Number(countRow?.count ?? 0);
  }
  return counts;
}

/** Compact by vacuuming into a replacement file first so readers never see a partially rewritten database. */
async function compactDatabaseFile(db: DatabaseSync, outputPath: string): Promise<void> {
  const persistedPath = `${outputPath}.persisted`;
  await removeDatabaseFiles(persistedPath);
  db.exec(`VACUUM INTO ${sqlStringLiteral(persistedPath)}`);
  db.close();
  await removeDatabaseFiles(outputPath);
  await rename(persistedPath, outputPath);
}
