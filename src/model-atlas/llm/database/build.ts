/** SQLite snapshot pipeline for cacheable Model Atlas source rows and derived scores. */

import { rename } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../../constants";
import { getScraperFallbackMatchDiagnostics } from "../matcher";
import {
	buildAutomationBenchScoreByModelName,
	getAutomationBenchLeaderboardStats,
} from "../scrapers/automation-bench";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { modelRowsFromMatchDiagnostics } from "../stats/matching";
import { publicOpenRouterModelId } from "../stats/model-aliases";
import { enrichModelRowsWithOpenRouter } from "../stats/openrouter-enrichment";
import { buildFinalModels } from "../stats/selection";
import { buildDatabaseCatalogRows, filterDatabaseTextLlmRows } from "./catalog";
import { buildDebugTraceRows } from "./debug-trace";
import { buildSourceHealth } from "./health";
import { openDatabase, removeDatabaseFiles } from "./schema";
import {
	loadOpenRouterRawPayload,
	loadSourceSnapshots,
	sourceDataFromSnapshots,
} from "./sources";
import {
	type DatabaseBuildOptions,
	type DatabaseBuildResult,
	DEFAULT_DATABASE_PATH,
	type DebugTraceRow,
	type SourceSnapshots,
} from "./types";
import {
	insertAgentsLastExamRawRows,
	insertArtificialAnalysisRawModels,
	insertBlueprintBenchRawRows,
	insertBrowseCompRawRows,
	insertCursorBenchRawRows,
	insertDebugTraceRows,
	insertDeepSWERawRows,
	insertGdpPdfRawRows,
	insertModelsDevRawModels,
	insertOpenRouterRawRows,
	insertProcessedModelRows,
	insertRiemannBenchRawRows,
	insertSourceHealth,
	insertSourceRowStates,
	insertTerminalBenchRawRows,
	insertToolathlonRawRows,
} from "./writers";

const SNAPSHOT_TABLES = [
	"aa_raw_models",
	"models_dev_raw_models",
	"deep_swe_raw_rows",
	"terminal_bench_raw_rows",
	"agents_last_exam_raw_rows",
	"blueprint_bench_2_raw_rows",
	"gdp_pdf_raw_rows",
	"riemann_bench_raw_rows",
	"browsecomp_raw_rows",
	"toolathlon_raw_rows",
	"cursorbench_raw_rows",
	"openrouter_raw_rows",
	"source_row_states",
	"source_health",
	"processed_models",
	"matcher_debug",
] as const;

type SnapshotRows = {
	startedAt: number;
	snapshots: SourceSnapshots;
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined;
	textMatchedRows: readonly unknown[];
	catalogRows: readonly unknown[];
	enrichedRows: readonly unknown[];
	selectedRows: readonly unknown[];
	debugTraceRows: readonly DebugTraceRow[];
	sourceHealth: DatabaseBuildResult["source_health"];
};

/** Return the current epoch seconds. */
function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/** Remove current snapshot rows before rewriting the runtime view. */
function clearSnapshotTables(db: DatabaseSync): void {
	for (const table of SNAPSHOT_TABLES) {
		db.prepare(`DELETE FROM ${table}`).run();
	}
}

/** Count source rows by table for the build result summary. */
function tableCounts(db: DatabaseSync): Record<string, number> {
	const rows = db
		.prepare(`
			SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`)
		.all();
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const name = typeof row.name === "string" ? row.name : null;
		if (name == null) {
			continue;
		}
		const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get();
		counts[name] = Number(countRow?.count ?? 0);
	}
	return counts;
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

/** Escapes string values for generated SQLite INSERT statements. */
function sqlStringLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Publishes a completed SQLite database to the configured runtime store. */
async function publishDatabaseFile(
	db: DatabaseSync,
	outputPath: string,
): Promise<void> {
	const persistedPath = `${outputPath}.persisted`;
	await removeDatabaseFiles(persistedPath);
	db.exec(`VACUUM INTO ${sqlStringLiteral(persistedPath)}`);
	db.close();
	await removeDatabaseFiles(outputPath);
	await rename(persistedPath, outputPath);
}

/** Create the pipeline run row and return its id. */
function insertPipelineRun(db: DatabaseSync, rows: SnapshotRows): number {
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
			rows.selectedRows.length,
		);
	return Number(result.lastInsertRowid);
}

/** Write raw and processed rows for one runtime snapshot. */
function writeSnapshot(db: DatabaseSync, rows: SnapshotRows): number {
	clearSnapshotTables(db);
	const runId = insertPipelineRun(db, rows);
	insertArtificialAnalysisRawModels(db, runId, rows.snapshots);
	insertModelsDevRawModels(db, runId, rows.snapshots);
	insertDeepSWERawRows(db, runId, rows.snapshots);
	insertTerminalBenchRawRows(db, runId, rows.snapshots);
	insertAgentsLastExamRawRows(db, runId, rows.snapshots);
	insertBlueprintBenchRawRows(db, runId, rows.snapshots);
	insertGdpPdfRawRows(db, runId, rows.snapshots);
	insertRiemannBenchRawRows(db, runId, rows.snapshots);
	insertBrowseCompRawRows(db, runId, rows.snapshots);
	insertToolathlonRawRows(db, runId, rows.snapshots);
	insertCursorBenchRawRows(db, runId, rows.snapshots);
	insertOpenRouterRawRows(db, runId, rows.openRouterRawPayload);
	insertSourceRowStates(db, runId, rows.snapshots);
	insertSourceHealth(db, runId, rows.sourceHealth);
	insertProcessedModelRows(db, runId, "matched", rows.textMatchedRows);
	insertProcessedModelRows(db, runId, "catalog", rows.catalogRows);
	insertProcessedModelRows(db, runId, "enriched", rows.enrichedRows);
	insertProcessedModelRows(db, runId, "final", rows.selectedRows);
	insertDebugTraceRows(db, runId, rows.debugTraceRows);
	db.prepare(
		"UPDATE pipeline_runs SET completed_at_epoch_seconds = ? WHERE id = ?",
	).run(nowEpochSeconds(), runId);
	return runId;
}

/** Extract OpenRouter model ids from rows already scoped by matching. */
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
	options: DatabaseBuildOptions = {},
): Promise<DatabaseBuildResult> {
	const startedAt = nowEpochSeconds();
	let db: DatabaseSync | null = await openDatabase(outputPath);

	try {
		const { snapshots, sourceCache } = await loadSourceSnapshots(
			db,
			startedAt,
			STAGE_CONFIG.scoring,
			options,
		);
		const automationBench = await getAutomationBenchLeaderboardStats();
		const sourceData = {
			...sourceDataFromSnapshots(snapshots),
			automationBenchModelScoreRows: automationBench.model_scores,
			automationBenchScoreByModelName: buildAutomationBenchScoreByModelName(
				automationBench.model_scores,
			),
		};
		const matchDiagnostics = await getScraperFallbackMatchDiagnostics({
			scrapedRows: sourceData.artificialAnalysisRows,
			modelsDevModels: sourceData.preferredModelsDevModels,
		});
		const matchedRows = modelRowsFromMatchDiagnostics(
			sourceData,
			STAGE_CONFIG.matcher,
			matchDiagnostics,
		);
		const textMatchedRows = filterDatabaseTextLlmRows(matchedRows);
		const catalogRows = buildDatabaseCatalogRows(sourceData, textMatchedRows);
		const openRouter = await loadOpenRouterRawPayload(
			db,
			openRouterModelIds(catalogRows),
			STAGE_CONFIG.openrouter.speedConcurrency,
			startedAt,
			options,
		);
		const enrichedRows = await enrichModelRowsWithOpenRouter(
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
		const sourceHealth = buildSourceHealth({
			generatedAtEpochSeconds: startedAt,
			sourceCache: finalSourceCache,
			sourceRowStates: snapshots.sourceRowStates,
		});

		const activeDb = db;
		const runId = runInTransaction(activeDb, () =>
			writeSnapshot(activeDb, {
				startedAt,
				snapshots,
				openRouterRawPayload: openRouter.rawPayload,
				textMatchedRows,
				catalogRows,
				enrichedRows: enrichedRows.rows,
				selectedRows: models,
				debugTraceRows,
				sourceHealth,
			}),
		);
		const counts = tableCounts(activeDb);
		const result = {
			path: outputPath,
			run_id: runId,
			source_rows: counts,
			source_cache: finalSourceCache,
			source_health: sourceHealth,
			final_model_count: models.length,
		};
		await publishDatabaseFile(activeDb, outputPath);
		db = null;
		return result;
	} finally {
		db?.close();
	}
}
