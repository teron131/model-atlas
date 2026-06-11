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
	buildBrowseCompScoreByModelName,
	getBrowseCompModelScoreStats,
} from "../scrapers/browsecomp";
import {
	buildDeepSWEScoreByModelName,
	getDeepSWERawLeaderboardStats,
	summarizeDeepSWEDefaultModelScores,
} from "../scrapers/deep-swe";
import {
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../scrapers/models-dev";
import { getOpenRouterRawScrapedStats } from "../scrapers/openrouter";
import {
	buildTerminalBenchAccuracyByModelName,
	getTerminalBenchAgentModelAccuracyStats,
	summarizeTerminalBenchModelMedianAccuracy,
} from "../scrapers/terminal-bench";
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
	readBrowseCompRawCache,
	readDeepSWERawCache,
	readModelsDevRawCache,
	readOpenRouterRawCache,
	readRawSourceCacheStatus,
	readTerminalBenchRawCache,
	refreshedCacheStatus,
} from "./cache";
import {
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

type AaSnapshot = {
	aaRawRows: SourceSnapshots["aaRawRows"];
	aaSelectedRows: SourceSnapshots["aaSelectedRows"];
	fetchedAt: { artificialAnalysis: number | null };
};

type ModelsDevSnapshot = Pick<
	SourceSnapshots,
	| "modelsDevPayload"
	| "modelsDevModels"
	| "modelsDevFetchedAt"
	| "modelsDevStatusCode"
>;

type DeepSWESnapshot = {
	deepSWERawRows: SourceSnapshots["deepSWERawRows"];
	deepSWEModelScoreRows: SourceSnapshots["deepSWEModelScoreRows"];
	fetchedAt: { deepSWE: number | null };
};

type TerminalBenchSnapshot = {
	terminalBenchRows: SourceSnapshots["terminalBenchRows"];
	terminalBenchModelScores: SourceSnapshots["terminalBenchModelScores"];
	fetchedAt: { terminalBench: number | null };
};

type AgentsLastExamSnapshot = {
	agentsLastExamRows: SourceSnapshots["agentsLastExamRows"];
	agentsLastExamModelScores: SourceSnapshots["agentsLastExamModelScores"];
	fetchedAt: { agentsLastExam: number | null };
};

type BrowseCompSnapshot = {
	browseCompModelScoreRows: SourceSnapshots["browseCompModelScoreRows"];
	fetchedAt: { browseComp: number | null };
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
		browseCompModelScoreRows: snapshots.browseCompModelScoreRows,
		browseCompScoreByModelName: buildBrowseCompScoreByModelName(
			snapshots.browseCompModelScoreRows,
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
): Promise<AaSnapshot> {
	const cached = readArtificialAnalysisRawCache(db);
	if (status.cache_hit && cached != null) {
		return {
			aaRawRows: cached.aaRawRows,
			aaSelectedRows: cached.aaSelectedRows,
			fetchedAt: { artificialAnalysis: cached.fetchedAt },
		};
	}
	const fetched = await getArtificialAnalysisScrapedRawStats();
	if (
		shouldUseFetchedRows(fetched.fetched_at_epoch_seconds, fetched.data.length)
	) {
		return {
			aaRawRows: fetched.data,
			aaSelectedRows: processArtificialAnalysisScrapedRows(fetched.data, {
				selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
			}),
			fetchedAt: { artificialAnalysis: fetched.fetched_at_epoch_seconds },
		};
	}
	return {
		aaRawRows: cached?.aaRawRows ?? fetched.data,
		aaSelectedRows:
			cached?.aaSelectedRows ??
			processArtificialAnalysisScrapedRows(fetched.data, {
				selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
			}),
		fetchedAt: {
			artificialAnalysis: cached?.fetchedAt ?? fetched.fetched_at_epoch_seconds,
		},
	};
}

async function modelsDevSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
): Promise<ModelsDevSnapshot> {
	const cached = readModelsDevRawCache(db);
	if (status.cache_hit && cached != null) {
		return {
			modelsDevPayload: cached.payload,
			modelsDevModels: processModelsDevPayload(
				cached.payload,
				isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
			),
			modelsDevFetchedAt: cached.fetchedAt,
			modelsDevStatusCode: cached.statusCode,
		};
	}
	const fetched = await getModelsDevSourceStats();
	if (
		shouldUseFetchedRows(
			fetched.fetched_at_epoch_seconds,
			Object.keys(fetched.payload).length,
		)
	) {
		return {
			modelsDevPayload: fetched.payload,
			modelsDevModels: processModelsDevPayload(
				fetched.payload,
				isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
			),
			modelsDevFetchedAt: fetched.fetched_at_epoch_seconds,
			modelsDevStatusCode: fetched.status_code,
		};
	}
	const payload = cached?.payload ?? fetched.payload;
	return {
		modelsDevPayload: payload,
		modelsDevModels: processModelsDevPayload(
			payload,
			isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		),
		modelsDevFetchedAt: cached?.fetchedAt ?? fetched.fetched_at_epoch_seconds,
		modelsDevStatusCode: cached?.statusCode ?? fetched.status_code,
	};
}

async function deepSWESnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
): Promise<DeepSWESnapshot> {
	const cached = readDeepSWERawCache(db);
	const cachedHasEffortMetadata = cached?.rows.some(
		(row) => row.reasoning_effort != null || row.config != null,
	);
	if (status.cache_hit && cached != null && cachedHasEffortMetadata) {
		return {
			deepSWERawRows: cached.rows,
			deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(cached.rows),
			fetchedAt: { deepSWE: cached.fetchedAt },
		};
	}
	const fetched = await getDeepSWERawLeaderboardStats();
	const rows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	)
		? fetched.data
		: (cached?.rows ?? fetched.data);
	return {
		deepSWERawRows: rows,
		deepSWEModelScoreRows: summarizeDeepSWEDefaultModelScores(rows),
		fetchedAt: {
			deepSWE:
				cached?.rows === rows
					? cached.fetchedAt
					: fetched.fetched_at_epoch_seconds,
		},
	};
}

async function terminalBenchSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
): Promise<TerminalBenchSnapshot> {
	const cached = readTerminalBenchRawCache(db);
	if (status.cache_hit && cached != null) {
		return {
			terminalBenchRows: cached.rows,
			terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(
				cached.rows,
			),
			fetchedAt: { terminalBench: cached.fetchedAt },
		};
	}
	const fetched = await getTerminalBenchAgentModelAccuracyStats();
	const rows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	)
		? fetched.data
		: (cached?.rows ?? fetched.data);
	return {
		terminalBenchRows: rows,
		terminalBenchModelScores: summarizeTerminalBenchModelMedianAccuracy(rows),
		fetchedAt: {
			terminalBench:
				cached?.rows === rows
					? cached.fetchedAt
					: fetched.fetched_at_epoch_seconds,
		},
	};
}

async function agentsLastExamSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
): Promise<AgentsLastExamSnapshot> {
	const cached = readAgentsLastExamRawCache(db);
	if (status.cache_hit && cached != null) {
		return {
			agentsLastExamRows: cached.rows,
			agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
				cached.rows,
			),
			fetchedAt: { agentsLastExam: cached.fetchedAt },
		};
	}
	const fetched = await getAgentsLastExamHarnessStats();
	const rows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	)
		? fetched.data
		: (cached?.rows ?? fetched.data);
	return {
		agentsLastExamRows: rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(rows),
		fetchedAt: {
			agentsLastExam:
				cached?.rows === rows
					? cached.fetchedAt
					: fetched.fetched_at_epoch_seconds,
		},
	};
}

async function browseCompSnapshot(
	db: DatabaseSync,
	status: RawSourceCacheStatus,
): Promise<BrowseCompSnapshot> {
	const cached = readBrowseCompRawCache(db);
	if (status.cache_hit && cached != null) {
		return {
			browseCompModelScoreRows: cached.rows,
			fetchedAt: { browseComp: cached.fetchedAt },
		};
	}
	const fetched = await getBrowseCompModelScoreStats();
	const rows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	)
		? fetched.data
		: (cached?.rows ?? fetched.data);
	return {
		browseCompModelScoreRows: rows,
		fetchedAt: {
			browseComp:
				cached?.rows === rows
					? cached.fetchedAt
					: fetched.fetched_at_epoch_seconds,
		},
	};
}

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
): Promise<SourceSnapshotCacheResult> {
	const sourceCache = sourceCacheDefaults(db, nowEpochSeconds);
	const [aa, modelsDev, deepSWE, terminalBench, agentsLastExam, browseComp] =
		await Promise.all([
			aaSnapshot(db, sourceCache.artificial_analysis),
			modelsDevSnapshot(db, sourceCache.models_dev),
			deepSWESnapshot(db, sourceCache.deep_swe),
			terminalBenchSnapshot(db, sourceCache.terminal_bench),
			agentsLastExamSnapshot(db, sourceCache.agents_last_exam),
			browseCompSnapshot(db, sourceCache.browsecomp),
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
	sourceCache.browsecomp = updatedSourceCacheStatus(
		sourceCache.browsecomp,
		browseComp.fetchedAt.browseComp,
		browseComp.browseCompModelScoreRows.length,
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
			browseCompModelScoreRows: browseComp.browseCompModelScoreRows,
			fetchedAt: {
				artificialAnalysis: aa.fetchedAt.artificialAnalysis,
				deepSWE: deepSWE.fetchedAt.deepSWE,
				terminalBench: terminalBench.fetchedAt.terminalBench,
				agentsLastExam: agentsLastExam.fetchedAt.agentsLastExam,
				browseComp: browseComp.fetchedAt.browseComp,
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
	if (status.cache_hit && cached != null && cacheCoversModels) {
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
