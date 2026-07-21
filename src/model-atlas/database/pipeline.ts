/** Storage-independent pipeline derives model rows and writes normalized table rows through a minimal writer interface. */

import { STAGE_CONFIG } from "../constants";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { deriveModelStats } from "../stats/derivation";
import { buildDebugTraceRows } from "./debug-trace";
import { buildSourceHealth } from "./health";
import { cachedSourceDataFromSnapshots } from "./source-snapshots/data";
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
	insertAleBenchRawRows,
	insertArtificialAnalysisEvaluationResourceRawRows,
	insertArtificialAnalysisRawModels,
	insertBlueprintBenchRawRows,
	insertBrowseCompRawRows,
	insertChartographyRawRows,
	insertChessPuzzlesRawRows,
	insertCodeMigrationRawRows,
	insertCursorBenchRawRows,
	insertCyberBenchRawRows,
	insertDebugTraceRows,
	insertDeepSWERawRows,
	insertEbrBenchRawRows,
	insertEmbRawRows,
	insertEnterpriseBenchCoreCraftRawRows,
	insertEpochCapabilitiesIndexRawRows,
	insertFinanceAgentV2RawRows,
	insertFrontierCodeRawRows,
	insertFrontierMathTier4RawRows,
	insertGdpPdfRawRows,
	insertHandbookMdRawRows,
	insertHarveyLabRawRows,
	insertLegalResearchRawRows,
	insertMedCodeRawRows,
	insertMercorApexAgentsRawRows,
	insertModelEvaluations,
	insertModels,
	insertModelsDevRawModels,
	insertModelTaskMetrics,
	insertOpenRouterRawRows,
	insertProgramBenchRawRows,
	insertProofBenchRawRows,
	insertPublicBenefitsBenchRawRows,
	insertRiemannBenchRawRows,
	insertSourceHealth,
	insertSourceQuarantines,
	insertTerminalBenchRawRows,
	insertToolathlonRawRows,
	insertValsIndexRawRows,
	insertVendingBench2RawRows,
	insertVibeCodeRawRows,
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

type DerivedDatabaseSnapshot = {
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
		write: (db, rows) => insertArtificialAnalysisRawModels(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.artificial_analysis_evaluation_resources,
		write: (db, rows) =>
			insertArtificialAnalysisEvaluationResourceRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.models_dev,
		write: (db, rows) => insertModelsDevRawModels(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.openrouter,
		write: (db, rows) => insertOpenRouterRawRows(db, rows.openRouterRawPayload),
	},
	{
		table: SNAPSHOT_TABLES.agent_arena,
		write: (db, rows) => insertAgentArenaRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.agents_last_exam,
		write: (db, rows) => insertAgentsLastExamRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.ale_bench,
		write: (db, rows) => insertAleBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.blueprint_bench_2,
		write: (db, rows) => insertBlueprintBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.browsecomp,
		write: (db, rows) => insertBrowseCompRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.chartography,
		write: (db, rows) => insertChartographyRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.chess_puzzles,
		write: (db, rows) => insertChessPuzzlesRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.code_migration,
		write: (db, rows) => insertCodeMigrationRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.cursorbench,
		write: (db, rows) => insertCursorBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.cyberbench,
		write: (db, rows) => insertCyberBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.deep_swe,
		write: (db, rows) => insertDeepSWERawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.ebr_bench,
		write: (db, rows) => insertEbrBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.emb,
		write: (db, rows) => insertEmbRawRows(db, rows.snapshots),
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
		table: SNAPSHOT_TABLES.finance_agent_v2,
		write: (db, rows) => insertFinanceAgentV2RawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.frontier_code,
		write: (db, rows) => insertFrontierCodeRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.frontiermath_tier_4,
		write: (db, rows) => insertFrontierMathTier4RawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.gdp_pdf,
		write: (db, rows) => insertGdpPdfRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.handbook_md,
		write: (db, rows) => insertHandbookMdRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_harvey_lab,
		write: (db, rows) => insertHarveyLabRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.legal_research,
		write: (db, rows) => insertLegalResearchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.medcode,
		write: (db, rows) => insertMedCodeRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.mercor_apex_agents,
		write: (db, rows) => insertMercorApexAgentsRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.programbench,
		write: (db, rows) => insertProgramBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.proofbench,
		write: (db, rows) => insertProofBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.public_benefits_bench,
		write: (db, rows) => insertPublicBenefitsBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.riemann_bench,
		write: (db, rows) => insertRiemannBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_terminal_bench,
		write: (db, rows) => insertTerminalBenchRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.toolathlon,
		write: (db, rows) => insertToolathlonRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vals_index,
		write: (db, rows) => insertValsIndexRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vending_bench_2,
		write: (db, rows) => insertVendingBench2RawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.vibe_code,
		write: (db, rows) => insertVibeCodeRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.weirdml,
		write: (db, rows) => insertWeirdMlRawRows(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.source_quarantines,
		write: (db, rows) => insertSourceQuarantines(db, rows.snapshots),
	},
	{
		table: SNAPSHOT_TABLES.source_health,
		write: (db, rows) => insertSourceHealth(db, rows.sourceHealth),
	},
	{
		table: SNAPSHOT_TABLES.models,
		write: (db, rows) => insertModels(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_evaluations,
		write: (db, rows) => insertModelEvaluations(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_task_metrics,
		write: (db, rows) => insertModelTaskMetrics(db, rows.finalModelRows),
	},
	{
		table: SNAPSHOT_TABLES.model_match_debug,
		write: (db, rows) => insertDebugTraceRows(db, rows.debugTraceRows),
	},
] satisfies readonly SnapshotWriter[];

export const SNAPSHOT_WRITER_TABLES = SNAPSHOT_WRITERS.map(
	({ table }) => table,
);

/** Derives model stages from normalized source snapshots while the caller owns storage-specific cache loading. */
export async function deriveDatabaseSnapshot(
	startedAtEpochSeconds: number,
	snapshots: SourceSnapshots,
	sourceCache: DatabaseBuildResult["source_cache"],
	loadOpenRouter: OpenRouterLoader,
): Promise<DerivedDatabaseSnapshot> {
	const sourceData = cachedSourceDataFromSnapshots(snapshots);
	const {
		matchDiagnostics,
		models: finalModelRows,
		openRouterLoad,
	} = await deriveModelStats(sourceData, { loadOpenRouter });
	const debugTraceRows = buildDebugTraceRows(
		snapshots,
		openRouterLoad.rawPayload,
		matchDiagnostics,
		STAGE_CONFIG.matcher,
	);
	const finalSourceCache = {
		...sourceCache,
		openrouter: openRouterLoad.cacheStatus,
	};
	return {
		rows: {
			snapshots,
			openRouterRawPayload: openRouterLoad.rawPayload,
			finalModelRows,
			debugTraceRows,
			sourceHealth: buildSourceHealth({
				generatedAtEpochSeconds: startedAtEpochSeconds,
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
