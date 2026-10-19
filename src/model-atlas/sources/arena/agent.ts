/**
 * Arena Agent leaderboard results from Arena.
 *
 * Page source: https://arena.ai/leaderboard/agent
 * Dataset source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/agent/latest
 */

import { benchmarkModelEffort, normalizeModelToken } from "../../identity/normalization";
import { providerIdentityKey } from "../../identity/provider";
import { asFiniteNumber, asRecord, nowEpochSeconds, stringValue } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource } from "../request-scheduler";
import { ARENA_AGENT_DATASET_URL, arenaDatasetIdentity, fetchArenaDataset } from "./dataset";

export const DEFAULT_LEADERBOARD_URL = "https://arena.ai/leaderboard/agent";

const DEFAULT_TIMEOUT_MS = 30_000;

const ARENA_AGENT_OBJECT_MARKER = '{"arena":{"slug":"agent"';

export type ArenaAgentModelScoreRow = {
  source_url: string;
  observed_at: string | null;
  rank: number;
  contender_name: string;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  organization: string;
  score: number;
  cost_per_task_usd: number | null;
};

export type ArenaAgentRowsByModelName = Map<string, ArenaAgentModelScoreRow>;

type ArenaAgentPayload = {
  fetched_at_epoch_seconds: number | null;
  data: ArenaAgentModelScoreRow[];
};

type ArenaAgentScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

/** Prefer the live website; fallback rows retain their separate publication date and source URL. */
export async function getArenaAgentStats(
  options: ArenaAgentScraperOptions = {},
): Promise<ArenaAgentPayload> {
  try {
    const url = options.url ?? DEFAULT_LEADERBOARD_URL;
    return await fetchSource(url, {}, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, async (response) => {
      if (!response.ok) {
        throw new Error(`Arena Agent scrape failed: ${response.status}`);
      }
      const data = processArenaAgentPageHtml(await response.text());
      if (data.length === 0) throw new Error("Arena Agent website has no usable rows");
      return {
        fetched_at_epoch_seconds: nowEpochSeconds(),
        data,
      };
    });
  } catch {
    try {
      const data = processArenaAgentDatasetRows(
        await fetchArenaDataset("agent", options.timeoutMs),
      );
      return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
    } catch {
      return { fetched_at_epoch_seconds: null, data: [] };
    }
  }
}

/** Preserve website contender identities and current quality; task costs are outside the selected contract. */
export function processArenaAgentPageHtml(pageHtml: string): ArenaAgentModelScoreRow[] {
  const corpus = extractNextFlightCorpus(pageHtml);
  for (
    let startIndex = corpus.indexOf(ARENA_AGENT_OBJECT_MARKER);
    startIndex !== -1;
    startIndex = corpus.indexOf(ARENA_AGENT_OBJECT_MARKER, startIndex + 1)
  ) {
    const endIndex = findObjectEnd(corpus, startIndex);
    if (endIndex === -1) {
      continue;
    }
    const payload = parseFlightJsonObject(corpus.slice(startIndex, endIndex + 1));
    if (payload == null) {
      continue;
    }
    const snapshot = asRecord(payload.snapshot);
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    const lastUpdated = stringValue(snapshot.lastUpdated);
    const observedAt =
      lastUpdated && /^\d{4}-\d{2}-\d{2}T/.test(lastUpdated) ? lastUpdated.slice(0, 10) : null;
    const parsedRows = rows.flatMap((row) => {
      const parsed = arenaAgentRow(row, observedAt);
      return parsed == null ? [] : [parsed];
    });
    if (parsedRows.length > 0) {
      return parsedRows;
    }
  }
  return [];
}

function arenaAgentRow(value: unknown, observedAt: string | null): ArenaAgentModelScoreRow | null {
  const row = asRecord(value);
  const avgScore = asRecord(row.avgScore);
  const rank = integerValue(row.rank);
  const contenderName = stringValue(row.contenderName);
  const model = stringValue(row.model);
  const organization = stringValue(row.modelOrganization);
  const score = asFiniteNumber(avgScore.value);
  if (
    rank == null ||
    contenderName == null ||
    model == null ||
    organization == null ||
    score == null
  ) {
    return null;
  }
  const { baseModel, reasoningEffort } = benchmarkModelEffort(model);
  return {
    source_url: DEFAULT_LEADERBOARD_URL,
    observed_at: observedAt,
    rank,
    contender_name: contenderName,
    model,
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    organization,
    score,
    cost_per_task_usd: null,
  };
}

function integerValue(value: unknown): number | null {
  const number = nonNegativeNumber(value);
  return number != null && Number.isInteger(number) ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = asFiniteNumber(value);
  return number != null && number >= 0 ? number : null;
}

/** Dataset labels are explicit fallback identities, never reconstructed website contender IDs. */
export function processArenaAgentDatasetRows(
  values: Record<string, unknown>[],
): ArenaAgentModelScoreRow[] {
  const rows: ArenaAgentModelScoreRow[] = [];
  const identities = new Set<string>();
  for (const value of values) {
    if (value.category !== "overall") continue;
    const model = stringValue(value.model_name);
    const organization = stringValue(value.organization);
    const score = asFiniteNumber(value.score);
    const rank = integerValue(value.rank);
    const observedAt = stringValue(value.leaderboard_publish_date);
    if (
      model == null ||
      organization == null ||
      score == null ||
      rank == null ||
      rank < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(observedAt ?? "")
    )
      throw new Error("Invalid Arena Agent dataset row");
    const identity = arenaDatasetIdentity(model);
    const key = `${providerIdentityKey(organization)}|${normalizeModelToken(identity.baseModel)}|${identity.reasoningEffort ?? ""}`;
    if (identity.unknown || identities.has(key))
      throw new Error("Ambiguous Arena Agent dataset identity");
    identities.add(key);
    rows.push({
      source_url: ARENA_AGENT_DATASET_URL,
      observed_at: observedAt,
      rank,
      contender_name: `dataset:${organization}:${model}`,
      model,
      base_model: identity.baseModel,
      reasoning_effort: identity.reasoningEffort,
      organization,
      score,
      cost_per_task_usd: null,
    });
  }
  return rows;
}
