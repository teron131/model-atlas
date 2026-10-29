/**
 * Aggregate indexes and general model metrics from the Artificial Analysis leaderboard.
 *
 * Page source: https://artificialanalysis.ai/leaderboards/models
 */

import { ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS } from "../../benchmarks/index-policy";
import { ARTIFICIAL_ANALYSIS_CONTEXT_KEY_BY_ALIAS } from "../../benchmarks/registry";
import { canonicalReasoningEffort } from "../../identity/normalization";
import { asRecord, type JsonObject, nowEpochSeconds } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource } from "../request-scheduler";
import { artificialAnalysisEvaluationVersion } from "./benchmark-resources";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "./model-labels";
import { getArtificialAnalysisPage } from "./page-data";

const ARTIFICIAL_ANALYSIS_LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";

const DEFAULT_TIMEOUT_MS = 30_000;

const ROW_DETECTION_KEY = "intelligenceIndex";

const SPARSE_COLUMN_NULL_RATIO = 0.5;

const MODEL_SEARCH_BACKTRACK_CHARS = 20_000;

const MIN_INTELLIGENCE_COST_TOTAL_TOKENS = 1_000_000;

type ArtificialAnalysisLeaderboardOptions = {
  url?: string;
  timeoutMs?: number;
  flatten?: boolean;
  dropMostlyNullColumns?: boolean;
  selectedColumns?: string[];
};

type ArtificialAnalysisLeaderboardProcessOptions = {
  flatten?: boolean;
  dropMostlyNullColumns?: boolean;
  selectedColumns?: string[];
};

type ArtificialAnalysisLeaderboardRawPayload = {
  fetched_at_epoch_seconds: number | null;
  data: JsonObject[];
};

type ArtificialAnalysisLeaderboardPayload = ArtificialAnalysisLeaderboardRawPayload;

/** Leaderboard projection columns keep source-data callers off the larger raw page row shape. */
export const ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS = [
  "model_id",
  "name",
  "model_url",
  "provider",
  "logo",
  "release_date",
  "input_modalities",
  "output_modalities",
  "reasoning",
  "reasoning_effort",
  "cost",
  "median_speed",
  "median_time",
  "median_end_to_end_response_time",
  "intelligence",
  "intelligence_index_version",
  "intelligence_index_cost",
  "benchmarks",
] as const;

const RECORDED_INDEX_COMPONENTS: ReadonlySet<string> = new Set(
  Object.keys(ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS),
);

const NO_COLUMN_VALUE = Symbol("no_column_value");

type RowSelectionContext = {
  creator: JsonObject;
  modelCreators: JsonObject;
  providerSlug: string | null;
  modelSlug: string | null;
  modelUrlCreatorSlug: string | null;
  modelUrlPath: string | null;
};

/**
 * Raw Artificial Analysis page rows stay unflattened so downstream snapshot code owns projection.
 * Any fetch or parse failure returns an empty payload with no fetch time.
 */
export async function getArtificialAnalysisLeaderboardRawStats(
  options: Pick<ArtificialAnalysisLeaderboardOptions, "url" | "timeoutMs"> = {},
): Promise<ArtificialAnalysisLeaderboardRawPayload> {
  try {
    const url = options.url ?? ARTIFICIAL_ANALYSIS_LEADERBOARD_URL;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const pageHtml = await fetchSource(url, {}, timeoutMs, async (response) => {
      if (!response.ok) {
        throw new Error(`Artificial Analysis scrape failed: ${response.status}`);
      }
      return response.text();
    });
    const corpus = extractNextFlightCorpus(pageHtml);
    const intelligenceIndexVersion = publishedIntelligenceIndexVersion(corpus);
    if (intelligenceIndexVersion == null)
      throw new Error("Missing Artificial Analysis Intelligence Index version");
    const preview = sortLeaderboardRows(
      extractLeaderboardRowsFromCorpus(corpus).filter(isLeaderboardModelRow),
    );
    const modelSlug = preview.find((row) => row.deprecated !== true)?.slug;
    if (typeof modelSlug !== "string" || modelSlug.length === 0)
      throw new Error("Missing Artificial Analysis model-detail link");
    // Model pages publish the complete comparison dataset with index resources; the leaderboard preview omits them.
    const { models } = await getArtificialAnalysisPage(
      new URL(`/models/${encodeURIComponent(modelSlug)}`, url).href,
      timeoutMs,
    );
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: sortLeaderboardRows(
        models.filter(isLeaderboardModelRow).map((row) => ({
          ...row,
          intelligenceIndexVersion,
          intelligenceIndexComponents: intelligenceIndexComponentSlugs(row),
        })),
      ),
    };
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      data: [],
    };
  }
}

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

/** Resolve one stable model identity from both live page rows and persisted leaderboard rows. */
export function artificialAnalysisModelId(row: JsonObject): string | null {
  const explicitModelId = firstString(row, ["model_id"]);
  if (explicitModelId != null) {
    return explicitModelId;
  }
  const { modelUrlCreatorSlug, modelSlug, modelUrlPath } = buildRowSelectionContext(row);
  if (typeof modelUrlPath === "string" && modelUrlPath.includes("/")) {
    return modelUrlPath;
  }
  if (modelUrlCreatorSlug != null && modelUrlPath != null) {
    return `${modelUrlCreatorSlug}/${modelUrlPath}`;
  }
  return modelUrlPath ?? modelSlug;
}

export function processArtificialAnalysisLeaderboardRows(
  rows: JsonObject[],
  options: ArtificialAnalysisLeaderboardProcessOptions = {},
): JsonObject[] {
  const shouldFlatten = options.flatten ?? true;
  const shouldDropMostlyNullColumns = options.dropMostlyNullColumns ?? true;
  const selectedColumns = options.selectedColumns ?? [];

  const sortedRows = sortLeaderboardRows(rows);
  const flattenedRows = shouldFlatten ? sortedRows.map(flattenExpandedRow) : sortedRows;
  if (selectedColumns.length > 0) {
    return selectColumns(flattenedRows, selectedColumns);
  }
  const rowsWithPrunedColumns = shouldDropMostlyNullColumns
    ? dropMostlyNullColumns(flattenedRows, SPARSE_COLUMN_NULL_RATIO)
    : flattenedRows;
  return selectColumns(rowsWithPrunedColumns, selectedColumns);
}

function sortLeaderboardRows(rows: JsonObject[]): JsonObject[] {
  return [...rows].sort((left, right) => {
    const leftIntelligence = firstNumber(left, ["intelligenceIndex", "intelligence_index"]);
    const rightIntelligence = firstNumber(right, ["intelligenceIndex", "intelligence_index"]);
    if (leftIntelligence == null && rightIntelligence == null) {
      return (firstString(left, ["slug"]) ?? "").localeCompare(firstString(right, ["slug"]) ?? "");
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
    return (firstString(left, ["slug"]) ?? "").localeCompare(firstString(right, ["slug"]) ?? "");
  });
}

function firstNumber(row: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    if (typeof row[key] === "number") {
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

/** The leaderboard names its index evaluation with the version it currently publishes; null when that name is missing. */
function publishedIntelligenceIndexVersion(flightCorpus: string): string | null {
  const name = /"slug":"artificial-analysis-intelligence-index","name":"([^"]+)"/.exec(
    flightCorpus,
  )?.[1];
  return name == null ? null : artificialAnalysisEvaluationVersion(name);
}

function intelligenceIndexComponentSlugs(row: JsonObject): string[] {
  const evaluations = row.intelligenceIndexEvaluations;
  return Array.isArray(evaluations)
    ? evaluations.flatMap((evaluation) => {
        const slug = asRecord(evaluation).slug;
        return typeof slug === "string" ? [slug] : [];
      })
    : [];
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
      const endIndex = findObjectEnd(flightCorpus, backIndex);
      if (endIndex === -1 || endIndex < hitIndex) {
        continue;
      }
      const candidateRowText = flightCorpus.slice(backIndex, endIndex + 1);
      const candidateRow = parseFlightJsonObject(candidateRowText);
      if (!candidateRow) {
        continue;
      }
      if (!(ROW_DETECTION_KEY in candidateRow)) {
        continue;
      }
      const rowId = rowIdentifier(candidateRow);
      if (!rowId) {
        continue;
      }
      leaderboardRowsById.set(rowId, candidateRow);
      break;
    }
  }
  return [...leaderboardRowsById.values()];
}

function rowIdentifier(row: JsonObject): string | null {
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
    firstString(row, ["modelCreatorName"]) ?? firstString(asRecord(row.creator), ["name"]);
  return slug != null && name != null && (creatorSlug != null || creatorName != null);
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
  const providerSlug = creatorNameSlug(row, creator);
  const modelSlug = firstString(row, ["slug"]);
  const modelUrlCreatorSlug =
    firstString(modelCreators, ["slug"]) ?? firstString(creator, ["slug"]) ?? providerSlug;
  const modelUrlPath = modelUrlPathFromRow(row, modelSlug);
  return {
    creator,
    modelCreators,
    providerSlug,
    modelSlug,
    modelUrlCreatorSlug,
    modelUrlPath,
  };
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

function creatorNameSlug(row: JsonObject, creator: JsonObject): string | null {
  const creatorName =
    typeof creator.name === "string"
      ? creator.name
      : typeof row.provider === "string"
        ? row.provider
        : firstString(row, ["modelCreatorName", "modelCreatorSlug"]);
  if (creatorName == null) {
    return null;
  }
  return creatorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function modelUrlPathFromRow(row: JsonObject, fallbackSlug: string | null): string | null {
  if (typeof row.model_url !== "string" || row.model_url.length === 0) {
    return fallbackSlug;
  }
  const urlPath = row.model_url
    .replace(/^https?:\/\/(?:www\.)?artificialanalysis\.ai/, "")
    .replace(/^\/models\//, "");
  return urlPath.length > 0 ? urlPath : fallbackSlug;
}

function dropMostlyNullColumns(rows: JsonObject[], nullRatioThreshold: number): JsonObject[] {
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
    Object.fromEntries(Object.entries(row).filter(([column]) => !columnsToDrop.has(column))),
  );
}

function isNullLike(value: unknown): boolean {
  return (
    value == null ||
    value === "" ||
    value === "$undefined" ||
    (Array.isArray(value) && value.length === 0)
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
    flattenedRow.prompt_length_type_default = firstPerformanceRow.prompt_length_type;
  }

  return flattenedRow;
}

function selectColumns(rows: JsonObject[], selectedColumns: string[]): JsonObject[] {
  const selectedColumnSet = new Set(
    selectedColumns.filter((column) => typeof column === "string" && column.length > 0),
  );
  if (selectedColumnSet.size === 0) {
    return rows;
  }
  return rows.map((row) => {
    const projectedRow: JsonObject = {};
    const selectionContext = buildRowSelectionContext(row);

    for (const column of selectedColumnSet) {
      const projectedValue = selectedColumnValue(column, row, selectionContext);
      if (projectedValue !== NO_COLUMN_VALUE) {
        projectedRow[column] = normalizeUndefinedToNull(projectedValue);
      } else {
        projectedRow[column] = normalizeUndefinedToNull(row[column] ?? null);
      }
    }
    return projectedRow;
  });
}

function selectedColumnValue(
  column: string,
  row: JsonObject,
  context: RowSelectionContext,
): unknown {
  const { creator, modelCreators, providerSlug, modelSlug, modelUrlCreatorSlug } = context;

  switch (column) {
    case "id":
      return providerSlug && modelSlug
        ? `${providerSlug}/${modelSlug}`
        : (modelSlug ?? row.id ?? null);
    case "model_url":
      return (
        row.model_url ??
        (modelUrlCreatorSlug && modelSlug ? `/models/${modelUrlCreatorSlug}/${modelSlug}` : null) ??
        (typeof row.id === "string" ? row.id : null)
      );
    case "model_id":
      return artificialAnalysisModelId(row);
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
    case "reasoning":
    case "reasoning_model":
      return firstBoolean(row, ["reasoningModel"]);
    case "reasoning_effort":
      return (
        canonicalReasoningEffort(
          row.reasoning_effort ?? row.reasoningEffort ?? asRecord(row.effort).slug,
        ) ?? parseArtificialAnalysisReasoningEffort(row.name, row.short_name, row.shortName)
      );
    case "input_modalities":
      return selectModalities(row, "input");
    case "output_modalities":
      return selectModalities(row, "output");
    case "release_date":
      return firstString(row, ["releaseDate"]);
    case "cost":
      return {
        input: firstNumber(row, ["price1mInputTokens"]),
        output: firstNumber(row, ["price1mOutputTokens"]),
      };
    case "input_tokens": {
      const intelligenceTokenCounts = asRecord(row.intelligenceIndexTokenCounts);
      return intelligenceTokenCounts.inputTokens ?? null;
    }
    case "output_tokens": {
      const intelligenceTokenCounts = asRecord(row.intelligenceIndexTokenCounts);
      const answerTokens = firstNumber(intelligenceTokenCounts, ["answerTokens"]);
      const reasoningTokens = firstNumber(intelligenceTokenCounts, ["reasoningTokens"]);
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
        asRecord(row.end_to_end_response_time_metrics).median_end_to_end_response_time ??
        null
      );
    case "benchmarks":
      return pickBenchmarks(row);
    case "intelligence":
      return pickIntelligence(row);
    case "intelligence_index_version":
      return firstString(row, ["intelligenceIndexVersion"]);
    case "intelligence_index_cost":
      return pickIntelligenceIndexCost(hasRecordedIntelligenceIndexComponents(row) ? row : {});
    default:
      return NO_COLUMN_VALUE;
  }
}

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

function firstBoolean(row: JsonObject, keys: string[]): boolean | null {
  for (const key of keys) {
    if (typeof row[key] === "boolean") {
      return row[key];
    }
  }
  return null;
}

function selectModalities(row: JsonObject, direction: "input" | "output"): string[] {
  return [
    row[`${direction}_modality_text`] || row[`${direction}ModalityText`] ? "text" : null,
    row[`${direction}_modality_image`] || row[`${direction}ModalityImage`] ? "image" : null,
    row[`${direction}_modality_video`] || row[`${direction}ModalityVideo`] ? "video" : null,
    row[`${direction}_modality_speech`] || row[`${direction}ModalitySpeech`] ? "speech" : null,
  ].filter((value): value is string => value != null);
}

/** Only context fields are kept; task-level benchmark scores come from their evaluation pages, so this table never becomes a second benchmark authority. */
function pickBenchmarks(row: JsonObject): JsonObject {
  const benchmarks: JsonObject = {};
  for (const [key, value] of Object.entries(row)) {
    const benchmarkKey = benchmarkKeyBySourceKey(key);
    if (benchmarkKey == null) {
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      benchmarks[benchmarkKey] = value;
    }
  }
  return benchmarks;
}

function benchmarkKeyBySourceKey(key: string): string | null {
  return (
    ARTIFICIAL_ANALYSIS_CONTEXT_KEY_BY_ALIAS[key] ??
    ARTIFICIAL_ANALYSIS_CONTEXT_KEY_BY_ALIAS[normalizeMetricKey(key)] ??
    null
  );
}

// `"gpqaDiamond"` → `"gpqa_diamond"`.
function normalizeMetricKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** An index value and its per-task telemetry count only when the row lists exactly the recorded constituents: a changed basket alters breadth and overlap, so it waits for review instead of scoring, and rows kept from before constituents were recorded never count. */
function hasRecordedIntelligenceIndexComponents(row: JsonObject): boolean {
  const components = row.intelligenceIndexComponents;
  if (!Array.isArray(components)) return false;
  const slugs = new Set(components);
  return (
    slugs.size === RECORDED_INDEX_COMPONENTS.size &&
    [...slugs].every((slug) => typeof slug === "string" && RECORDED_INDEX_COMPONENTS.has(slug))
  );
}

function pickIntelligence(row: JsonObject): JsonObject {
  return {
    intelligence_index: hasRecordedIntelligenceIndexComponents(row)
      ? firstNumber(row, ["intelligenceIndex", "intelligence_index"])
      : null,
    agentic_index: firstNumber(row, ["agenticIndex", "agentic_index"]),
    coding_index: firstNumber(row, ["codingIndex", "coding_index"]),
    omniscience_index: firstNumber(row, ["omniscience", "omniscience_index"]),
  };
}

function pickIntelligenceIndexCost(row: JsonObject): JsonObject {
  const intelligenceTokenCounts = asRecord(row.intelligenceIndexTokenCounts);
  const costPerTaskRecord = asRecord(row.intelligenceIndexCostPerTask);
  const costPerTaskBreakdown = asRecord(costPerTaskRecord.cost);
  const outputTokensPerTaskRecord = asRecord(row.intelligenceIndexOutputTokensPerTask);
  const inputTokens = firstNumber(intelligenceTokenCounts, ["inputTokens"]);
  const outputTokens = firstNumber(intelligenceTokenCounts, ["outputTokens"]);
  const answerTokens = firstNumber(intelligenceTokenCounts, ["answerTokens"]);
  const reasoningTokens = firstNumber(intelligenceTokenCounts, ["reasoningTokens"]);
  const outputFromParts =
    (answerTokens ?? 0) + (reasoningTokens ?? 0) > 0
      ? (answerTokens ?? 0) + (reasoningTokens ?? 0)
      : null;
  const totalTokens = outputTokens ?? outputFromParts;

  return {
    input_cost: firstNumber(row, ["intelligenceIndexCostInput", "input_cost"]),
    reasoning_cost: firstNumber(row, ["intelligenceIndexCostReasoning", "reasoning_cost"]),
    output_cost: firstNumber(row, ["intelligenceIndexCostOutput", "output_cost"]),
    total_cost: firstNumber(row, ["intelligenceIndexCostTotal", "total_cost"]),
    input_tokens: inputTokens ?? firstNumber(row, ["input_tokens"]),
    reasoning_tokens: reasoningTokens ?? firstNumber(row, ["reasoning_tokens"]),
    answer_tokens: answerTokens ?? firstNumber(row, ["answer_tokens"]),
    output_tokens: outputTokens ?? firstNumber(row, ["output_tokens"]),
    total_tokens:
      typeof totalTokens === "number" && totalTokens >= MIN_INTELLIGENCE_COST_TOTAL_TOKENS
        ? totalTokens
        : firstNumber(row, ["total_tokens"]),
    cost_per_task:
      firstNumber(costPerTaskBreakdown, ["total"]) ??
      firstNumber(row, ["intelligenceIndexCostPerTask", "cost_per_task"]),
    seconds_per_task: firstNumber(row, ["intelligenceIndexTimePerTask", "seconds_per_task"]),
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
