/** Sparse benchmark snapshots preserve source identities, raw evidence, and source-owned summaries. */

import {
	type AgentArenaModelScoreRow,
	getAgentArenaStats,
} from "../../../scrapers/agent-arena";
import {
	type AgentsLastExamHarnessRow,
	type AgentsLastExamModelScoreRow,
	getAgentsLastExamHarnessStats,
	summarizeAgentsLastExamModelScores,
} from "../../../scrapers/agents-last-exam";
import {
	type AleBenchConfigurationRow,
	getAleBenchStats,
} from "../../../scrapers/ale-bench";
import {
	type BlueprintBenchModelScoreRow,
	getBlueprintBenchStats,
} from "../../../scrapers/blueprint-bench";
import {
	type CursorBenchModelScoreRow,
	getCursorBenchStats,
} from "../../../scrapers/cursorbench";
import {
	type DeepSWERawLeaderboardRow,
	type DeepSWESourceVersion,
	deepSWESourceVersionForRows,
	getDeepSWERawLeaderboardSourceRows,
	preferredDeepSWELeaderboardRows,
} from "../../../scrapers/deep-swe";
import {
	type FrontierCodeModelEffortRow,
	getFrontierCodeStats,
} from "../../../scrapers/frontier-code";
import {
	getMercorApexAgentsStats,
	type MercorApexAgentsRow,
} from "../../../scrapers/mercor-apex-agents";
import {
	getVendingBench2Stats,
	type VendingBench2ModelScoreRow,
} from "../../../scrapers/vending-bench-2";
import type {
	readAgentArenaRawCache,
	readAgentsLastExamRawCache,
	readAleBenchRawCache,
	readBlueprintBenchRawCache,
	readCursorBenchRawCache,
	readDeepSWERawCache,
	readFrontierCodeRawCache,
	readMercorApexAgentsRawCache,
	readVendingBench2RawCache,
} from "../../cache";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
} from "../../types";
import { snapshotRowsWithStates, sourceKey } from "../policy";
import {
	shouldUseFetchedRows,
	snapshotFetchedAt,
	snapshotSourceRows,
} from "../row-snapshot";

type AgentArenaSnapshot = {
	agentArenaModelScoreRows: AgentArenaModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type AgentsLastExamSnapshot = {
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type AleBenchSnapshot = {
	aleBenchConfigurationRows: AleBenchConfigurationRow[];
	sourceStatus: SourceSnapshotStatus;
};

type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

type DeepSWESnapshot = {
	deepSWERawRows: DeepSWERawLeaderboardRow[];
	deepSWESourceVersion: DeepSWESourceVersion | null;
	sourceStatus: SourceSnapshotStatus;
};

type FrontierCodeSnapshot = {
	frontierCodeRows: FrontierCodeModelEffortRow[];
	sourceStatus: SourceSnapshotStatus;
};

type MercorApexAgentsSnapshot = {
	mercorApexAgentsRows: MercorApexAgentsRow[];
	sourceStatus: SourceSnapshotStatus;
};

type VendingBench2Snapshot = {
	vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
	vendingBench2DataUrl: string | null;
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Agent Arena rows keyed by contender identity so renamed display labels remain auditable. */
export async function agentArenaSnapshot(
	cached: ReturnType<typeof readAgentArenaRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentArenaSnapshot> {
	const snapshot = await snapshotSourceRows({
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

/** Preserves Agents Last Exam harness rows while returning summarized model scores. */
export async function agentsLastExamSnapshot(
	cached: ReturnType<typeof readAgentsLastExamRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentsLastExamSnapshot> {
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "agents_last_exam",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(row.split, row.harness, row.model, row.harness_variant),
			rowLabel: (row) => `${row.model} ${row.split}`,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			agentsLastExamRows: cachedSnapshot.rows,
			agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
				cachedSnapshot.rows,
			),
			sourceStatus: {
				source: "agents_last_exam",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedSnapshot.rows.length,
				sourceRowStates: cachedSnapshot.states,
				fetchedAtKey: "agentsLastExam",
			},
		};
	}
	const fetched = await getAgentsLastExamHarnessStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "agents_last_exam",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) =>
			sourceKey(row.split, row.harness, row.model, row.harness_variant),
		rowLabel: (row) => `${row.model} ${row.split}`,
		previousMissingSince,
		nowEpochSeconds,
	});
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		agentsLastExamRows: snapshot.rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
			snapshot.rows,
		),
		sourceStatus: {
			source: "agents_last_exam",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "agentsLastExam",
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
	const snapshot = await snapshotSourceRows({
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
	const snapshot = await snapshotSourceRows({
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

/** Loads CursorBench rows keyed by model, base model, and reasoning effort. */
export async function cursorBenchSnapshot(
	cached: ReturnType<typeof readCursorBenchRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<CursorBenchSnapshot> {
	const snapshot = await snapshotSourceRows({
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

/** Preserves DeepSWE raw leaderboard rows and records the preferred source version. */
export async function deepSWESnapshot(
	cached: ReturnType<typeof readDeepSWERawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<DeepSWESnapshot> {
	const hasCachedEffortMetadata = cached?.rows.some(
		(row) => row.reasoning_effort != null || row.config != null,
	);
	if (
		status.cache_hit &&
		cached != null &&
		hasCachedEffortMetadata &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "deep_swe",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(
					row.source_version,
					row.model,
					row.reasoning_effort,
					row.config,
				),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			deepSWERawRows: cachedSnapshot.rows,
			deepSWESourceVersion: cached.sourceVersion,
			sourceStatus: {
				source: "deep_swe",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedSnapshot.rows.length,
				sourceRowStates: cachedSnapshot.states,
				fetchedAtKey: "deepSWE",
			},
		};
	}
	const fetched = await getDeepSWERawLeaderboardSourceRows();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "deep_swe",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) =>
			sourceKey(
				row.source_version,
				row.model,
				row.reasoning_effort,
				row.config,
			),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	const preferredRows = preferredDeepSWELeaderboardRows(snapshot.rows);
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		deepSWERawRows: snapshot.rows,
		deepSWESourceVersion:
			preferredRows.length > 0
				? deepSWESourceVersionForRows(snapshot.rows)
				: (cached?.sourceVersion ?? null),
		sourceStatus: {
			source: "deep_swe",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "deepSWE",
		},
	};
}

/** Loads every FrontierCode effort while keeping source effort labels in the persisted row identity. */
export async function frontierCodeSnapshot(
	cached: ReturnType<typeof readFrontierCodeRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<FrontierCodeSnapshot> {
	const snapshot = await snapshotSourceRows({
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

/** Loads Mercor APEX rows keyed by its stable contender ID and effort. */
export async function mercorApexAgentsSnapshot(
	cached: ReturnType<typeof readMercorApexAgentsRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<MercorApexAgentsSnapshot> {
	const snapshot = await snapshotSourceRows({
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

/** Loads Vending-Bench 2 model curves and records the versioned official data-module URL. */
export async function vendingBench2Snapshot(
	cached: ReturnType<typeof readVendingBench2RawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<VendingBench2Snapshot> {
	const snapshot = await snapshotSourceRows({
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
