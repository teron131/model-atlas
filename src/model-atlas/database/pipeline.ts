/** Storage-independent pipeline derives model rows and writes normalized table rows through a minimal writer interface. */

import { STAGE_CONFIG } from "../constants";
import { buildMatchDiagnostics } from "../matcher";
import { publicOpenRouterModelId } from "../openrouter-routes";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { enrichModelRowsWithBenchmarks } from "../stats/benchmarks";
import { buildModelCatalogRows } from "../stats/catalog";
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
	insertAgentArenaRawRows,
	insertAgentsLastExamRawRows,
	insertArtificialAnalysisEvaluationResourceRawRows,
	insertArtificialAnalysisRawModels,
	insertBlueprintBenchRawRows,
	insertBrowseCompRawRows,
	insertChartographyRawRows,
	insertChessPuzzlesRawRows,
	insertCursorBenchRawRows,
	insertDebugTraceRows,
	insertDeepSWERawRows,
	insertEbrBenchRawRows,
	insertEnterpriseBenchCoreCraftRawRows,
	insertEpochCapabilitiesIndexRawRows,
	insertFrontierMathTier4RawRows,
	insertGdpPdfRawRows,
	insertHandbookMdRawRows,
	insertMercorApexAgentsRawRows,
	insertModelEvaluations,
	insertModels,
	insertModelsDevRawModels,
	insertModelTaskMetrics,
	insertOpenRouterRawRows,
	insertProofBenchRawRows,
	insertRiemannBenchRawRows,
	insertSourceHealth,
	insertSourceQuarantines,
	insertToolathlonRawRows,
	insertValsIndexRawRows,
	insertValsTerminalBenchRawRows,
	insertVendingBench2RawRows,
	insertWeirdMlRawRows,
} from "./writers";
import type { DatabaseWriter } from "./writers/shared";

export type DatabaseSnapshotRows = {
	snapshots: SourceSnapshots;
	openRouterRawPayload: OpenRouterRawScrapedPayload | null | undefined;
	finalModelRows: readonly unknown[];
	debugTraceRows: readonly DebugTraceRow[];
	sourceHealth: DatabaseBuildResult["source_health"];
};

type OpenRouterLoader = (modelIds: string[]) => Promise<{
	rawPayload: OpenRouterRawScrapedPayload | null;
	cacheStatus: DatabaseBuildResult["source_cache"]["openrouter"];
}>;

export type DerivedDatabaseSnapshot = {
	rows: DatabaseSnapshotRows;
	sourceCache: DatabaseBuildResult["source_cache"];
};

type SnapshotWriter = {
	table: SnapshotTableName;
	write: (db: DatabaseWriter, rows: DatabaseSnapshotRows) => void;
};

const SNAPSHOT_WRITERS = [
	{
		table: SNAPSHOT_TABLES.artificial_analysis,
		write: (db, rows) =>
			insertArtificialAnalysisRawModels(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.artificial_analysis_evaluation_resources,
		write: (db, rows) =>
			insertArtificialAnalysisEvaluationResourceRawRows(
				db,
				rows.snapshots,
			),
	},
	{
		table: SNAPSHOT_TABLES.models_dev,
		write: (db, rows) =>
			insertModelsDevRawModels(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.openrouter,
		write: (db, rows) =>
			insertOpenRouterRawRows(db, rows.openRouterRawPayload),
	},
	{
		table: SNAPSHOT_TABLES.agent_arena,
		write: (db, rows) =>
			insertAgentArenaRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.agents_last_exam,
		write: (db, rows) =>
			insertAgentsLastExamRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.blueprint_bench_2,
		write: (db, rows) =>
			insertBlueprintBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.browsecomp,
		write: (db, rows) =>
			insertBrowseCompRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.chartography,
		write: (db, rows) =>
			insertChartographyRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.chess_puzzles,
		write: (db, rows) =>
			insertChessPuzzlesRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.cursorbench,
		write: (db, rows) =>
			insertCursorBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.deep_swe,
		write: (db, rows) => insertDeepSWERawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.ebr_bench,
		write: (db, rows) =>
			insertEbrBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.enterprisebench_corecraft,
		write: (db, rows) =>
			insertEnterpriseBenchCoreCraftRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.epoch_capabilities_index,
		write: (db, rows) =>
			insertEpochCapabilitiesIndexRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.frontiermath_tier_4,
		write: (db, rows) =>
			insertFrontierMathTier4RawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.gdp_pdf,
		write: (db, rows) => insertGdpPdfRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.handbook_md,
		write: (db, rows) =>
			insertHandbookMdRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.mercor_apex_agents,
		write: (db, rows) =>
			insertMercorApexAgentsRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.proofbench,
		write: (db, rows) =>
			insertProofBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.riemann_bench,
		write: (db, rows) =>
			insertRiemannBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_terminal_bench,
		write: (db, rows) =>
			insertValsTerminalBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.toolathlon,
		write: (db, rows) =>
			insertToolathlonRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_index,
		write: (db, rows) =>
			insertValsIndexRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vending_bench_2,
		write: (db, rows) =>
			insertVendingBench2RawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.weirdml,
		write: (db, rows) => insertWeirdMlRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.source_quarantines,
		write: (db, rows) =>
			insertSourceQuarantines(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.source_health,
		write: (db, rows) =>
			insertSourceHealth(db, rows.sourceHealth),
	},
	{
		table: SNAPSHOT_TABLES.models,
		write: (db, rows) => insertModels(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_evaluations,
		write: (db, rows) =>
			insertModelEvaluations(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_task_metrics,
		write: (db, rows) =>
			insertModelTaskMetrics(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_match_debug,
		write: (db, rows) =>
			insertDebugTraceRows(db, rows.debugTraceRows),
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
export async function deriveDatabaseSnapshot(
	startedAt: number,
	snapshots: SourceSnapshots,
	sourceCache: DatabaseBuildResult["source_cache"],
	loadOpenRouter: OpenRouterLoader,
): Promise<DerivedDatabaseSnapshot> {
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
	const catalogRows = buildModelCatalogRows(sourceData, matchedRows);
	const aggregatedRows = aggregateExpandedModelRows(catalogRows);
	const benchmarkEnrichedRows = enrichModelRowsWithBenchmarks(
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
			snapshots,
			openRouterRawPayload: openRouter.rawPayload,
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

/** Writes one derived snapshot through either SQLite statements or a direct-publication collector. */
export function writeDatabaseSnapshotRows(
	db: DatabaseWriter,
	rows: DatabaseSnapshotRows,
): void {
	for (const { write } of SNAPSHOT_WRITERS) {
		write(db, rows);
	}
}
