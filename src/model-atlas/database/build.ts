/** Build a complete SQLite checkpoint while retaining source caches and append-only audit history. */

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
import { deriveDatabaseSnapshot, writeCheckpoint } from "./checkpoint";
import { DEFAULT_DATABASE_PATH, openDatabase, removeDatabaseFiles } from "./schema";
import { readDatabasePayload } from "./sqlite-payload";

export type DatabaseBuildResult = {
  path: string;
  source_rows: Record<string, number>;
  source_cache: Record<RawSourceName, RawSourceCacheStatus>;
  source_health: ModelAtlasSourceHealth;
  final_model_count: number;
};

/** Refresh the local checkpoint; the GCS publisher owns making it visible to runtime readers. */
export async function buildDatabase(
  outputPath = DEFAULT_DATABASE_PATH,
  options: SourceRefreshOptions & { previousPayload?: ModelAtlasPayload | null } = {},
): Promise<DatabaseBuildResult> {
  const startedAtEpochSeconds = nowEpochSeconds();
  const previousPayload =
    options.previousPayload ?? (existsSync(outputPath) ? readDatabasePayload(outputPath) : null);
  let db: DatabaseSync | null = await openDatabase(outputPath);

  try {
    const { snapshots, sourceCache } = await loadSourceSnapshots(
      db,
      startedAtEpochSeconds,
      STAGE_CONFIG.scoring,
      options,
    );
    const derived = await deriveDatabaseSnapshot(
      startedAtEpochSeconds,
      snapshots,
      sourceCache,
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
        replaceSourceRows: options.replaceSourceRows,
      },
    );

    const activeDb = db;
    runInTransaction(activeDb, () => writeCheckpoint(activeDb, derived.rows));
    if (activeDb.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") {
      throw new Error("Refusing to publish a SQLite checkpoint that failed its integrity check");
    }
    const result = {
      path: outputPath,
      source_rows: countTableRows(activeDb),
      source_cache: derived.sourceCache,
      source_health: derived.rows.sourceHealth,
      final_model_count: derived.rows.finalModelRows.length,
    };
    await publishDatabaseFile(activeDb, outputPath);
    db = null;
    return result;
  } finally {
    db?.close();
  }
}

/** Wrap the synchronous database build so partial snapshot writes roll back together on failure. */
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

/** Publish by vacuuming to a replacement file first so readers never see a partially rewritten database. */
async function publishDatabaseFile(db: DatabaseSync, outputPath: string): Promise<void> {
  const persistedPath = `${outputPath}.persisted`;
  await removeDatabaseFiles(persistedPath);
  db.exec(`VACUUM INTO ${sqlStringLiteral(persistedPath)}`);
  db.close();
  await removeDatabaseFiles(outputPath);
  await rename(persistedPath, outputPath);
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
