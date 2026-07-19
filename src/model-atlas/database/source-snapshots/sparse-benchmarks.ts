/** Sparse benchmark snapshots keep each source's identity fields intact before shared missing-row policy runs. */

import {
	type AgentArenaModelScoreRow,
	getAgentArenaStats,
} from "../../scrapers/agent-arena";
import {
	type ArtificialAnalysisEvaluationResourceRow,
	getArtificialAnalysisEvaluationResourceStats,
} from "../../scrapers/artificial-analysis/benchmark-resources";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../../scrapers/benchmark-score";
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
import { getEpochCapabilitiesIndexStats } from "../../scrapers/epoch/capabilities-index";
import { getEpochChessPuzzleStats } from "../../scrapers/epoch/chess-puzzles";
import { getEpochEbrBenchStats } from "../../scrapers/epoch/ebr-bench";
import { getEpochFrontierMathTier4Stats } from "../../scrapers/epoch/frontiermath-tier-4";
import { getWeirdMlStats } from "../../scrapers/epoch/weirdml";
import {
	getMercorApexAgentsStats,
	type MercorApexAgentsRow,
} from "../../scrapers/mercor-apex-agents";
import { getChartographyStats } from "../../scrapers/surge/chartography";
import { getEnterpriseBenchCoreCraftStats } from "../../scrapers/surge/enterprisebench-corecraft";
import {
	type GdpPdfModelScoreRow,
	getGdpPdfStats,
} from "../../scrapers/surge/gdp-pdf";
import { getHandbookMdStats } from "../../scrapers/surge/handbook-md";
import {
	getRiemannBenchStats,
	type RiemannBenchModelScoreRow,
} from "../../scrapers/surge/riemann-bench";
import {
	getToolathlonStats,
	type ToolathlonModelScoreRow,
} from "../../scrapers/toolathlon";
import {
	getValsIndexStats,
	type ValsIndexModelScoreRow,
	type ValsIndexTaskScoreRow,
} from "../../scrapers/vals/index-benchmark";
import { getProofBenchStats } from "../../scrapers/vals/proofbench";
import {
	getTerminalBenchStats,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchTaskRow,
} from "../../scrapers/vals/terminal-bench";
import {
	getVendingBench2Stats,
	type VendingBench2ModelScoreRow,
} from "../../scrapers/vending-bench-2";
import type {
	readAgentArenaRawCache,
	readArtificialAnalysisEvaluationResourceRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readCursorBenchRawCache,
	readEbrBenchRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFrontierMathTier4RawCache,
	readGdpPdfRawCache,
	readHandbookMdRawCache,
	readMercorApexAgentsRawCache,
	readProofBenchRawCache,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readValsTerminalBenchRawCache,
	readVendingBench2RawCache,
	readWeirdMlRawCache,
} from "../cache";
import { snapshotRows, snapshotRowsWithStates, sourceKey } from "../policy";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	RawSourceName,
	SourceSnapshotStatus,
	SourceSnapshots,
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

export type AgentArenaSnapshot = {
	agentArenaModelScoreRows: AgentArenaModelScoreRow[];
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

export type MercorApexAgentsSnapshot = {
	mercorApexAgentsRows: MercorApexAgentsRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
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

export type TerminalBenchSnapshot = {
	valsTerminalBenchRows: TerminalBenchTaskRow[];
	valsTerminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type VendingBench2Snapshot = {
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	sourceStatus: SourceSnapshotStatus;
};

type BenchmarkScoreSnapshot = {
	rows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

async function benchmarkScoreSnapshot(
	cached: { rows: BenchmarkScoreRow[]; fetchedAt: number | null } | null,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
	source: RawSourceName,
	fetchedAtKey: keyof SourceSnapshots["fetchedAt"],
	fetchRows: () => Promise<BenchmarkScorePayload>,
): Promise<BenchmarkScoreSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source,
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows,
		rowKey: benchmarkScoreRowKey,
		rowLabel: benchmarkScoreRowLabel,
	});
	return {
		rows: snapshot.rows,
		sourceStatus: {
			source,
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey,
		},
	};
} /** Loads Artificial Analysis evaluation resources keyed by benchmark, source model, and effort. */
export async function artificialAnalysisEvaluationResourceSnapshot(
	cached: ReturnType<typeof readArtificialAnalysisEvaluationResourceRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ArtificialAnalysisEvaluationResourceSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "artificial_analysis_evaluation_resources",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getArtificialAnalysisEvaluationResourceStats,
		rowKey: artificialAnalysisEvaluationResourceSourceKey,
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

/** Loads Agent Arena rows keyed by contender identity so renamed display labels remain auditable. */
export async function agentArenaSnapshot(
	cached: ReturnType<typeof readAgentArenaRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentArenaSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "agent_arena",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getAgentArenaStats,
		rowKey: (row) => sourceKey(row.contender_name, row.reasoning_effort),
		rowLabel: (row) => row.model,
	});
	return {
		agentArenaModelScoreRows: snapshot.rows,
		sourceStatus: {
			source: "agent_arena",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "agentArena",
		},
	};
}

/** Loads BlueprintBench rows keyed by model name for cache and missing-row tracking. */
export async function blueprintBenchSnapshot(
	cached: ReturnType<typeof readBlueprintBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BlueprintBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "blueprint_bench_2",
		cached,
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
	cached: ReturnType<typeof readBrowseCompRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BrowseCompSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "browsecomp",
		cached,
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

/** Loads Chartography through its own cache and missing-row lifecycle. */
export function chartographySnapshot(
	cached: ReturnType<typeof readChartographyRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"chartography",
		"chartography",
		getChartographyStats,
	);
}

/** Loads Chess Puzzles through its own cache and missing-row lifecycle. */
export function chessPuzzlesSnapshot(
	cached: ReturnType<typeof readChessPuzzlesRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"chess_puzzles",
		"chessPuzzles",
		getEpochChessPuzzleStats,
	);
}

/** Loads CursorBench rows keyed by model, base model, and reasoning effort. */
export async function cursorBenchSnapshot(
	cached: ReturnType<typeof readCursorBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<CursorBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "cursorbench",
		cached,
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

/** Loads EBR-Bench through its own cache and missing-row lifecycle. */
export function ebrBenchSnapshot(
	cached: ReturnType<typeof readEbrBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"ebr_bench",
		"ebrBench",
		getEpochEbrBenchStats,
	);
}

/** Loads EnterpriseBench CoreCraft through its own cache and missing-row lifecycle. */
export function enterpriseBenchCoreCraftSnapshot(
	cached: ReturnType<typeof readEnterpriseBenchCoreCraftRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"enterprisebench_corecraft",
		"enterpriseBenchCoreCraft",
		getEnterpriseBenchCoreCraftStats,
	);
}

/** Loads Epoch Capabilities Index through its own cache and missing-row lifecycle. */
export function epochCapabilitiesIndexSnapshot(
	cached: ReturnType<typeof readEpochCapabilitiesIndexRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"epoch_capabilities_index",
		"epochCapabilitiesIndex",
		getEpochCapabilitiesIndexStats,
	);
}

/** Loads FrontierMath Tier 4 through its own cache and missing-row lifecycle. */
export function frontierMathTier4Snapshot(
	cached: ReturnType<typeof readFrontierMathTier4RawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"frontiermath_tier_4",
		"frontierMathTier4",
		getEpochFrontierMathTier4Stats,
	);
}

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

/** Loads HANDBOOK.md through its own cache and missing-row lifecycle. */
export function handbookMdSnapshot(
	cached: ReturnType<typeof readHandbookMdRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BenchmarkScoreSnapshot> {
	return benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"handbook_md",
		"handbookMd",
		getHandbookMdStats,
	);
}

/** Loads Mercor APEX rows keyed by its stable contender ID and effort. */
export async function mercorApexAgentsSnapshot(
	cached: ReturnType<typeof readMercorApexAgentsRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<MercorApexAgentsSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "mercor_apex_agents",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getMercorApexAgentsStats,
		rowKey: (row) => sourceKey(row.model_id, row.reasoning_effort),
		rowLabel: (row) => row.source_model,
	});
	return {
		mercorApexAgentsRows: snapshot.rows,
		sourceStatus: {
			source: "mercor_apex_agents",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "mercorApexAgents",
		},
	};
}

/** Loads Vals ProofBench rows through an independent source lifecycle. */
export async function proofBenchSnapshot(
	cached: ReturnType<typeof readProofBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ProofBenchSnapshot> {
	const snapshot = await benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"proofbench",
		"proofBench",
		getProofBenchStats,
	);
	return {
		proofBenchRows: snapshot.rows,
		sourceStatus: snapshot.sourceStatus,
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

/** Loads Terminal-Bench rows while using overall model-harness rows for matching. */
export async function valsTerminalBenchSnapshot(
	cached: ReturnType<typeof readValsTerminalBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<TerminalBenchSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getTerminalBenchStats();
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
		(row) => sourceKey(row.task, row.source_model_id, row.harness ?? "default"),
	);
	const modelScores = rows.filter(
		(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
	);
	const states = snapshotRowsWithStates({
		source: "vals_terminal_bench",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.source_model_id, row.harness ?? "default"),
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

/** Loads Toolathlon rows keyed by provider and model for cache row continuity. */
export async function toolathlonSnapshot(
	cached: ReturnType<typeof readToolathlonRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ToolathlonSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "toolathlon",
		cached,
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
	cached: ReturnType<typeof readValsIndexRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ValsIndexSnapshot> {
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

/** Loads Vending-Bench 2 model curves and records the versioned official data-module URL. */
export async function vendingBench2Snapshot(
	cached: ReturnType<typeof readVendingBench2RawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<VendingBench2Snapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "vending_bench_2",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getVendingBench2Stats,
		rowKey: (row) => sourceKey(row.model, row.reasoning_effort),
		rowLabel: (row) => row.model,
	});
	return {
		vendingBench2ModelScoreRows: snapshot.rows,
		vendingBench2DataUrl: snapshot.sourceUrl ?? null,
		sourceStatus: {
			source: "vending_bench_2",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "vendingBench2",
		},
	};
}

/** Loads WeirdML rows through an independent source lifecycle. */
export async function weirdMlSnapshot(
	cached: ReturnType<typeof readWeirdMlRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<WeirdMlSnapshot> {
	const snapshot = await benchmarkScoreSnapshot(
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		"weirdml",
		"weirdMl",
		getWeirdMlStats,
	);
	return {
		weirdMlRows: snapshot.rows,
		sourceStatus: snapshot.sourceStatus,
	};
}

export type ProofBenchSnapshot = {
	proofBenchRows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

export type WeirdMlSnapshot = {
	weirdMlRows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

function benchmarkScoreRowKey(row: BenchmarkScoreRow): string {
	const rawRunId = row.metadata.run_id;
	const runId =
		typeof rawRunId === "string" || typeof rawRunId === "number"
			? rawRunId
			: null;
	return sourceKey(
		row.benchmark_key,
		runId ?? row.model_id ?? row.model,
		row.reasoning_effort,
	);
}

function benchmarkScoreRowLabel(row: BenchmarkScoreRow): string {
	return `${row.benchmark_key}: ${row.model}`;
}

/** Builds a stable cache key that keeps benchmark reasoning-effort observations distinct. */
export function artificialAnalysisEvaluationResourceSourceKey(
	row: ArtificialAnalysisEvaluationResourceRow,
): string {
	return sourceKey(row.benchmark_key, row.model_id, row.reasoning_effort);
}
