/** Local SQLite tooling builds and atomically publishes offline Model Atlas snapshots. */

import { rename } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../constants";
import { nowEpochSeconds } from "../utils";
import { loadOpenRouterRawPayload } from "./openrouter-cache";
import {
	type DatabaseSnapshotRows,
	deriveDatabaseSnapshot,
	SNAPSHOT_WRITER_TABLES,
	writeDatabaseSnapshotRows,
} from "./pipeline";
import { openDatabase, removeDatabaseFiles } from "./schema";
import { loadSourceSnapshots } from "./snapshots";
import {
	type DatabaseBuildOptions,
	type DatabaseBuildResult,
	DEFAULT_DATABASE_PATH,
} from "./types";

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

function sqlStringLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Publish by vacuuming to a replacement file first so readers never see a partially rewritten database. */
async function publishDatabaseFile(
	db: DatabaseSync,
	outputPath: string,
): Promise<void> {
	const persistedPath = `${outputPath}.persisted`;
	await removeDatabaseFiles(persistedPath);
	db.exec(`VACUUM INTO ${sqlStringLiteral(persistedPath)}`);
	db.close();
	await removeDatabaseFiles(outputPath);
	await rename(persistedPath, outputPath);
}

function writeSnapshot(db: DatabaseSync, rows: DatabaseSnapshotRows): void {
	for (const table of SNAPSHOT_WRITER_TABLES) {
		db.prepare(`DELETE FROM ${table}`).run();
	}
	db.prepare("DELETE FROM snapshot_metadata").run();
	writeDatabaseSnapshotRows(db, rows);
	db.prepare(
		"INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)",
	).run(nowEpochSeconds());
}

/** Builds a local SQLite artifact for offline inspection and scripts; runtime publication uses D1 directly. */
export async function buildDatabase(
	outputPath = DEFAULT_DATABASE_PATH,
	options: DatabaseBuildOptions = {},
): Promise<DatabaseBuildResult> {
	const startedAtEpochSeconds = nowEpochSeconds();
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
		);

		const activeDb = db;
		runInTransaction(activeDb, () => writeSnapshot(activeDb, derived.rows));
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
