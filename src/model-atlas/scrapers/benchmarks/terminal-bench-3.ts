/**
 * Terminal-Bench 3.0 leaderboard results from its official structured source.
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
import { stringValue } from "../parsing";

const TERMINAL_BENCH_3_DATA_URL =
  "https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read";
const TERMINAL_BENCH_3_PACKAGE = "terminal-bench/terminal-bench";
const TERMINAL_BENCH_3_NAME = "3-0-0";
const TERMINAL_BENCH_3_TITLE = "Terminal-Bench 3.0";
const DEFAULT_TIMEOUT_MS = 30_000;

export const TERMINAL_BENCH_3_SOURCE_REVISION = "3_0_0";

export type TerminalBench3ModelAgentRow = BenchmarkModelRow & {
  revision: typeof TERMINAL_BENCH_3_SOURCE_REVISION;
  harness: string;
  score: number;
  score_standard_error: number;
};

export type TerminalBench3RowsByModelName = Map<string, TerminalBench3ModelAgentRow>;

type TerminalBench3Payload = {
  fetched_at_epoch_seconds: number | null;
  data: TerminalBench3ModelAgentRow[];
};

type TerminalBench3ScraperOptions = {
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

function modelAgentRow(value: unknown): TerminalBench3ModelAgentRow | null {
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
    revision: TERMINAL_BENCH_3_SOURCE_REVISION,
    model: modelEffortLabel(baseModel, reasoningEffort),
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    harness,
    score,
    score_standard_error: scoreStandardError,
  };
}

/** Return the provider-qualified alias omitted by Terminal-Bench 3.0 for Claude family labels. */
function claudeBaseModelAlias(baseModel: string): string | null {
  return /^(?:Fable|Opus|Sonnet)\b/.test(baseModel) ? `Claude ${baseModel}` : null;
}

/** Parse every displayed Terminal-Bench 3.0 row without collapsing model, effort, or agent configurations. */
export function processTerminalBench3Payload(value: unknown): TerminalBench3ModelAgentRow[] {
  const root = asRecord(value);
  const leaderboard = asRecord(root.leaderboard);
  const datasetVersionIds = leaderboard.dataset_version_ids;
  if (
    leaderboard.package !== TERMINAL_BENCH_3_PACKAGE ||
    leaderboard.name !== TERMINAL_BENCH_3_NAME ||
    leaderboard.title !== TERMINAL_BENCH_3_TITLE ||
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
export function buildTerminalBench3Map(
  rows: readonly TerminalBench3ModelAgentRow[],
): TerminalBench3RowsByModelName {
  const strongestByModelEffort = new Map<string, TerminalBench3ModelAgentRow>();
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

/** Fetch the structured public source used by the official Terminal-Bench 3.0 leaderboard. */
export async function getTerminalBench3Stats(
  options: TerminalBench3ScraperOptions = {},
): Promise<TerminalBench3Payload> {
  try {
    const response = await fetchWithTimeout(
      options.url ?? TERMINAL_BENCH_3_DATA_URL,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: TERMINAL_BENCH_3_PACKAGE, name: TERMINAL_BENCH_3_NAME }),
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`Terminal-Bench 3.0 scrape failed: ${response.status}`);
    }
    const data = processTerminalBench3Payload(await response.json());
    if (data.length === 0) {
      throw new Error("Terminal-Bench 3.0 scrape returned no 3.0 rows");
    }
    return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
