/** Cloudflare D1 persistence for the Model Atlas SQLite schema. */

import { DatabaseSync } from "node:sqlite";

import type { LlmStatsPayload } from "../stats/types";
import {
	buildModelAtlasPayloadFromRows,
	type ModelAtlasPayloadRows,
} from "./payload";
import { loadSchemaSql, schemaTableColumns, schemaTableNames } from "./schema";

type D1Value = string | number | null;
type D1Rows = Record<string, unknown>[];

type D1Config = {
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
const D1_PARAM_LIMIT = 750;
const COMPLETED_RUNS_TO_RETAIN = 3;

function d1Config(): D1Config | null {
	const accountId =
		process.env.MODEL_ATLAS_D1_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
	const databaseId =
		process.env.MODEL_ATLAS_D1_DATABASE_ID ??
		process.env.CLOUDFLARE_D1_DATABASE_ID;
	const apiToken =
		process.env.MODEL_ATLAS_D1_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
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

export function modelAtlasD1Configured(): boolean {
	return d1Config() != null;
}

export function modelAtlasD1MissingEnvironment(): string[] {
	const missing: string[] = [];
	if (
		!process.env.MODEL_ATLAS_D1_ACCOUNT_ID &&
		!process.env.CLOUDFLARE_ACCOUNT_ID
	) {
		missing.push("MODEL_ATLAS_D1_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID");
	}
	if (
		!process.env.MODEL_ATLAS_D1_DATABASE_ID &&
		!process.env.CLOUDFLARE_D1_DATABASE_ID
	) {
		missing.push("MODEL_ATLAS_D1_DATABASE_ID or CLOUDFLARE_D1_DATABASE_ID");
	}
	if (
		!process.env.MODEL_ATLAS_D1_API_TOKEN &&
		!process.env.CLOUDFLARE_API_TOKEN
	) {
		missing.push("MODEL_ATLAS_D1_API_TOKEN or CLOUDFLARE_API_TOKEN");
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

async function queryD1(
	sql: string,
	params: D1Value[] = [],
): Promise<D1QueryResult> {
	const config = d1Config();
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

async function allD1(sql: string, params: D1Value[] = []): Promise<D1Rows> {
	return resultRows(await queryD1(sql, params));
}

function assertIdentifier(value: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
}

function quoteIdentifier(value: string): string {
	assertIdentifier(value);
	return `"${value}"`;
}

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

async function ensureD1Schema(): Promise<string[]> {
	const schemaSql = await loadSchemaSql();
	for (const statement of splitSqlStatements(schemaSql)) {
		await queryD1(statement);
	}
	await ensureD1SchemaColumns(schemaSql);
	return schemaTableNames(schemaSql);
}

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

function localLatestRun(db: DatabaseSync): {
	id: number;
	startedAt: number;
	completedAt: number;
	matchedRows: number | null;
	enrichedRows: number | null;
	finalModels: number | null;
} {
	const row = db
		.prepare(`
			SELECT
				id,
				started_at_epoch_seconds,
				completed_at_epoch_seconds,
				matched_row_count,
				enriched_row_count,
				final_model_count
			FROM pipeline_runs
			WHERE completed_at_epoch_seconds IS NOT NULL
			ORDER BY id DESC
			LIMIT 1
		`)
		.get() as Record<string, unknown> | undefined;
	const id = Number(row?.id);
	const startedAt = Number(row?.started_at_epoch_seconds);
	const completedAt = Number(row?.completed_at_epoch_seconds);
	if (
		!Number.isFinite(id) ||
		!Number.isFinite(startedAt) ||
		!Number.isFinite(completedAt)
	) {
		throw new Error("No completed Model Atlas SQLite run exists to publish");
	}
	return {
		id,
		startedAt,
		completedAt,
		matchedRows: finiteNumberOrNull(row?.matched_row_count),
		enrichedRows: finiteNumberOrNull(row?.enriched_row_count),
		finalModels: finiteNumberOrNull(row?.final_model_count),
	};
}

function finiteNumberOrNull(value: unknown): number | null {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : null;
}

function tableColumns(db: DatabaseSync, table: string): string[] {
	return db
		.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
		.all()
		.flatMap((row) =>
			typeof row.name === "string" && row.name.length > 0 ? [row.name] : [],
		);
}

function tableRows(db: DatabaseSync, table: string, runId: number): D1Rows {
	return db
		.prepare(
			`SELECT * FROM ${quoteIdentifier(table)} WHERE run_id = ? ORDER BY row_index`,
		)
		.all(runId) as D1Rows;
}

function insertSql(table: string, columns: string[], rowCount: number): string {
	const columnList = columns.map(quoteIdentifier).join(", ");
	const rowPlaceholders = `(${columns.map(() => "?").join(", ")})`;
	return `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES ${Array.from({ length: rowCount }, () => rowPlaceholders).join(", ")}`;
}

async function insertRows(
	table: string,
	columns: string[],
	rows: D1Rows,
	remoteRunId: number,
): Promise<void> {
	const rowsPerChunk = Math.max(1, Math.floor(D1_PARAM_LIMIT / columns.length));
	for (let start = 0; start < rows.length; start += rowsPerChunk) {
		const chunk = rows.slice(start, start + rowsPerChunk);
		const params = chunk.flatMap((row) =>
			columns.map((column) =>
				asD1Value(column === "run_id" ? remoteRunId : row[column]),
			),
		);
		await queryD1(insertSql(table, columns, chunk.length), params);
	}
}

function asD1Value(value: unknown): D1Value {
	if (value == null) {
		return null;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "bigint") {
		return Number(value);
	}
	return String(value);
}

async function createRemoteRun(
	localRun: ReturnType<typeof localLatestRun>,
): Promise<number> {
	const result = await queryD1(
		`
			INSERT INTO pipeline_runs (
				started_at_epoch_seconds,
				completed_at_epoch_seconds,
				matched_row_count,
				enriched_row_count,
				final_model_count
			) VALUES (?, NULL, ?, ?, ?)
		`,
		[
			localRun.startedAt,
			localRun.matchedRows,
			localRun.enrichedRows,
			localRun.finalModels,
		],
	);
	const insertedId = finiteNumberOrNull(result.meta?.last_row_id);
	if (insertedId != null) {
		return insertedId;
	}
	const rows = await allD1(
		`
			SELECT id
			FROM pipeline_runs
			WHERE started_at_epoch_seconds = ? AND completed_at_epoch_seconds IS NULL
			ORDER BY id DESC
			LIMIT 1
		`,
		[localRun.startedAt],
	);
	const id = finiteNumberOrNull(rows[0]?.id);
	if (id == null) {
		throw new Error("Unable to determine the new Cloudflare D1 run id");
	}
	return id;
}

async function completeRemoteRun(
	remoteRunId: number,
	completedAt: number,
): Promise<void> {
	await queryD1(
		"UPDATE pipeline_runs SET completed_at_epoch_seconds = ? WHERE id = ?",
		[completedAt, remoteRunId],
	);
}

async function deleteRemoteRun(
	tables: string[],
	remoteRunId: number,
): Promise<void> {
	for (const table of tables) {
		await queryD1(`DELETE FROM ${quoteIdentifier(table)} WHERE run_id = ?`, [
			remoteRunId,
		]);
	}
	await queryD1("DELETE FROM pipeline_runs WHERE id = ?", [remoteRunId]);
}

async function pruneOldRuns(
	tables: string[],
	retainCompletedRuns: number,
): Promise<void> {
	const rows = await allD1(
		"SELECT id FROM pipeline_runs WHERE completed_at_epoch_seconds IS NOT NULL ORDER BY id DESC",
	);
	const staleRunIds = rows.slice(retainCompletedRuns).flatMap((row) => {
		const id = finiteNumberOrNull(row.id);
		return id == null ? [] : [id];
	});
	for (const runId of staleRunIds) {
		await deleteRemoteRun(tables, runId);
	}
}

export async function publishSqliteDatabaseToD1(
	databasePath: string,
	retainCompletedRuns = COMPLETED_RUNS_TO_RETAIN,
): Promise<{ databaseId: string; runId: number }> {
	const schemaTables = await ensureD1Schema();
	const runScopedTables = schemaTables.filter(
		(table) => table !== "pipeline_runs",
	);
	const db = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const localRun = localLatestRun(db);
		const remoteRunId = await createRemoteRun(localRun);
		try {
			for (const table of runScopedTables) {
				const columns = tableColumns(db, table);
				const rows = tableRows(db, table, localRun.id);
				if (rows.length > 0) {
					await insertRows(table, columns, rows, remoteRunId);
				}
			}
			await completeRemoteRun(remoteRunId, localRun.completedAt);
		} catch (error) {
			await deleteRemoteRun(runScopedTables, remoteRunId);
			throw error;
		}
		await pruneOldRuns(runScopedTables, retainCompletedRuns);
		return {
			databaseId: d1Config()?.databaseId ?? "",
			runId: remoteRunId,
		};
	} finally {
		db.close();
	}
}

export async function readD1ModelAtlasPayload(): Promise<LlmStatsPayload | null> {
	if (!modelAtlasD1Configured()) {
		return null;
	}
	const runRows = await allD1(`
		SELECT id, completed_at_epoch_seconds AS fetched_at_epoch_seconds
		FROM pipeline_runs
		WHERE completed_at_epoch_seconds IS NOT NULL
		ORDER BY id DESC
		LIMIT 1
	`);
	const runId = finiteNumberOrNull(runRows[0]?.id);
	if (runId == null) {
		return null;
	}
	const fetchedAt = finiteNumberOrNull(runRows[0]?.fetched_at_epoch_seconds);
	const [modelRows, sourceHealthRows, aaRows, browseCompRows, deepSWERows] =
		await Promise.all([
			allD1(
				"SELECT * FROM processed_models WHERE run_id = ? AND stage = 'final' ORDER BY row_index",
				[runId],
			),
			allD1("SELECT * FROM source_health WHERE run_id = ? ORDER BY row_index", [
				runId,
			]),
			allD1("SELECT * FROM aa_raw_models WHERE run_id = ? ORDER BY row_index", [
				runId,
			]),
			allD1(
				"SELECT * FROM browsecomp_raw_rows WHERE run_id = ? ORDER BY row_index",
				[runId],
			),
			allD1(
				"SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY pass_at_1 DESC, row_index",
				[runId],
			),
		]);
	const rows: ModelAtlasPayloadRows = {
		run: {
			id: runId,
			fetchedAt,
		},
		modelRows,
		sourceHealthRows,
		aaRows,
		browseCompRows,
		deepSWERows,
	};
	return buildModelAtlasPayloadFromRows(rows);
}
