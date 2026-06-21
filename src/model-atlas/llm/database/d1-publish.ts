/** Cloudflare D1 publishing via Wrangler import. */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../../constants";
import { preserveHighSignalSnapshotModels } from "../stats/snapshot-preservation";
import type { LlmStatsModel } from "../stats/types";
import { buildModelAtlasDatabase } from "./build";
import {
	ensureModelAtlasD1Schema,
	type ModelAtlasD1Config,
	modelAtlasD1Config,
	modelAtlasD1MissingEnvironment,
	readD1ModelAtlasPayload,
} from "./d1";
import { readModelAtlasDatabasePayload } from "./payload";
import { loadSchemaSql, schemaTableColumns } from "./schema";
import { DEFAULT_DATABASE_PATH } from "./types";
import { insertProcessedModelRows } from "./writers";

const DEFAULT_IMPORT_SQL_PATH = resolve(".cache/d1-publish.sql");
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;

export type D1PublishResult = {
	storage: "cloudflare_d1";
	database_id: string;
	run_id: number;
	model_count: number;
	fetched_at_epoch_seconds: number | null;
	import_sql_path: string;
	verification: {
		counts: Record<string, number>;
		deep_swe_versions: Record<string, unknown>[];
	};
};

export async function publishModelAtlasD1(): Promise<D1PublishResult> {
	const config = modelAtlasD1Config();
	if (config == null) {
		throw new Error(
			`Cloudflare D1 is not configured. Missing ${modelAtlasD1MissingEnvironment().join(", ")}.`,
		);
	}
	const database = await buildModelAtlasDatabase(DEFAULT_DATABASE_PATH, {
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
	});
	const payload = await preservedPayload(database.path);
	await ensureModelAtlasD1Schema();
	await writeD1ImportSql(database.path, DEFAULT_IMPORT_SQL_PATH);
	runWranglerD1Import(config, DEFAULT_IMPORT_SQL_PATH);
	const verification = await d1Verification(config, database.run_id);
	return {
		storage: "cloudflare_d1",
		database_id: config.databaseId,
		run_id: database.run_id,
		model_count: payload.models.length,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds ?? null,
		import_sql_path: DEFAULT_IMPORT_SQL_PATH,
		verification,
	};
}

async function preservedPayload(databasePath: string) {
	const refreshedPayload = readModelAtlasDatabasePayload(databasePath);
	const previousPayload = await readD1ModelAtlasPayload().catch(() => null);
	const payload = preserveHighSignalSnapshotModels(
		refreshedPayload,
		previousPayload,
		STAGE_CONFIG.snapshotPreservation,
		STAGE_CONFIG.scoring,
	);
	if (payload !== refreshedPayload) {
		rewriteFinalModelRows(databasePath, payload.models);
	}
	return payload;
}

function rewriteFinalModelRows(
	databasePath: string,
	models: LlmStatsModel[],
): void {
	const db = new DatabaseSync(databasePath);
	try {
		const row = db
			.prepare(
				"SELECT id FROM pipeline_runs WHERE completed_at_epoch_seconds IS NOT NULL ORDER BY id DESC LIMIT 1",
			)
			.get() as { id?: number | bigint } | undefined;
		const runId = Number(row?.id);
		if (!Number.isFinite(runId)) {
			throw new Error("No completed Model Atlas database run exists");
		}
		db.exec("BEGIN");
		try {
			db.prepare(
				"DELETE FROM processed_models WHERE run_id = ? AND stage = 'final'",
			).run(runId);
			insertProcessedModelRows(db, runId, "final", models);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		db.close();
	}
}

async function writeD1ImportSql(
	databasePath: string,
	outputPath: string,
): Promise<void> {
	await mkdir(dirname(outputPath), { recursive: true });
	const schemaSql = await loadSchemaSql();
	const tables = [...schemaTableColumns(schemaSql).keys()];
	const db = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const run = latestCompletedRun(db);
		const runScopedTables = tables.filter((table) => table !== "pipeline_runs");
		const statements = [
			...runScopedTables.map(
				(table) =>
					`DELETE FROM ${quoteIdentifier(table)} WHERE run_id = ${sqlLiteral(run.id)};`,
			),
			`DELETE FROM pipeline_runs WHERE id = ${sqlLiteral(run.id)};`,
			pipelineRunInsertStatement(run),
			...runScopedTables.flatMap((table) =>
				runScopedTableInsertStatements(db, table, run.id),
			),
			`UPDATE pipeline_runs SET completed_at_epoch_seconds = ${sqlLiteral(run.completedAt)} WHERE id = ${sqlLiteral(run.id)};`,
			...runScopedTables.map(
				(table) =>
					`DELETE FROM ${quoteIdentifier(table)} WHERE run_id != ${sqlLiteral(run.id)};`,
			),
			`DELETE FROM pipeline_runs WHERE id != ${sqlLiteral(run.id)};`,
			"",
		];
		await writeFile(outputPath, statements.join("\n"), "utf-8");
	} finally {
		db.close();
	}
}

function latestCompletedRun(db: DatabaseSync): {
	id: number;
	startedAt: number;
	completedAt: number;
	matchedRows: number | null;
	enrichedRows: number | null;
	finalModels: number | null;
} {
	const row = db
		.prepare(
			`
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
		`,
		)
		.get() as Record<string, unknown> | undefined;
	const id = finiteNumberOrNull(row?.id);
	const startedAt = finiteNumberOrNull(row?.started_at_epoch_seconds);
	const completedAt = finiteNumberOrNull(row?.completed_at_epoch_seconds);
	if (id == null || startedAt == null || completedAt == null) {
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

function pipelineRunInsertStatement(
	run: ReturnType<typeof latestCompletedRun>,
): string {
	return `
		INSERT INTO pipeline_runs (
			id,
			started_at_epoch_seconds,
			completed_at_epoch_seconds,
			matched_row_count,
			enriched_row_count,
			final_model_count
		) VALUES (
			${sqlLiteral(run.id)},
			${sqlLiteral(run.startedAt)},
			NULL,
			${sqlLiteral(run.matchedRows)},
			${sqlLiteral(run.enrichedRows)},
			${sqlLiteral(run.finalModels)}
		);
	`
		.replace(/\s+/g, " ")
		.trim();
}

function runScopedTableInsertStatements(
	db: DatabaseSync,
	table: string,
	runId: number,
): string[] {
	const columns = tableColumns(db, table);
	const rows = db
		.prepare(
			`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)} WHERE run_id = ? ORDER BY row_index`,
		)
		.all(runId);
	return insertStatements(table, columns, rows);
}

function tableColumns(db: DatabaseSync, table: string): string[] {
	return db
		.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
		.all()
		.flatMap((row) =>
			typeof row.name === "string" && row.name.length > 0 ? [row.name] : [],
		);
}

function insertStatements(
	table: string,
	columns: string[],
	rows: Record<string, unknown>[],
): string[] {
	const prefix = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES `;
	const statements: string[] = [];
	let chunk: string[] = [];
	let chunkLength = prefix.length + 1;
	for (const row of rows) {
		const valueSql = `(${columns.map((column) => sqlLiteral(row[column])).join(", ")})`;
		const nextLength =
			chunkLength + valueSql.length + (chunk.length > 0 ? 2 : 0);
		if (
			chunk.length > 0 &&
			(chunk.length >= INSERT_ROWS_PER_STATEMENT ||
				nextLength > MAX_INSERT_STATEMENT_CHARS)
		) {
			statements.push(`${prefix}${chunk.join(", ")};`);
			chunk = [];
			chunkLength = prefix.length + 1;
		}
		chunk.push(valueSql);
		chunkLength += valueSql.length + (chunk.length > 1 ? 2 : 0);
	}
	if (chunk.length > 0) {
		statements.push(`${prefix}${chunk.join(", ")};`);
	}
	return statements;
}

function sqlLiteral(value: unknown): string {
	if (value == null) {
		return "NULL";
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : "NULL";
	}
	if (typeof value === "bigint") {
		return String(value);
	}
	return `'${String(value).replaceAll("'", "''")}'`;
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

function runWranglerD1Import(
	config: ModelAtlasD1Config,
	filePath: string,
): void {
	const result = spawnSync(
		"pnpm",
		[
			"exec",
			"wrangler",
			"d1",
			"execute",
			config.databaseId,
			"--remote",
			"--file",
			filePath,
			"--yes",
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			encoding: "utf-8",
			env: {
				...process.env,
				CLOUDFLARE_ACCOUNT_ID: config.accountId,
				CLOUDFLARE_API_TOKEN: config.apiToken,
			},
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`Wrangler D1 import failed.\n${result.stderr || result.stdout}`,
		);
	}
}

async function d1Verification(
	config: ModelAtlasD1Config,
	runId: number,
): Promise<D1PublishResult["verification"]> {
	const tables = [
		"aa_raw_models",
		"models_dev_raw_models",
		"deep_swe_raw_rows",
		"processed_models",
		"source_row_states",
	];
	const counts = Object.fromEntries(
		await Promise.all(
			tables.map(async (table) => [
				table,
				Number(
					(
						await d1Query(
							config,
							`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE run_id = ?`,
							[runId],
						)
					)[0]?.count,
				),
			]),
		),
	);
	const deepSweVersions = await d1Query(
		config,
		`SELECT source_version, COUNT(*) AS count FROM deep_swe_raw_rows WHERE run_id = ? GROUP BY source_version ORDER BY source_version`,
		[runId],
	);
	return { counts, deep_swe_versions: deepSweVersions };
}

async function d1Query(
	config: ModelAtlasD1Config,
	sql: string,
	params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
	const response = await fetch(
		`${config.apiBaseUrl}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ sql, params }),
		},
	);
	const body = (await response.json()) as {
		success?: boolean;
		errors?: { message?: string }[];
		result?: { success?: boolean; results?: Record<string, unknown>[] }[];
	};
	if (
		!response.ok ||
		body.success === false ||
		body.result?.[0]?.success === false
	) {
		throw new Error(
			`Cloudflare D1 verification failed: ${body.errors?.map((error) => error.message).join("; ") ?? response.statusText}`,
		);
	}
	return body.result?.[0]?.results ?? [];
}

function finiteNumberOrNull(value: unknown): number | null {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : null;
}
