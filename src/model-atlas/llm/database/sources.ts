/** Source snapshot calculations for the Model Atlas SQLite database pipeline. */

import type { DatabaseSync } from "node:sqlite";

import {
	buildAaRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
	pickPreferredModelsDevRows,
} from "../llm-stats/source-policy";
import type { SourceData } from "../llm-stats/types";
import {
	asRecord,
	modelSlugFromModelId,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../shared";
import {
	ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS,
	getArtificialAnalysisScrapedRawStats,
	processArtificialAnalysisScrapedRows,
} from "../sources/artificial-analysis-scraper";
import {
	buildDeepSWEScoreByModelName,
	findDeepSWEModelScore,
	getDeepSWERawLeaderboardStats,
	summarizeDeepSWEBestModelScores,
} from "../sources/deep-swe-scraper";
import {
	getModelsDevSourceStats,
	type ModelsDevFlatModel,
	processModelsDevPayload,
} from "../sources/models-dev";
import { getOpenRouterRawScrapedStats } from "../sources/openrouter-scraper";
import {
	buildTerminalBenchAccuracyByModelName,
	findTerminalBenchMedianAccuracy,
	getTerminalBenchAgentModelAccuracyStats,
	summarizeTerminalBenchModelMedianAccuracy,
} from "../sources/terminal-bench-scraper";
import {
	readArtificialAnalysisRawCache,
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

/** Build the source data object consumed by match/enrichment stages. */
export function buildSourceData(snapshots: SourceSnapshots): SourceData {
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

function canonicalModelId(
	modelId: unknown,
	providerId: unknown,
	fallbackModelId: unknown,
): string | null {
	if (typeof modelId === "string" && modelId.includes("/")) {
		return modelId;
	}
	if (typeof providerId === "string" && typeof modelId === "string") {
		return `${providerId}/${modelId}`;
	}
	if (typeof providerId === "string" && typeof fallbackModelId === "string") {
		return `${providerId}/${fallbackModelId}`;
	}
	return typeof modelId === "string" ? modelId : null;
}

function normalizedRowId(row: Record<string, unknown>): string | null {
	const id = typeof row.id === "string" ? row.id : null;
	return id == null ? null : normalizeProviderModelId(id);
}

function normalizedRowProvider(row: Record<string, unknown>): string | null {
	const normalizedId = normalizedRowId(row);
	const provider =
		normalizedId?.split("/")[0] ??
		(typeof row.provider_id === "string" ? row.provider_id : null);
	return provider == null ? null : normalizeProviderId(provider);
}

function normalizedRowFamily(row: Record<string, unknown>): string | null {
	if (typeof row.family !== "string" || row.family.length === 0) {
		return null;
	}
	return row.family
		.toLowerCase()
		.replace(/[._:\s]+/g, "-")
		.replace(/-+/g, "-");
}

function catalogFamilyKey(row: Record<string, unknown>): string | null {
	const provider = normalizedRowProvider(row);
	const family = normalizedRowFamily(row);
	return provider == null || family == null ? null : `${provider}/${family}`;
}

function rowText(
	row: Record<string, unknown>,
	keys: readonly string[],
): string {
	return keys
		.map((key) => row[key])
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
}

function rowHasExplicitTextOutput(row: Record<string, unknown>): boolean {
	const modalities = asRecord(row.modalities);
	return Array.isArray(modalities.output) && modalities.output.includes("text");
}

function hasObviousImageModelLabel(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id", "name", "family"]).includes(
		"image",
	);
}

function isTextLlmCatalogRow(row: Record<string, unknown>): boolean {
	return rowHasExplicitTextOutput(row) && !hasObviousImageModelLabel(row);
}

function isLatestAliasRow(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id"]).includes("latest");
}

function isDatedAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-\d{8}$/.test(normalizedId);
}

function isFastAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-fast$/.test(normalizedId);
}

function catalogAliasPriority(row: Record<string, unknown>): number {
	if (isLatestAliasRow(row)) {
		return 3;
	}
	if (isFastAliasRow(row)) {
		return 2;
	}
	if (isDatedAliasRow(row)) {
		return 1;
	}
	return 0;
}

function modelsDevSourceInputCount(
	payload: ModelsDevSnapshot["modelsDevPayload"],
): number {
	return Object.values(payload).reduce(
		(count, provider) => count + Object.keys(provider.models ?? {}).length,
		0,
	);
}

/** Keep processed DB stages scoped to text-output LLM rows and exclude obvious image models. */
export function filterDatabaseTextLlmRows(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return rows.filter(isTextLlmCatalogRow);
}

function normalizedCatalogIds(row: Record<string, unknown>): string[] {
	return [row.id, row.openrouter_id]
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.map(normalizeProviderModelId);
}

function modelsDevCatalogRow(
	modelsDevModel: ModelsDevFlatModel,
	sourceData: SourceData,
): Record<string, unknown> | null {
	const modelFields = asRecord(modelsDevModel.model);
	const canonicalId = canonicalModelId(
		modelsDevModel.model.id ?? modelsDevModel.model_id,
		modelsDevModel.provider_id,
		modelsDevModel.model_id,
	);
	if (canonicalId == null) {
		return null;
	}
	const {
		id: _matchedId,
		name: _matchedName,
		family: matchedFamily,
		model_id: _matchedModelId,
		slug: _matchedSlug,
		...modelMetadata
	} = modelFields;
	const modelNameCandidates = [
		modelsDevModel.model.name,
		modelsDevModel.model_id,
		modelsDevModel.model.id,
		canonicalId,
		modelSlugFromModelId(canonicalId),
	];
	const evaluations: Record<string, unknown> = {};
	const deepSWEScore = findDeepSWEModelScore(
		modelNameCandidates,
		sourceData.deepSWEScoreByModelName,
	);
	if (deepSWEScore != null) {
		evaluations.deep_swe = deepSWEScore.pass_at_1;
	}
	const terminalBenchAccuracy = findTerminalBenchMedianAccuracy(
		modelNameCandidates,
		sourceData.terminalBenchAccuracyByModelName,
	);
	if (terminalBenchAccuracy != null) {
		evaluations.terminal_bench_2 = terminalBenchAccuracy;
	}
	return {
		id: canonicalId,
		provider_id: modelsDevModel.provider_id,
		openrouter_id: modelsDevModel.model.id ?? modelsDevModel.model_id,
		name:
			typeof modelsDevModel.model.name === "string"
				? modelsDevModel.model.name
				: modelsDevModel.model_id,
		aa_id: null,
		family: matchedFamily,
		...modelMetadata,
		...(deepSWEScore == null
			? {}
			: { scoring_sources: { deep_swe: deepSWEScore } }),
		...(Object.keys(evaluations).length === 0 ? {} : { evaluations }),
	};
}

/** Add preferred recent models.dev catalog rows that have no AA-matched row. */
export function buildDatabaseCatalogRows(
	sourceData: SourceData,
	matchedRows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const existingNormalizedIds = new Set<string>();
	const existingConcreteFamilyKeys = new Set<string>();
	const rememberCatalogRow = (row: Record<string, unknown>) => {
		for (const normalizedId of normalizedCatalogIds(row)) {
			existingNormalizedIds.add(normalizedId);
		}
		const familyKey = catalogFamilyKey(row);
		if (familyKey != null && !isLatestAliasRow(row)) {
			existingConcreteFamilyKeys.add(familyKey);
		}
	};
	for (const row of matchedRows) {
		rememberCatalogRow(row);
	}
	const catalogRows = filterDatabaseTextLlmRows(matchedRows);
	const modelsDevCatalogRows = sourceData.preferredModelsDevModels
		.map((modelsDevModel) => modelsDevCatalogRow(modelsDevModel, sourceData))
		.filter((row): row is Record<string, unknown> => row != null)
		.sort(
			(left, right) => catalogAliasPriority(left) - catalogAliasPriority(right),
		);
	for (const row of modelsDevCatalogRows) {
		const normalizedId = normalizedRowId(row);
		const latestFamilyKey = isLatestAliasRow(row)
			? catalogFamilyKey(row)
			: null;
		if (
			normalizedId == null ||
			!isTextLlmCatalogRow(row) ||
			existingNormalizedIds.has(normalizedId) ||
			(latestFamilyKey != null &&
				existingConcreteFamilyKeys.has(latestFamilyKey))
		) {
			continue;
		}
		rememberCatalogRow(row);
		catalogRows.push(row);
	}
	return catalogRows;
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
	if (status.cache_hit && cached != null) {
		return {
			deepSWERawRows: cached.rows,
			deepSWEModelScoreRows: summarizeDeepSWEBestModelScores(cached.rows),
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
		deepSWEModelScoreRows: summarizeDeepSWEBestModelScores(rows),
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

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadOrFetchSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
): Promise<SourceSnapshotCacheResult> {
	const sourceCache = sourceCacheDefaults(db, nowEpochSeconds);
	const [aa, modelsDev, deepSWE, terminalBench] = await Promise.all([
		aaSnapshot(db, sourceCache.artificial_analysis),
		modelsDevSnapshot(db, sourceCache.models_dev),
		deepSWESnapshot(db, sourceCache.deep_swe),
		terminalBenchSnapshot(db, sourceCache.terminal_bench),
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
			fetchedAt: {
				artificialAnalysis: aa.fetchedAt.artificialAnalysis,
				deepSWE: deepSWE.fetchedAt.deepSWE,
				terminalBench: terminalBench.fetchedAt.terminalBench,
			},
		},
		sourceCache,
	};
}

/** Load OpenRouter raw stats from SQLite when fresh and complete for the current matched model ids. */
export async function loadOrFetchOpenRouterRawPayload(
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
