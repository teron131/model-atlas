/** Cloudflare D1 reads and schema management for the Model Atlas SQLite schema. */

import type { LlmStatsPayload } from "../stats/types";
import {
	buildModelAtlasPayloadFromRows,
	MODEL_ATLAS_COMPLETED_RUN_SQL,
	modelAtlasPayloadRunFromRow,
	readModelAtlasPayloadRows,
} from "./payload";
import { loadSchemaSql, schemaTableColumns, schemaTableNames } from "./schema";

type D1Value = string | number | null;
type D1Rows = Record<string, unknown>[];

export type ModelAtlasD1Config = {
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
export function modelAtlasD1Config(): ModelAtlasD1Config | null {
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
export function modelAtlasD1Configured(): boolean {
	return modelAtlasD1Config() != null;
}

/** Lists the D1 environment variables missing from the current runtime. */
export function modelAtlasD1MissingEnvironment(): string[] {
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
function d1Endpoint(config: ModelAtlasD1Config, path: "query"): string {
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
async function queryD1(
	sql: string,
	params: D1Value[] = [],
): Promise<D1QueryResult> {
	const config = modelAtlasD1Config();
	if (config == null) {
		throw new Error(
			`Cloudflare D1 is not configured. Missing ${modelAtlasD1MissingEnvironment().join(", ")}.`,
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

/** Returns all row objects from a Cloudflare D1 SQL query. */
async function allD1(sql: string, params: D1Value[] = []): Promise<D1Rows> {
	return resultRows(await queryD1(sql, params));
}

function assertIdentifier(value: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
}

/** Quotes a validated SQL identifier for D1 statements. */
function quoteIdentifier(value: string): string {
	assertIdentifier(value);
	return `"${value}"`;
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
export async function ensureModelAtlasD1Schema(): Promise<string[]> {
	const schemaSql = await loadSchemaSql();
	for (const statement of splitSqlStatements(schemaSql)) {
		await queryD1(statement);
	}
	await ensureD1SchemaColumns(schemaSql);
	return schemaTableNames(schemaSql);
}

/** Adds missing schema columns when D1 is behind the shared schema. */
async function ensureD1SchemaColumns(schemaSql: string): Promise<void> {
	for (const [table, columns] of schemaTableColumns(schemaSql)) {
		const existingColumns = new Set(
			(await allD1(`PRAGMA table_info(${quoteIdentifier(table)})`)).flatMap(
				(row) => (typeof row.name === "string" ? [row.name] : []),
			),
		);
		for (const [column, type] of columns) {
			if (!existingColumns.has(column)) {
				await queryD1(
					`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${type}`,
				);
			}
		}
	}
}

/** Reads the latest completed Model Atlas payload from D1. */
export async function readD1ModelAtlasPayload(): Promise<LlmStatsPayload | null> {
	if (!modelAtlasD1Configured()) {
		return null;
	}
	const run = modelAtlasPayloadRunFromRow(
		(await allD1(MODEL_ATLAS_COMPLETED_RUN_SQL))[0],
	);
	if (run == null) {
		return null;
	}
	return buildModelAtlasPayloadFromRows(
		await readModelAtlasPayloadRows(run, (rowGroup, runId) =>
			allD1(rowGroup.sql, [runId]),
		),
	);
}
