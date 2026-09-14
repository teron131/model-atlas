/**
 * ALE-Bench leaderboard results from Sakana AI and Epoch AI.
 *
 * Page source: https://sakanaai.github.io/ALE-Bench-Leaderboard
 * JSON source: https://sakanaai.github.io/ALE-Bench-Leaderboard/data/results_summary.json
 * CSV source: https://epoch.ai/data/external_benchmarks/ale_bench.csv
 */

import { fuseBenchmarkSources, type FusionObservation } from "../../benchmarks/source-fusion";
import { benchmarkModelEffort, canonicalReasoningEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import {
  ALE_BENCH_EPOCH_RESULTS_URL,
  type AleBenchEpochRow,
  processAleBenchEpochCsv,
} from "../epoch/ale-bench";
import { fetchSource } from "../request-scheduler";

const ALE_BENCH_SAKANA_RESULTS_URL =
  "https://sakanaai.github.io/ALE-Bench-Leaderboard/data/results_summary.json";

export const ALE_BENCH_LEADERBOARD_URL = "https://sakanaai.github.io/ALE-Bench-Leaderboard";

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_SELF_REFINE_COUNT = 1;

const MAX_CROSSWALK_MEDIAN_ABSOLUTE_ERROR = 0.01;

const SPLITS = ["all", "short", "long"] as const;

const SLUG_EFFORT_SUFFIX_PATTERN =
  /^(.*)-(ultra|xhigh|extra-high|max|high|medium|low|minimal|none|adaptive)$/;

type AleBenchSummaryStatistics = {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdev: number;
};

type AleBenchSplitStatistics = Record<(typeof SPLITS)[number], AleBenchSummaryStatistics>;

type AleBenchTaskResult = {
  problem_id: string;
  code_language: string;
  overall_judge_result: string;
  overall_absolute_score: number;
  overall_relative_score: number;
  max_execution_time_ms: number;
  max_memory_usage_kib: number;
  rank: number;
  performance: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
};

export type AleBenchConfigurationRow = {
  model: string;
  detail_path: string;
  num_self_refine: number;
  rank: AleBenchSplitStatistics;
  performance: AleBenchSplitStatistics;
  input_tokens: AleBenchSplitStatistics;
  output_tokens: AleBenchSplitStatistics;
  total_tokens: AleBenchSplitStatistics;
  cost: AleBenchSplitStatistics;
  results: AleBenchTaskResult[];
};

export type AleBenchModelScoreRow = AleBenchConfigurationRow & {
  base_model: string;
  reasoning_effort: string | null;
  score: number;
  cost_per_task_usd: number;
  tokens_per_task: number;
  input_tokens_per_task: number;
  output_tokens_per_task: number;
};

export type AleBenchRowsByModelName = Map<string, AleBenchModelScoreRow>;

export type AleBenchSourceRow =
  | AleBenchConfigurationRow
  | { model: string; epoch: AleBenchEpochRow };

type AleBenchPayload = {
  fetched_at_epoch_seconds: number | null;
  data: AleBenchSourceRow[];
};

type AleBenchScraperOptions = {
  sakanaUrl?: string;
  epochUrl?: string;
  timeoutMs?: number;
};

/** Fetch both observation sources; absent mirror data must not discard a successful Sakana fetch. */
export async function getAleBenchStats(
  options: AleBenchScraperOptions = {},
): Promise<AleBenchPayload> {
  try {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const epochRequest = fetchSource(
      options.epochUrl ?? ALE_BENCH_EPOCH_RESULTS_URL,
      {},
      timeoutMs,
      async (response) => (response.ok ? response.text() : null),
    ).catch(() => null);
    const sakanaPayload = await fetchSource(
      options.sakanaUrl ?? ALE_BENCH_SAKANA_RESULTS_URL,
      {},
      timeoutMs,
      async (response) => {
        if (!response.ok) {
          throw new Error(`ALE-Bench Sakana scrape failed: ${response.status}`);
        }
        return response.json();
      },
    );
    const data = processAleBenchSakanaPayload(sakanaPayload);
    if (data.length === 0) throw new Error("ALE-Bench Sakana scrape returned no rows");

    let epochRows: AleBenchEpochRow[] = [];
    try {
      const epochCsv = await epochRequest;
      if (epochCsv != null) epochRows = processAleBenchEpochCsv(epochCsv);
    } catch {
      // Retain successful Sakana observations when the independent Epoch fetch is unavailable.
    }
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: [...data, ...epochRows.map((epoch) => ({ model: epoch.model, epoch }))],
    };
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      data: [],
    };
  }
}

/** Parse ALE's slug-style effort suffixes without treating model-family tokens as reasoning labels. */
export function aleBenchModelEffort(model: string) {
  const slugMatch = SLUG_EFFORT_SUFFIX_PATTERN.exec(model);
  if (slugMatch != null) {
    const baseModel = slugMatch[1];
    const reasoningEffort = canonicalReasoningEffort(slugMatch[2]);
    if (baseModel != null && baseModel.length > 0 && reasoningEffort != null) {
      return { baseModel, reasoningEffort };
    }
  }
  return benchmarkModelEffort(model);
}

export function processAleBenchConfigurationRow(
  model: string,
  detailPath: string,
  value: unknown,
): AleBenchConfigurationRow | null {
  const row = asRecord(value);
  const numSelfRefine = asFiniteNumber(row.num_self_refine);
  const rank = splitStatistics(row.rank);
  const performance = splitStatistics(row.performance);
  const inputTokens = splitStatistics(row.input_tokens);
  const outputTokens = splitStatistics(row.output_tokens);
  const totalTokens = splitStatistics(row.total_tokens);
  const cost = splitStatistics(row.cost);
  const rawResults = Array.isArray(row.results) ? row.results : [];
  const results = rawResults
    .map(taskResult)
    .filter((result): result is AleBenchTaskResult => result != null);
  if (
    numSelfRefine == null ||
    !Number.isInteger(numSelfRefine) ||
    numSelfRefine < 1 ||
    rank == null ||
    performance == null ||
    inputTokens == null ||
    outputTokens == null ||
    totalTokens == null ||
    cost == null ||
    results.length === 0 ||
    results.length !== rawResults.length
  ) {
    return null;
  }
  return {
    model,
    detail_path: detailPath,
    num_self_refine: numSelfRefine,
    rank,
    performance,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cost,
    results,
  };
}

/** Parse every Sakana model/refinement configuration without collapsing its task evidence. */
export function processAleBenchSakanaPayload(value: unknown): AleBenchConfigurationRow[] {
  if (!Array.isArray(value)) return [];
  const rows: AleBenchConfigurationRow[] = [];
  for (const candidate of value) {
    const modelRow = asRecord(candidate);
    const model = typeof modelRow.model_name === "string" ? modelRow.model_name.trim() : null;
    const detailPath =
      typeof modelRow.detail_path === "string" ? modelRow.detail_path.trim() : null;
    if (
      model == null ||
      model.length === 0 ||
      detailPath == null ||
      detailPath.length === 0 ||
      !Array.isArray(modelRow.overall_results)
    ) {
      continue;
    }
    for (const result of modelRow.overall_results) {
      const parsed = processAleBenchConfigurationRow(model, detailPath, result);
      if (parsed != null) rows.push(parsed);
    }
  }
  return rows.sort(
    (left, right) =>
      left.model.localeCompare(right.model) || left.num_self_refine - right.num_self_refine,
  );
}

/** Select the no-feedback-loop row and expose its quality and mean per-task resource contract. */
export function summarizeAleBenchSourceDefaultRows(
  rows: readonly AleBenchSourceRow[],
): AleBenchModelScoreRow[] {
  return rows
    .filter(
      (row): row is AleBenchConfigurationRow =>
        !("epoch" in row) && row.num_self_refine === DEFAULT_SELF_REFINE_COUNT,
    )
    .map((row) => {
      const effort = aleBenchModelEffort(row.model);
      return {
        ...row,
        base_model: effort.baseModel,
        reasoning_effort: effort.reasoningEffort,
        score: row.performance.all.mean,
        cost_per_task_usd: row.cost.all.mean,
        tokens_per_task: row.total_tokens.all.mean,
        input_tokens_per_task: row.input_tokens.all.mean,
        output_tokens_per_task: row.output_tokens.all.mean,
      };
    });
}

/** Fuse Performance in its native units; no probability clamp or primary-source precedence applies. */
export function fuseAleBenchRows(rows: readonly AleBenchSourceRow[]): FusionObservation[] {
  const primary = summarizeAleBenchSourceDefaultRows(rows).map((row) => ({
    benchmark_key: "ale_bench",
    source_url: ALE_BENCH_LEADERBOARD_URL,
    model_id: null,
    model: row.model,
    base_model: row.base_model,
    reasoning_effort: row.reasoning_effort,
    model_creator: null,
    rank: null,
    canonical_value: row.score,
    cost: row.cost_per_task_usd,
    tokens_per_task: row.tokens_per_task,
    output_tokens_per_task: row.output_tokens_per_task,
    observed_at: null,
    metadata: {},
  }));
  const mirror = rows.flatMap((source): FusionObservation[] => {
    if (!("epoch" in source)) return [];
    const row = source.epoch;
    const effort = aleBenchModelEffort(row.model);
    return [
      {
        benchmark_key: "ale_bench",
        source_url: ALE_BENCH_EPOCH_RESULTS_URL,
        model_id: null,
        model: row.model,
        base_model: effort.baseModel,
        reasoning_effort: effort.reasoningEffort,
        model_creator: null,
        rank: null,
        canonical_value: row.performance,
        cost: row.cost,
        tokens_per_task: row.total_tokens,
        output_tokens_per_task: row.output_tokens,
        observed_at: null,
        metadata: {},
      },
    ];
  });
  return fuseBenchmarkSources(primary, mirror, {
    maximumScoreError: MAX_CROSSWALK_MEDIAN_ABSOLUTE_ERROR,
    normalizeScore: (score) => Math.max(0, score),
  });
}

function splitStatistics(value: unknown): AleBenchSplitStatistics | null {
  const row = asRecord(value);
  const entries = SPLITS.map((split) => [split, summaryStatistics(row[split])] as const);
  return entries.some(([, statistics]) => statistics == null)
    ? null
    : (Object.fromEntries(entries) as AleBenchSplitStatistics);
}

function summaryStatistics(value: unknown): AleBenchSummaryStatistics | null {
  const row = asRecord(value);
  const mean = asFiniteNumber(row.mean);
  const median = asFiniteNumber(row.median);
  const min = asFiniteNumber(row.min);
  const max = asFiniteNumber(row.max);
  const stdev = asFiniteNumber(row.stdev);
  return mean == null || median == null || min == null || max == null || stdev == null
    ? null
    : { mean, median, min, max, stdev };
}

function taskResult(value: unknown): AleBenchTaskResult | null {
  const row = asRecord(value);
  if (
    typeof row.problem_id !== "string" ||
    typeof row.code_language !== "string" ||
    typeof row.overall_judge_result !== "string"
  ) {
    return null;
  }
  const numericFields = [
    "overall_absolute_score",
    "overall_relative_score",
    "max_execution_time_ms",
    "max_memory_usage_kib",
    "rank",
    "performance",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cost",
  ] as const;
  const values = Object.fromEntries(
    numericFields.map((field) => [field, asFiniteNumber(row[field])]),
  ) as Record<(typeof numericFields)[number], number | null>;
  if (numericFields.some((field) => values[field] == null)) {
    return null;
  }
  return {
    problem_id: row.problem_id,
    code_language: row.code_language,
    overall_judge_result: row.overall_judge_result,
    overall_absolute_score: values.overall_absolute_score as number,
    overall_relative_score: values.overall_relative_score as number,
    max_execution_time_ms: values.max_execution_time_ms as number,
    max_memory_usage_kib: values.max_memory_usage_kib as number,
    rank: values.rank as number,
    performance: values.performance as number,
    input_tokens: values.input_tokens as number,
    output_tokens: values.output_tokens as number,
    total_tokens: values.total_tokens as number,
    cost: values.cost as number,
  };
}
