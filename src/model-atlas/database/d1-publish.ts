/** Cloudflare D1 publishing for local scripts and deployed refresh routes. */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../constants";
import { preserveHighSignalSnapshotModels } from "../stats/snapshot-preservation";
import type { LlmStatsModel } from "../stats/types";
import { buildDatabase } from "./build";
import {
	type D1Config,
	d1Config,
	ensureD1Schema,
	missingD1Environment,
	queryD1,
	queryD1Rows,
	readD1Payload,
} from "./d1";
import { readDatabasePayload } from "./payload";
import { loadSchemaSql, schemaTableColumns } from "./schema";
import { DEFAULT_DATABASE_PATH, SNAPSHOT_TABLES } from "./types";
import { insertModelStageRows } from "./writers";

const DEFAULT_IMPORT_SQL_PATH = resolve(".cache/d1-publish.sql");
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;

export type D1ImportMode = "wrangler" | "rest";

export type D1PublishOptions = {
	databasePath?: string;
	importMode?: D1ImportMode;
	importSqlPath?: string;
};

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

/** Publishes a freshly built Model Atlas run into Cloudflare D1. */
export async function publishD1Snapshot(
	options: D1PublishOptions = {},
): Promise<D1PublishResult> {
	const config = d1Config();
	if (config == null) {
		throw new Error(
			`Cloudflare D1 is not configured. Missing ${missingD1Environment().join(", ")}.`,
		);
	}
	const database = await buildDatabase(
		options.databasePath ?? DEFAULT_DATABASE_PATH,
		{
			replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
		},
	);
	const payload = await preservedPayload(database.path);
	await ensureD1Schema();
	const publishRunId = await nextD1RunId(database.run_id);
	const importSqlPath =
		options.importSqlPath ??
		(options.importMode === "rest"
			? resolve(tmpdir(), "model-atlas/d1-publish.sql")
			: DEFAULT_IMPORT_SQL_PATH);
	const importStatements = await writeD1ImportSql(
		database.path,
		importSqlPath,
		publishRunId,
	);
	await runD1Import(
		config,
		importSqlPath,
		importStatements,
		options.importMode ?? "wrangler",
	);
	const verification = await d1Verification(publishRunId);
	return {
		storage: "cloudflare_d1",
		database_id: config.databaseId,
		run_id: publishRunId,
		model_count: payload.models.length,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds ?? null,
		import_sql_path: importSqlPath,
		verification,
	};
}

/** Publishes a freshly rebuilt runtime snapshot into Cloudflare D1 without relying on Wrangler. */
export async function refreshD1Snapshot(
	databasePath?: string,
): Promise<D1PublishResult> {
	return publishD1Snapshot({
		databasePath,
		importMode: "rest",
		importSqlPath: resolve(tmpdir(), "model-atlas/d1-publish.sql"),
	});
}

async function preservedPayload(databasePath: string) {
	const refreshedPayload = readDatabasePayload(databasePath);
	const previousPayload = await readD1Payload().catch(() => null);
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

async function nextD1RunId(localRunId: number): Promise<number> {
	const rows = await queryD1Rows(
		"SELECT COALESCE(MAX(id), 0) AS max_id FROM pipeline_runs",
	);
	const maxRemoteRunId = finiteNumberOrNull(rows[0]?.max_id) ?? 0;
	return Math.max(localRunId, maxRemoteRunId + 1);
}

/** Rewrites final model rows after snapshot preservation changes IDs. */
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
				`DELETE FROM ${SNAPSHOT_TABLES.model_stage_rows} WHERE run_id = ? AND stage = 'final'`,
			).run(runId);
			insertModelStageRows(db, runId, "final", models);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		db.close();
	}
}

/** Writes a D1 import script for one completed pipeline run. */
async function writeD1ImportSql(
	databasePath: string,
	outputPath: string,
	publishRunId: number,
): Promise<string[]> {
	await mkdir(dirname(outputPath), { recursive: true });
	const statements = await d1ImportStatements(databasePath, publishRunId);
	await writeFile(outputPath, statements.join("\n"), "utf-8");
	return statements;
}

/** Builds import statements for one completed pipeline run. */
async function d1ImportStatements(
	databasePath: string,
	publishRunId: number,
): Promise<string[]> {
	const schemaSql = await loadSchemaSql();
	const columnsByTable = schemaTableColumns(schemaSql);
	const tables = [...columnsByTable.keys()];
	const db = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const run = latestCompletedRun(db);
		const publishRun = {
			...run,
			id: publishRunId,
		};
		const runScopedTables = tables.filter((table) => table !== "pipeline_runs");
		const statements = [
			...runScopedTables.map(
				(table) =>
					`DELETE FROM ${quoteIdentifier(table)} WHERE run_id = ${sqlLiteral(publishRun.id)};`,
			),
			`DELETE FROM pipeline_runs WHERE id = ${sqlLiteral(publishRun.id)};`,
			pipelineRunInsertStatement(publishRun),
			...runScopedTables.flatMap((table) =>
				runScopedTableInsertStatements(
					db,
					table,
					columnsByTable.get(table)?.map(([column]) => column) ?? [],
					run.id,
					publishRun.id,
				),
			),
			`UPDATE pipeline_runs SET completed_at_epoch_seconds = ${sqlLiteral(publishRun.completedAt)} WHERE id = ${sqlLiteral(publishRun.id)};`,
			...runScopedTables.map(
				(table) =>
					`DELETE FROM ${quoteIdentifier(table)} WHERE run_id != ${sqlLiteral(publishRun.id)};`,
			),
			`DELETE FROM pipeline_runs WHERE id != ${sqlLiteral(publishRun.id)};`,
			"",
		];
		return statements;
	} finally {
		db.close();
	}
}

/** Finds the newest completed local pipeline run to publish. */
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

/** Builds the D1 insert statement for the pipeline run record. */
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

/** Builds D1 insert statements for tables keyed by run_id. */
function runScopedTableInsertStatements(
	db: DatabaseSync,
	table: string,
	columns: string[],
	sourceRunId: number,
	publishRunId: number,
): string[] {
	const rows = db
		.prepare(
			`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)} WHERE run_id = ? ORDER BY row_index`,
		)
		.all(sourceRunId)
		.map((row) => ({
			...row,
			run_id: publishRunId,
		}));
	return insertStatements(table, columns, rows);
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

/** Escapes JavaScript values as SQL literals for the D1 import script. */
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

/** Quotes a validated SQL identifier for import statements. */
function quoteIdentifier(value: string): string {
	assertIdentifier(value);
	return `"${value}"`;
}

/** Imports the generated SQL through the selected D1 publication mechanism. */
async function runD1Import(
	config: D1Config,
	filePath: string,
	statements: string[],
	mode: D1ImportMode,
): Promise<void> {
	if (mode === "wrangler") {
		runWranglerD1Import(config, filePath);
		return;
	}
	await runRestD1Import(statements);
}

function runWranglerD1Import(config: D1Config, filePath: string): void {
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

/** Imports the generated run into D1 through the REST API for deployed runtimes. */
async function runRestD1Import(statements: string[]): Promise<void> {
	for (const statement of statements) {
		if (statement.trim().length === 0) {
			continue;
		}
		await queryD1(statement);
	}
}

/** Verifies the remote D1 run after import completes. */
async function d1Verification(
	runId: number,
): Promise<D1PublishResult["verification"]> {
	const tables = [
		SNAPSHOT_TABLES.artificial_analysis,
		SNAPSHOT_TABLES.models_dev,
		SNAPSHOT_TABLES.deep_swe,
		SNAPSHOT_TABLES.model_stage_rows,
		SNAPSHOT_TABLES.source_row_states,
	];
	const counts = Object.fromEntries(
		await Promise.all(
			tables.map(async (table) => [
				table,
				Number(
					(
						await d1Query(
							`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE run_id = ?`,
							[runId],
						)
					)[0]?.count,
				),
			]),
		),
	);
	const deepSweVersions = await d1Query(
		`SELECT source_version, COUNT(*) AS count FROM ${quoteIdentifier(SNAPSHOT_TABLES.deep_swe)} WHERE run_id = ? GROUP BY source_version ORDER BY source_version`,
		[runId],
	);
	return { counts, deep_swe_versions: deepSweVersions };
}

/** Sends a SQL query directly to Cloudflare D1 for publication checks. */
async function d1Query(
	sql: string,
	params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
	return queryD1Rows(
		sql,
		params.map((param) =>
			param == null
				? null
				: typeof param === "string" || typeof param === "number"
					? param
					: String(param),
		),
	);
}

function finiteNumberOrNull(value: unknown): number | null {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : null;
}
