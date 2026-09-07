/**
 * Text-prompt voxel construction ratings from VoxelBench.
 *
 * Page source: https://voxelbench.ai/leaderboard
 * JSON source: https://voxelbench.ai/api/leaderboard?limit=100&type=text
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../benchmarks/observation";
import { benchmarkModelEffort } from "../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../runtime";
import { fetchSource } from "./request-scheduler";

const SOURCE_URL = "https://voxelbench.ai/api/leaderboard?limit=100&type=text";
const MINIMUM_VOTES = 50;

/** Fetch the text leaderboard; failed requests leave existing source evidence available to the shared cache policy. */
export async function getVoxelBenchStats(
  sourceUrl = SOURCE_URL,
): Promise<BenchmarkObservationPayload> {
  try {
    return await fetchSource(sourceUrl, {}, 30_000, async (response) => {
      if (!response.ok) throw new Error(`VoxelBench scrape failed: ${response.status}`);
      return {
        fetched_at_epoch_seconds: nowEpochSeconds(),
        data: processVoxelBenchLeaderboard(await response.json(), sourceUrl),
      };
    });
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Keep native Glicko-2 points and labelled efforts, admitting only text rows meeting the public leaderboard's vote threshold. */
export function processVoxelBenchLeaderboard(
  payload: unknown,
  sourceUrl = SOURCE_URL,
): BenchmarkObservationRow[] {
  const leaderboard = asRecord(payload).leaderboard;
  if (!Array.isArray(leaderboard)) return [];
  const rows: BenchmarkObservationRow[] = [];
  for (const value of leaderboard) {
    const row = asRecord(value);
    const model = typeof row.modelName === "string" ? row.modelName.trim() : "";
    const rating = asFiniteNumber(row.rating);
    const votes = asFiniteNumber(row.gamesPlayed);
    const deviation = asFiniteNumber(row.deviation);
    if (
      !model ||
      row.ratingType !== "text" ||
      rating == null ||
      votes == null ||
      !Number.isInteger(votes) ||
      votes < MINIMUM_VOTES ||
      deviation == null ||
      deviation < 0
    )
      continue;
    const parsed = benchmarkModelEffort(model);
    const budget = /\s+\((\d+k) Thinking\)$/i.exec(model);
    const slug = typeof row.modelSlug === "string" ? row.modelSlug.trim() : "";
    rows.push({
      benchmark_key: "voxelbench",
      source_url: sourceUrl,
      model_id: slug && !slug.startsWith("stealth/") ? slug : null,
      model,
      base_model: budget ? model.slice(0, budget.index) : parsed.baseModel,
      reasoning_effort: budget ? `${budget[1]!.toLowerCase()}-thinking` : parsed.reasoningEffort,
      model_creator: null,
      rank: asFiniteNumber(row.rank),
      canonical_value: rating,
      observed_at: null,
      metadata: {
        ...(slug.startsWith("stealth/") ? { model_slug: slug } : {}),
        track: "text",
        votes,
        rating_deviation: deviation,
      },
    });
  }
  return rows;
}
