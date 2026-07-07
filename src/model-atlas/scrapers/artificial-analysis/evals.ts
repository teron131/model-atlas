/**
 * Artificial Analysis main leaderboard scraper owns the broad score table and general model metrics.
 *
 * This centralized page is the broad model table for scores and general Artificial Analysis metrics; benchmark-specific resource pages are scraped separately when they expose per-task cost, time, token, or harness details that the main table omits.
 */

import { asRecord, type JsonObject } from "../../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import {
	cleanArtificialAnalysisModelName,
	parseArtificialAnalysisReasoningEffort,
} from "./common";

const DEFAULT_SCRAPE_URL = "https://artificialanalysis.ai/leaderboards/models";
const DEFAULT_TIMEOUT_MS = 30_000;
const ROW_DETECTION_KEY = "intelligenceIndex";
const SPARSE_COLUMN_NULL_RATIO = 0.5;
const MODEL_SEARCH_BACKTRACK_CHARS = 20_000;
const MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD = 1_000_000;
const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

export type ArtificialAnalysisScraperOptions = {
	url?: string;
	timeoutMs?: number;
	flatten?: boolean;
	dropMostlyNullColumns?: boolean;
	selectedColumns?: string[];
};

export type ArtificialAnalysisScraperProcessOptions = {
	flatten?: boolean;
	dropMostlyNullColumns?: boolean;
	selectedColumns?: string[];
};

export type ArtificialAnalysisScrapedRawPayload = {
	fetched_at_epoch_seconds: number | null;
	data: JsonObject[];
};

export type ArtificialAnalysisScrapedPayload =
	ArtificialAnalysisScrapedRawPayload;

export const ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS = [
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
function decodeFlightChunk(raw: string): string {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw;
	}
}

function toAbsoluteAaLogoUrl(value: unknown): string | null {
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

const EVALUATION_KEY_BY_SOURCE_KEY = {
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
		const normalizedKey = evaluationKeyBySourceKey(key);
		if (normalizedKey == null) {
			continue;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			evaluations[normalizedKey] = value;
		}
	}
	return evaluations;
}

function evaluationKeyBySourceKey(key: string): string | null {
	return (
		EVALUATION_KEY_BY_SOURCE_KEY[
			key as keyof typeof EVALUATION_KEY_BY_SOURCE_KEY
		] ??
		EVALUATION_KEY_BY_SOURCE_KEY[
			normalizeMetricKey(key) as keyof typeof EVALUATION_KEY_BY_SOURCE_KEY
		] ??
		null
	);
}

function pickIntelligence(row: JsonObject): JsonObject {
	const omniscienceBreakdown = asRecord(row.omniscienceBreakdown);
	const omniscienceTotal = asRecord(omniscienceBreakdown.total);
	const intelligence: JsonObject = {
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
	if (intelligence.omniscience_accuracy == null) {
		intelligence.omniscience_accuracy = firstNumber(omniscienceTotal, [
			"accuracy",
		]);
	}
	return intelligence;
}

function pickIntelligenceIndexCost(row: JsonObject): JsonObject {
	const intelligenceTokenCounts = asRecord(row.intelligenceIndexTokenCounts);
	const costPerTask = asRecord(row.intelligenceIndexCostPerTask);
	const costPerTaskBreakdown = asRecord(costPerTask.cost);
	const outputTokensPerTask = asRecord(
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
			totalTokens >= MIN_INTELLIGENCE_COST_TOKEN_THRESHOLD
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
			firstNumber(outputTokensPerTask, ["output"]) ??
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

function extractFlightCorpus(pageHtml: string): string {
	const matches = [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)];
	return matches.map((match) => decodeFlightChunk(match[1] ?? "")).join("\n");
}

function findObjectEnd(corpus: string, startIndex: number): number {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = startIndex; index < corpus.length; index += 1) {
		const char = corpus[index];
		if (inString) {
			if (escaping) {
				escaping = false;
			} else if (char === "\\") {
				escaping = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

function parseJsonObject(value: string): JsonObject | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
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

	for (const source of [timescaleData, responseTimeMetrics]) {
		for (const [key, value] of Object.entries(source)) {
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
	creatorSlug: string | null;
	modelUrlSlug: string | null;
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
function flatCreatorFromRow(row: JsonObject): JsonObject {
	return {
		name: firstString(row, ["modelCreatorName"]),
		slug: firstString(row, ["modelCreatorSlug"]),
		logo: firstString(row, ["modelCreatorLogo"]),
		color: firstString(row, ["modelCreatorColor"]),
	};
}

function modelUrlSlugFromRow(
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
		...flatCreatorFromRow(row),
		...asRecord(row.creator),
	};
	const modelCreators = {
		...flatCreatorFromRow(row),
		...asRecord(row.model_creators),
	};
	const providerSlug = getProviderSlug(row, creator);
	const modelSlug = firstString(row, ["slug"]);
	const creatorSlug =
		firstString(modelCreators, ["slug"]) ??
		firstString(creator, ["slug"]) ??
		providerSlug;
	const modelUrlSlug = modelUrlSlugFromRow(row, modelSlug);
	return {
		creator,
		modelCreators,
		providerSlug,
		modelSlug,
		creatorSlug,
		modelUrlSlug,
	};
}

function selectModalities(row: JsonObject, type: "input" | "output"): string[] {
	return [
		row[`${type}_modality_text`] || row[`${type}ModalityText`] ? "text" : null,
		row[`${type}_modality_image`] || row[`${type}ModalityImage`]
			? "image"
			: null,
		row[`${type}_modality_video`] || row[`${type}ModalityVideo`]
			? "video"
			: null,
		row[`${type}_modality_speech`] || row[`${type}ModalitySpeech`]
			? "speech"
			: null,
	].filter((value): value is string => value != null);
}

function selectReasoningFlag(row: JsonObject): boolean | null {
	return firstBoolean(row, ["reasoningModel"]);
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
		creatorSlug,
		modelUrlSlug,
	} = context;

	switch (column) {
		case "id":
			return providerSlug && modelSlug
				? `${providerSlug}/${modelSlug}`
				: (modelSlug ?? row.id ?? null);
		case "model_url":
			return (
				row.model_url ??
				(creatorSlug && modelSlug
					? `/models/${creatorSlug}/${modelSlug}`
					: null) ??
				(typeof row.id === "string" ? row.id : null)
			);
		case "model_id":
			return typeof modelUrlSlug === "string" && modelUrlSlug.includes("/")
				? modelUrlSlug
				: creatorSlug && modelUrlSlug
					? `${creatorSlug}/${modelUrlSlug}`
					: (modelUrlSlug ?? row.model_url ?? null);
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
			return toAbsoluteAaLogoUrl(
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
			return selectReasoningFlag(row);
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
	const keepSet = new Set(
		selectedColumns.filter(
			(column) => typeof column === "string" && column.length > 0,
		),
	);
	if (keepSet.size === 0) {
		return rows;
	}
	return rows.map((row) => {
		const selectedRow: JsonObject = {};
		const context = buildRowSelectionContext(row);

		for (const column of keepSet) {
			const columnValue = getSelectedColumnValue(column, row, context);
			if (columnValue !== NO_COLUMN_VALUE) {
				selectedRow[column] = normalizeUndefinedToNull(columnValue);
			} else {
				selectedRow[column] = normalizeUndefinedToNull(row[column] ?? null);
			}
		}
		return selectedRow;
	});
}

function extractRowsFromCorpus(corpus: string): JsonObject[] {
	const rowsById = new Map<string, JsonObject>();

	let cursor = 0;
	while (true) {
		const hitIndex = corpus.indexOf(`"${ROW_DETECTION_KEY}":`, cursor);
		if (hitIndex === -1) {
			break;
		}
		cursor = hitIndex + 1;

		const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
		for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
			if (corpus[backIndex] !== "{") {
				continue;
			}
			const endIndex = findObjectEnd(corpus, backIndex);
			if (endIndex === -1 || endIndex < hitIndex) {
				continue;
			}
			const candidateText = corpus.slice(backIndex, endIndex + 1);
			const row = parseJsonObject(candidateText);
			if (!row) {
				continue;
			}
			if (!(ROW_DETECTION_KEY in row)) {
				continue;
			}
			const rowId = getRowIdentifier(row);
			if (!rowId) {
				continue;
			}
			rowsById.set(rowId, row);
			break;
		}
	}
	return [...rowsById.values()];
}

export function processArtificialAnalysisScrapedRows(
	rows: JsonObject[],
	options: ArtificialAnalysisScraperProcessOptions = {},
): JsonObject[] {
	const shouldFlatten = options.flatten ?? true;
	const shouldDropMostlyNullColumns = options.dropMostlyNullColumns ?? true;
	const selectedColumns = options.selectedColumns ?? [];

	const currentRows = sortLeaderboardRows(rows);
	const normalizedRows = shouldFlatten
		? currentRows.map(flattenExpandedRow)
		: currentRows;
	if (selectedColumns.length > 0) {
		return selectColumns(normalizedRows, selectedColumns);
	}
	const cleanedRows = shouldDropMostlyNullColumns
		? dropMostlyNullColumns(normalizedRows, SPARSE_COLUMN_NULL_RATIO)
		: normalizedRows;
	return selectColumns(cleanedRows, selectedColumns);
}

/**
 * Raw Artificial Analysis page rows stay unflattened so downstream snapshot code owns projection.
 *
 * This function intentionally performs no flattening/cleaning/selection.
 */
export async function getArtificialAnalysisScrapedRawStats(
	options: Pick<ArtificialAnalysisScraperOptions, "url" | "timeoutMs"> = {},
): Promise<ArtificialAnalysisScrapedRawPayload> {
	try {
		const url = options.url ?? DEFAULT_SCRAPE_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Artificial Analysis scrape failed: ${response.status}`);
		}
		const pageHtml = await response.text();
		const corpus = extractFlightCorpus(pageHtml);
		const data = sortLeaderboardRows(
			extractRowsFromCorpus(corpus).filter(isLeaderboardModelRow),
		);

		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}

/**
 * Scrape expanded LLM leaderboard rows from Artificial Analysis page payload.
 *
 * This parser targets Next.js flight chunks embedded in HTML and is best-effort.
 * It is failure-safe and returns an empty payload on any fetch/parse failure.
 */
export async function getArtificialAnalysisScrapedStats(
	options: ArtificialAnalysisScraperOptions = {},
): Promise<ArtificialAnalysisScrapedPayload> {
	const rawPayload = await getArtificialAnalysisScrapedRawStats(options);
	return {
		fetched_at_epoch_seconds: rawPayload.fetched_at_epoch_seconds,
		data: processArtificialAnalysisScrapedRows(rawPayload.data, options),
	};
}

export async function getArtificialAnalysisEvalsStats(
	options: Omit<ArtificialAnalysisScraperOptions, "selectedColumns"> = {},
): Promise<ArtificialAnalysisScrapedPayload> {
	return getArtificialAnalysisScrapedStats({
		...options,
		selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
	});
}
