/** Sparse benchmark snapshots keep each source's identity fields intact before shared missing-row policy runs. */

import {
	type AgentArenaModelScoreRow,
	getAgentArenaStats,
} from "../../scrapers/agent-arena";
import {
	type AleBenchConfigurationRow,
	getAleBenchStats,
} from "../../scrapers/ale-bench";
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
import {
	type FrontierCodeModelEffortRow,
	getFrontierCodeStats,
} from "../../scrapers/frontier-code";
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
import { getCodeMigrationStats } from "../../scrapers/vals/code-migration";
import { getCyberBenchStats } from "../../scrapers/vals/cyberbench";
import { getEmbStats } from "../../scrapers/vals/emb";
import { getFinanceAgentV2Stats } from "../../scrapers/vals/finance-agent-v2";
import {
	getHarveyLabStats,
	type HarveyLabModelScoreRow,
	type HarveyLabTaskRow,
} from "../../scrapers/vals/harvey-lab";
import {
	getValsIndexStats,
	type ValsIndexModelScoreRow,
	type ValsIndexTaskScoreRow,
} from "../../scrapers/vals/index-benchmark";
import { getLegalResearchStats } from "../../scrapers/vals/legal-research";
import { getMedCodeStats } from "../../scrapers/vals/medcode";
import { getProgramBenchStats } from "../../scrapers/vals/programbench";
import { getProofBenchStats } from "../../scrapers/vals/proofbench";
import { getPublicBenefitsBenchStats } from "../../scrapers/vals/public-benefits-bench";
import {
	getTerminalBenchStats,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchTaskRow,
} from "../../scrapers/vals/terminal-bench";
import { getVibeCodeStats } from "../../scrapers/vals/vibe-code";
import {
	getVendingBench2Stats,
	type VendingBench2ModelScoreRow,
} from "../../scrapers/vending-bench-2";
import { getWeirdMlStats } from "../../scrapers/weirdml";
import type {
	readAgentArenaRawCache,
	readAleBenchRawCache,
	readArtificialAnalysisEvaluationResourceRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readCodeMigrationRawCache,
	readCursorBenchRawCache,
	readCyberBenchRawCache,
	readEbrBenchRawCache,
	readEmbRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFinanceAgentV2RawCache,
	readFrontierCodeRawCache,
	readFrontierMathTier4RawCache,
	readGdpPdfRawCache,
	readHandbookMdRawCache,
	readHarveyLabRawCache,
	readLegalResearchRawCache,
	readMedCodeRawCache,
	readMercorApexAgentsRawCache,
	readProgramBenchRawCache,
	readProofBenchRawCache,
	readPublicBenefitsBenchRawCache,
	readRiemannBenchRawCache,
	readTerminalBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readVendingBench2RawCache,
	readVibeCodeRawCache,
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
	benchmarkScoreRowKey,
	modelScoreSnapshot,
	shouldUseFetchedRows,
	snapshotFetchedAt,
} from "./model-score";

type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type AgentArenaSnapshot = {
	agentArenaModelScoreRows: AgentArenaModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type AleBenchSnapshot = {
	aleBenchConfigurationRows: AleBenchConfigurationRow[];
	sourceStatus: SourceSnapshotStatus;
};

type ArtificialAnalysisEvaluationResourceSnapshot = {
	artificialAnalysisEvaluationResourceRows: ArtificialAnalysisEvaluationResourceRow[];
	sourceStatus: SourceSnapshotStatus;
};

type BrowseCompSnapshot = {
	browseCompModelScoreRows: BrowseCompModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type FrontierCodeSnapshot = {
	frontierCodeRows: FrontierCodeModelEffortRow[];
	sourceStatus: SourceSnapshotStatus;
};

type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: GdpPdfModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type HarveyLabSnapshot = {
	harveyLabRows: HarveyLabTaskRow[];
	harveyLabModelScoreRows: HarveyLabModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type MercorApexAgentsSnapshot = {
	mercorApexAgentsRows: MercorApexAgentsRow[];
	sourceStatus: SourceSnapshotStatus;
};

type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
	riemannBenchSourceUrl: string;
	sourceStatus: SourceSnapshotStatus;
};

type ToolathlonSnapshot = {
	toolathlonModelScoreRows: ToolathlonModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type ValsIndexSnapshot = {
	valsIndexRows: ValsIndexTaskScoreRow[];
	valsIndexModelScoreRows: ValsIndexModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type TerminalBenchSnapshot = {
	terminalBenchRows: TerminalBenchTaskRow[];
	terminalBenchModelScoreRows: TerminalBenchModelHarnessRow[];
	sourceStatus: SourceSnapshotStatus;
};

type VendingBench2Snapshot = {
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
		rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
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
}

/** Loads Artificial Analysis evaluation resources keyed by benchmark, source model, and effort. */
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

/** Loads all ALE refinement checkpoints while scoring remains restricted to the source-default row. */
export async function aleBenchSnapshot(
	cached: ReturnType<typeof readAleBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AleBenchSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "ale_bench",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: async () => {
			const payload = await getAleBenchStats();
			return {
				fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
				data: payload.data,
			};
		},
		rowKey: (row) => sourceKey(row.model, row.num_self_refine),
		rowLabel: (row) => `${row.model} x${row.num_self_refine}`,
	});
	return {
		aleBenchConfigurationRows: snapshot.rows,
		sourceStatus: {
			source: "ale_bench",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "aleBench",
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

/** Loads Code Migration through its own cache and missing-row lifecycle. */
export function codeMigrationSnapshot(
	cached: ReturnType<typeof readCodeMigrationRawCache>,
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
		"code_migration",
		"codeMigration",
		getCodeMigrationStats,
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

/** Loads CyberBench through its own cache and missing-row lifecycle. */
export function cyberBenchSnapshot(
	cached: ReturnType<typeof readCyberBenchRawCache>,
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
		"cyberbench",
		"cyberBench",
		getCyberBenchStats,
	);
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

/** Loads EMB through its own cache and missing-row lifecycle. */
export function embSnapshot(
	cached: ReturnType<typeof readEmbRawCache>,
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
		"emb",
		"emb",
		getEmbStats,
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

/** Loads Finance Agent V2 through its own cache and missing-row lifecycle. */
export function financeAgentV2Snapshot(
	cached: ReturnType<typeof readFinanceAgentV2RawCache>,
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
		"finance_agent_v2",
		"financeAgentV2",
		getFinanceAgentV2Stats,
	);
}

/** Loads every FrontierCode effort while keeping source effort labels in the persisted row identity. */
export async function frontierCodeSnapshot(
	cached: ReturnType<typeof readFrontierCodeRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<FrontierCodeSnapshot> {
	const snapshot = await modelScoreSnapshot({
		source: "frontier_code",
		cached,
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getFrontierCodeStats,
		rowKey: (row) => sourceKey(row.base_model, row.source_effort),
		rowLabel: (row) => `${row.model}: ${row.harness}`,
	});
	return {
		frontierCodeRows: snapshot.rows,
		sourceStatus: {
			source: "frontier_code",
			fetchedAt: snapshot.fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.sourceRowStates,
			fetchedAtKey: "frontierCode",
		},
	};
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

/** Loads Harvey LAB rows while using strict overall task resolution for scoring. */
export async function harveyLabSnapshot(
	cached: ReturnType<typeof readHarveyLabRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<HarveyLabSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getHarveyLabStats();
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
		(row) => sourceKey(row.task, row.model_id, row.reasoning_effort),
	);
	const modelScores = rows.filter(
		(row): row is HarveyLabModelScoreRow =>
			row.task === "overall" && row.metric === "task_resolution",
	);
	const states = snapshotRowsWithStates({
		source: "vals_harvey_lab",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.model_id, row.reasoning_effort),
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
		harveyLabRows: rows,
		harveyLabModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_harvey_lab",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "harveyLab",
		},
	};
}

/** Loads Legal Research through its own cache and missing-row lifecycle. */
export function legalResearchSnapshot(
	cached: ReturnType<typeof readLegalResearchRawCache>,
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
		"legal_research",
		"legalResearch",
		getLegalResearchStats,
	);
}

/** Loads MedCode through its own cache and missing-row lifecycle. */
export function medCodeSnapshot(
	cached: ReturnType<typeof readMedCodeRawCache>,
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
		"medcode",
		"medCode",
		getMedCodeStats,
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

/** Loads ProgramBench through its own cache and missing-row lifecycle. */
export function programBenchSnapshot(
	cached: ReturnType<typeof readProgramBenchRawCache>,
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
		"programbench",
		"programBench",
		getProgramBenchStats,
	);
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

/** Loads Public Benefits Bench through its own cache and missing-row lifecycle. */
export function publicBenefitsBenchSnapshot(
	cached: ReturnType<typeof readPublicBenefitsBenchRawCache>,
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
		"public_benefits_bench",
		"publicBenefitsBench",
		getPublicBenefitsBenchStats,
	);
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
export async function terminalBenchSnapshot(
	cached: ReturnType<typeof readTerminalBenchRawCache>,
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
		terminalBenchRows: rows,
		terminalBenchModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_terminal_bench",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "terminalBench",
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

/** Loads Vibe Code through its own cache and missing-row lifecycle. */
export function vibeCodeSnapshot(
	cached: ReturnType<typeof readVibeCodeRawCache>,
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
		"vibe_code",
		"vibeCode",
		getVibeCodeStats,
	);
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

type ProofBenchSnapshot = {
	proofBenchRows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type WeirdMlSnapshot = {
	weirdMlRows: BenchmarkScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Builds a stable cache key that keeps benchmark reasoning-effort observations distinct. */
export function artificialAnalysisEvaluationResourceSourceKey(
	row: ArtificialAnalysisEvaluationResourceRow,
): string {
	return sourceKey(row.benchmark_key, row.model_id, row.reasoning_effort);
}
