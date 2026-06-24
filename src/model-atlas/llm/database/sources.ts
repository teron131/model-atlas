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
	getDeepSWERawLeaderboardSourceRows,
	preferredDeepSWELeaderboardRows,
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
import {
	asFiniteNumber,
	asRecord,
	type JsonObject,
	modelSlugFromModelId,
} from "../shared";
import {
	AGENTIC_INDEX_KEYS,
	INTELLIGENCE_INDEX_KEYS,
} from "../stats/scores/benchmark-imputation";
import {
	buildAaRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
	pickPreferredModelsDevRows,
} from "../stats/source-policy";
import type { LlmStatsSourceData, ScoringConfig } from "../stats/types";
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

const AA_RESOURCE_SIGNAL_KEYS = [
	"cost_per_task",
	"seconds_per_task",
	"output_tokens_per_task",
] as const;

function camelMetricKey(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_match, char: string) =>
		char.toUpperCase(),
	);
}

function aaSignalKeys(scoringConfig: ScoringConfig): Set<string> {
	const keys = new Set<string>(AA_RESOURCE_SIGNAL_KEYS);
	for (const key of [
		...INTELLIGENCE_INDEX_KEYS,
		...AGENTIC_INDEX_KEYS,
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]) {
		keys.add(key);
		keys.add(camelMetricKey(key));
	}
	return keys;
}

function aaScoreSignalCount(
	row: JsonObject,
	scoringConfig: ScoringConfig,
): number {
	const intelligence = asRecord(row.intelligence);
	const evaluations = asRecord(row.evaluations);
	const cost = asRecord(row.intelligence_index_cost);
	const signalKeys = aaSignalKeys(scoringConfig);
	return [...signalKeys].filter(
		(key) =>
			asFiniteNumber(row[key]) != null ||
			asFiniteNumber(intelligence[key]) != null ||
			asFiniteNumber(evaluations[key]) != null ||
			asFiniteNumber(cost[key]) != null,
	).length;
}

function aaRowIsUnavailable(row: JsonObject): boolean {
	const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
	return (
		row.deprecated === true ||
		name.includes("not currently available") ||
		name.includes("unavailable")
	);
}

export function mergeArtificialAnalysisRow(
	cachedRow: JsonObject,
	fetchedRow: JsonObject,
	scoringConfig: ScoringConfig,
): JsonObject {
	if (
		aaRowIsUnavailable(fetchedRow) &&
		aaScoreSignalCount(cachedRow, scoringConfig) >
			aaScoreSignalCount(fetchedRow, scoringConfig)
	) {
		return cachedRow;
	}
	return fetchedRow;
}

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
	deepSWESourceVersion: SourceSnapshots["deepSWESourceVersion"];
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

type SnapshotSourceStatus = {
	source: RawSourceName;
	fetchedAt: number | null;
	sourceInputCount: number;
	sourceRowStates: SourceRowState[];
	fetchedAtKey?: keyof SourceSnapshots["fetchedAt"];
};

type RawRowsCache<Row> = {
	rows: Row[];
	fetchedAt: number | null;
};

type ModelScoreRowsPayload<Row> = {
	fetched_at_epoch_seconds: number | null;
	data: Row[];
};

type ModelScoreSnapshotConfig<Row> = {
	source: RawSourceName;
	cached: RawRowsCache<Row> | null | undefined;
	status: RawSourceCacheStatus;
	options: DatabaseBuildOptions;
	previousMissingSince: ReadonlyMap<string, number>;
	nowEpochSeconds: number;
	fetchRows: () => Promise<ModelScoreRowsPayload<Row>>;
	rowKey: (row: Row) => string | null;
	rowLabel: (row: Row) => string | null;
};

type ModelScoreSnapshotResult<Row> = {
	rows: Row[];
	sourceRowStates: SourceRowState[];
	fetchedAt: number | null;
};

async function modelScoreSnapshot<Row>(
	config: ModelScoreSnapshotConfig<Row>,
): Promise<ModelScoreSnapshotResult<Row>> {
	if (
		config.status.cache_hit &&
		config.cached != null &&
		config.options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: config.source,
			cachedRows: config.cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options: config.options,
			rowKey: config.rowKey,
			rowLabel: config.rowLabel,
			previousMissingSince: config.previousMissingSince,
			nowEpochSeconds: config.nowEpochSeconds,
		});
		return {
			rows: cachedSnapshot.rows,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: config.cached.fetchedAt,
		};
	}

	const fetched = await config.fetchRows();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: config.source,
		cachedRows: config.cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options: config.options,
		rowKey: config.rowKey,
		rowLabel: config.rowLabel,
		previousMissingSince: config.previousMissingSince,
		nowEpochSeconds: config.nowEpochSeconds,
	});
	return {
		rows: snapshot.rows,
		sourceRowStates: snapshot.states,
		fetchedAt: snapshotFetchedAt(
			hasUsableFetchedRows,
			config.cached?.fetchedAt,
			fetched.fetched_at_epoch_seconds,
		),
	};
}

function preferredDeepSWESourceVersion(
	rows: SourceSnapshots["deepSWERawRows"],
) {
	if (rows.some((row) => row.source_version === "v1.1")) {
		return "v1.1";
	}
	if (rows.some((row) => row.source_version === "v1")) {
		return "v1";
	}
	return null;
}

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

/** Apply fetched timestamps and row counts from each loaded source snapshot. */
function updateSourceCacheStatuses(
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>,
	sourceStatuses: SnapshotSourceStatus[],
): void {
	for (const sourceStatus of sourceStatuses) {
		sourceCache[sourceStatus.source] = updatedSourceCacheStatus(
			sourceCache[sourceStatus.source],
			sourceStatus.fetchedAt,
			sourceStatus.sourceInputCount,
		);
	}
}

/** Merge per-source row lifecycle states in source processing order. */
function sourceSnapshotRowStates(
	sourceStatuses: SnapshotSourceStatus[],
): SourceRowState[] {
	return sourceStatuses.flatMap((sourceStatus) => sourceStatus.sourceRowStates);
}

/** Project source snapshot timestamps into the public fetchedAt shape. */
function sourceSnapshotFetchedAt(
	sourceStatuses: SnapshotSourceStatus[],
): SourceSnapshots["fetchedAt"] {
	const fetchedAt: SourceSnapshots["fetchedAt"] = {
		artificialAnalysis: null,
		deepSWE: null,
		terminalBench: null,
		agentsLastExam: null,
		blueprintBench: null,
		gdpPdf: null,
		riemannBench: null,
		browseComp: null,
		toolathlon: null,
		cursorBench: null,
	};
	for (const sourceStatus of sourceStatuses) {
		if (sourceStatus.fetchedAtKey != null) {
			fetchedAt[sourceStatus.fetchedAtKey] = sourceStatus.fetchedAt;
		}
	}
	return fetchedAt;
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
	scoringConfig: ScoringConfig,
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
		mergeRow: (cachedRow, fetchedRow) =>
			mergeArtificialAnalysisRow(cachedRow, fetchedRow, scoringConfig),
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
			deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(
				preferredDeepSWELeaderboardRows(cachedSnapshot.rows),
			),
			deepSWESourceVersion: cached.sourceVersion,
			sourceRowStates: cachedSnapshot.states,
			fetchedAt: { deepSWE: cached.fetchedAt },
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
	return {
		deepSWERawRows: snapshot.rows,
		deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(preferredRows),
		deepSWESourceVersion:
			preferredRows.length > 0
				? preferredDeepSWESourceVersion(snapshot.rows)
				: (cached?.sourceVersion ?? null),
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
	const snapshot = await modelScoreSnapshot({
		source: "browsecomp",
		cached: readBrowseCompRawCache(db),
		status,
		options,
		previousMissingSince,
		nowEpochSeconds,
		fetchRows: getBrowseCompModelScoreStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		browseCompModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { browseComp: snapshot.fetchedAt },
	};
}

async function blueprintBenchSnapshot(
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
		fetchRows: getBlueprintBenchModelScoreStats,
		rowKey: (row) => sourceKey(row.model),
		rowLabel: (row) => row.model,
	});
	return {
		blueprintBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { blueprintBench: snapshot.fetchedAt },
	};
}

async function gdpPdfSnapshot(
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
		fetchRows: getGdpPdfModelScoreStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		gdpPdfModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { gdpPdf: snapshot.fetchedAt },
	};
}

async function riemannBenchSnapshot(
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
		fetchRows: getRiemannBenchModelScoreStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		riemannBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { riemannBench: snapshot.fetchedAt },
	};
}

async function toolathlonSnapshot(
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
		fetchRows: getToolathlonModelScoreStats,
		rowKey: (row) => sourceKey(row.provider, row.model),
		rowLabel: (row) => row.model,
	});
	return {
		toolathlonModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { toolathlon: snapshot.fetchedAt },
	};
}

async function cursorBenchSnapshot(
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
		fetchRows: getCursorBenchModelScoreStats,
		rowKey: (row) => sourceKey(row.model, row.base_model, row.reasoning_effort),
		rowLabel: (row) => row.model,
	});
	return {
		cursorBenchModelScoreRows: snapshot.rows,
		sourceRowStates: snapshot.sourceRowStates,
		fetchedAt: { cursorBench: snapshot.fetchedAt },
	};
}

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
	scoringConfig: ScoringConfig,
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
			scoringConfig,
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
	const sourceStatuses: SnapshotSourceStatus[] = [
		{
			source: "artificial_analysis",
			fetchedAt: aa.fetchedAt.artificialAnalysis,
			sourceInputCount: aa.aaRawRows.length,
			sourceRowStates: aa.sourceRowStates,
			fetchedAtKey: "artificialAnalysis",
		},
		{
			source: "models_dev",
			fetchedAt: modelsDev.modelsDevFetchedAt,
			sourceInputCount: modelsDevSourceInputCount(modelsDev.modelsDevPayload),
			sourceRowStates: modelsDev.sourceRowStates,
		},
		{
			source: "deep_swe",
			fetchedAt: deepSWE.fetchedAt.deepSWE,
			sourceInputCount: deepSWE.deepSWERawRows.length,
			sourceRowStates: deepSWE.sourceRowStates,
			fetchedAtKey: "deepSWE",
		},
		{
			source: "terminal_bench",
			fetchedAt: terminalBench.fetchedAt.terminalBench,
			sourceInputCount: terminalBench.terminalBenchRows.length,
			sourceRowStates: terminalBench.sourceRowStates,
			fetchedAtKey: "terminalBench",
		},
		{
			source: "agents_last_exam",
			fetchedAt: agentsLastExam.fetchedAt.agentsLastExam,
			sourceInputCount: agentsLastExam.agentsLastExamRows.length,
			sourceRowStates: agentsLastExam.sourceRowStates,
			fetchedAtKey: "agentsLastExam",
		},
		{
			source: "blueprint_bench_2",
			fetchedAt: blueprintBench.fetchedAt.blueprintBench,
			sourceInputCount: blueprintBench.blueprintBenchModelScoreRows.length,
			sourceRowStates: blueprintBench.sourceRowStates,
			fetchedAtKey: "blueprintBench",
		},
		{
			source: "gdp_pdf",
			fetchedAt: gdpPdf.fetchedAt.gdpPdf,
			sourceInputCount: gdpPdf.gdpPdfModelScoreRows.length,
			sourceRowStates: gdpPdf.sourceRowStates,
			fetchedAtKey: "gdpPdf",
		},
		{
			source: "riemann_bench",
			fetchedAt: riemannBench.fetchedAt.riemannBench,
			sourceInputCount: riemannBench.riemannBenchModelScoreRows.length,
			sourceRowStates: riemannBench.sourceRowStates,
			fetchedAtKey: "riemannBench",
		},
		{
			source: "browsecomp",
			fetchedAt: browseComp.fetchedAt.browseComp,
			sourceInputCount: browseComp.browseCompModelScoreRows.length,
			sourceRowStates: browseComp.sourceRowStates,
			fetchedAtKey: "browseComp",
		},
		{
			source: "toolathlon",
			fetchedAt: toolathlon.fetchedAt.toolathlon,
			sourceInputCount: toolathlon.toolathlonModelScoreRows.length,
			sourceRowStates: toolathlon.sourceRowStates,
			fetchedAtKey: "toolathlon",
		},
		{
			source: "cursorbench",
			fetchedAt: cursorBench.fetchedAt.cursorBench,
			sourceInputCount: cursorBench.cursorBenchModelScoreRows.length,
			sourceRowStates: cursorBench.sourceRowStates,
			fetchedAtKey: "cursorBench",
		},
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
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
			deepSWESourceVersion: deepSWE.deepSWESourceVersion,
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
			sourceRowStates: sourceSnapshotRowStates(sourceStatuses),
			fetchedAt: sourceSnapshotFetchedAt(sourceStatuses),
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
