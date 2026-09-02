/**
 * Terminal-Bench 4.0 leaderboard results from its official structured source.
 *
 * Page source: https://www.tbench.ai/?version=4.0
 * JSON source: https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog/portfolio";
import { type BenchmarkResourceAggregate, resourcePerTaskRun } from "../../benchmarks/observation";
import {
  type BenchmarkModelRow,
  buildBenchmarkModelMap,
  canonicalReasoningEffort,
  normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { stringValue } from "../parsing";

const TERMINAL_BENCH_4_DATA_URL =
  "https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read";
const TERMINAL_BENCH_4_PACKAGE = "terminal-bench/terminal-bench";
const TERMINAL_BENCH_4_NAME = "4-0-0";
const TERMINAL_BENCH_4_TITLE = "Terminal-Bench 4.0";
const DEFAULT_TIMEOUT_MS = 30_000;

export const TERMINAL_BENCH_4_SOURCE_REVISION = "4_0_0";

export type TerminalBench4ModelAgentRow = BenchmarkModelRow &
  Required<BenchmarkResourceAggregate> & {
    revision: typeof TERMINAL_BENCH_4_SOURCE_REVISION;
    harness: string;
    score: number;
    score_ci95_half_width: number;
    cost_per_task_usd: number;
    tokens_per_task: number;
  };

export type TerminalBench4RowsByModelName = Map<string, TerminalBench4ModelAgentRow>;

type TerminalBench4Payload = {
  fetched_at_epoch_seconds: number | null;
  data: TerminalBench4ModelAgentRow[];
};

type TerminalBench4ScraperOptions = {
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

function modelAgentRow(value: unknown): TerminalBench4ModelAgentRow | null {
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
  const scoreCi95HalfWidth = percentToUnitScore(metrics.accuracy_ci95_half_width);
  const taskRunCount = asFiniteNumber(metrics.n_trials);
  const totalCostUsd = asFiniteNumber(metrics.total_cost_usd);
  const totalTokens = asFiniteNumber(metrics.total_tokens);
  if (
    baseModel == null ||
    harness == null ||
    score == null ||
    scoreCi95HalfWidth == null ||
    taskRunCount !== BENCHMARK_RESOURCE_PROFILES.terminal_bench_4.taskRunCount ||
    totalCostUsd == null ||
    totalCostUsd <= 0 ||
    totalTokens == null ||
    !Number.isInteger(totalTokens) ||
    totalTokens <= 0
  ) {
    return null;
  }
  return {
    revision: TERMINAL_BENCH_4_SOURCE_REVISION,
    model: modelEffortLabel(baseModel, reasoningEffort),
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    harness,
    score,
    score_ci95_half_width: scoreCi95HalfWidth,
    task_run_count: taskRunCount,
    total_cost_usd: totalCostUsd,
    total_tokens: totalTokens,
    cost_per_task_usd: resourcePerTaskRun(totalCostUsd, taskRunCount),
    tokens_per_task: resourcePerTaskRun(totalTokens, taskRunCount),
  };
}

/** Return the provider-qualified alias omitted by Terminal-Bench 4.0 for Claude family labels. */
function claudeBaseModelAlias(baseModel: string): string | null {
  return /^(?:Fable|Opus|Sonnet)\b/.test(baseModel) ? `Claude ${baseModel}` : null;
}

/** Parse every displayed Terminal-Bench 4.0 row without collapsing model, effort, or agent configurations. */
export function processTerminalBench4Payload(value: unknown): TerminalBench4ModelAgentRow[] {
  const root = asRecord(value);
  const leaderboard = asRecord(root.leaderboard);
  const datasetVersionIds = leaderboard.dataset_version_ids;
  if (
    leaderboard.package !== TERMINAL_BENCH_4_PACKAGE ||
    leaderboard.name !== TERMINAL_BENCH_4_NAME ||
    leaderboard.title !== TERMINAL_BENCH_4_TITLE ||
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
export function buildTerminalBench4Map(
  rows: readonly TerminalBench4ModelAgentRow[],
): TerminalBench4RowsByModelName {
  const strongestByModelEffort = new Map<string, TerminalBench4ModelAgentRow>();
  for (const row of rows) {
    const key = normalizeModelToken(row.model);
    const current = strongestByModelEffort.get(key);
    if (
      current == null ||
      row.score > current.score ||
      (row.score === current.score && row.score_ci95_half_width < current.score_ci95_half_width)
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

/** Fetch the structured public source used by the official Terminal-Bench 4.0 leaderboard. */
export async function getTerminalBench4Stats(
  options: TerminalBench4ScraperOptions = {},
): Promise<TerminalBench4Payload> {
  try {
    const response = await fetchWithTimeout(
      options.url ?? TERMINAL_BENCH_4_DATA_URL,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: TERMINAL_BENCH_4_PACKAGE, name: TERMINAL_BENCH_4_NAME }),
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`Terminal-Bench 4.0 scrape failed: ${response.status}`);
    }
    const data = processTerminalBench4Payload(await response.json());
    if (data.length === 0) {
      throw new Error("Terminal-Bench 4.0 scrape returned no 4.0 rows");
    }
    return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
