/**
 * ARC Prize results from the official verified leaderboards.
 *
 * Page source: https://arcprize.org/leaderboard
 * ARC-AGI-2 JSON source: https://arcprize.org/media/data/leaderboard/v2.json
 * ARC-AGI-3 JSON source: https://arcprize.org/media/data/leaderboard/v3.json
 */

import {
  benchmarkModelEffort,
  modelNameWithoutCreatorPrefix,
  normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { stringValue } from "../../scrapers/parsing";
import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../observation";

const DEFAULT_TIMEOUT_MS = 30_000;
const SCORE_ELIGIBLE_MODEL_TYPES = new Set(["Base LLM", "CoT"]);

export type ArcPrizeLeaderboardOptions = {
  benchmarkKey: "arc_agi_2" | "arc_agi_3";
  datasetId: "v2_Semi_Private" | "v3_Semi_Private";
  sourceUrl: string;
};

type ArcPrizeFetchOptions = ArcPrizeLeaderboardOptions & {
  timeoutMs?: number;
};

type ParsedArcPrizeRow = {
  model_id: string;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  model_creator: string;
  score: number;
  metadata: BenchmarkObservationMetadata;
  source_index: number;
};

/** Normalize ARC's Anthropic shorthand while preserving every displayed configuration in model. */
function arcModelIdentity(
  model: string,
  creator: string,
): {
  baseModel: string;
  reasoningEffort: string | null;
} {
  const parsed = benchmarkModelEffort(model);
  let baseModel = modelNameWithoutCreatorPrefix(parsed.baseModel, creator);
  if (
    normalizeModelToken(creator) === "anthropic" &&
    /^(?:opus|sonnet|haiku|fable)\b/i.test(baseModel)
  ) {
    baseModel = `Claude ${baseModel}`;
  }
  return { baseModel, reasoningEffort: parsed.reasoningEffort };
}

/** Keep one displayed, comparable general-model evaluation and its scoring provenance. */
function arcPrizeObservation(
  value: unknown,
  sourceIndex: number,
  options: ArcPrizeLeaderboardOptions,
): ParsedArcPrizeRow | null {
  const row = asRecord(value);
  if (row.datasetId !== options.datasetId || row.display === false || row.modelGroup === "Human") {
    return null;
  }

  const modelId = stringValue(row.modelId);
  const displayName = stringValue(row.modelDisplayName);
  const creator = stringValue(row.providerDisplayName) ?? stringValue(row.providerId);
  const modelType = stringValue(row.modelType);
  const score = asFiniteNumber(row.score);
  if (
    modelId == null ||
    displayName == null ||
    creator == null ||
    modelType == null ||
    !SCORE_ELIGIBLE_MODEL_TYPES.has(modelType) ||
    score == null ||
    score < 0 ||
    score > 1
  ) {
    return null;
  }

  const model = displayName.replace(/\s*[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, "").trim();
  const identity = arcModelIdentity(model, creator);
  const metadata: BenchmarkObservationMetadata = {};
  const cost = asFiniteNumber(options.datasetId === "v2_Semi_Private" ? row.costPerTask : row.cost);
  if (cost != null && cost >= 0) {
    metadata[
      options.datasetId === "v2_Semi_Private" ? "cost_per_task_usd" : "evaluation_cost_usd"
    ] = cost;
  }

  return {
    model_id: modelId,
    model,
    base_model: identity.baseModel,
    reasoning_effort: identity.reasoningEffort,
    model_creator: creator,
    score,
    metadata,
    source_index: sourceIndex,
  };
}

/** Parse one official leaderboard and rank displayed model rows by score, retaining ties. */
export function processArcPrizeLeaderboardJson(
  payload: unknown,
  options: ArcPrizeLeaderboardOptions,
): BenchmarkObservationRow[] {
  const root = asRecord(payload);
  const observedAt = stringValue(root.generatedAt);
  const evaluations = Array.isArray(root.evaluations) ? root.evaluations : [];
  const seenRows = new Set<string>();
  const rows = evaluations
    .map((value, sourceIndex) => arcPrizeObservation(value, sourceIndex, options))
    .filter((row): row is ParsedArcPrizeRow => row != null)
    .filter((row) => {
      const key = JSON.stringify([
        row.model_id,
        row.model,
        row.base_model,
        row.reasoning_effort,
        row.model_creator,
        row.score,
        row.metadata,
      ]);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    })
    .sort((left, right) => right.score - left.score || left.source_index - right.source_index);

  let rank = 0;
  let previousScore: number | null = null;
  return rows.map((row, index) => {
    if (previousScore !== row.score) rank = index + 1;
    previousScore = row.score;
    return {
      benchmark_key: options.benchmarkKey,
      source_url: options.sourceUrl,
      model_id: row.model_id,
      model: row.model,
      base_model: row.base_model,
      reasoning_effort: row.reasoning_effort,
      model_creator: row.model_creator,
      rank,
      canonical_value: row.score,
      observed_at: observedAt,
      metadata: row.metadata,
    };
  });
}

/** Fetch current official ARC Prize evidence without mutating persisted data. */
export async function getArcPrizeStats(
  options: ArcPrizeFetchOptions,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(
      options.sourceUrl,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`ARC Prize ${options.benchmarkKey} scrape failed: ${response.status}`);
    }
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processArcPrizeLeaderboardJson(await response.json(), options),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
