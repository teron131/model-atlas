/**
 * Aggregate indexes and general model metrics from the Artificial Analysis leaderboard.
 *
 * Page source: https://artificialanalysis.ai/leaderboards/models
 */

import { ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS } from "../../benchmarks/index-policy";
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

const MODEL_SEARCH_BACKTRACK_CHARS = 20_000;

type ArtificialAnalysisLeaderboardOptions = {
  url?: string;
  timeoutMs?: number;
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
] as const;

const RECORDED_INDEX_COMPONENTS: ReadonlySet<string> = new Set(
  Object.keys(ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS),
);

const NO_COLUMN_VALUE = Symbol("no_column_value");

type RowSelectionContext = {
  creator: JsonObject;
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
  options: ArtificialAnalysisLeaderboardOptions = {},
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
  options: ArtificialAnalysisLeaderboardOptions = {},
): Promise<ArtificialAnalysisLeaderboardPayload> {
  const rawPayload = await getArtificialAnalysisLeaderboardRawStats(options);
  return {
    fetched_at_epoch_seconds: rawPayload.fetched_at_epoch_seconds,
    data: processArtificialAnalysisLeaderboardRows(rawPayload.data, [
      ...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
    ]),
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
  selectedColumns: readonly string[],
): JsonObject[] {
  return selectColumns(sortLeaderboardRows(rows), selectedColumns);
}

function sortLeaderboardRows(rows: JsonObject[]): JsonObject[] {
  return [...rows].sort((left, right) => {
    const leftIntelligence = firstNumber(left, ["intelligenceIndex"]);
    const rightIntelligence = firstNumber(right, ["intelligenceIndex"]);
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

/** Leaderboard preview rows name their creator inline, while model-page rows nest it. */
function isLeaderboardModelRow(row: JsonObject): boolean {
  if (!(ROW_DETECTION_KEY in row)) {
    return false;
  }
  const creatorName =
    firstString(row, ["modelCreatorName"]) ?? firstString(asRecord(row.creator), ["name"]);
  return (
    firstString(row, ["slug"]) != null && firstString(row, ["name"]) != null && creatorName != null
  );
}

function buildRowSelectionContext(row: JsonObject): RowSelectionContext {
  const creator = asRecord(row.creator);
  const providerSlug = creatorNameSlug(creator);
  const modelSlug = firstString(row, ["slug"]);
  return {
    creator,
    providerSlug,
    modelSlug,
    modelUrlCreatorSlug: firstString(creator, ["slug"]) ?? providerSlug,
    modelUrlPath: modelUrlPathFromRow(row, modelSlug),
  };
}

function creatorNameSlug(creator: JsonObject): string | null {
  return (
    firstString(creator, ["name"])
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ?? null
  );
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

function selectColumns(rows: JsonObject[], selectedColumns: readonly string[]): JsonObject[] {
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
  const { creator, providerSlug, modelSlug, modelUrlCreatorSlug } = context;

  switch (column) {
    case "model_url":
      return (
        row.model_url ??
        (modelUrlCreatorSlug && modelSlug ? `/models/${modelUrlCreatorSlug}/${modelSlug}` : null)
      );
    case "model_id":
      return artificialAnalysisModelId(row);
    case "name":
      return cleanArtificialAnalysisModelName(row.shortName ?? row.name ?? modelSlug);
    case "provider":
      return providerSlug;
    case "logo":
      return absoluteLogoUrl(creator.logo);
    case "reasoning":
      return firstBoolean(row, ["isReasoning"]);
    case "reasoning_effort":
      return (
        canonicalReasoningEffort(row.reasoning_effort ?? asRecord(row.effort).slug) ??
        parseArtificialAnalysisReasoningEffort(row.name, row.shortName)
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
    case "median_speed":
      return firstNumber(asRecord(row.timescaleData), ["medianOutputSpeed"]);
    case "median_time":
      return firstNumber(asRecord(row.timescaleData), ["medianTimeToFirstChunk"]);
    case "median_end_to_end_response_time":
      return firstNumber(asRecord(row.endToEndResponseTime), ["total"]);
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
    row[`${direction}ModalityText`] ? "text" : null,
    row[`${direction}ModalityImage`] ? "image" : null,
    row[`${direction}ModalityVideo`] ? "video" : null,
    row[`${direction}ModalitySpeech`] ? "speech" : null,
  ].filter((value): value is string => value != null);
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
      ? firstNumber(row, ["intelligenceIndex"])
      : null,
    omniscience_index: firstNumber(row, ["omniscience"]),
  };
}

function pickIntelligenceIndexCost(row: JsonObject): JsonObject {
  return {
    cost_per_task: firstNumber(asRecord(asRecord(row.intelligenceIndexCostPerTask).cost), [
      "total",
    ]),
    seconds_per_task: firstNumber(row, ["intelligenceIndexTimePerTask"]),
    output_tokens_per_task: firstNumber(asRecord(row.intelligenceIndexOutputTokensPerTask), [
      "output",
    ]),
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
