/** Surge benchmark snapshots own source-specific identity and source URL requirements. */

import {
	type GdpPdfModelScoreRow,
	getGdpPdfStats,
} from "../../../scrapers/surge/gdp-pdf";
import {
	getRiemannBenchStats,
	type RiemannBenchModelScoreRow,
} from "../../../scrapers/surge/riemann-bench";
import type { readGdpPdfRawCache, readRiemannBenchRawCache } from "../../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
} from "../../types";
import { modelScoreSnapshot } from "../model-score";
import { sourceKey } from "../policy";

type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
	sourceStatus: SourceSnapshotStatus;
};

/** Loads GDP PDF rows keyed by provider and model for cache row continuity. */
export async function gdpPdfSnapshot(
	cached: ReturnType<typeof readGdpPdfRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<GdpPdfSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "gdp_pdf",
		cached,
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
	cached: ReturnType<typeof readRiemannBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<RiemannBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "riemann_bench",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getRiemannBenchStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	if (snapshot.sourceUrl == null) {
		throw new Error("Riemann Bench snapshot is missing its source URL");
	}
	return {
		riemannBenchModelScoreRows: snapshot.rows,
		riemannBenchSourceUrl: snapshot.sourceUrl,
		sourceStatus: {
			source: "riemann_bench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "riemannBench",
		},
	};
}
