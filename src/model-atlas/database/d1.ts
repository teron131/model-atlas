/** Cloudflare D1 reads and schema management for the Model Atlas SQLite schema. */

import type { LlmStatsPayload } from "../stats/types";
import {
	buildPayloadFromRows,
	COMPLETED_RUN_SQL,
	payloadRunFromRow,
	readPayloadRows,
} from "./payload";
import {
	loadSchemaSql,
	quoteIdentifier,
	type SchemaColumnShape,
	schemaTableMatches,
	schemaTableShapes,
} from "./schema";

export type D1Value = string | number | null;
export type D1Rows = Record<string, unknown>[];

export type D1Config = {
	accountId: string;
	databaseId: string;
	apiToken: string;
	apiBaseUrl: string;
};

type D1QueryResult = {
	success?: boolean;
	meta?: {
		last_row_id?: number;
	};
	results?: D1Rows | { columns?: string[]; rows?: unknown[][] };
};

type D1ApiResponse = {
	success?: boolean;
	errors?: { message?: string }[];
	result?: D1QueryResult[];
};

const DEFAULT_API_BASE_URL = "https://api.cloudflare.com/client/v4";

/** Reads Cloudflare D1 connection settings from the runtime environment. */
export function d1Config(): D1Config | null {
	const accountId = process.env.D1_ACCOUNT_ID;
	const databaseId = process.env.D1_DATABASE_ID;
	const apiToken = process.env.D1_API_TOKEN;
	if (!accountId || !databaseId || !apiToken) {
		return null;
	}
	return {
		accountId,
		databaseId,
		apiToken,
		apiBaseUrl: process.env.CLOUDFLARE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
	};
}

/** Reports whether all required D1 environment variables are present. */
export function d1Configured(): boolean {
	return d1Config() != null;
}

/** Lists the D1 environment variables missing from the current runtime. */
export function missingD1Environment(): string[] {
	const missing: string[] = [];
	if (!process.env.D1_ACCOUNT_ID) {
		missing.push("D1_ACCOUNT_ID");
	}
	if (!process.env.D1_DATABASE_ID) {
		missing.push("D1_DATABASE_ID");
	}
	if (!process.env.D1_API_TOKEN) {
		missing.push("D1_API_TOKEN");
	}
	return missing;
}

/** Builds the Cloudflare D1 REST endpoint for the requested operation. */
function d1Endpoint(config: D1Config, path: "query"): string {
	return `${config.apiBaseUrl}/accounts/${config.accountId}/d1/database/${config.databaseId}/${path}`;
}

/** Converts Cloudflare D1 error payloads into a single thrown error. */
function d1Error(response: D1ApiResponse): Error {
	const messages = response.errors
		?.map((error) => error.message)
		.filter((message): message is string => Boolean(message));
	return new Error(
		`Cloudflare D1 query failed${messages?.length ? `: ${messages.join("; ")}` : ""}`,
	);
}

function resultRows(result: D1QueryResult | undefined): D1Rows {
	if (result?.results == null) {
		return [];
	}
	if (Array.isArray(result.results)) {
		return result.results;
	}
	const columns = result.results.columns ?? [];
	return (result.results.rows ?? []).map((row) =>
		Object.fromEntries(columns.map((column, index) => [column, row[index]])),
	);
}

/** Sends a parameterized SQL query to Cloudflare D1. */
export async function queryD1(
	sql: string,
	params: D1Value[] = [],
): Promise<D1QueryResult> {
	const config = d1Config();
	if (config == null) {
		throw new Error(
			`Cloudflare D1 is not configured. Missing ${missingD1Environment().join(", ")}.`,
		);
	}
	const response = await fetch(d1Endpoint(config, "query"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ sql, params }),
	});
	const payload = (await response.json()) as D1ApiResponse;
	if (!response.ok || payload.success === false) {
		throw d1Error(payload);
	}
	const result = payload.result?.[0];
	if (result?.success === false) {
		throw d1Error(payload);
	}
	return result ?? {};
}

/** Returns row objects from a Cloudflare D1 SQL query. */
export async function queryD1Rows(
	sql: string,
	params: D1Value[] = [],
): Promise<D1Rows> {
	return resultRows(await queryD1(sql, params));
}

/** Splits the shared schema SQL into D1-compatible statements. */
function splitSqlStatements(sql: string): string[] {
	return sql
		.split(";")
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0)
		.filter(
			(statement) =>
				!/^PRAGMA\s+journal_mode\b/i.test(statement) &&
				!/^PRAGMA\s+synchronous\b/i.test(statement),
		);
}

/** Applies the shared Model Atlas schema to Cloudflare D1. */
export async function ensureD1Schema(): Promise<string[]> {
	const schemaSql = await loadSchemaSql();
	await replaceD1SchemaOnDrift(schemaSql);
	const statements = splitSqlStatements(schemaSql);
	for (const statement of statements.filter(
		(statement) => !/^CREATE\s+INDEX\b/i.test(statement),
	)) {
		await queryD1(statement);
	}
	for (const statement of statements.filter((statement) =>
		/^CREATE\s+INDEX\b/i.test(statement),
	)) {
		await queryD1(statement);
	}
	return [...schemaTableShapes(schemaSql).keys()];
}

async function d1TableColumns(
	table: string,
): Promise<Map<string, SchemaColumnShape>> {
	return new Map(
		(
			await queryD1Rows(`PRAGMA table_info(${quoteIdentifier(table)})`).catch(
				() => [],
			)
		).flatMap((row) => {
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

/** Replace D1 snapshot tables when any existing table drifts from the shared schema. */
async function replaceD1SchemaOnDrift(schemaSql: string): Promise<void> {
	const schemaTables = schemaTableShapes(schemaSql);
	const tableEntries = [...schemaTables];
	const driftChecks = await Promise.all(
		tableEntries.map(async ([table, columns]) => {
			const existingColumns = await d1TableColumns(table);
			return (
				existingColumns.size > 0 &&
				!schemaTableMatches(existingColumns, columns)
			);
		}),
	);
	if (!driftChecks.some(Boolean)) {
		return;
	}
	for (const table of schemaTables.keys()) {
		await queryD1(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
	}
}

/** Reads the latest completed Model Atlas payload from D1. */
export async function readD1Payload(): Promise<LlmStatsPayload | null> {
	if (!d1Configured()) {
		return null;
	}
	const run = payloadRunFromRow((await queryD1Rows(COMPLETED_RUN_SQL))[0]);
	if (run == null) {
		return null;
	}
	return buildPayloadFromRows(
		await readPayloadRows(run, (rowGroup, runId) =>
			queryD1Rows(rowGroup.sql, [runId]),
		),
	);
}
