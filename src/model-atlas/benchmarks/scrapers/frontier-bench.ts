/**
 * Frontier-Bench v0.1 leaderboard results from FrontierBench.
 *
 * Page source: https://www.frontierbench.ai/
 * JSON source: https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read
 */

import {
  type BenchmarkModelRow,
  buildBenchmarkModelMap,
  canonicalReasoningEffort,
  normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { stringValue } from "../../scrapers/parsing";

const FRONTIER_BENCH_DATA_URL =
  "https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read";
const FRONTIER_BENCH_PACKAGE = "frontier-bench/frontier-bench";
const FRONTIER_BENCH_NAME = "frontier-bench";
const FRONTIER_BENCH_TITLE = "FRONTIER-BENCH V0.1";
const DEFAULT_TIMEOUT_MS = 30_000;

export const FRONTIER_BENCH_SOURCE_REVISION = "v0_1";

export type FrontierBenchModelAgentRow = BenchmarkModelRow & {
  revision: typeof FRONTIER_BENCH_SOURCE_REVISION;
  harness: string;
  score: number;
  score_standard_error: number;
};

export type FrontierBenchRowsByModelName = Map<string, FrontierBenchModelAgentRow>;

type FrontierBenchPayload = {
  fetched_at_epoch_seconds: number | null;
  data: FrontierBenchModelAgentRow[];
};

type FrontierBenchScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

function percentToUnitScore(value: unknown): number | null {
  const score = asFiniteNumber(value);
  return score != null && score >= 0 && score <= 100 ? Number((score / 100).toFixed(6)) : null;
}

function modelEffortLabel(baseModel: string, reasoningEffort: string | null): string {
  return reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`;
}

function modelAgentRow(value: unknown): FrontierBenchModelAgentRow | null {
  const row = asRecord(value);
  if (row.status !== "display") {
    return null;
  }
  const metadata = asRecord(row.metadata);
  const metrics = asRecord(row.metrics);
  const baseModel = stringValue(asRecord(metadata.model_display).label);
  const harness = stringValue(asRecord(metadata.agent_display).label);
  const reasoningEffort = canonicalReasoningEffort(metadata.reasoning_effort);
  const score = percentToUnitScore(metrics.accuracy);
  const scoreStandardError = percentToUnitScore(metrics.accuracy_stderr);
  if (baseModel == null || harness == null || score == null || scoreStandardError == null) {
    return null;
  }
  return {
    revision: FRONTIER_BENCH_SOURCE_REVISION,
    model: modelEffortLabel(baseModel, reasoningEffort),
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    harness,
    score,
    score_standard_error: scoreStandardError,
  };
}

/** Return the provider-qualified alias omitted by Frontier-Bench for Claude family labels. */
function claudeBaseModelAlias(baseModel: string): string | null {
  return /^(?:Fable|Opus|Sonnet)\b/.test(baseModel) ? `Claude ${baseModel}` : null;
}

/** Parse every displayed v0.1 row without collapsing model, effort, or agent configurations. */
export function processFrontierBenchPayload(value: unknown): FrontierBenchModelAgentRow[] {
  const root = asRecord(value);
  const leaderboard = asRecord(root.leaderboard);
  const datasetVersionIds = leaderboard.dataset_version_ids;
  if (
    leaderboard.package !== FRONTIER_BENCH_PACKAGE ||
    leaderboard.name !== FRONTIER_BENCH_NAME ||
    leaderboard.title !== FRONTIER_BENCH_TITLE ||
    !Array.isArray(datasetVersionIds) ||
    datasetVersionIds.length === 0 ||
    datasetVersionIds.some((id) => stringValue(id) == null)
  ) {
    return [];
  }
  const rows = Array.isArray(root.rows) ? root.rows : [];
  return rows.flatMap((row) => {
    const parsed = modelAgentRow(row);
    return parsed == null ? [] : [parsed];
  });
}

/**
 * Index the strongest displayed agent for each exact model effort.
 *
 * Raw persistence retains every model-agent row; this projection only settles scoring when the source later publishes more than one agent for the same model and effort.
 */
export function buildFrontierBenchMap(
  rows: readonly FrontierBenchModelAgentRow[],
): FrontierBenchRowsByModelName {
  const strongestByModelEffort = new Map<string, FrontierBenchModelAgentRow>();
  for (const row of rows) {
    const key = normalizeModelToken(row.model);
    const current = strongestByModelEffort.get(key);
    if (
      current == null ||
      row.score > current.score ||
      (row.score === current.score && row.score_standard_error < current.score_standard_error)
    ) {
      strongestByModelEffort.set(key, row);
    }
  }
  const strongestRows = [...strongestByModelEffort.values()];
  const rowsByModelName = buildBenchmarkModelMap(strongestRows);
  for (const row of strongestRows) {
    const aliasedBaseModel = claudeBaseModelAlias(row.base_model);
    if (aliasedBaseModel == null) {
      continue;
    }
    const sourceDefault = rowsByModelName.get(normalizeModelToken(row.base_model));
    if (sourceDefault === row) {
      rowsByModelName.set(normalizeModelToken(aliasedBaseModel), sourceDefault);
    }
    const aliasedModel = modelEffortLabel(aliasedBaseModel, row.reasoning_effort);
    rowsByModelName.set(normalizeModelToken(aliasedModel), row);
  }
  return rowsByModelName;
}

/** Fetch the structured public source used by the official Frontier-Bench leaderboard. */
export async function getFrontierBenchStats(
  options: FrontierBenchScraperOptions = {},
): Promise<FrontierBenchPayload> {
  try {
    const response = await fetchWithTimeout(
      options.url ?? FRONTIER_BENCH_DATA_URL,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: FRONTIER_BENCH_PACKAGE, name: FRONTIER_BENCH_NAME }),
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`Frontier-Bench scrape failed: ${response.status}`);
    }
    const data = processFrontierBenchPayload(await response.json());
    if (data.length === 0) {
      throw new Error("Frontier-Bench scrape returned no v0.1 rows");
    }
    return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
