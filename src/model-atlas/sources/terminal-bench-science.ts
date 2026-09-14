/**
 * Terminal-Bench-Science 0.1 observations from the official leaderboard and Vals.
 *
 * Page source: https://www.terminal-bench-science.ai/
 * Page source: https://www.vals.ai/benchmarks/terminal-bench-science
 * JSON source: https://www.terminal-bench-science.ai/api/leaderboard?package=terminal-bench-science%2Fterminal-bench-science&name=v0-1-eval
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../benchmarks/catalog/portfolio";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  resourcePerTaskRun,
} from "../benchmarks/observation";
import { canonicalReasoningEffort, modelNameWithoutCreatorPrefix } from "../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../runtime";
import { percentToUnitScore, stringValue } from "./parsing";
import { fetchSource } from "./request-scheduler";
import { getValsSourceStats } from "./vals/results";

const TERMINAL_BENCH_SCIENCE_DATA_URL =
  "https://www.terminal-bench-science.ai/api/leaderboard?package=terminal-bench-science%2Fterminal-bench-science&name=v0-1-eval";

const TERMINAL_BENCH_SCIENCE_PACKAGE = "terminal-bench-science/terminal-bench-science";

const TERMINAL_BENCH_SCIENCE_NAME = "v0-1-eval";

const DEFAULT_TIMEOUT_MS = 30_000;
export const TERMINAL_BENCH_SCIENCE_VALS_URL =
  "https://www.vals.ai/benchmarks/terminal-bench-science";

/** Fetch current Terminal-Bench-Science quality and resource evidence without retaining domain or task detail. */
export async function getTerminalBenchScienceStats(
  sourceUrl = TERMINAL_BENCH_SCIENCE_DATA_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BenchmarkObservationPayload> {
  try {
    const [official, vals] = await Promise.all([
      fetchSource(sourceUrl, {}, timeoutMs, async (response) => {
        if (!response.ok) {
          throw new Error(`Terminal-Bench-Science scrape failed: ${response.status}`);
        }
        const data = processTerminalBenchSciencePayload(await response.json(), sourceUrl);
        if (data.length === 0) {
          throw new Error("Terminal-Bench-Science scrape returned no 0.1 rows");
        }
        return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
      }),
      getValsSourceStats({
        benchmarkKey: "terminal_bench_science",
        canonicalTask: "overall",
        sourceUrl: TERMINAL_BENCH_SCIENCE_VALS_URL,
      }),
    ]);
    if (vals.data.length === 0)
      throw new Error("Terminal-Bench Science Vals source returned no rows");
    return {
      fetched_at_epoch_seconds: official.fetched_at_epoch_seconds,
      data: [
        ...official.data,
        ...vals.data.map((row) => ({
          ...row,
          base_model:
            row.base_model === "deepseek-v4-pro-0813" ? "DeepSeek V4 Pro" : row.base_model,
          metadata: {
            ...row.metadata,
            source_series: "vals",
            observation_role: "component",
            time_measure: "wall",
          },
        })),
      ],
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Parse every displayed model-effort-harness row while retaining only scoring and audit evidence. */
export function processTerminalBenchSciencePayload(
  value: unknown,
  sourceUrl = TERMINAL_BENCH_SCIENCE_DATA_URL,
): BenchmarkObservationRow[] {
  const root = asRecord(value);
  const leaderboard = asRecord(root.leaderboard);
  const datasetVersionIds = leaderboard.dataset_version_ids;
  if (
    leaderboard.package !== TERMINAL_BENCH_SCIENCE_PACKAGE ||
    leaderboard.name !== TERMINAL_BENCH_SCIENCE_NAME ||
    !Array.isArray(datasetVersionIds) ||
    datasetVersionIds.length === 0 ||
    datasetVersionIds.some((id) => stringValue(id) == null)
  ) {
    return [];
  }

  const rows = Array.isArray(root.rows) ? root.rows : [];
  return rows.flatMap((row) => {
    const parsed = terminalBenchScienceObservation(row, sourceUrl);
    return parsed == null ? [] : [parsed];
  });
}

/** Reject cached task resources from another source revision or an incomplete aggregate resource contract. */
export function terminalBenchScienceCacheMatches(
  rows: readonly BenchmarkObservationRow[],
): boolean {
  return (
    rows.some((row) => row.metadata.source_series === "vals") &&
    rows.every(
      (row) =>
        row.metadata.source_series === "vals" ||
        (row.metadata.source_series === "official" &&
          row.metadata.source_revision === TERMINAL_BENCH_SCIENCE_NAME &&
          row.cost != null &&
          row.cost >= 0 &&
          row.tokens_per_task != null &&
          row.tokens_per_task >= 0 &&
          row.task_run_count === BENCHMARK_RESOURCE_PROFILES.terminal_bench_science.taskRunCount &&
          row.total_cost_usd != null &&
          row.total_cost_usd >= 0 &&
          row.total_tokens != null &&
          row.total_tokens >= 0),
    )
  );
}

function terminalBenchScienceObservation(
  value: unknown,
  sourceUrl: string,
): BenchmarkObservationRow | null {
  const row = asRecord(value);
  if (row.status !== "display") return null;

  const metadata = asRecord(row.metadata);
  const metrics = asRecord(row.metrics);
  const model = stringValue(asRecord(metadata.model_display).label);
  const creator = stringValue(asRecord(metadata.model_org).label);
  const harness = stringValue(asRecord(metadata.agent_display).label);
  const rank = asFiniteNumber(row.rank);
  const score = percentToUnitScore(String(metrics.accuracy ?? ""));
  const scoreStandardError = percentToUnitScore(String(metrics.accuracy_stderr ?? ""));
  const taskRunCount = asFiniteNumber(metrics.tasks);
  const totalTokens = asFiniteNumber(metrics.total_tokens);
  const totalCostUsd = asFiniteNumber(metrics.total_cost_usd);
  if (
    model == null ||
    creator == null ||
    harness == null ||
    rank == null ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    score == null ||
    scoreStandardError == null ||
    taskRunCount == null ||
    !Number.isInteger(taskRunCount) ||
    taskRunCount !== BENCHMARK_RESOURCE_PROFILES.terminal_bench_science.taskRunCount ||
    totalTokens == null ||
    !Number.isInteger(totalTokens) ||
    totalTokens < 0 ||
    totalCostUsd == null ||
    totalCostUsd < 0
  ) {
    return null;
  }

  return {
    benchmark_key: "terminal_bench_science",
    source_url: sourceUrl,
    model_id: null,
    model,
    base_model: terminalBenchScienceBaseModel(model, creator),
    reasoning_effort: canonicalReasoningEffort(metadata.reasoning_effort),
    model_creator: creator,
    rank,
    canonical_value: score,
    task_run_count: taskRunCount,
    total_cost_usd: totalCostUsd,
    total_tokens: totalTokens,
    cost: resourcePerTaskRun(totalCostUsd, taskRunCount),
    tokens_per_task: resourcePerTaskRun(totalTokens, taskRunCount),
    observed_at: stringValue(row.updated_at),
    metadata: {
      source_series: "official",
      source_revision: TERMINAL_BENCH_SCIENCE_NAME,
      harness,
      score_standard_error: scoreStandardError,
    },
  };
}

function terminalBenchScienceBaseModel(model: string, creator: string): string {
  const baseModel = modelNameWithoutCreatorPrefix(model, creator);
  return creator === "Anthropic" && /^(?:Fable|Opus|Sonnet)\b/.test(baseModel)
    ? `Claude ${baseModel}`
    : baseModel;
}
