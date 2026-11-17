/**
 * Terminal-Bench 4.1 leaderboard results from its official structured source.
 *
 * Page source: https://www.tbench.ai/?version=4.1
 * JSON source: https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog";
import { type BenchmarkResourceAggregate, resourcePerTaskRun } from "../../benchmarks/observation";
import { withClaudeFamily } from "../../identity/claude";
import {
  type BenchmarkModelRow,
  buildBenchmarkModelMap,
  canonicalReasoningEffort,
  modelEffortLabel,
  normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../../runtime";
import { percentToUnitScore } from "../parsing";
import { fetchSource } from "../request-scheduler";

const TERMINAL_BENCH_DATA_URL =
  "https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read";

const TERMINAL_BENCH_PACKAGE = "terminal-bench/terminal-bench";

const TERMINAL_BENCH_NAME = "4-1-0";

const TERMINAL_BENCH_TITLE = "Terminal-Bench 4.1";

export const TERMINAL_BENCH_LEADERBOARD_URL = "https://www.tbench.ai/?version=4.1";

export const TERMINAL_BENCH_SOURCE_REVISION = "4_1_0";

export type TerminalBenchModelHarnessRow = BenchmarkModelRow &
  Required<Pick<BenchmarkResourceAggregate, "task_run_count" | "total_tokens">> & {
    revision: typeof TERMINAL_BENCH_SOURCE_REVISION;
    harness: string;
    score: number;
    score_ci95_half_width: number;
    /** Null when the source publishes a zero cost for a run that consumed tokens, which means it reported none. */
    total_cost_usd: number | null;
    cost_per_task_usd: number | null;
    tokens_per_task: number;
    seconds_per_task?: number | null;
    output_tokens_per_task?: number | null;
  };

type TerminalBenchRowsByModelName = Map<string, TerminalBenchModelHarnessRow>;

type TerminalBenchPayload = {
  fetched_at_epoch_seconds: number | null;
  data: TerminalBenchModelHarnessRow[];
};

/** Fetch the structured public source used by the official Terminal-Bench 4.1 leaderboard. */
export async function getTerminalBenchStats(): Promise<TerminalBenchPayload> {
  return fetchSource(
    TERMINAL_BENCH_DATA_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: TERMINAL_BENCH_PACKAGE, name: TERMINAL_BENCH_NAME }),
    },
    async (response) => {
      if (!response.ok) {
        throw new Error(`Terminal-Bench 4.1 scrape failed: ${response.status}`);
      }
      const data = processTerminalBenchPayload(await response.json());
      if (data.length === 0) {
        throw new Error("Terminal-Bench 4.1 scrape returned no 4.1 rows");
      }
      return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
    },
  );
}

/** Parse every displayed Terminal-Bench 4.1 row without collapsing model, effort, or agent configurations. */
export function processTerminalBenchPayload(value: unknown): TerminalBenchModelHarnessRow[] {
  const root = asRecord(value);
  const leaderboard = asRecord(root.leaderboard);
  const datasetVersionIds = leaderboard.dataset_version_ids;
  if (
    leaderboard.package !== TERMINAL_BENCH_PACKAGE ||
    leaderboard.name !== TERMINAL_BENCH_NAME ||
    leaderboard.title !== TERMINAL_BENCH_TITLE ||
    !Array.isArray(datasetVersionIds) ||
    datasetVersionIds.length === 0 ||
    datasetVersionIds.some((id) => asNonEmptyString(id) == null)
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
export function buildTerminalBenchMap(
  rows: readonly TerminalBenchModelHarnessRow[],
): TerminalBenchRowsByModelName {
  const strongestByModelEffort = new Map<string, TerminalBenchModelHarnessRow>();
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
    const aliasedBaseModel = withClaudeFamily(row.base_model);
    if (aliasedBaseModel === row.base_model) {
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

function modelAgentRow(value: unknown): TerminalBenchModelHarnessRow | null {
  const row = asRecord(value);
  if (row.status !== "display") {
    return null;
  }
  const metadata = asRecord(row.metadata);
  const metrics = asRecord(row.metrics);
  const baseModel = asNonEmptyString(asRecord(metadata.model_display).label);
  const harness = asNonEmptyString(asRecord(metadata.agent_display).label);
  const reasoningEffort = canonicalReasoningEffort(metadata.reasoning_effort);
  const score = percentToUnitScore(metrics.accuracy);
  const scoreCi95HalfWidth = percentToUnitScore(metrics.accuracy_ci95_half_width);
  const taskRunCount = asFiniteNumber(metrics.n_trials);
  const totalCostUsd = asFiniteNumber(metrics.total_cost_usd);
  const totalTokens = asFiniteNumber(metrics.total_tokens);
  const outputTokens = asFiniteNumber(metrics.output_tokens);
  if (
    baseModel == null ||
    harness == null ||
    score == null ||
    scoreCi95HalfWidth == null ||
    taskRunCount !== BENCHMARK_RESOURCE_PROFILES.terminal_bench.taskRunCount ||
    totalCostUsd == null ||
    totalCostUsd < 0 ||
    totalTokens == null ||
    !Number.isInteger(totalTokens) ||
    totalTokens <= 0
  ) {
    return null;
  }
  const reportedCostUsd = totalCostUsd > 0 ? totalCostUsd : null;
  return {
    revision: TERMINAL_BENCH_SOURCE_REVISION,
    model: modelEffortLabel(baseModel, reasoningEffort),
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    harness,
    score,
    score_ci95_half_width: scoreCi95HalfWidth,
    task_run_count: taskRunCount,
    total_cost_usd: reportedCostUsd,
    total_tokens: totalTokens,
    cost_per_task_usd:
      reportedCostUsd == null ? null : resourcePerTaskRun(reportedCostUsd, taskRunCount),
    tokens_per_task: resourcePerTaskRun(totalTokens, taskRunCount),
    seconds_per_task: asFiniteNumber(metrics.avg_trial_duration_sec),
    output_tokens_per_task:
      outputTokens == null ? null : resourcePerTaskRun(outputTokens, taskRunCount),
  };
}
