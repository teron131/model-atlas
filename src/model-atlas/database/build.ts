/** Local SQLite tooling builds and atomically publishes offline Model Atlas snapshots. */

import { rename } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../constants";
import { nowEpochSeconds } from "../utils";
import {
	type DatabaseRunRows,
	deriveDatabaseRun,
	SNAPSHOT_WRITER_TABLES,
	writeDatabaseRunRows,
} from "./pipeline";
import { openDatabase, removeDatabaseFiles } from "./schema";
import { loadOpenRouterRawPayload, loadSourceSnapshots } from "./sources";
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

function insertPipelineRun(db: DatabaseSync, rows: DatabaseRunRows): number {
	const result = db
		.prepare(`
			INSERT INTO pipeline_runs (
				started_at_epoch_seconds, matched_row_count, enriched_row_count, final_model_count
			) VALUES (?, ?, ?, ?)
		`)
		.run(
			rows.startedAt,
			rows.matchedTextLlmRows.length,
			rows.enrichedRows.length,
			rows.finalModelRows.length,
		);
	return Number(result.lastInsertRowid);
}

function writeSnapshot(db: DatabaseSync, rows: DatabaseRunRows): number {
	for (const table of SNAPSHOT_WRITER_TABLES) {
		db.prepare(`DELETE FROM ${table}`).run();
	}
	const runId = insertPipelineRun(db, rows);
	writeDatabaseRunRows(db, runId, rows);
	db.prepare(
		"UPDATE pipeline_runs SET completed_at_epoch_seconds = ? WHERE id = ?",
	).run(nowEpochSeconds(), runId);
	return runId;
}

/** Builds a local SQLite artifact for offline inspection and scripts; runtime publication uses D1 directly. */
export async function buildDatabase(
	outputPath = DEFAULT_DATABASE_PATH,
	options: DatabaseBuildOptions = {},
): Promise<DatabaseBuildResult> {
	const startedAt = nowEpochSeconds();
	let db: DatabaseSync | null = await openDatabase(outputPath);

	try {
		const { snapshots, sourceCache } = await loadSourceSnapshots(
			db,
			startedAt,
			STAGE_CONFIG.scoring,
			options,
		);
		const derived = await deriveDatabaseRun(
			startedAt,
			snapshots,
			sourceCache,
			(modelIds) =>
				loadOpenRouterRawPayload(
					db as DatabaseSync,
					modelIds,
					STAGE_CONFIG.openrouter.speedConcurrency,
					startedAt,
					options,
				),
		);

		const activeDb = db;
		const runId = runInTransaction(activeDb, () =>
			writeSnapshot(activeDb, derived.rows),
		);
		const result = {
			path: outputPath,
			run_id: runId,
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
