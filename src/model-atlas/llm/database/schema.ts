import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** Load the SQLite schema file colocated with this database pipeline. */
async function loadSchemaSql(): Promise<string> {
	return readFile(
		fileURLToPath(new URL("./schema.sql", import.meta.url)),
		"utf-8",
	);
}

/** Remove a SQLite database file and its sidecar files. */
export async function removeDatabaseFiles(path: string): Promise<void> {
	await Promise.all([
		rm(path, { force: true }),
		rm(`${path}-shm`, { force: true }),
		rm(`${path}-wal`, { force: true }),
	]);
}

/** Recreate the SQLite database from the checked-in schema. */
export async function openDatabase(outputPath: string): Promise<DatabaseSync> {
	await mkdir(dirname(outputPath), { recursive: true });
	await removeDatabaseFiles(outputPath);
	const db = new DatabaseSync(outputPath);
	db.exec(await loadSchemaSql());
	return db;
}
