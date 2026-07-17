/** Cloudflare D1 adapter keeps deployed reads and schema checks aligned with the SQLite snapshot contract. */

import type { LlmStatsPayload } from "../stats/types";
import {
	buildPayloadFromRows,
	buildPayloadRows,
	COMPLETED_RUN_SQL,
	PAYLOAD_ROW_GROUPS,
	payloadRunFromRow,
} from "./payload";
import {
	catalogTableMatchesSchema,
	loadSchemaSql,
	quoteIdentifier,
	SCHEMA_MANIFEST_TABLE,
	type SchemaCatalogRow,
	type SchemaManifestRow,
	type SchemaReconciliationPlan,
	schemaReconciliationPlan,
} from "./schema";

export type D1Value = string | number | null;
export type D1Rows = Record<string, unknown>[];
export type D1Query = {
	sql: string;
	params?: D1Value[];
};

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

type D1QueryBody = D1Query | { batch: D1Query[] };

const DEFAULT_API_BASE_URL = "https://api.cloudflare.com/client/v4";

/** D1 configuration is complete only when every required deployment secret is present. */
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

function d1Endpoint(config: D1Config, path: "query"): string {
	return `${config.apiBaseUrl}/accounts/${config.accountId}/d1/database/${config.databaseId}/${path}`;
}

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

async function sendD1Query(body: D1QueryBody): Promise<D1QueryResult[]> {
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
		body: JSON.stringify(body),
	});
	const payload = (await response.json()) as D1ApiResponse;
	if (!response.ok || payload.success === false) {
		throw d1Error(payload);
	}
	const results = payload.result ?? [];
	if (results.some((result) => result.success === false)) {
		throw d1Error(payload);
	}
	return results;
}

/** Sends a parameterized SQL query to Cloudflare D1. */
export async function queryD1(
	sql: string,
	params: D1Value[] = [],
): Promise<D1QueryResult> {
	return (await sendD1Query({ sql, params }))[0] ?? {};
}

/** Executes one atomic D1 batch so publication cannot expose a partial run. */
export async function queryD1Batch(
	queries: readonly D1Query[],
): Promise<D1QueryResult[]> {
	if (queries.length === 0) {
		return [];
	}
	return sendD1Query({
		batch: queries.map(({ sql, params = [] }) => ({ sql, params })),
	});
}

/** Returns row groups for several read queries in one D1 round trip. */
export async function queryD1BatchRows(
	queries: readonly D1Query[],
): Promise<D1Rows[]> {
	return (await queryD1Batch(queries)).map((result) => resultRows(result));
}

export async function queryD1Rows(
	sql: string,
	params: D1Value[] = [],
): Promise<D1Rows> {
	return resultRows(await queryD1(sql, params));
}

/** Reconciles D1 schema objects atomically while preserving rows in tables whose primary keys still match. */
export async function ensureD1Schema(): Promise<SchemaReconciliationPlan> {
	const schemaSql = await loadSchemaSql();
	const catalogRows = (await queryD1Rows(
		"SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index')",
	)) as SchemaCatalogRow[];
	let manifestRows: SchemaManifestRow[] = [];
	if (
		catalogTableMatchesSchema(catalogRows, schemaSql, SCHEMA_MANIFEST_TABLE)
	) {
		manifestRows = (await queryD1Rows(
			`SELECT object_type, object_name FROM ${quoteIdentifier(SCHEMA_MANIFEST_TABLE)}`,
		)) as SchemaManifestRow[];
	}
	const plan = schemaReconciliationPlan(schemaSql, catalogRows, manifestRows);
	await queryD1Batch(plan.statements.map((sql) => ({ sql })));
	return plan;
}

/** D1 reads only expose the latest completed run so partial imports never become public payloads. */
export async function readD1Payload(): Promise<LlmStatsPayload | null> {
	if (!d1Configured()) {
		return null;
	}
	const run = payloadRunFromRow((await queryD1Rows(COMPLETED_RUN_SQL))[0]);
	if (run == null) {
		return null;
	}
	const rowGroups = await queryD1BatchRows(
		PAYLOAD_ROW_GROUPS.map((rowGroup) =>
			rowGroup.sourceTable == null
				? { sql: rowGroup.sql, params: [run.id] }
				: {
						sql: rowGroup.sql.replace(
							"run_id = ?",
							`run_id = (SELECT MAX(run_id) FROM ${quoteIdentifier(rowGroup.sourceTable)})`,
						),
					},
		),
	);
	return buildPayloadFromRows(
		buildPayloadRows(
			run,
			PAYLOAD_ROW_GROUPS.map(
				(rowGroup, index) => [rowGroup.key, rowGroups[index] ?? []] as const,
			),
		),
	);
}
