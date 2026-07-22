/** Pure schema parsing and reconciliation for SQLite and D1 catalogs. */

export const SCHEMA_MANIFEST_TABLE = "model_atlas_schema_manifest";

type SchemaColumnShape = {
	type: string;
	notNull: boolean;
	primaryKey: number;
};

export type SchemaCatalogRow = {
	type?: unknown;
	name?: unknown;
	sql?: unknown;
};

export type SchemaManifestRow = {
	object_type?: unknown;
	object_name?: unknown;
};

export type SchemaReconciliationPlan = {
	statements: string[];
	changedTables: string[];
	removedTables: string[];
	changedIndexes: string[];
	removedIndexes: string[];
};

type SchemaIndexDefinition = {
	table: string;
	sql: string;
};

export function quoteIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
	return `"${value}"`;
}

function schemaTableMatches(
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

/** Builds an atomic reconciliation that preserves common columns only when stable primary keys still match. */
export function schemaReconciliationPlan(
	schemaSql: string,
	catalogRows: readonly SchemaCatalogRow[],
	manifestRows: readonly SchemaManifestRow[],
): SchemaReconciliationPlan {
	const expectedTableBodies = schemaTableBodies(schemaSql);
	if (!expectedTableBodies.has(SCHEMA_MANIFEST_TABLE)) {
		throw new Error(`Checked-in schema must define ${SCHEMA_MANIFEST_TABLE}`);
	}
	const expectedTableShapes = schemaTableShapes(schemaSql);
	const expectedTableColumns = schemaTableColumns(schemaSql);
	const expectedIndexes = schemaIndexDefinitions(schemaSql);
	const currentTables = catalogTableShapes(catalogRows);
	const currentTableSql = catalogTableSql(catalogRows);
	const currentIndexes = catalogIndexSql(catalogRows);
	const managedObjects = manifestObjectKeys(manifestRows);
	const expectedObjects = new Set([
		...[...expectedTableBodies.keys()].map((name) => objectKey("table", name)),
		...[...expectedIndexes.keys()].map((name) => objectKey("index", name)),
	]);
	const changedTables: string[] = [];
	const changedTableNames = new Set<string>();
	const removedTables: string[] = [];
	const changedIndexes: string[] = [];
	const removedIndexes: string[] = [];
	const statements: string[] = [];

	for (const managedObject of managedObjects) {
		if (expectedObjects.has(managedObject)) {
			continue;
		}
		const [type, name] = splitObjectKey(managedObject);
		if (type === "index") {
			statements.push(`DROP INDEX IF EXISTS ${quoteIdentifier(name)}`);
			removedIndexes.push(name);
		} else {
			statements.push(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
			removedTables.push(name);
		}
	}

	for (const [table, body] of expectedTableBodies) {
		const expectedShape = expectedTableShapes.get(table) ?? new Map();
		const existingShape = currentTables.get(table);
		if (existingShape == null) {
			statements.push(createTableSql(table, body));
			changedTables.push(table);
			changedTableNames.add(table);
			continue;
		}
		if (
			schemaTableMatches(existingShape, expectedShape) &&
			normalizeSchemaSql(currentTableSql.get(table) ?? "") ===
				normalizeSchemaSql(createTableSql(table, body))
		) {
			continue;
		}
		statements.push(
			...rebuildTableStatements(
				table,
				body,
				existingShape,
				expectedShape,
				expectedTableColumns.get(table) ?? [],
			),
		);
		changedTables.push(table);
		changedTableNames.add(table);
	}

	for (const [name, expected] of expectedIndexes) {
		const currentSql = currentIndexes.get(name);
		if (
			!changedTableNames.has(expected.table) &&
			currentSql != null &&
			normalizeSchemaSql(currentSql) === normalizeSchemaSql(expected.sql)
		) {
			continue;
		}
		statements.push(`DROP INDEX IF EXISTS ${quoteIdentifier(name)}`);
		statements.push(expected.sql);
		changedIndexes.push(name);
	}

	if (
		managedObjects.size !== expectedObjects.size ||
		[...managedObjects].some((value) => !expectedObjects.has(value))
	) {
		statements.push(`DELETE FROM ${quoteIdentifier(SCHEMA_MANIFEST_TABLE)}`);
		if (expectedObjects.size > 0) {
			statements.push(
				`INSERT INTO ${quoteIdentifier(SCHEMA_MANIFEST_TABLE)} (object_type, object_name) VALUES ${[
					...expectedObjects,
				]
					.map((key) => {
						const [type, name] = splitObjectKey(key);
						return `(${sqlStringLiteral(type)}, ${sqlStringLiteral(name)})`;
					})
					.join(", ")}`,
			);
		}
	}

	return {
		statements,
		changedTables,
		removedTables,
		changedIndexes,
		removedIndexes,
	};
}

function rebuildTableStatements(
	table: string,
	body: string,
	existingShape: Map<string, SchemaColumnShape>,
	expectedShape: Map<string, SchemaColumnShape>,
	expectedColumns: readonly [string, string][],
): string[] {
	const existingPrimaryKey = primaryKeyColumnNames(existingShape);
	const expectedPrimaryKey = primaryKeyColumnNames(expectedShape);
	if (!arraysEqual(existingPrimaryKey, expectedPrimaryKey)) {
		throw new Error(
			`Cannot automatically reconcile ${table}: primary key changed from (${existingPrimaryKey.join(", ")}) to (${expectedPrimaryKey.join(", ")})`,
		);
	}
	for (const [column, definition] of expectedColumns) {
		if (
			existingShape.has(column) ||
			!/\bNOT\s+NULL\b/i.test(definition) ||
			/\bDEFAULT\b/i.test(definition)
		) {
			continue;
		}
		throw new Error(
			`Cannot automatically reconcile ${table}: new required column ${column} needs a DEFAULT or an explicit migration`,
		);
	}
	const commonColumns = expectedColumns
		.map(([column]) => column)
		.filter((column) => existingShape.has(column));
	const nextTable = `__model_atlas_next_${table}`;
	const previousTable = `__model_atlas_previous_${table}`;
	const columnList = commonColumns.map(quoteIdentifier).join(", ");
	const valueList = commonColumns.map(quoteIdentifier).join(", ");
	return [
		`DROP TABLE IF EXISTS ${quoteIdentifier(nextTable)}`,
		`DROP TABLE IF EXISTS ${quoteIdentifier(previousTable)}`,
		createTableSql(nextTable, body),
		...(commonColumns.length === 0
			? []
			: [
					`INSERT INTO ${quoteIdentifier(nextTable)} (${columnList}) SELECT ${valueList} FROM ${quoteIdentifier(table)}`,
				]),
		`ALTER TABLE ${quoteIdentifier(table)} RENAME TO ${quoteIdentifier(previousTable)}`,
		`ALTER TABLE ${quoteIdentifier(nextTable)} RENAME TO ${quoteIdentifier(table)}`,
		`DROP TABLE ${quoteIdentifier(previousTable)}`,
	];
}

function catalogTableShapes(
	rows: readonly SchemaCatalogRow[],
): Map<string, Map<string, SchemaColumnShape>> {
	return new Map(
		rows.flatMap((row) => {
			if (
				row.type !== "table" ||
				typeof row.name !== "string" ||
				typeof row.sql !== "string"
			) {
				return [];
			}
			const shape = schemaTableShapes(row.sql).get(row.name);
			return shape == null ? [] : [[row.name, shape]];
		}),
	);
}

function catalogTableSql(
	rows: readonly SchemaCatalogRow[],
): Map<string, string> {
	return new Map(
		rows.flatMap((row) =>
			row.type === "table" &&
			typeof row.name === "string" &&
			typeof row.sql === "string"
				? [[row.name, row.sql]]
				: [],
		),
	);
}

function catalogIndexSql(
	rows: readonly SchemaCatalogRow[],
): Map<string, string> {
	return new Map(
		rows.flatMap((row) =>
			row.type === "index" &&
			typeof row.name === "string" &&
			typeof row.sql === "string"
				? [[row.name, row.sql]]
				: [],
		),
	);
}

/** A manifest is readable only when its current columns still match the checked-in manifest contract. */
export function catalogTableMatchesSchema(
	rows: readonly SchemaCatalogRow[],
	schemaSql: string,
	table: string,
): boolean {
	const currentSql = catalogTableSql(rows).get(table);
	const expectedBody = schemaTableBodies(schemaSql).get(table);
	return (
		currentSql != null &&
		expectedBody != null &&
		normalizeSchemaSql(currentSql) ===
			normalizeSchemaSql(createTableSql(table, expectedBody))
	);
}

function schemaTableBodies(schemaSql: string): Map<string, string> {
	const tables = new Map<string, string>();
	const tableRegex =
		/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s*\(([\s\S]*?)\n\s*\)\s*;?/gi;
	for (const tableMatch of schemaSql.matchAll(tableRegex)) {
		const table = tableMatch[1];
		const body = tableMatch[2];
		if (table != null && body != null) {
			tables.set(table, body);
		}
	}
	return tables;
}

function schemaTableDefinitions(body: string): string[] {
	const definitions: string[] = [];
	let start = 0;
	let depth = 0;
	let quote: "'" | '"' | "`" | null = null;
	for (let index = 0; index < body.length; index += 1) {
		const character = body[index];
		if (quote != null) {
			if (character === quote) {
				if (body[index + 1] === quote) {
					index += 1;
				} else {
					quote = null;
				}
			}
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
		} else if (character === "(") {
			depth += 1;
		} else if (character === ")") {
			depth -= 1;
		} else if (character === "," && depth === 0) {
			definitions.push(body.slice(start, index).trim());
			start = index + 1;
		}
	}
	definitions.push(body.slice(start).trim());
	return definitions.filter((definition) => definition.length > 0);
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
	return schemaTableDefinitions(body).flatMap((line) => {
		if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) {
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
		const primaryColumns = primaryKeyColumns(schemaTableDefinitions(body));
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

export function schemaStatements(schemaSql: string): string[] {
	return schemaSql
		.replace(/^\s*--.*$/gm, "")
		.split(";")
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

function schemaIndexDefinitions(
	schemaSql: string,
): Map<string, SchemaIndexDefinition> {
	return new Map(
		schemaStatements(schemaSql).flatMap((statement) => {
			const match =
				/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s+ON\s+["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/i.exec(
					statement,
				);
			const name = match?.[1];
			const table = match?.[2];
			return name != null && table != null
				? [[name, { table, sql: statement }]]
				: [];
		}),
	);
}

function createTableSql(table: string, body: string): string {
	return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (\n${body}\n)`;
}

function primaryKeyColumnNames(
	columns: Map<string, SchemaColumnShape>,
): string[] {
	return [...columns]
		.filter(([, shape]) => shape.primaryKey > 0)
		.sort(([, left], [, right]) => left.primaryKey - right.primaryKey)
		.map(([column]) => column);
}

function normalizeSchemaSql(sql: string): string {
	return sql
		.replace(/\bIF\s+NOT\s+EXISTS\b/gi, "")
		.replace(/["`]/g, "")
		.replace(/\s+/g, " ")
		.replace(/;$/, "")
		.trim()
		.toLowerCase();
}

function manifestObjectKeys(rows: readonly SchemaManifestRow[]): Set<string> {
	return new Set(
		rows.flatMap((row) =>
			(row.object_type === "table" || row.object_type === "index") &&
			typeof row.object_name === "string"
				? [objectKey(row.object_type, row.object_name)]
				: [],
		),
	);
}

function objectKey(type: "index" | "table", name: string): string {
	return `${type}:${name}`;
}

function splitObjectKey(key: string): ["index" | "table", string] {
	const separator = key.indexOf(":");
	const type = key.slice(0, separator);
	const name = key.slice(separator + 1);
	if ((type !== "table" && type !== "index") || name.length === 0) {
		throw new Error(`Invalid managed schema object: ${key}`);
	}
	return [type, name];
}

function sqlStringLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function arraysEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
