/**
 * Artificial Analysis leaderboard scraper owns the broad score table and general model metrics.
 *
 * This centralized page is the broad model table for scores and general Artificial Analysis metrics; benchmark-specific resource pages are scraped separately when they expose per-task cost, time, token, or harness details that the leaderboard omits.
 */

import { asRecord, type JsonObject } from "../../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import {
	cleanArtificialAnalysisModelName,
	extractArtificialAnalysisFlightCorpus,
	findArtificialAnalysisFlightObjectEnd,
	parseArtificialAnalysisFlightObject,
	parseArtificialAnalysisReasoningEffort,
} from "./common";

const DEFAULT_SCRAPE_URL = "https://artificialanalysis.ai/leaderboards/models";
const DEFAULT_TIMEOUT_MS = 30_000;
const ROW_DETECTION_KEY = "intelligenceIndex";
const SPARSE_COLUMN_NULL_RATIO = 0.5;
const MODEL_SEARCH_BACKTRACK_CHARS = 20_000;
const MIN_INTELLIGENCE_COST_TOTAL_TOKENS = 1_000_000;

export type ArtificialAnalysisLeaderboardOptions = {
	url?: string;
	timeoutMs?: number;
	flatten?: boolean;
	dropMostlyNullColumns?: boolean;
	selectedColumns?: string[];
};

export type ArtificialAnalysisLeaderboardProcessOptions = {
	flatten?: boolean;
	dropMostlyNullColumns?: boolean;
	selectedColumns?: string[];
};

export type ArtificialAnalysisLeaderboardRawPayload = {
	fetched_at_epoch_seconds: number | null;
	data: JsonObject[];
};

export type ArtificialAnalysisLeaderboardPayload =
	ArtificialAnalysisLeaderboardRawPayload;

/** Leaderboard projection columns keep source-data callers off the larger raw page row shape. */
export const ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS = [
	"model_id",
	"model_url",
	"logo",
	"reasoning_effort",
	"median_speed",
	"median_time",
	"median_end_to_end_response_time",
	"intelligence",
	"intelligence_index_cost",
	"evaluations",
] as const;

function absoluteLogoUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return null;
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	const normalized = value.startsWith("/")
		? value
		: value.includes("/")
			? `/${value}`
			: `/img/logos/${value}`;
	return `https://artificialanalysis.ai${normalized}`;
}

const BENCHMARK_KEY_BY_SOURCE_KEY = {
	apexAgents: "apex_agents",
	apex_agents: "apex_agents",
	critpt: "critpt",
	gdpvalNormalized: "gdpval_normalized",
	gdpval_normalized: "gdpval_normalized",
	gpqa: "gpqa",
	hle: "hle",
	itbenchSre: "itbench_sre",
	itbench_sre: "itbench_sre",
	lcr: "lcr",
	mmmuPro: "mmmu_pro",
	mmmu_pro: "mmmu_pro",
	scicode: "scicode",
	tauBanking: "tau_banking",
	tau_banking: "tau_banking",
	terminalbenchV21: "terminalbench_v21",
	terminalbench_v21: "terminalbench_v21",
} as const satisfies Readonly<Record<string, string>>;
const NO_COLUMN_VALUE = Symbol("no_column_value");
function firstNumber(row: JsonObject, keys: string[]): number | null {
	for (const key of keys) {
		if (typeof row[key] === "number") {
			return row[key];
		}
	}
	return null;
}

function firstBoolean(row: JsonObject, keys: string[]): boolean | null {
	for (const key of keys) {
		if (typeof row[key] === "boolean") {
			return row[key];
		}
	}
	return null;
}

function firstString(row: JsonObject, keys: string[]): string | null {
	for (const key of keys) {
		if (typeof row[key] === "string" && row[key].length > 0) {
			return row[key];
		}
	}
	return null;
}

function normalizeMetricKey(key: string): string {
	return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function pickEvaluations(row: JsonObject): JsonObject {
	const evaluations: JsonObject = {};
	for (const [key, value] of Object.entries(row)) {
		const benchmarkKey = benchmarkKeyBySourceKey(key);
		if (benchmarkKey == null) {
			continue;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			evaluations[benchmarkKey] = value;
		}
	}
	return evaluations;
}

function benchmarkKeyBySourceKey(key: string): string | null {
	return (
		BENCHMARK_KEY_BY_SOURCE_KEY[
			key as keyof typeof BENCHMARK_KEY_BY_SOURCE_KEY
		] ??
		BENCHMARK_KEY_BY_SOURCE_KEY[
			normalizeMetricKey(key) as keyof typeof BENCHMARK_KEY_BY_SOURCE_KEY
		] ??
		null
	);
}

function pickIntelligence(row: JsonObject): JsonObject {
	const omniscienceBreakdown = asRecord(row.omniscienceBreakdown);
	const omniscienceTotal = asRecord(omniscienceBreakdown.total);
	const intelligenceMetrics: JsonObject = {
		intelligence_index: firstNumber(row, [
			"intelligenceIndex",
			"intelligence_index",
		]),
		agentic_index: firstNumber(row, ["agenticIndex", "agentic_index"]),
		coding_index: firstNumber(row, ["codingIndex", "coding_index"]),
		omniscience_index: firstNumber(row, ["omniscience", "omniscience_index"]),
		omniscience_accuracy: firstNumber(row, [
			"omniscienceAccuracy",
			"omniscience_accuracy",
		]),
	};
	if (intelligenceMetrics.omniscience_accuracy == null) {
		intelligenceMetrics.omniscience_accuracy = firstNumber(omniscienceTotal, [
			"accuracy",
		]);
	}
	return intelligenceMetrics;
}

function pickIntelligenceIndexCost(row: JsonObject): JsonObject {
	const intelligenceTokenCounts = asRecord(row.intelligenceIndexTokenCounts);
	const costPerTaskRecord = asRecord(row.intelligenceIndexCostPerTask);
	const costPerTaskBreakdown = asRecord(costPerTaskRecord.cost);
	const outputTokensPerTaskRecord = asRecord(
		row.intelligenceIndexOutputTokensPerTask,
	);
	const inputTokens = firstNumber(intelligenceTokenCounts, ["inputTokens"]);
	const outputTokens = firstNumber(intelligenceTokenCounts, ["outputTokens"]);
	const answerTokens = firstNumber(intelligenceTokenCounts, ["answerTokens"]);
	const reasoningTokens = firstNumber(intelligenceTokenCounts, [
		"reasoningTokens",
	]);
	const outputFromParts =
		(answerTokens ?? 0) + (reasoningTokens ?? 0) > 0
			? (answerTokens ?? 0) + (reasoningTokens ?? 0)
			: null;
	const totalTokens = outputTokens ?? outputFromParts;

	return {
		input_cost: firstNumber(row, ["intelligenceIndexCostInput", "input_cost"]),
		reasoning_cost: firstNumber(row, [
			"intelligenceIndexCostReasoning",
			"reasoning_cost",
		]),
		output_cost: firstNumber(row, [
			"intelligenceIndexCostOutput",
			"output_cost",
		]),
		total_cost: firstNumber(row, ["intelligenceIndexCostTotal", "total_cost"]),
		input_tokens: inputTokens ?? firstNumber(row, ["input_tokens"]),
		reasoning_tokens: reasoningTokens ?? firstNumber(row, ["reasoning_tokens"]),
		answer_tokens: answerTokens ?? firstNumber(row, ["answer_tokens"]),
		output_tokens: outputTokens ?? firstNumber(row, ["output_tokens"]),
		total_tokens:
			typeof totalTokens === "number" &&
			totalTokens >= MIN_INTELLIGENCE_COST_TOTAL_TOKENS
				? totalTokens
				: firstNumber(row, ["total_tokens"]),
		cost_per_task:
			firstNumber(costPerTaskBreakdown, ["total"]) ??
			firstNumber(row, ["cost_per_task"]),
		seconds_per_task: firstNumber(row, [
			"intelligenceIndexTimePerTask",
			"seconds_per_task",
		]),
		output_tokens_per_task:
			firstNumber(outputTokensPerTaskRecord, ["output"]) ??
			firstNumber(row, ["output_tokens_per_task"]),
	};
}

function normalizeUndefinedToNull(value: unknown): unknown {
	if (value === undefined) {
		return null;
	}
	if (Array.isArray(value)) {
		return value.map((item) => normalizeUndefinedToNull(item));
	}
	if (value != null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [
				key,
				normalizeUndefinedToNull(nestedValue),
			]),
		);
	}
	return value;
}

function getRowIdentifier(row: JsonObject): string | null {
	if (typeof row.id === "string") {
		return row.id;
	}
	if (typeof row.model_id === "string") {
		return row.model_id;
	}
	if (typeof row.slug === "string") {
		return row.slug;
	}
	return null;
}

function isLeaderboardModelRow(row: JsonObject): boolean {
	if (!(ROW_DETECTION_KEY in row)) {
		return false;
	}
	const slug = firstString(row, ["slug"]);
	const name = firstString(row, ["name", "shortName", "short_name"]);
	const creatorSlug = firstString(row, ["modelCreatorSlug"]);
	const creatorName =
		firstString(row, ["modelCreatorName"]) ??
		firstString(asRecord(row.creator), ["name"]);
	return (
		slug != null && name != null && (creatorSlug != null || creatorName != null)
	);
}

function flattenExpandedRow(row: JsonObject): JsonObject {
	const timescaleData = asRecord(row.timescaleData);
	const responseTimeMetrics = asRecord(row.end_to_end_response_time_metrics);
	const firstPerformanceRow = Array.isArray(row.performanceByPromptLength)
		? asRecord(row.performanceByPromptLength[0])
		: {};

	const flattenedRow: JsonObject = { ...row };

	for (const metricSource of [timescaleData, responseTimeMetrics]) {
		for (const [key, value] of Object.entries(metricSource)) {
			if (flattenedRow[key] == null && value !== undefined) {
				flattenedRow[key] = value;
			}
		}
	}

	if (
		flattenedRow.prompt_length_type_default == null &&
		firstPerformanceRow.prompt_length_type != null
	) {
		flattenedRow.prompt_length_type_default =
			firstPerformanceRow.prompt_length_type;
	}

	return flattenedRow;
}

function isNullLike(value: unknown): boolean {
	return (
		value == null ||
		value === "" ||
		value === "$undefined" ||
		(Array.isArray(value) && value.length === 0)
	);
}

/** Drop columns that are mostly null for Artificial Analysis scraper. */
function dropMostlyNullColumns(
	rows: JsonObject[],
	nullRatioThreshold: number,
): JsonObject[] {
	if (rows.length === 0) {
		return rows;
	}
	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	const columnsToDrop = new Set<string>();

	for (const column of columns) {
		let nullLikeCount = 0;
		for (const row of rows) {
			if (isNullLike(row[column])) {
				nullLikeCount += 1;
			}
		}
		if (nullLikeCount / rows.length > nullRatioThreshold) {
			columnsToDrop.add(column);
		}
	}

	if (columnsToDrop.size === 0) {
		return rows;
	}
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).filter(([column]) => !columnsToDrop.has(column)),
		),
	);
}

function sortLeaderboardRows(rows: JsonObject[]): JsonObject[] {
	return [...rows].sort((left, right) => {
		const leftIntelligence = firstNumber(left, ["intelligenceIndex"]);
		const rightIntelligence = firstNumber(right, ["intelligenceIndex"]);
		if (leftIntelligence == null && rightIntelligence == null) {
			return (firstString(left, ["slug"]) ?? "").localeCompare(
				firstString(right, ["slug"]) ?? "",
			);
		}
		if (leftIntelligence == null) {
			return 1;
		}
		if (rightIntelligence == null) {
			return -1;
		}
		if (leftIntelligence !== rightIntelligence) {
			return rightIntelligence - leftIntelligence;
		}
		return (firstString(left, ["slug"]) ?? "").localeCompare(
			firstString(right, ["slug"]) ?? "",
		);
	});
}

type RowSelectionContext = {
	creator: JsonObject;
	modelCreators: JsonObject;
	providerSlug: string | null;
	modelSlug: string | null;
	modelRouteCreatorSlug: string | null;
	modelUrlPath: string | null;
};

function getProviderSlug(row: JsonObject, creator: JsonObject): string | null {
	const providerName =
		typeof creator.name === "string"
			? creator.name
			: typeof row.provider === "string"
				? row.provider
				: firstString(row, ["modelCreatorName", "modelCreatorSlug"]);
	if (providerName == null) {
		return null;
	}
	return providerName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Inline creator fields are normalized to the nested creator shape used by hydrated page rows. */
function flatCreatorFieldsFromRow(row: JsonObject): JsonObject {
	return {
		name: firstString(row, ["modelCreatorName"]),
		slug: firstString(row, ["modelCreatorSlug"]),
		logo: firstString(row, ["modelCreatorLogo"]),
		color: firstString(row, ["modelCreatorColor"]),
	};
}

function modelUrlPathFromRow(
	row: JsonObject,
	fallbackSlug: string | null,
): string | null {
	if (typeof row.model_url !== "string" || row.model_url.length === 0) {
		return fallbackSlug;
	}
	const urlPath = row.model_url
		.replace(/^https?:\/\/(?:www\.)?artificialanalysis\.ai/, "")
		.replace(/^\/models\//, "");
	return urlPath.length > 0 ? urlPath : fallbackSlug;
}

function buildRowSelectionContext(row: JsonObject): RowSelectionContext {
	const creator = {
		...flatCreatorFieldsFromRow(row),
		...asRecord(row.creator),
	};
	const modelCreators = {
		...flatCreatorFieldsFromRow(row),
		...asRecord(row.model_creators),
	};
	const providerSlug = getProviderSlug(row, creator);
	const modelSlug = firstString(row, ["slug"]);
	const modelRouteCreatorSlug =
		firstString(modelCreators, ["slug"]) ??
		firstString(creator, ["slug"]) ??
		providerSlug;
	const modelUrlPath = modelUrlPathFromRow(row, modelSlug);
	return {
		creator,
		modelCreators,
		providerSlug,
		modelSlug,
		modelRouteCreatorSlug,
		modelUrlPath,
	};
}

function selectModalities(
	row: JsonObject,
	direction: "input" | "output",
): string[] {
	return [
		row[`${direction}_modality_text`] || row[`${direction}ModalityText`]
			? "text"
			: null,
		row[`${direction}_modality_image`] || row[`${direction}ModalityImage`]
			? "image"
			: null,
		row[`${direction}_modality_video`] || row[`${direction}ModalityVideo`]
			? "video"
			: null,
		row[`${direction}_modality_speech`] || row[`${direction}ModalitySpeech`]
			? "speech"
			: null,
	].filter((value): value is string => value != null);
}

function getSelectedColumnValue(
	column: string,
	row: JsonObject,
	context: RowSelectionContext,
): unknown {
	const {
		creator,
		modelCreators,
		providerSlug,
		modelSlug,
		modelRouteCreatorSlug,
		modelUrlPath,
	} = context;

	switch (column) {
		case "id":
			return providerSlug && modelSlug
				? `${providerSlug}/${modelSlug}`
				: (modelSlug ?? row.id ?? null);
		case "model_url":
			return (
				row.model_url ??
				(modelRouteCreatorSlug && modelSlug
					? `/models/${modelRouteCreatorSlug}/${modelSlug}`
					: null) ??
				(typeof row.id === "string" ? row.id : null)
			);
		case "model_id":
			return typeof modelUrlPath === "string" && modelUrlPath.includes("/")
				? modelUrlPath
				: modelRouteCreatorSlug && modelUrlPath
					? `${modelRouteCreatorSlug}/${modelUrlPath}`
					: (modelUrlPath ?? row.model_url ?? null);
		case "name":
			return cleanArtificialAnalysisModelName(
				row.short_name ??
					row.shortName ??
					row.name ??
					(typeof row.slug === "string" ? row.slug : null),
			);
		case "provider":
			return (
				providerSlug ??
				creator.name ??
				modelCreators.name ??
				row.model_creator_id ??
				row.creator_name ??
				null
			);
		case "logo":
			return absoluteLogoUrl(
				row.logo_small_url ??
					row.logo_url ??
					row.logoSmall ??
					row.logo_small ??
					row.modelCreatorLogo ??
					modelCreators.logo_small_url ??
					modelCreators.logo_url ??
					modelCreators.logo_small ??
					modelCreators.logo ??
					creator.logo_small_url ??
					creator.logo_url ??
					creator.logo_small ??
					creator.logo,
			);
		case "attachment":
			return (
				Boolean(row.input_modality_image) ||
				Boolean(row.input_modality_video) ||
				Boolean(row.input_modality_speech) ||
				Boolean(row.inputModalityImage) ||
				Boolean(row.inputModalityVideo) ||
				Boolean(row.inputModalitySpeech)
			);
		case "reasoning":
		case "reasoning_model":
			return firstBoolean(row, ["reasoningModel"]);
		case "reasoning_effort":
			return parseArtificialAnalysisReasoningEffort(
				row.short_name ?? row.shortName ?? row.name,
			);
		case "input_modalities":
			return selectModalities(row, "input");
		case "output_modalities":
			return selectModalities(row, "output");
		case "release_date":
			return firstString(row, ["releaseDate"]);
		case "input_tokens": {
			const intelligenceTokenCounts = asRecord(
				row.intelligenceIndexTokenCounts,
			);
			return intelligenceTokenCounts.inputTokens ?? null;
		}
		case "output_tokens": {
			const intelligenceTokenCounts = asRecord(
				row.intelligenceIndexTokenCounts,
			);
			const answerTokens = firstNumber(intelligenceTokenCounts, [
				"answerTokens",
			]);
			const reasoningTokens = firstNumber(intelligenceTokenCounts, [
				"reasoningTokens",
			]);
			const outputFromParts =
				(answerTokens ?? 0) + (reasoningTokens ?? 0) > 0
					? (answerTokens ?? 0) + (reasoningTokens ?? 0)
					: null;
			return intelligenceTokenCounts.outputTokens ?? outputFromParts ?? null;
		}
		case "median_speed":
			return (
				row.median_output_speed ??
				row.medianOutputTokensPerSecond ??
				asRecord(row.timescaleData).median_output_speed ??
				null
			);
		case "median_time":
			return (
				row.median_time_to_first_chunk ??
				row.medianTimeToFirstTokenSeconds ??
				asRecord(row.timescaleData).median_time_to_first_chunk ??
				null
			);
		case "median_end_to_end_response_time":
			return (
				row.median_end_to_end_response_time ??
				row.medianEndToEndResponseTimeSeconds ??
				asRecord(row.end_to_end_response_time_metrics)
					.median_end_to_end_response_time ??
				null
			);
		case "evaluations":
			return pickEvaluations(row);
		case "intelligence":
			return pickIntelligence(row);
		case "intelligence_index_cost":
			return pickIntelligenceIndexCost(row);
		default:
			return NO_COLUMN_VALUE;
	}
}

function selectColumns(
	rows: JsonObject[],
	selectedColumns: string[],
): JsonObject[] {
	const selectedColumnSet = new Set(
		selectedColumns.filter(
			(column) => typeof column === "string" && column.length > 0,
		),
	);
	if (selectedColumnSet.size === 0) {
		return rows;
	}
	return rows.map((row) => {
		const projectedRow: JsonObject = {};
		const selectionContext = buildRowSelectionContext(row);

		for (const column of selectedColumnSet) {
			const projectedValue = getSelectedColumnValue(
				column,
				row,
				selectionContext,
			);
			if (projectedValue !== NO_COLUMN_VALUE) {
				projectedRow[column] = normalizeUndefinedToNull(projectedValue);
			} else {
				projectedRow[column] = normalizeUndefinedToNull(row[column] ?? null);
			}
		}
		return projectedRow;
	});
}

function extractLeaderboardRowsFromCorpus(flightCorpus: string): JsonObject[] {
	const leaderboardRowsById = new Map<string, JsonObject>();

	let cursor = 0;
	while (true) {
		const hitIndex = flightCorpus.indexOf(`"${ROW_DETECTION_KEY}":`, cursor);
		if (hitIndex === -1) {
			break;
		}
		cursor = hitIndex + 1;

		const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
		for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
			if (flightCorpus[backIndex] !== "{") {
				continue;
			}
			const endIndex = findArtificialAnalysisFlightObjectEnd(
				flightCorpus,
				backIndex,
			);
			if (endIndex === -1 || endIndex < hitIndex) {
				continue;
			}
			const candidateRowText = flightCorpus.slice(backIndex, endIndex + 1);
			const candidateRow =
				parseArtificialAnalysisFlightObject(candidateRowText);
			if (!candidateRow) {
				continue;
			}
			if (!(ROW_DETECTION_KEY in candidateRow)) {
				continue;
			}
			const rowId = getRowIdentifier(candidateRow);
			if (!rowId) {
				continue;
			}
			leaderboardRowsById.set(rowId, candidateRow);
			break;
		}
	}
	return [...leaderboardRowsById.values()];
}

export function processArtificialAnalysisLeaderboardRows(
	rows: JsonObject[],
	options: ArtificialAnalysisLeaderboardProcessOptions = {},
): JsonObject[] {
	const shouldFlatten = options.flatten ?? true;
	const shouldDropMostlyNullColumns = options.dropMostlyNullColumns ?? true;
	const selectedColumns = options.selectedColumns ?? [];

	const sortedRows = sortLeaderboardRows(rows);
	const flattenedRows = shouldFlatten
		? sortedRows.map(flattenExpandedRow)
		: sortedRows;
	if (selectedColumns.length > 0) {
		return selectColumns(flattenedRows, selectedColumns);
	}
	const nonSparseRows = shouldDropMostlyNullColumns
		? dropMostlyNullColumns(flattenedRows, SPARSE_COLUMN_NULL_RATIO)
		: flattenedRows;
	return selectColumns(nonSparseRows, selectedColumns);
}

/**
 * Raw Artificial Analysis page rows stay unflattened so downstream snapshot code owns projection.
 *
 * This function intentionally performs no flattening/cleaning/selection.
 */
export async function getArtificialAnalysisLeaderboardRawStats(
	options: Pick<ArtificialAnalysisLeaderboardOptions, "url" | "timeoutMs"> = {},
): Promise<ArtificialAnalysisLeaderboardRawPayload> {
	try {
		const url = options.url ?? DEFAULT_SCRAPE_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Artificial Analysis scrape failed: ${response.status}`);
		}
		const pageHtml = await response.text();
		const flightCorpus = extractArtificialAnalysisFlightCorpus(pageHtml);
		const leaderboardRows = sortLeaderboardRows(
			extractLeaderboardRowsFromCorpus(flightCorpus).filter(
				isLeaderboardModelRow,
			),
		);

		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: leaderboardRows,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}

/** Scrape the Artificial Analysis leaderboard with the selected columns used by source matching and scoring. */
export async function getArtificialAnalysisLeaderboardStats(
	options: Omit<ArtificialAnalysisLeaderboardOptions, "selectedColumns"> = {},
): Promise<ArtificialAnalysisLeaderboardPayload> {
	const rawPayload = await getArtificialAnalysisLeaderboardRawStats(options);
	return {
		fetched_at_epoch_seconds: rawPayload.fetched_at_epoch_seconds,
		data: processArtificialAnalysisLeaderboardRows(rawPayload.data, {
			...options,
			selectedColumns: [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
		}),
	};
}
