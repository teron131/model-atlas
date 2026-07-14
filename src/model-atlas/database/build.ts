/** SQLite snapshot pipeline owns local source refresh, staged model rows, and atomic database publication. */

import { rename } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../constants";
import { buildMatchDiagnostics } from "../matcher";
import { publicOpenRouterModelId } from "../openrouter-routes";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { enrichModelRowsWithSupplementalBenchmarks } from "../stats/benchmarks";
import { buildModelCatalogRows, filterTextLlmRows } from "../stats/catalog";
import { modelRowsFromMatchDiagnostics } from "../stats/matching";
import {
	aggregateExpandedModelRows,
	enrichModelRowsWithOpenRouter,
} from "../stats/openrouter-enrichment";
import { buildFinalModels } from "../stats/selection";
import { nowEpochSeconds } from "../utils";
import { buildDebugTraceRows } from "./debug-trace";
import { buildSourceHealth } from "./health";
import { openDatabase, removeDatabaseFiles } from "./schema";
import { cachedSourceDataFromSnapshots } from "./source-snapshots/source-data";
import { loadOpenRouterRawPayload, loadSourceSnapshots } from "./sources";
import {
	type DatabaseBuildOptions,
	type DatabaseBuildResult,
	DEFAULT_DATABASE_PATH,
	type DebugTraceRow,
	SNAPSHOT_TABLES,
	type SnapshotTableName,
	type SourceSnapshots,
} from "./types";
import {
	insertAgentsLastExamRawRows,
	insertArtificialAnalysisEvaluationResourceRawRows,
	insertArtificialAnalysisRawModels,
	insertBlueprintBenchRawRows,
	insertBrowseCompRawRows,
	insertCursorBenchRawRows,
	insertDebugTraceRows,
	insertDeepSWERawRows,
	insertGdpPdfRawRows,
	insertModelStageRows,
	insertModelsDevRawModels,
	insertOpenRouterRawRows,
	insertRiemannBenchRawRows,
	insertSourceHealth,
	insertSourceRowStates,
	insertToolathlonRawRows,
	insertValsIndexRawRows,
	insertValsTerminalBenchRawRows,
} from "./writers";

type DatabaseRunRows = {
	startedAt: number;
	snapshots: SourceSnapshots;
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined;
	matchedTextLlmRows: readonly unknown[];
	catalogRows: readonly unknown[];
	enrichedRows: readonly unknown[];
	finalModelRows: readonly unknown[];
	debugTraceRows: readonly DebugTraceRow[];
	sourceHealth: DatabaseBuildResult["source_health"];
};

type SnapshotWriter = {
	table: SnapshotTableName;
	write: (db: DatabaseSync, runId: number, rows: DatabaseRunRows) => void;
};

/** Pairs each snapshot-owned table with the write that repopulates it after clearing. */
const SNAPSHOT_WRITERS = [
	{
		table: SNAPSHOT_TABLES.artificial_analysis,
		write: (db, runId, rows) =>
			insertArtificialAnalysisRawModels(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.artificial_analysis_evaluation_resources,
		write: (db, runId, rows) =>
			insertArtificialAnalysisEvaluationResourceRawRows(
				db,
				runId,
				rows.snapshots,
			),
	},
	{
		table: SNAPSHOT_TABLES.models_dev,
		write: (db, runId, rows) =>
			insertModelsDevRawModels(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.agents_last_exam,
		write: (db, runId, rows) =>
			insertAgentsLastExamRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.blueprint_bench_2,
		write: (db, runId, rows) =>
			insertBlueprintBenchRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.browsecomp,
		write: (db, runId, rows) =>
			insertBrowseCompRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.cursorbench,
		write: (db, runId, rows) =>
			insertCursorBenchRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.deep_swe,
		write: (db, runId, rows) => insertDeepSWERawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.gdp_pdf,
		write: (db, runId, rows) => insertGdpPdfRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.riemann_bench,
		write: (db, runId, rows) =>
			insertRiemannBenchRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.toolathlon,
		write: (db, runId, rows) =>
			insertToolathlonRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_index,
		write: (db, runId, rows) =>
			insertValsIndexRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_terminal_bench,
		write: (db, runId, rows) =>
			insertValsTerminalBenchRawRows(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.openrouter,
		write: (db, runId, rows) =>
			insertOpenRouterRawRows(db, runId, rows.openRouterRawPayload),
	},
	{
		table: SNAPSHOT_TABLES.source_row_states,
		write: (db, runId, rows) =>
			insertSourceRowStates(db, runId, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.source_health,
		write: (db, runId, rows) =>
			insertSourceHealth(db, runId, rows.sourceHealth),
	},
	{
		table: SNAPSHOT_TABLES.model_stage_rows,
		write: (db, runId, rows) => {
			insertModelStageRows(db, runId, "matched", rows.matchedTextLlmRows);
			insertModelStageRows(db, runId, "catalog", rows.catalogRows);
			insertModelStageRows(db, runId, "enriched", rows.enrichedRows);
			insertModelStageRows(db, runId, "final", rows.finalModelRows);
		},
	},
	{
		table: SNAPSHOT_TABLES.model_match_debug,
		write: (db, runId, rows) =>
			insertDebugTraceRows(db, runId, rows.debugTraceRows),
	},
] satisfies readonly SnapshotWriter[];

function countTableRows(db: DatabaseSync): Record<string, number> {
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

/** Wrap the synchronous database build so partial snapshot writes roll back together on failure. */
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

function sqlStringLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Publish by vacuuming to a replacement file first so readers never see a partially rewritten database. */
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

function insertPipelineRun(db: DatabaseSync, rows: DatabaseRunRows): number {
	const result = db
		.prepare(`
			INSERT INTO pipeline_runs (
				started_at_epoch_seconds, matched_row_count, enriched_row_count, final_model_count
			) VALUES (?, ?, ?, ?)
		`)
		.run(
			rows.startedAt,
			rows.matchedTextLlmRows.length,
			rows.enrichedRows.length,
			rows.finalModelRows.length,
		);
	return Number(result.lastInsertRowid);
}

function writeSnapshot(db: DatabaseSync, rows: DatabaseRunRows): number {
	for (const { table } of SNAPSHOT_WRITERS) {
		db.prepare(`DELETE FROM ${table}`).run();
	}
	const runId = insertPipelineRun(db, rows);
	for (const { write } of SNAPSHOT_WRITERS) {
		write(db, runId, rows);
	}
	db.prepare(
		"UPDATE pipeline_runs SET completed_at_epoch_seconds = ? WHERE id = ?",
	).run(nowEpochSeconds(), runId);
	return runId;
}

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

export async function buildDatabase(
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
		const sourceData = cachedSourceDataFromSnapshots(snapshots);
		const matchDiagnostics = buildMatchDiagnostics({
			matcherConfig: STAGE_CONFIG.matcher,
			scrapedRows: sourceData.artificialAnalysis.rows,
			modelsDevModels: sourceData.modelsDev.rows,
		});
		const matchedRows = modelRowsFromMatchDiagnostics(
			sourceData,
			matchDiagnostics,
		);
		const matchedTextLlmRows = filterTextLlmRows(matchedRows);
		const catalogRows = buildModelCatalogRows(sourceData, matchedRows);
		const aggregatedRows = aggregateExpandedModelRows(catalogRows);
		const benchmarkEnrichedRows = enrichModelRowsWithSupplementalBenchmarks(
			aggregatedRows,
			sourceData,
		);
		const openRouter = await loadOpenRouterRawPayload(
			db,
			openRouterModelIds(benchmarkEnrichedRows),
			STAGE_CONFIG.openrouter.speedConcurrency,
			startedAt,
			options,
		);
		const enrichedRows = await enrichModelRowsWithOpenRouter(
			benchmarkEnrichedRows,
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
		const finalModels = await buildFinalModels(
			{
				...enrichedRows,
				deepSWEDefaultEffortRows: sourceData.deepSWE.defaultEffortRows,
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
				matchedTextLlmRows,
				catalogRows,
				enrichedRows: enrichedRows.rows,
				finalModelRows: finalModels,
				debugTraceRows,
				sourceHealth,
			}),
		);
		const tableRowCounts = countTableRows(activeDb);
		const result = {
			path: outputPath,
			run_id: runId,
			source_rows: tableRowCounts,
			source_cache: finalSourceCache,
			source_health: sourceHealth,
			final_model_count: finalModels.length,
		};
		await publishDatabaseFile(activeDb, outputPath);
		db = null;
		return result;
	} finally {
		db?.close();
	}
}
