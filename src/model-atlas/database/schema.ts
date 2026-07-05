/** Shared database schema introspection for Model Atlas. */

import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_SQL_PATH = resolve(
	process.cwd(),
	"src/model-atlas/database/schema.sql",
);

/** Load the SQLite schema file colocated with this database pipeline. */
export async function loadSchemaSql(): Promise<string> {
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
	replaceSchemaTablesOnDrift(db, schemaSql);
	db.exec(schemaSql);
	return db;
}

export type SchemaColumnShape = {
	type: string;
	notNull: boolean;
	primaryKey: number;
};

export function quoteIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
	return `"${value}"`;
}

function tableColumns(
	db: DatabaseSync,
	table: string,
): Map<string, SchemaColumnShape> {
	return new Map(
		db
			.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
			.all()
			.flatMap((row) => {
				if (typeof row.name !== "string") {
					return [];
				}
				return [
					[
						row.name,
						{
							type: typeof row.type === "string" ? row.type.toUpperCase() : "",
							notNull: row.notnull === 1,
							primaryKey: typeof row.pk === "number" ? row.pk : 0,
						},
					] satisfies [string, SchemaColumnShape],
				];
			}),
	);
}

export function schemaTableMatches(
	existingColumns: Map<string, SchemaColumnShape>,
	expectedColumns: Map<string, SchemaColumnShape>,
): boolean {
	if (existingColumns.size !== expectedColumns.size) {
		return false;
	}
	for (const [column, expected] of expectedColumns) {
		const existingColumn = existingColumns.get(column);
		if (
			existingColumn == null ||
			existingColumn.type !== expected.type ||
			existingColumn.notNull !== expected.notNull ||
			existingColumn.primaryKey !== expected.primaryKey
		) {
			return false;
		}
	}
	return true;
}

/** Replace the snapshot database when any existing schema-owned table drifts from the checked-in schema. */
function replaceSchemaTablesOnDrift(db: DatabaseSync, schemaSql: string): void {
	const schemaTables = schemaTableShapes(schemaSql);
	const hasDrift = [...schemaTables].some(([table, columns]) => {
		const existingColumns = tableColumns(db, table);
		if (existingColumns.size === 0) {
			return false;
		}
		return !schemaTableMatches(existingColumns, columns);
	});
	if (!hasDrift) {
		return;
	}
	for (const table of schemaTables.keys()) {
		db.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`).run();
	}
}

function schemaTableBodies(schemaSql: string): Map<string, string> {
	const tables = new Map<string, string>();
	const tableRegex = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g;
	for (const tableMatch of schemaSql.matchAll(tableRegex)) {
		const table = tableMatch[1];
		const body = tableMatch[2];
		if (table != null && body != null) {
			tables.set(table, body);
		}
	}
	return tables;
}

function schemaTableLines(body: string): string[] {
	return body
		.split("\n")
		.map((rawLine) => rawLine.trim().replace(/,$/, ""))
		.filter((line) => line.length > 0);
}

function primaryKeyColumns(lines: readonly string[]): string[] {
	for (const line of lines) {
		const match = /^PRIMARY\s+KEY\s+\(([^)]+)\)$/i.exec(line);
		if (match?.[1] == null) {
			continue;
		}
		return match[1].split(",").map((column) => column.trim());
	}
	return [];
}

function schemaColumnEntries(body: string): [string, string][] {
	return schemaTableLines(body).flatMap((line) => {
		if (line.startsWith("PRIMARY KEY") || line.startsWith("FOREIGN KEY")) {
			return [];
		}
		const columnMatch = /^(\w+)\s+(.+)$/.exec(line);
		const column = columnMatch?.[1];
		const definition = columnMatch?.[2];
		return column != null && definition != null ? [[column, definition]] : [];
	});
}

export function schemaTableShapes(
	schemaSql: string,
): Map<string, Map<string, SchemaColumnShape>> {
	const tables = new Map<string, Map<string, SchemaColumnShape>>();
	for (const [table, body] of schemaTableBodies(schemaSql)) {
		const primaryColumns = primaryKeyColumns(schemaTableLines(body));
		const columns = new Map<string, SchemaColumnShape>();
		for (const [column, definition] of schemaColumnEntries(body)) {
			const primaryKeyIndex = primaryColumns.indexOf(column);
			columns.set(column, {
				type: definition.split(/\s+/, 1)[0]?.toUpperCase() ?? "",
				notNull: /\bNOT\s+NULL\b/i.test(definition),
				primaryKey:
					primaryKeyIndex >= 0
						? primaryKeyIndex + 1
						: /\bPRIMARY\s+KEY\b/i.test(definition)
							? 1
							: 0,
			});
		}
		tables.set(table, columns);
	}
	return tables;
}

export function schemaTableColumns(
	schemaSql: string,
): Map<string, [string, string][]> {
	return new Map(
		[...schemaTableBodies(schemaSql)].map(([table, body]) => [
			table,
			schemaColumnEntries(body),
		]),
	);
}
