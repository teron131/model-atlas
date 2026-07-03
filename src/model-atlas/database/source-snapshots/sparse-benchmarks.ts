/** Sparse one-score benchmark source snapshot adapters. */

import type { DatabaseSync } from "node:sqlite";
import {
	type ArtificialAnalysisEvaluationResourceRow,
	getArtificialAnalysisEvaluationResourceStats,
} from "../../scrapers/artificial-analysis/evaluation-resources";
import {
	type BlueprintBenchModelScoreRow,
	getBlueprintBenchStats,
} from "../../scrapers/blueprint-bench";
import {
	type BrowseCompModelScoreRow,
	getBrowseCompStats,
} from "../../scrapers/browsecomp";
import {
	type CursorBenchModelScoreRow,
	getCursorBenchStats,
} from "../../scrapers/cursorbench";
import {
	type GdpPdfModelScoreRow,
	getGdpPdfStats,
} from "../../scrapers/gdp-pdf";
import {
	getRiemannBenchStats,
	type RiemannBenchModelScoreRow,
} from "../../scrapers/riemann-bench";
import {
	getToolathlonStats,
	type ToolathlonModelScoreRow,
} from "../../scrapers/toolathlon";
import {
	getValsIndexStats,
	type ValsIndexModelScoreRow,
	type ValsIndexTaskScoreRow,
} from "../../scrapers/vals/index-benchmark";
import {
	getTerminalBenchValsStats,
	type TerminalBenchValsModelHarnessRow,
	type TerminalBenchValsTaskRow,
} from "../../scrapers/vals/terminal-bench";
import {
	readArtificialAnalysisEvaluationResourceRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readCursorBenchRawCache,
	readGdpPdfRawCache,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readValsTerminalBenchRawCache,
} from "../cache";
import { snapshotRows, snapshotRowsWithStates, sourceKey } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
} from "../types";
import {
	modelScoreSnapshot,
	shouldUseFetchedRows,
	snapshotFetchedAt,
} from "./model-score";

export type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type ArtificialAnalysisEvaluationResourceSnapshot = {
	artificialAnalysisEvaluationResourceRows: ArtificialAnalysisEvaluationResourceRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type BrowseCompSnapshot = {
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type ToolathlonSnapshot = {
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type ValsIndexSnapshot = {
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type TerminalBenchValsSnapshot = {
	valsTerminalBenchRows: TerminalBenchValsTaskRow[];
	valsTerminalBenchModelScoreRows: TerminalBenchValsModelHarnessRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads AA evaluation resource rows keyed by benchmark and source model id. */
export async function artificialAnalysisEvaluationResourceSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ArtificialAnalysisEvaluationResourceSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "artificial_analysis_evaluation_resources",
		cached: readArtificialAnalysisEvaluationResourceRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getArtificialAnalysisEvaluationResourceStats,
		rowKey: (row) => sourceKey(row.benchmark_key, row.model_id),
		rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
	});
	return {
		artificialAnalysisEvaluationResourceRows: snapshot.rows,
		sourceStatus: {
			source: "artificial_analysis_evaluation_resources",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "artificialAnalysisEvaluationResources",
		},
	};
}

/** Loads BlueprintBench rows keyed by model name for cache and missing-row tracking. */
export async function blueprintBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BlueprintBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "blueprint_bench_2",
		cached: readBlueprintBenchRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getBlueprintBenchStats,
		rowKey: (row) => sourceKey(row.model),
		rowLabel: (row) => row.model,
	});
	return {
		blueprintBenchModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "blueprint_bench_2",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "blueprintBench",
		},
	};
}

/** Loads BrowseComp rows keyed by provider and model for update-health source rows. */
export async function browseCompSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BrowseCompSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "browsecomp",
		cached: readBrowseCompRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getBrowseCompStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		browseCompModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "browsecomp",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "browseComp",
		},
	};
}

/** Loads CursorBench rows keyed by model, base model, and reasoning effort. */
export async function cursorBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<CursorBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "cursorbench",
		cached: readCursorBenchRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getCursorBenchStats,
		rowKey: (row) => sourceKey(row.model, row.base_model, row.reasoning_effort),
		rowLabel: (row) => row.model,
	});
	return {
		cursorBenchModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "cursorbench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "cursorBench",
		},
	};
}

/** Loads GDP PDF rows keyed by provider and model for cache row continuity. */
export async function gdpPdfSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<GdpPdfSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "gdp_pdf",
		cached: readGdpPdfRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getGdpPdfStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		gdpPdfModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "gdp_pdf",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "gdpPdf",
		},
	};
}

/** Loads Riemann Bench rows keyed by provider and model for cache row continuity. */
export async function riemannBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<RiemannBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "riemann_bench",
		cached: readRiemannBenchRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getRiemannBenchStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		riemannBenchModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "riemann_bench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "riemannBench",
		},
	};
}

/** Loads Toolathlon rows keyed by provider and model for cache row continuity. */
export async function toolathlonSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ToolathlonSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "toolathlon",
		cached: readToolathlonRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getToolathlonStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		toolathlonModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "toolathlon",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "toolathlon",
		},
	};
}

/** Loads Vals Index task rows while using only overall rows for scoring health. */
export async function valsIndexSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ValsIndexSnapshot> {
	const cached = readValsIndexRawCache(db);
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getValsIndexStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.model_id),
	);
	const modelScores = rows.filter(
		(row): row is ValsIndexModelScoreRow => row.task === "overall",
	);
	const states = snapshotRowsWithStates({
		source: "vals_index",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.model_id),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		valsIndexRows: rows,
		valsIndexModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_index",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "valsIndex",
		},
	};
}

/** Loads Vals Terminal-Bench rows while using overall model-harness rows for matching. */
export async function valsTerminalBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<TerminalBenchValsSnapshot> {
	const cached = readValsTerminalBenchRawCache(db);
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getTerminalBenchValsStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.raw_model_id, row.harness ?? "default"),
	);
	const modelScores = rows.filter(
		(row): row is TerminalBenchValsModelHarnessRow => row.task === "overall",
	);
	const states = snapshotRowsWithStates({
		source: "vals_terminal_bench",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.raw_model_id, row.harness ?? "default"),
		rowLabel: (row) =>
			row.harness == null ? row.model : `${row.model} ${row.harness}`,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		valsTerminalBenchRows: rows,
		valsTerminalBenchModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_terminal_bench",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "valsTerminalBench",
		},
	};
}
