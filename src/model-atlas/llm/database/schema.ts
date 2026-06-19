import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_SQL_PATH = resolve(
	process.cwd(),
	"src/model-atlas/llm/database/schema.sql",
);

/** Load the SQLite schema file colocated with this database pipeline. */
async function loadSchemaSql(): Promise<string> {
	try {
		return await readFile(SCHEMA_SQL_PATH, "utf-8");
	} catch (error) {
		if ((error as { code?: string }).code !== "ENOENT") {
			throw error;
		}
		return readFile(new URL("./schema.sql", import.meta.url), "utf-8");
	}
}

/** Remove a SQLite database file and its sidecar files. */
export async function removeDatabaseFiles(path: string): Promise<void> {
	await Promise.all([
		rm(path, { force: true }),
		rm(`${path}-shm`, { force: true }),
		rm(`${path}-wal`, { force: true }),
	]);
}

/** Open the SQLite database and ensure the checked-in schema exists. */
export async function openDatabase(outputPath: string): Promise<DatabaseSync> {
	await mkdir(dirname(outputPath), { recursive: true });
	const db = new DatabaseSync(outputPath);
	const schemaSql = await loadSchemaSql();
	db.exec(schemaSql);
	ensureSchemaColumns(db, schemaSql);
	return db;
}

function tableColumns(db: DatabaseSync, table: string): Set<string> {
	return new Set(
		db
			.prepare(`PRAGMA table_info(${table})`)
			.all()
			.flatMap((row) => (typeof row.name === "string" ? [row.name] : [])),
	);
}

function ensureSchemaColumns(db: DatabaseSync, schemaSql: string): void {
	for (const [table, columns] of schemaTableColumns(schemaSql)) {
		const existingColumns = tableColumns(db, table);
		for (const [column, type] of columns) {
			if (!existingColumns.has(column)) {
				db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
			}
		}
	}
}

function schemaTableColumns(
	schemaSql: string,
): Map<string, [string, string][]> {
	const tables = new Map<string, [string, string][]>();
	const tableRegex = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g;
	for (const tableMatch of schemaSql.matchAll(tableRegex)) {
		const table = tableMatch[1];
		const body = tableMatch[2];
		if (table == null || body == null) {
			continue;
		}
		const columns: [string, string][] = [];
		for (const rawLine of body.split("\n")) {
			const line = rawLine.trim().replace(/,$/, "");
			if (
				line.length === 0 ||
				line.startsWith("PRIMARY KEY") ||
				line.startsWith("FOREIGN KEY")
			) {
				continue;
			}
			const [column, type] = line.split(/\s+/, 2);
			if (column != null && type != null) {
				columns.push([column, type]);
			}
		}
		tables.set(table, columns);
	}
	return tables;
}
