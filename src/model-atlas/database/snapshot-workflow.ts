/** Storage-independent snapshot workflow derives model rows and writes normalized table rows through a minimal writer interface. */

import { STAGE_CONFIG } from "../config";
import {
	buildDebugTraceRows,
	insertDebugTraceRows,
} from "../ingest/debug-trace";
import { cachedSourceDataFromSnapshots } from "../ingest/source-snapshots/data";
import { buildSourceHealth } from "../ingest/source-snapshots/policy";
import type {
	DatabaseBuildResult,
	DebugTraceRow,
	SnapshotTableName,
	SourceSnapshots,
} from "../ingest/types";
import { SNAPSHOT_TABLES } from "../ingest/types";
import {
	BENCHMARK_RAW_WRITERS,
	insertArtificialAnalysisEvaluationResourceRawRows,
	insertArtificialAnalysisRawModels,
	insertModelEvaluations,
	insertModels,
	insertModelsDevRawModels,
	insertModelTaskMetrics,
	insertOpenRouterRawRows,
	insertSourceHealth,
	insertSourceQuarantines,
} from "../ingest/writers";
import type { DatabaseWriter } from "../ingest/writers/shared";
import { deriveModelStats } from "../pipeline/derivation";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";

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
	...BENCHMARK_RAW_WRITERS.map(({ table, write }) => ({
		table,
		write: (db: DatabaseWriter, rows: DatabaseSnapshotRows) =>
			write(db, rows.snapshots),
	})),
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
