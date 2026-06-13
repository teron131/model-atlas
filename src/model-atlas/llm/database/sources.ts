/** Source snapshot calculations for the Model Atlas SQLite database pipeline. */

import type { DatabaseSync } from "node:sqlite";
import {
	buildAgentsLastExamScoreByModelName,
	getAgentsLastExamHarnessStats,
	summarizeAgentsLastExamModelScores,
} from "../scrapers/agents-last-exam";
import {
	ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS,
	getArtificialAnalysisScrapedRawStats,
	processArtificialAnalysisScrapedRows,
} from "../scrapers/artificial-analysis-evals";
import { buildAutomationBenchScoreByModelName } from "../scrapers/automation-bench";
import {
	buildBlueprintBenchScoreByModelName,
	getBlueprintBenchModelScoreStats,
} from "../scrapers/blueprint-bench";
import {
	buildBrowseCompScoreByModelName,
	getBrowseCompModelScoreStats,
} from "../scrapers/browsecomp";
import {
	buildCursorBenchScoreByModelName,
	getCursorBenchModelScoreStats,
} from "../scrapers/cursorbench";
import {
	buildDeepSWEScoreByModelName,
	getDeepSWERawLeaderboardStats,
	summarizeDeepSWEDefaultModelScores,
} from "../scrapers/deep-swe";
import {
	buildGdpPdfScoreByModelName,
	getGdpPdfModelScoreStats,
} from "../scrapers/gdp-pdf";
import {
	getModelsDevSourceStats,
	type ModelsDevPayload,
	type ProviderRecord,
	processModelsDevPayload,
} from "../scrapers/models-dev";
import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import {
	buildRiemannBenchScoreByModelName,
	getRiemannBenchModelScoreStats,
} from "../scrapers/riemann-bench";
import {
	buildTerminalBenchAccuracyByModelName,
	getTerminalBenchAgentModelAccuracyStats,
	summarizeTerminalBenchModelMedianAccuracy,
} from "../scrapers/terminal-bench";
import {
	buildToolathlonScoreByModelName,
	getToolathlonModelScoreStats,
} from "../scrapers/toolathlon";
import { modelSlugFromModelId } from "../shared";
import {
	buildAaRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
	pickPreferredModelsDevRows,
} from "../stats/source-policy";
import type { LlmStatsSourceData } from "../stats/types";
import {
	readAgentsLastExamRawCache,
	readArtificialAnalysisRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readCursorBenchRawCache,
	readDeepSWERawCache,
	readGdpPdfRawCache,
	readModelsDevRawCache,
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	readRiemannBenchRawCache,
	readTerminalBenchRawCache,
	readToolathlonRawCache,
	refreshedCacheStatus,
} from "./cache";
import {
	latestSourceRowStates,
	missingSinceBySource,
	rowStringValue,
	snapshotRowsWithStates,
	sourceKey,
	sourceStatesForModelsDevPayload,
} from "./policy";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

type AaSnapshot = {
	aaRawRows: SourceSnapshots["aaRawRows"];
	aaSelectedRows: SourceSnapshots["aaSelectedRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { artificialAnalysis: number | null };
};

type ModelsDevSnapshot = Pick<
	SourceSnapshots,
	| "modelsDevPayload"
	| "modelsDevModels"
	| "modelsDevFetchedAt"
	| "modelsDevStatusCode"
> & { sourceRowStates: SourceRowState[] };

type DeepSWESnapshot = {
	deepSWERawRows: SourceSnapshots["deepSWERawRows"];
	deepSWEModelScoreRows: SourceSnapshots["deepSWEModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { deepSWE: number | null };
};

type TerminalBenchSnapshot = {
	terminalBenchRows: SourceSnapshots["terminalBenchRows"];
	terminalBenchModelScores: SourceSnapshots["terminalBenchModelScores"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { terminalBench: number | null };
};

type AgentsLastExamSnapshot = {
	agentsLastExamRows: SourceSnapshots["agentsLastExamRows"];
	agentsLastExamModelScores: SourceSnapshots["agentsLastExamModelScores"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { agentsLastExam: number | null };
};

type BrowseCompSnapshot = {
	browseCompModelScoreRows: SourceSnapshots["browseCompModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { browseComp: number | null };
};

type BlueprintBenchSnapshot = {
	blueprintBenchModelScoreRows: SourceSnapshots["blueprintBenchModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { blueprintBench: number | null };
};

type GdpPdfSnapshot = {
	gdpPdfModelScoreRows: SourceSnapshots["gdpPdfModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { gdpPdf: number | null };
};

type RiemannBenchSnapshot = {
	riemannBenchModelScoreRows: SourceSnapshots["riemannBenchModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { riemannBench: number | null };
};

type ToolathlonSnapshot = {
	toolathlonModelScoreRows: SourceSnapshots["toolathlonModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { toolathlon: number | null };
};

type CursorBenchSnapshot = {
	cursorBenchModelScoreRows: SourceSnapshots["cursorBenchModelScoreRows"];
	sourceRowStates: SourceRowState[];
	fetchedAt: { cursorBench: number | null };
};

/** Project loaded snapshots into the source data consumed by matching and enrichment. */
export function sourceDataFromSnapshots(
	snapshots: SourceSnapshots,
): LlmStatsSourceData {
	const preferredModelsDevModels = pickPreferredModelsDevRows(
		snapshots.modelsDevModels,
	);
	return {
		artificialAnalysisRows: snapshots.aaSelectedRows,
		preferredModelsDevModels,
		modelsDevById: new Map(
			preferredModelsDevModels.map((modelsDevModel) => [
				modelsDevModel.model_id,
				modelsDevModel,
			]),
		),
		artificialAnalysisBySlug: new Map(
			snapshots.aaSelectedRows.flatMap((row) => {
				const modelId = typeof row.model_id === "string" ? row.model_id : null;
				const slug = modelSlugFromModelId(modelId);
				return slug == null ? [] : [[slug, row]];
			}),
		),
		deepSWEModelScoreRows: snapshots.deepSWEModelScoreRows,
		deepSWEScoreByModelName: buildDeepSWEScoreByModelName(
			snapshots.deepSWEModelScoreRows,
		),
		terminalBenchAccuracyByModelName: buildTerminalBenchAccuracyByModelName(
			snapshots.terminalBenchModelScores,
		),
		agentsLastExamModelScoreRows: snapshots.agentsLastExamModelScores,
		agentsLastExamScoreByModelName: buildAgentsLastExamScoreByModelName(
			snapshots.agentsLastExamModelScores,
		),
		automationBenchModelScoreRows: [],
		automationBenchScoreByModelName: buildAutomationBenchScoreByModelName([]),
		blueprintBenchModelScoreRows: snapshots.blueprintBenchModelScoreRows,
		blueprintBenchScoreByModelName: buildBlueprintBenchScoreByModelName(
			snapshots.blueprintBenchModelScoreRows,
		),
		gdpPdfModelScoreRows: snapshots.gdpPdfModelScoreRows,
		gdpPdfScoreByModelName: buildGdpPdfScoreByModelName(
			snapshots.gdpPdfModelScoreRows,
		),
		riemannBenchModelScoreRows: snapshots.riemannBenchModelScoreRows,
		riemannBenchScoreByModelName: buildRiemannBenchScoreByModelName(
			snapshots.riemannBenchModelScoreRows,
		),
		browseCompModelScoreRows: snapshots.browseCompModelScoreRows,
		browseCompScoreByModelName: buildBrowseCompScoreByModelName(
			snapshots.browseCompModelScoreRows,
		),
		toolathlonModelScoreRows: snapshots.toolathlonModelScoreRows,
		toolathlonScoreByModelName: buildToolathlonScoreByModelName(
			snapshots.toolathlonModelScoreRows,
		),
		cursorBenchModelScoreRows: snapshots.cursorBenchModelScoreRows,
		cursorBenchScoreByModelName: buildCursorBenchScoreByModelName(
			snapshots.cursorBenchModelScoreRows,
		),
	};
}

function sourceCacheDefaults(
	db: DatabaseSync,
	nowEpochSeconds: number,
): Record<RawSourceName, RawSourceCacheStatus> {
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source) => [
			source,
			readRawSourceCacheStatus(db, source, nowEpochSeconds),
		]),
	) as Record<RawSourceName, RawSourceCacheStatus>;
}

function shouldUseFetchedRows(
	fetchedAtEpochSeconds: number | null,
	rowCount: number,
): boolean {
	return fetchedAtEpochSeconds != null && rowCount > 0;
}

function snapshotFetchedAt(
	hasUsableFetchedRows: boolean,
	cachedFetchedAt: number | null | undefined,
	fetchedAtEpochSeconds: number | null,
): number | null {
	return hasUsableFetchedRows || cachedFetchedAt == null
		? fetchedAtEpochSeconds
		: cachedFetchedAt;
}

function mergeModelsDevPayload(
	cachedPayload: ModelsDevPayload | undefined,
	fetchedPayload: ModelsDevPayload,
	options: DatabaseBuildOptions,
): ModelsDevPayload {
	if (cachedPayload == null || options.replaceSourceRows === true) {
		return fetchedPayload;
	}
	const mergedPayload: ModelsDevPayload = structuredClone(cachedPayload);
	for (const [providerId, fetchedProvider] of Object.entries(fetchedPayload)) {
		const cachedProvider = mergedPayload[providerId];
		const mergedProvider: ProviderRecord = {
			...cachedProvider,
			...fetchedProvider,
			models: {
				...(cachedProvider?.models ?? {}),
				...(fetchedProvider.models ?? {}),
			},
		};
		mergedPayload[providerId] = mergedProvider;
	}
	return mergedPayload;
}

function updatedSourceCacheStatus(
	status: RawSourceCacheStatus,
	lastFetchEpochSeconds: number | null,
	sourceInputCount: number,
): RawSourceCacheStatus {
	return {
		...status,
		refreshed:
			!status.cache_hit &&
			lastFetchEpochSeconds !== status.last_fetch_epoch_seconds,
		last_fetch_epoch_seconds: lastFetchEpochSeconds,
		source_input_count: sourceInputCount,
	};
}

function modelsDevSourceInputCount(
	payload: ModelsDevSnapshot["modelsDevPayload"],
): number {
	return Object.values(payload).reduce(
		(count, provider) => count + Object.keys(provider.models ?? {}).length,
		0,
	);
}

async function aaSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AaSnapshot> {
	const cached = readArtificialAnalysisRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "artificial_analysis",
			cachedRows: cached.aaRawRows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => rowStringValue(row, "model_id"),
			rowLabel: (row) => rowStringValue(row, "name"),
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			aaRawRows: cachedSnapshot.rows,
			aaSelectedRows: processArtificialAnalysisScrapedRows(
				cachedSnapshot.rows,
				{
					selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
				},
			),
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { artificialAnalysis: cached.fetchedAt },
		};
	}
	const fetched = await getArtificialAnalysisScrapedRawStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "artificial_analysis",
		cachedRows: cached?.aaRawRows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => rowStringValue(row, "model_id"),
		rowLabel: (row) => rowStringValue(row, "name"),
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		aaRawRows: snapshot.rows,
		aaSelectedRows: processArtificialAnalysisScrapedRows(snapshot.rows, {
			selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
		}),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			artificialAnalysis: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function modelsDevSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ModelsDevSnapshot> {
	const cached = readModelsDevRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const sourceRowStates = sourceStatesForModelsDevPayload(
			cached.payload,
			null,
			false,
			previousMissingSince,
			nowEpochSeconds,
			options,
		);
		return {
			modelsDevPayload: cached.payload,
			modelsDevModels: processModelsDevPayload(
				cached.payload,
				isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
			),
			modelsDevFetchedAt: cached.fetchedAt,
			modelsDevStatusCode: cached.statusCode,
			sourceRowStates,
		};
	}
	const fetched = await getModelsDevSourceStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		Object.keys(fetched.payload).length,
	);
	const payload = hasUsableFetchedRows
		? mergeModelsDevPayload(cached?.payload, fetched.payload, options)
		: (cached?.payload ?? fetched.payload);
	return {
		modelsDevPayload: payload,
		modelsDevModels: processModelsDevPayload(
			payload,
			isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		),
		sourceRowStates: sourceStatesForModelsDevPayload(
			payload,
			fetched.payload,
			hasUsableFetchedRows,
			previousMissingSince,
			nowEpochSeconds,
			options,
		),
		modelsDevFetchedAt: snapshotFetchedAt(
			hasUsableFetchedRows,
			cached?.fetchedAt,
			fetched.fetched_at_epoch_seconds,
		),
		modelsDevStatusCode:
			hasUsableFetchedRows || cached?.statusCode == null
				? fetched.status_code
				: cached.statusCode,
	};
}

async function deepSWESnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<DeepSWESnapshot> {
	const cached = readDeepSWERawCache(db);
	const cachedHasEffortMetadata = cached?.rows.some(
		(row) => row.reasoning_effort != null || row.config != null,
	);
	if (
		status.cache_hit &&
		cached != null &&
		cachedHasEffortMetadata &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "deep_swe",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.model, row.reasoning_effort, row.config),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			deepSWERawRows: cachedSnapshot.rows,
			deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(
				cachedSnapshot.rows,
			),
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { deepSWE: cached.fetchedAt },
		};
	}
	const fetched = await getDeepSWERawLeaderboardStats();
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
		rowKey: (row) => sourceKey(row.model, row.reasoning_effort, row.config),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		deepSWERawRows: snapshot.rows,
		deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(snapshot.rows),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			deepSWE: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function terminalBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<TerminalBenchSnapshot> {
	const cached = readTerminalBenchRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "terminal_bench",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.agent, row.model),
			rowLabel: (row) => `${row.agent} ${row.model}`,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			terminalBenchRows: cachedSnapshot.rows,
			terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(
				cachedSnapshot.rows,
			),
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { terminalBench: cached.fetchedAt },
		};
	}
	const fetched = await getTerminalBenchAgentModelAccuracyStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "terminal_bench",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.agent, row.model),
		rowLabel: (row) => `${row.agent} ${row.model}`,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		terminalBenchRows: snapshot.rows,
		terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(
			snapshot.rows,
		),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			terminalBench: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function agentsLastExamSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentsLastExamSnapshot> {
	const cached = readAgentsLastExamRawCache(db);
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
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { agentsLastExam: cached.fetchedAt },
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
	return {
		agentsLastExamRows: snapshot.rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
			snapshot.rows,
		),
		sourceRowStates: snapshot.states,
		fetchedAt: {
			agentsLastExam: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function browseCompSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BrowseCompSnapshot> {
	const cached = readBrowseCompRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "browsecomp",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.provider, row.model),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			browseCompModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { browseComp: cached.fetchedAt },
		};
	}
	const fetched = await getBrowseCompModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "browsecomp",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		browseCompModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			browseComp: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function blueprintBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<BlueprintBenchSnapshot> {
	const cached = readBlueprintBenchRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "blueprint_bench_2",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.model),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			blueprintBenchModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { blueprintBench: cached.fetchedAt },
		};
	}
	const fetched = await getBlueprintBenchModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "blueprint_bench_2",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.model),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		blueprintBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			blueprintBench: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function gdpPdfSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<GdpPdfSnapshot> {
	const cached = readGdpPdfRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "gdp_pdf",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.provider, row.model),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			gdpPdfModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { gdpPdf: cached.fetchedAt },
		};
	}
	const fetched = await getGdpPdfModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "gdp_pdf",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		gdpPdfModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			gdpPdf: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function riemannBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<RiemannBenchSnapshot> {
	const cached = readRiemannBenchRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "riemann_bench",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.provider, row.model),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			riemannBenchModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { riemannBench: cached.fetchedAt },
		};
	}
	const fetched = await getRiemannBenchModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "riemann_bench",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		riemannBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			riemannBench: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function toolathlonSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<ToolathlonSnapshot> {
	const cached = readToolathlonRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "toolathlon",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) => sourceKey(row.provider, row.model),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			toolathlonModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { toolathlon: cached.fetchedAt },
		};
	}
	const fetched = await getToolathlonModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "toolathlon",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		toolathlonModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			toolathlon: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

async function cursorBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<CursorBenchSnapshot> {
	const cached = readCursorBenchRawCache(db);
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "cursorbench",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(row.model, row.base_model, row.reasoning_effort),
			rowLabel: (row) => row.model,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			cursorBenchModelScoreRows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { cursorBench: cached.fetchedAt },
		};
	}
	const fetched = await getCursorBenchModelScoreStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "cursorbench",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) => sourceKey(row.model, row.base_model, row.reasoning_effort),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	});
	return {
		cursorBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: {
			cursorBench: snapshotFetchedAt(
				hasUsableFetchedRows,
				cached?.fetchedAt,
				fetched.fetched_at_epoch_seconds,
			),
		},
	};
}

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
	options: DatabaseBuildOptions = {},
): Promise<SourceSnapshotCacheResult> {
	const sourceCache = sourceCacheDefaults(db, nowEpochSeconds);
	const previousMissingSince = missingSinceBySource(latestSourceRowStates(db));
	const [
		aa,
		modelsDev,
		deepSWE,
		terminalBench,
		agentsLastExam,
		blueprintBench,
		gdpPdf,
		riemannBench,
		browseComp,
		toolathlon,
		cursorBench,
	] = await Promise.all([
		aaSnapshot(
			db,
			sourceCache.artificial_analysis,
			options,
			previousMissingSince.artificial_analysis,
			nowEpochSeconds,
		),
		modelsDevSnapshot(
			db,
			sourceCache.models_dev,
			options,
			previousMissingSince.models_dev,
			nowEpochSeconds,
		),
		deepSWESnapshot(
			db,
			sourceCache.deep_swe,
			options,
			previousMissingSince.deep_swe,
			nowEpochSeconds,
		),
		terminalBenchSnapshot(
			db,
			sourceCache.terminal_bench,
			options,
			previousMissingSince.terminal_bench,
			nowEpochSeconds,
		),
		agentsLastExamSnapshot(
			db,
			sourceCache.agents_last_exam,
			options,
			previousMissingSince.agents_last_exam,
			nowEpochSeconds,
		),
		blueprintBenchSnapshot(
			db,
			sourceCache.blueprint_bench_2,
			options,
			previousMissingSince.blueprint_bench_2,
			nowEpochSeconds,
		),
		gdpPdfSnapshot(
			db,
			sourceCache.gdp_pdf,
			options,
			previousMissingSince.gdp_pdf,
			nowEpochSeconds,
		),
		riemannBenchSnapshot(
			db,
			sourceCache.riemann_bench,
			options,
			previousMissingSince.riemann_bench,
			nowEpochSeconds,
		),
		browseCompSnapshot(
			db,
			sourceCache.browsecomp,
			options,
			previousMissingSince.browsecomp,
			nowEpochSeconds,
		),
		toolathlonSnapshot(
			db,
			sourceCache.toolathlon,
			options,
			previousMissingSince.toolathlon,
			nowEpochSeconds,
		),
		cursorBenchSnapshot(
			db,
			sourceCache.cursorbench,
			options,
			previousMissingSince.cursorbench,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = processModelsDevPayload(
		modelsDev.modelsDevPayload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		buildAaRetainKeys(aa.aaSelectedRows),
	);
	sourceCache.artificial_analysis = updatedSourceCacheStatus(
		sourceCache.artificial_analysis,
		aa.fetchedAt.artificialAnalysis,
		aa.aaRawRows.length,
	);
	sourceCache.models_dev = updatedSourceCacheStatus(
		sourceCache.models_dev,
		modelsDev.modelsDevFetchedAt,
		modelsDevSourceInputCount(modelsDev.modelsDevPayload),
	);
	sourceCache.deep_swe = updatedSourceCacheStatus(
		sourceCache.deep_swe,
		deepSWE.fetchedAt.deepSWE,
		deepSWE.deepSWERawRows.length,
	);
	sourceCache.terminal_bench = updatedSourceCacheStatus(
		sourceCache.terminal_bench,
		terminalBench.fetchedAt.terminalBench,
		terminalBench.terminalBenchRows.length,
	);
	sourceCache.agents_last_exam = updatedSourceCacheStatus(
		sourceCache.agents_last_exam,
		agentsLastExam.fetchedAt.agentsLastExam,
		agentsLastExam.agentsLastExamRows.length,
	);
	sourceCache.blueprint_bench_2 = updatedSourceCacheStatus(
		sourceCache.blueprint_bench_2,
		blueprintBench.fetchedAt.blueprintBench,
		blueprintBench.blueprintBenchModelScoreRows.length,
	);
	sourceCache.gdp_pdf = updatedSourceCacheStatus(
		sourceCache.gdp_pdf,
		gdpPdf.fetchedAt.gdpPdf,
		gdpPdf.gdpPdfModelScoreRows.length,
	);
	sourceCache.riemann_bench = updatedSourceCacheStatus(
		sourceCache.riemann_bench,
		riemannBench.fetchedAt.riemannBench,
		riemannBench.riemannBenchModelScoreRows.length,
	);
	sourceCache.browsecomp = updatedSourceCacheStatus(
		sourceCache.browsecomp,
		browseComp.fetchedAt.browseComp,
		browseComp.browseCompModelScoreRows.length,
	);
	sourceCache.toolathlon = updatedSourceCacheStatus(
		sourceCache.toolathlon,
		toolathlon.fetchedAt.toolathlon,
		toolathlon.toolathlonModelScoreRows.length,
	);
	sourceCache.cursorbench = updatedSourceCacheStatus(
		sourceCache.cursorbench,
		cursorBench.fetchedAt.cursorBench,
		cursorBench.cursorBenchModelScoreRows.length,
	);
	return {
		snapshots: {
			aaRawRows: aa.aaRawRows,
			aaSelectedRows: aa.aaSelectedRows,
			modelsDevPayload: modelsDev.modelsDevPayload,
			modelsDevModels,
			modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
			modelsDevStatusCode: modelsDev.modelsDevStatusCode,
			deepSWERawRows: deepSWE.deepSWERawRows,
			deepSWEModelScoreRows: deepSWE.deepSWEModelScoreRows,
			terminalBenchRows: terminalBench.terminalBenchRows,
			terminalBenchModelScores: terminalBench.terminalBenchModelScores,
			agentsLastExamRows: agentsLastExam.agentsLastExamRows,
			agentsLastExamModelScores: agentsLastExam.agentsLastExamModelScores,
			blueprintBenchModelScoreRows: blueprintBench.blueprintBenchModelScoreRows,
			gdpPdfModelScoreRows: gdpPdf.gdpPdfModelScoreRows,
			riemannBenchModelScoreRows: riemannBench.riemannBenchModelScoreRows,
			browseCompModelScoreRows: browseComp.browseCompModelScoreRows,
			toolathlonModelScoreRows: toolathlon.toolathlonModelScoreRows,
			cursorBenchModelScoreRows: cursorBench.cursorBenchModelScoreRows,
			sourceRowStates: [
				...aa.sourceRowStates,
				...modelsDev.sourceRowStates,
				...deepSWE.sourceRowStates,
				...terminalBench.sourceRowStates,
				...agentsLastExam.sourceRowStates,
				...blueprintBench.sourceRowStates,
				...gdpPdf.sourceRowStates,
				...riemannBench.sourceRowStates,
				...browseComp.sourceRowStates,
				...toolathlon.sourceRowStates,
				...cursorBench.sourceRowStates,
			],
			fetchedAt: {
				artificialAnalysis: aa.fetchedAt.artificialAnalysis,
				deepSWE: deepSWE.fetchedAt.deepSWE,
				terminalBench: terminalBench.fetchedAt.terminalBench,
				agentsLastExam: agentsLastExam.fetchedAt.agentsLastExam,
				blueprintBench: blueprintBench.fetchedAt.blueprintBench,
				gdpPdf: gdpPdf.fetchedAt.gdpPdf,
				riemannBench: riemannBench.fetchedAt.riemannBench,
				browseComp: browseComp.fetchedAt.browseComp,
				toolathlon: toolathlon.fetchedAt.toolathlon,
				cursorBench: cursorBench.fetchedAt.cursorBench,
			},
		},
		sourceCache,
	};
}

/** Load OpenRouter raw stats from SQLite when fresh and complete for the current matched model ids. */
export async function loadOpenRouterRawPayload(
	db: DatabaseSync,
	modelIds: string[],
	speedConcurrency: number,
	nowEpochSeconds: number,
	options: DatabaseBuildOptions = {},
): Promise<{
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
	cacheStatus: RawSourceCacheStatus;
}> {
	const status = readRawSourceCacheStatus(db, "openrouter", nowEpochSeconds);
	const cached = readOpenRouterRawCache(db);
	const cachedModelIds = new Set(cached?.models.map((model) => model.id) ?? []);
	const cacheCoversModels = modelIds.every((modelId) =>
		cachedModelIds.has(modelId),
	);
	if (
		status.cache_hit &&
		cached != null &&
		cacheCoversModels &&
		options.replaceSourceRows !== true
	) {
		return {
			rawPayload: cached,
			cacheStatus: {
				...status,
				source_input_count: cached.directory.length + cached.models.length,
			},
		};
	}
	try {
		const rawPayload =
			modelIds.length === 0
				? null
				: await getOpenRouterRawScrapedStats({
						modelIds,
						concurrency: speedConcurrency,
					});
		return {
			rawPayload,
			cacheStatus: refreshedCacheStatus(
				rawPayload?.fetched_at_epoch_seconds ?? null,
				(rawPayload?.directory.length ?? 0) + (rawPayload?.models.length ?? 0),
			),
		};
	} catch {
		return {
			rawPayload: cached,
			cacheStatus: {
				...status,
				source_input_count:
					(cached?.directory.length ?? 0) + (cached?.models.length ?? 0),
			},
		};
	}
}
