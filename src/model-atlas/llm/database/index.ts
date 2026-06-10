/** SQLite snapshot pipeline for cacheable Model Atlas source rows and derived scores. */

import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { STAGE_CONFIG } from "../../constants";
import { buildFinalModels } from "../llm-stats/final-stage";
import { matchedRowsFromDiagnostics } from "../llm-stats/match-stage";
import { publicOpenRouterModelId } from "../llm-stats/model-aliases";
import { enrichRows } from "../llm-stats/openrouter-stage";
import { getScraperFallbackMatchDiagnostics } from "../matcher";
import type { OpenRouterRawScrapedPayload } from "../sources/openrouter-scraper";
import { buildDebugTraceRows } from "./debug-trace";
import {
	buildDatabaseCatalogRows,
	buildSourceData,
	filterDatabaseTextLlmRows,
	loadOrFetchOpenRouterRawPayload,
	loadOrFetchSourceSnapshots,
} from "./sources";
import {
	type DatabaseBuildResult,
	DEFAULT_DATABASE_PATH,
	type DebugTraceRow,
	type SourceSnapshots,
} from "./types";
import {
	insertAgentsLastExamRawRows,
	insertArtificialAnalysisRawModels,
	insertBrowseCompRawRows,
	insertDebugTraceRows,
	insertDeepSWERawRows,
	insertModelsDevRawModels,
	insertOpenRouterRawRows,
	insertProcessedModelRows,
	insertTerminalBenchRawRows,
	tableCounts,
} from "./writers";

export { readModelAtlasDatabasePayload } from "./payload";

const SNAPSHOT_TABLES = [
	"aa_raw_models",
	"models_dev_raw_models",
	"deep_swe_raw_rows",
	"terminal_bench_raw_rows",
	"agents_last_exam_raw_rows",
	"browsecomp_raw_rows",
	"openrouter_raw_rows",
	"processed_models",
	"debug",
] as const;

type DatabaseSnapshotRows = {
	startedAt: number;
	snapshots: SourceSnapshots;
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined;
	textMatchedRows: readonly unknown[];
	catalogRows: readonly unknown[];
	enrichedRows: readonly unknown[];
	finalRows: readonly unknown[];
	debugTraceRows: readonly DebugTraceRow[];
};

/** Return the current epoch seconds. */
function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/** Load the SQLite schema file colocated with this database pipeline. */
async function loadSchemaSql(): Promise<string> {
	return readFile(
		fileURLToPath(new URL("./schema.sql", import.meta.url)),
		"utf-8",
	);
}

/** Open the SQLite database and apply the table schema without deleting raw caches. */
async function openDatabase(
	outputPath: string,
	schemaSql: string,
): Promise<DatabaseSync> {
	await mkdir(dirname(outputPath), { recursive: true });
	const db = new DatabaseSync(outputPath);
	db.exec(schemaSql);
	ensureArtificialAnalysisColumns(db);
	ensureDeepSWEColumns(db);
	ensureAgentsLastExamColumns(db);
	ensureBrowseCompColumns(db);
	return db;
}

/** Add nullable Artificial Analysis columns to existing local caches. */
function ensureArtificialAnalysisColumns(db: DatabaseSync): void {
	const existingColumns = new Set(
		db
			.prepare("PRAGMA table_info(aa_raw_models)")
			.all()
			.map((row) => String((row as { name?: unknown }).name)),
	);
	const columns: Array<[string, string]> = [
		["median_end_to_end_response_time_seconds", "REAL"],
	];
	for (const [name, type] of columns) {
		if (!existingColumns.has(name)) {
			db.exec(`ALTER TABLE aa_raw_models ADD COLUMN ${name} ${type}`);
		}
	}
}

/** Add nullable DeepSWE columns to existing local caches. */
function ensureDeepSWEColumns(db: DatabaseSync): void {
	const existingColumns = new Set(
		db
			.prepare("PRAGMA table_info(deep_swe_raw_rows)")
			.all()
			.map((row) => String((row as { name?: unknown }).name)),
	);
	const columns: Array<[string, string]> = [
		["reasoning_effort", "TEXT"],
		["config", "TEXT"],
		["ci_lo", "REAL"],
		["ci_hi", "REAL"],
		["ci_half", "REAL"],
	];
	for (const [name, type] of columns) {
		if (!existingColumns.has(name)) {
			db.exec(`ALTER TABLE deep_swe_raw_rows ADD COLUMN ${name} ${type}`);
		}
	}
}

/** Add Agents' Last Exam columns to existing local caches. */
function ensureAgentsLastExamColumns(db: DatabaseSync): void {
	const existingProcessedColumns = new Set(
		db
			.prepare("PRAGMA table_info(processed_models)")
			.all()
			.map((row) => String((row as { name?: unknown }).name)),
	);
	const columns: Array<[string, string]> = [
		["agents_last_exam", "REAL"],
		["agents_last_exam_task_cost", "REAL"],
		["agents_last_exam_task_seconds", "REAL"],
		["agents_last_exam_task_input_tokens", "REAL"],
		["agents_last_exam_task_output_tokens", "REAL"],
	];
	for (const [name, type] of columns) {
		if (!existingProcessedColumns.has(name)) {
			db.exec(`ALTER TABLE processed_models ADD COLUMN ${name} ${type}`);
		}
	}
}

/** Add BrowseComp columns to existing local caches. */
function ensureBrowseCompColumns(db: DatabaseSync): void {
	const existingRawColumns = new Set(
		db
			.prepare("PRAGMA table_info(browsecomp_raw_rows)")
			.all()
			.map((row) => String((row as { name?: unknown }).name)),
	);
	if (!existingRawColumns.has("provider")) {
		db.exec(
			"ALTER TABLE browsecomp_raw_rows ADD COLUMN provider TEXT NOT NULL DEFAULT ''",
		);
	}
	const rawColumns: Array<[string, string]> = [
		["provider_name", "TEXT"],
		["source_url", "TEXT"],
		["analysis_method", "TEXT"],
		["verified", "INTEGER"],
		["self_reported", "INTEGER"],
	];
	for (const [name, type] of rawColumns) {
		if (!existingRawColumns.has(name)) {
			db.exec(`ALTER TABLE browsecomp_raw_rows ADD COLUMN ${name} ${type}`);
		}
	}
	const existingProcessedColumns = new Set(
		db
			.prepare("PRAGMA table_info(processed_models)")
			.all()
			.map((row) => String((row as { name?: unknown }).name)),
	);
	if (!existingProcessedColumns.has("browsecomp")) {
		db.exec("ALTER TABLE processed_models ADD COLUMN browsecomp REAL");
	}
}

/** Remove current snapshot rows before rewriting the runtime view. */
function clearSnapshotTables(db: DatabaseSync): void {
	for (const table of SNAPSHOT_TABLES) {
		db.prepare(`DELETE FROM ${table}`).run();
	}
}

/** Run synchronous SQLite writes inside one transaction. */
function runInTransaction<T>(db: DatabaseSync, write: () => T): T {
	db.exec("BEGIN");
	try {
		const result = write();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

/** Create the pipeline run row and return its id. */
function insertPipelineRun(
	db: DatabaseSync,
	rows: DatabaseSnapshotRows,
): number {
	const result = db
		.prepare(`
			INSERT INTO pipeline_runs (
				started_at_epoch_seconds, matched_row_count, enriched_row_count, final_model_count
			) VALUES (?, ?, ?, ?)
		`)
		.run(
			rows.startedAt,
			rows.textMatchedRows.length,
			rows.enrichedRows.length,
			rows.finalRows.length,
		);
	return Number(result.lastInsertRowid);
}

/** Write raw and processed rows for one runtime snapshot. */
function writeDatabaseSnapshot(
	db: DatabaseSync,
	rows: DatabaseSnapshotRows,
): number {
	clearSnapshotTables(db);
	const runId = insertPipelineRun(db, rows);
	insertArtificialAnalysisRawModels(db, runId, rows.snapshots);
	insertModelsDevRawModels(db, runId, rows.snapshots);
	insertDeepSWERawRows(db, runId, rows.snapshots);
	insertTerminalBenchRawRows(db, runId, rows.snapshots);
	insertAgentsLastExamRawRows(db, runId, rows.snapshots);
	insertBrowseCompRawRows(db, runId, rows.snapshots);
	insertOpenRouterRawRows(db, runId, rows.openRouterRawPayload);
	insertProcessedModelRows(db, runId, "matched", rows.textMatchedRows);
	insertProcessedModelRows(db, runId, "catalog", rows.catalogRows);
	insertProcessedModelRows(db, runId, "enriched", rows.enrichedRows);
	insertProcessedModelRows(db, runId, "final", rows.finalRows);
	insertDebugTraceRows(db, runId, rows.debugTraceRows);
	db.prepare(
		"UPDATE pipeline_runs SET completed_at_epoch_seconds = ? WHERE id = ?",
	).run(nowEpochSeconds(), runId);
	return runId;
}

/** Extract OpenRouter model ids from rows already scoped by the matcher stage. */
function openRouterModelIds(rows: Record<string, unknown>[]): string[] {
	return Array.from(
		new Set(
			rows
				.map((row) => row.openrouter_id ?? row.id)
				.filter((id): id is string => typeof id === "string" && id.length > 0)
				.map((id) => publicOpenRouterModelId(id) ?? id),
		),
	);
}

/** Build the Model Atlas SQLite database snapshot. */
export async function buildModelAtlasDatabase(
	outputPath = DEFAULT_DATABASE_PATH,
): Promise<DatabaseBuildResult> {
	const startedAt = nowEpochSeconds();
	const schemaSql = await loadSchemaSql();
	const db = await openDatabase(outputPath, schemaSql);

	try {
		const { snapshots, sourceCache } = await loadOrFetchSourceSnapshots(
			db,
			startedAt,
		);
		const sourceData = buildSourceData(snapshots);
		const matchDiagnostics = await getScraperFallbackMatchDiagnostics({
			scrapedRows: sourceData.artificialAnalysisRows,
			modelsDevModels: sourceData.preferredModelsDevModels,
		});
		const matchedRows = matchedRowsFromDiagnostics(
			sourceData,
			STAGE_CONFIG.matcher,
			matchDiagnostics,
		);
		const textMatchedRows = filterDatabaseTextLlmRows(matchedRows);
		const catalogRows = buildDatabaseCatalogRows(sourceData, textMatchedRows);
		const openRouter = await loadOrFetchOpenRouterRawPayload(
			db,
			openRouterModelIds(catalogRows),
			STAGE_CONFIG.openrouter.speedConcurrency,
			startedAt,
		);
		const enrichedRows = await enrichRows(
			catalogRows,
			STAGE_CONFIG.openrouter,
			STAGE_CONFIG.scoring,
			openRouter.rawPayload,
		);
		const debugTraceRows = buildDebugTraceRows(
			snapshots,
			openRouter.rawPayload,
			matchDiagnostics,
			STAGE_CONFIG.matcher,
		);
		const models = await buildFinalModels(
			{
				...enrichedRows,
				deepSWEModelScoreRows: sourceData.deepSWEModelScoreRows,
			},
			null,
			STAGE_CONFIG.final,
			STAGE_CONFIG.scoring,
		);
		const finalSourceCache: DatabaseBuildResult["source_cache"] = {
			...sourceCache,
			openrouter: openRouter.cacheStatus,
		};

		const runId = runInTransaction(db, () =>
			writeDatabaseSnapshot(db, {
				startedAt,
				snapshots,
				openRouterRawPayload: openRouter.rawPayload,
				textMatchedRows,
				catalogRows,
				enrichedRows: enrichedRows.rows,
				finalRows: models,
				debugTraceRows,
			}),
		);
		const counts = tableCounts(db);
		return {
			path: outputPath,
			run_id: runId,
			source_rows: counts,
			source_cache: finalSourceCache,
			final_model_count: models.length,
		};
	} finally {
		db.close();
	}
}
