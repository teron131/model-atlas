/**
 * Arena Agent leaderboard results from Arena.
 *
 * Page source: https://arena.ai/leaderboard/agent
 */

import { benchmarkModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import {
  extractNextFlightCorpus,
  findObjectEnd,
  parseFlightJsonObject,
  stringValue,
} from "../parsing";
import { fetchSource } from "../request-scheduler";

export const DEFAULT_LEADERBOARD_URL = "https://arena.ai/leaderboard/agent";

const DEFAULT_TIMEOUT_MS = 30_000;

const ARENA_AGENT_OBJECT_MARKER = '{"arena":{"slug":"agent"';

export type ArenaAgentModelScoreRow = {
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
      return {
        fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
        data,
      };
    });
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Join rolling task costs by contender identity; missing costs never discard quality evidence. */
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
    const costStats = asRecord(payload.costStats);
    const costsByContender = new Map(
      (Array.isArray(costStats.entries) ? costStats.entries : []).map((value) => {
        const cost = asRecord(value);
        return [stringValue(cost.contenderName), cost] as const;
      }),
    );
    const parsedRows = rows.flatMap((row) => {
      const parsed = arenaAgentRow(
        row,
        costsByContender.get(stringValue(asRecord(row).contenderName)),
      );
      return parsed == null ? [] : [parsed];
    });
    if (parsedRows.length > 0) {
      return parsedRows;
    }
  }
  return [];
}

function arenaAgentRow(value: unknown, costValue: unknown): ArenaAgentModelScoreRow | null {
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
  const cost = asRecord(costValue);
  const pricedSampleCount = integerValue(cost.pricedSampleCount);
  return {
    rank,
    contender_name: contenderName,
    model,
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    organization,
    score,
    cost_per_task_usd: pricedSampleCount === 0 ? null : nonNegativeNumber(cost.medianUsd),
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
