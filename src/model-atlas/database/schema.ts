/** Local SQLite schema loading, lifecycle, and atomic reconciliation. */

import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	catalogTableMatchesSchema,
	quoteIdentifier,
	SCHEMA_MANIFEST_TABLE,
	type SchemaCatalogRow,
	type SchemaManifestRow,
	schemaReconciliationPlan,
	schemaStatements,
} from "./schema-reconciliation";

const SCHEMA_SQL_PATH = resolve(
	process.cwd(),
	"src/model-atlas/database/schema.sql",
);

/** Schema loading prefers the source tree but falls back to the module URL for packaged CLIs. */
export async function loadSchemaSql(): Promise<string> {
	let schemaSql: string;
	try {
		schemaSql = await readFile(SCHEMA_SQL_PATH, "utf-8");
	} catch (error) {
		if ((error as { code?: string }).code !== "ENOENT") {
			throw error;
		}
		schemaSql = await readFile(
			new URL("./schema.sql", import.meta.url),
			"utf-8",
		);
	}
	return `${schemaSql.trim()}\n`;
}

/** Remove a SQLite database file and its sidecar files. */
export async function removeDatabaseFiles(path: string): Promise<void> {
	await Promise.all([
		rm(path, { force: true }),
		rm(`${path}-shm`, { force: true }),
		rm(`${path}-wal`, { force: true }),
	]);
}

/** Opening a local snapshot applies the same keyed schema reconciliation used by D1. */
export async function openDatabase(outputPath: string): Promise<DatabaseSync> {
	await mkdir(dirname(outputPath), { recursive: true });
	const db = new DatabaseSync(outputPath);
	try {
		const schemaSql = await loadSchemaSql();
		for (const statement of schemaStatements(schemaSql).filter((sql) =>
			/^PRAGMA\b/i.test(sql),
		)) {
			db.exec(statement);
		}
		const catalogRows = db
			.prepare(
				"SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index')",
			)
			.all() as SchemaCatalogRow[];
		const manifestRows = readLocalSchemaManifest(db, schemaSql, catalogRows);
		const plan = schemaReconciliationPlan(schemaSql, catalogRows, manifestRows);
		if (plan.statements.length > 0) {
			db.exec("BEGIN");
			try {
				for (const statement of plan.statements) {
					db.exec(statement);
				}
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

/** Missing or drifted manifest metadata is rebuilt without being trusted for obsolete-object deletion. */
function readLocalSchemaManifest(
	db: DatabaseSync,
	schemaSql: string,
	catalogRows: readonly SchemaCatalogRow[],
): SchemaManifestRow[] {
	if (
		!catalogTableMatchesSchema(catalogRows, schemaSql, SCHEMA_MANIFEST_TABLE)
	) {
		return [];
	}
	return db
		.prepare(
			`SELECT object_type, object_name FROM ${quoteIdentifier(SCHEMA_MANIFEST_TABLE)}`,
		)
		.all() as SchemaManifestRow[];
}
