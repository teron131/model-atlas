/**
 * Riemann-bench leaderboard results from Surge AI.
 *
 * Page source: https://surgehq.ai/leaderboards/riemann-bench
 * Paper source: https://cdn.prod.website-files.com/68dc970bd6e945ea3fb0f426/69c2d73f5d377a9428089ff7_048c62b8b526b0f06e87457bcca0e6fa_RiemannBench.pdf
 */

import { modelNameIdentityKey } from "../../identity";
import { normalizeModelToken } from "../../identity/normalization";
import { nowEpochSeconds } from "../../runtime";
import { fetchSource } from "../request-scheduler";
import { surgeLeaderboardScoreRows } from "./results";

const RIEMANN_BENCH_LEADERBOARD_URL = "https://surgehq.ai/leaderboards/riemann-bench";

export type RiemannBenchModelScoreRow = {
  provider: string | null;
  model: string;
  score: number;
  last_updated: string | null;
};

export type RiemannBenchRowsByModelName = Map<string, RiemannBenchModelScoreRow>;

type RiemannBenchModelScorePayload = {
  fetched_at_epoch_seconds: number | null;
  source_url: string;
  data: RiemannBenchModelScoreRow[];
};

export async function getRiemannBenchStats(): Promise<RiemannBenchModelScorePayload> {
  try {
    return await fetchSource(RIEMANN_BENCH_LEADERBOARD_URL, {}, async (response) => {
      if (!response.ok) {
        throw new Error(`Riemann-bench scrape failed: ${response.status}`);
      }
      return {
        fetched_at_epoch_seconds: nowEpochSeconds(),
        source_url: RIEMANN_BENCH_LEADERBOARD_URL,
        data: surgeLeaderboardScoreRows(await response.text()),
      };
    });
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      source_url: RIEMANN_BENCH_LEADERBOARD_URL,
      data: [],
    };
  }
}

export function buildRiemannBenchMap(
  rows: RiemannBenchModelScoreRow[],
): RiemannBenchRowsByModelName {
  const rowsByModelName: RiemannBenchRowsByModelName = new Map();
  for (const row of rows) {
    for (const key of riemannBenchKeyCandidates(row.model)) {
      rowsByModelName.set(key, row);
    }
  }
  return rowsByModelName;
}

export function findRiemannBenchScore(
  candidateNames: unknown[],
  riemannBenchRowsByModelName: RiemannBenchRowsByModelName,
): number | null {
  const candidateKeys = candidateNames.flatMap((candidateName) =>
    typeof candidateName === "string" && candidateName.length > 0
      ? riemannBenchKeyCandidates(candidateName)
      : [],
  );
  for (const key of candidateKeys) {
    const row = riemannBenchRowsByModelName.get(key);
    if (row) {
      return row.score;
    }
  }
  // Spacing such as Surge's "Qwen 3.7 Max" against "Qwen3.7 Max" differs only before the identity key.
  const identityKeys = new Set(candidateKeys.map(modelNameIdentityKey));
  for (const [key, row] of riemannBenchRowsByModelName) {
    if (identityKeys.has(modelNameIdentityKey(key))) {
      return row.score;
    }
  }
  return null;
}

function riemannBenchKeyCandidates(model: string): string[] {
  const withoutParenthetical = model.replace(/\s*\([^)]*\)/g, "").trim();
  const slashParts = withoutParenthetical
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [model, withoutParenthetical, ...slashParts]
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}
