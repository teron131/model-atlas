/** Storage-independent pipeline derives model rows and writes normalized table rows through a minimal writer interface. */

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
import { buildDebugTraceRows } from "./debug-trace";
import { buildSourceHealth } from "./health";
import { cachedSourceDataFromSnapshots } from "./source-snapshots/source-data";
import type {
	DatabaseBuildResult,
	DebugTraceRow,
	SnapshotTableName,
	SourceSnapshots,
} from "./types";
import { SNAPSHOT_TABLES } from "./types";
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
import type { DatabaseWriter } from "./writers/shared";

export type DatabaseRunRows = {
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

type OpenRouterLoader = (modelIds: string[]) => Promise<{
	rawPayload: OpenRouterRawScrapedPayload | null;
	cacheStatus: DatabaseBuildResult["source_cache"]["openrouter"];
}>;

export type DerivedDatabaseRun = {
	rows: DatabaseRunRows;
	sourceCache: DatabaseBuildResult["source_cache"];
};

type SnapshotWriter = {
	table: SnapshotTableName;
	write: (db: DatabaseWriter, runId: number, rows: DatabaseRunRows) => void;
};

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

export const SNAPSHOT_WRITER_TABLES = SNAPSHOT_WRITERS.map(
	({ table }) => table,
);

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

/** Derives model stages from normalized source snapshots while the caller owns storage-specific cache loading. */
export async function deriveDatabaseRun(
	startedAt: number,
	snapshots: SourceSnapshots,
	sourceCache: DatabaseBuildResult["source_cache"],
	loadOpenRouter: OpenRouterLoader,
): Promise<DerivedDatabaseRun> {
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
	const openRouter = await loadOpenRouter(
		openRouterModelIds(benchmarkEnrichedRows),
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
	const finalModelRows = await buildFinalModels(
		{
			...enrichedRows,
			deepSWEDefaultEffortRows: sourceData.deepSWE.defaultEffortRows,
		},
		null,
		STAGE_CONFIG.final,
		STAGE_CONFIG.scoring,
	);
	const finalSourceCache = {
		...sourceCache,
		openrouter: openRouter.cacheStatus,
	};
	return {
		rows: {
			startedAt,
			snapshots,
			openRouterRawPayload: openRouter.rawPayload,
			matchedTextLlmRows,
			catalogRows,
			enrichedRows: enrichedRows.rows,
			finalModelRows,
			debugTraceRows,
			sourceHealth: buildSourceHealth({
				generatedAtEpochSeconds: startedAt,
				sourceCache: finalSourceCache,
				sourceRowStates: snapshots.sourceRowStates,
			}),
		},
		sourceCache: finalSourceCache,
	};
}

/** Writes one derived run through either SQLite statements or a direct-publication collector. */
export function writeDatabaseRunRows(
	db: DatabaseWriter,
	runId: number,
	rows: DatabaseRunRows,
): void {
	for (const { write } of SNAPSHOT_WRITERS) {
		write(db, runId, rows);
	}
}
