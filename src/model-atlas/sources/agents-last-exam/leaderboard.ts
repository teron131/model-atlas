/**
 * Agents' Last Exam leaderboard results from the official leaderboard and API.
 *
 * Page source: https://agents-last-exam.org/leaderboard
 * JSON source: https://agents-last-exam.org/api/demo/leaderboard
 */

import { canonicalReasoningEffort, modelEffortLabel } from "../../identity/normalization";
import { meanOfFinite, medianOfFinite } from "../../math-utils";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import {
  fetchSourceJson,
  scheduleSourceRequest,
  SourceQueueTimeoutError,
} from "../request-scheduler";

export const AGENTS_LAST_EXAM_LEADERBOARD_URL = "https://agents-last-exam.org/leaderboard";

const LEADERBOARD_API_URL = "https://agents-last-exam.org/api/demo/leaderboard";

const BROWSER_TIMEOUT_MS = 30_000;

const SCORE_SPLIT = "full/overall";

export type AgentsLastExamHarnessRow = {
  split: string;
  harness: string;
  model: string;
  harness_variant: string | null;
  runs: number;
  tasks: number;
  split_tasks: number;
  passes: number;
  accuracy: number;
  score: number;
  total_duration_seconds: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number | null;
  cost_source: string | null;
};

export type AgentsLastExamModelScoreRow = {
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  split: string;
  median_score: number;
  mean_score: number;
  median_accuracy: number;
  mean_accuracy: number;
  median_total_duration_seconds: number;
  mean_total_duration_seconds: number;
  median_total_input_tokens: number;
  mean_total_input_tokens: number;
  median_total_output_tokens: number;
  mean_total_output_tokens: number;
  median_duration_seconds_per_task: number;
  mean_duration_seconds_per_task: number;
  median_input_tokens_per_task: number;
  mean_input_tokens_per_task: number;
  median_output_tokens_per_task: number;
  mean_output_tokens_per_task: number;
  median_cost_usd_per_task: number | null;
  mean_cost_usd_per_task: number | null;
  frequency: number;
};

type AgentsLastExamHarnessPayload = {
  fetched_at_epoch_seconds: number | null;
  data: AgentsLastExamHarnessRow[];
};

type AgentsLastExamModelScorePayload = {
  fetched_at_epoch_seconds: number | null;
  data: AgentsLastExamModelScoreRow[];
};

/** Any API failure other than a scheduler queue timeout retries through the browser fallback; a queue timeout returns no rows. */
export async function getAgentsLastExamHarnessStats(): Promise<AgentsLastExamHarnessPayload> {
  try {
    const rows = await fetchApiRows();
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: rows,
    };
  } catch (error) {
    if (error instanceof SourceQueueTimeoutError) {
      return {
        fetched_at_epoch_seconds: null,
        data: [],
      };
    }
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: await fetchPlaywrightRows(),
    };
  }
}

export async function getAgentsLastExamStats(): Promise<AgentsLastExamModelScorePayload> {
  const payload = await getAgentsLastExamHarnessStats();
  return {
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    data: summarizeAgentsLastExamModelScores(payload.data),
  };
}

function processAgentsLastExamLeaderboardRows(rows: unknown[]): AgentsLastExamHarnessRow[] {
  return rows
    .map((row) => asHarnessRow(row))
    .filter((row): row is AgentsLastExamHarnessRow => row != null);
}

/** The public Agents' Last Exam benchmark keeps the stronger median or mean harness summary. */
export function agentsLastExamBenchmarkScore(
  row: Pick<AgentsLastExamModelScoreRow, "median_score" | "mean_score">,
): number {
  return Math.max(row.median_score, row.mean_score);
}

/** Summarize the scored split per model and reasoning effort; harnesses run at the same effort share one row. */
export function summarizeAgentsLastExamModelScores(
  rows: AgentsLastExamHarnessRow[],
): AgentsLastExamModelScoreRow[] {
  const groups = new Map<
    string,
    { model: string; reasoningEffort: string | null; rows: AgentsLastExamHarnessRow[] }
  >();
  for (const row of rows) {
    if (row.split !== SCORE_SPLIT) {
      continue;
    }
    const reasoningEffort = canonicalReasoningEffort(row.harness_variant);
    const key = `${row.model}\u001f${reasoningEffort ?? ""}`;
    const group = groups.get(key) ?? { model: row.model, reasoningEffort, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ model, reasoningEffort, rows: modelRows }) => {
      const scores = modelRows.map((row) => row.score);
      const accuracies = modelRows.map((row) => row.accuracy);
      const durationSeconds = modelRows.map((row) => row.total_duration_seconds);
      const inputTokens = modelRows.map((row) => row.total_input_tokens);
      const outputTokens = modelRows.map((row) => row.total_output_tokens);
      const durationSecondsPerTask = modelRows.map((row) =>
        perTask(row.total_duration_seconds, row),
      );
      const inputTokensPerTask = modelRows.map((row) => perTask(row.total_input_tokens, row));
      const outputTokensPerTask = modelRows.map((row) => perTask(row.total_output_tokens, row));
      const costsPerTask = modelRows.map((row) => perTask(row.total_cost_usd, row));
      return {
        model: modelEffortLabel(model, reasoningEffort),
        base_model: model,
        reasoning_effort: reasoningEffort,
        split: SCORE_SPLIT,
        median_score: medianOfFinite(scores),
        mean_score: meanOfFinite(scores),
        median_accuracy: medianOfFinite(accuracies),
        mean_accuracy: meanOfFinite(accuracies),
        median_total_duration_seconds: medianOfFinite(durationSeconds),
        mean_total_duration_seconds: meanOfFinite(durationSeconds),
        median_total_input_tokens: medianOfFinite(inputTokens),
        mean_total_input_tokens: meanOfFinite(inputTokens),
        median_total_output_tokens: medianOfFinite(outputTokens),
        mean_total_output_tokens: meanOfFinite(outputTokens),
        median_duration_seconds_per_task: medianOfFinite(durationSecondsPerTask),
        mean_duration_seconds_per_task: meanOfFinite(durationSecondsPerTask),
        median_input_tokens_per_task: medianOfFinite(inputTokensPerTask),
        mean_input_tokens_per_task: meanOfFinite(inputTokensPerTask),
        median_output_tokens_per_task: medianOfFinite(outputTokensPerTask),
        mean_output_tokens_per_task: meanOfFinite(outputTokensPerTask),
        median_cost_usd_per_task: medianOfFinite(costsPerTask),
        mean_cost_usd_per_task: meanOfFinite(costsPerTask),
        frequency: modelRows.length,
      };
    })
    .filter(
      (row): row is AgentsLastExamModelScoreRow =>
        row.median_score != null &&
        row.mean_score != null &&
        row.median_accuracy != null &&
        row.mean_accuracy != null &&
        row.median_total_duration_seconds != null &&
        row.mean_total_duration_seconds != null &&
        row.median_total_input_tokens != null &&
        row.mean_total_input_tokens != null &&
        row.median_total_output_tokens != null &&
        row.mean_total_output_tokens != null &&
        row.median_duration_seconds_per_task != null &&
        row.mean_duration_seconds_per_task != null &&
        row.median_input_tokens_per_task != null &&
        row.mean_input_tokens_per_task != null &&
        row.median_output_tokens_per_task != null &&
        row.mean_output_tokens_per_task != null,
    )
    .sort(
      (left, right) => agentsLastExamBenchmarkScore(right) - agentsLastExamBenchmarkScore(left),
    );
}

async function fetchApiRows(): Promise<AgentsLastExamHarnessRow[]> {
  const payload = asRecord(await fetchSourceJson(LEADERBOARD_API_URL));
  return Array.isArray(payload.rows) ? processAgentsLastExamLeaderboardRows(payload.rows) : [];
}

/** Browser fallback keeps the source usable when the direct JSON endpoint blocks plain fetches. */
async function fetchPlaywrightRows(): Promise<AgentsLastExamHarnessRow[]> {
  return scheduleSourceRequest(AGENTS_LAST_EXAM_LEADERBOARD_URL, async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const responsePromise = page.waitForResponse(
        (response) => response.url() === LEADERBOARD_API_URL && response.ok(),
        { timeout: BROWSER_TIMEOUT_MS },
      );
      await page.goto(AGENTS_LAST_EXAM_LEADERBOARD_URL, {
        waitUntil: "domcontentloaded",
        timeout: BROWSER_TIMEOUT_MS,
      });
      const response = await responsePromise;
      const payload = asRecord(await response.json());
      return Array.isArray(payload.rows) ? processAgentsLastExamLeaderboardRows(payload.rows) : [];
    } finally {
      await browser.close();
    }
  });
}

function asHarnessRow(value: unknown): AgentsLastExamHarnessRow | null {
  const row = asRecord(value);
  const split = typeof row.split === "string" ? row.split : null;
  const harness = typeof row.harness === "string" ? row.harness : null;
  const model = typeof row.model === "string" ? row.model : null;
  const runs = asFiniteNumber(row.runs);
  const tasks = asFiniteNumber(row.tasks);
  const splitTasks = asFiniteNumber(row.splitTasks);
  const passes = asFiniteNumber(row.passes);
  const accuracy = asFiniteNumber(row.passRate);
  const score = asFiniteNumber(row.avgScore);
  const totalDurationSeconds = asFiniteNumber(row.totalDurationS);
  const totalInputTokens = asFiniteNumber(row.totalInputTokens);
  const totalOutputTokens = asFiniteNumber(row.totalOutputTokens);
  const totalCostUsd = asFiniteNumber(row.totalCostUsd);
  if (
    split == null ||
    harness == null ||
    model == null ||
    runs == null ||
    tasks == null ||
    splitTasks == null ||
    passes == null ||
    accuracy == null ||
    score == null ||
    totalDurationSeconds == null ||
    totalInputTokens == null ||
    totalOutputTokens == null
  ) {
    return null;
  }
  return {
    split,
    harness,
    model,
    harness_variant:
      typeof row.harnessVariant === "string" && row.harnessVariant.length > 0
        ? row.harnessVariant
        : null,
    runs,
    tasks,
    split_tasks: splitTasks,
    passes,
    accuracy,
    score,
    total_duration_seconds: totalDurationSeconds,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cost_usd: totalCostUsd,
    cost_source:
      typeof row.costSource === "string" && row.costSource.length > 0 ? row.costSource : null,
  };
}

/** Agents' Last Exam totals sum task-level averages, so distinct evaluated tasks are the normalization denominator. */
function perTask(value: number | null, row: AgentsLastExamHarnessRow): number | null {
  return value != null && row.tasks > 0 ? value / row.tasks : null;
}
