/** Sparse one-score benchmark source snapshot adapters. */

import type { DatabaseSync } from "node:sqlite";

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
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readCursorBenchRawCache,
	readGdpPdfRawCache,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
} from "../cache";
import { sourceKey } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceRowState,
} from "../types";
import { modelScoreSnapshot } from "./model-score";

export type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { blueprintBench: number | null };
};

export type BrowseCompSnapshot = {
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { browseComp: number | null };
};

export type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { cursorBench: number | null };
};

export type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { gdpPdf: number | null };
};

export type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { riemannBench: number | null };
};

export type ToolathlonSnapshot = {
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	sourceRowStates: SourceRowState[];
	fetchedAt: { toolathlon: number | null };
};

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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { blueprintBench: snapshot.fetchedAt },
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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { browseComp: snapshot.fetchedAt },
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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { cursorBench: snapshot.fetchedAt },
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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { gdpPdf: snapshot.fetchedAt },
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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { riemannBench: snapshot.fetchedAt },
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
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { toolathlon: snapshot.fetchedAt },
	};
}
