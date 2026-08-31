/**
 * Scrapes complete Artificial Analysis score and resource rows from evaluation-page Flight data while owning effort identity, per-task conversion, retry, and all-page completeness policy.
 * Page source: https://artificialanalysis.ai/evaluations
 */

import { ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES as BENCHMARK_RESOURCE_PAGES } from "../../../benchmarks/registry";
import {
  canonicalReasoningEffort,
  normalizeModelToken,
  reasoningEffortRank,
} from "../../../identity/normalization";
import {
  asFiniteNumber,
  asRecord,
  fetchWithTimeout,
  mapWithConcurrency,
  nowEpochSeconds,
} from "../../../runtime";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "../../artificial-analysis/model-labels";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REQUEST_JITTER_MS = 250;
const PAGE_FETCH_ATTEMPTS = 2;
const ROW_DETECTION_KEY = "canonicalEvalTokenCounts";
const MODEL_SEARCH_BACKTRACK_CHARS = 70_000;
const REASONING_EFFORT_SUFFIXES = [
  "non-reasoning",
  "extra-high",
  "xhigh",
  "high",
  "medium",
  "low",
  "max",
] as const;

type JsonPath = readonly string[];

type TokenPrices = {
  input: number;
  output: number;
  cacheHit: number | null;
  cacheWrite: number | null;
};

type CostCategories = {
  input: number;
  cacheHit: number;
  cacheWrite: number;
  answer: number;
  reasoning: number;
};

type CostPerTask = {
  total: number;
} & Partial<CostCategories>;

type ArtificialAnalysisBenchmarkResourcePage = {
  benchmark_key: string;
  score_key?: string;
  score_path?: JsonPath;
  resource_key: string;
  url: string;
  task_run_count: number;
};

type ArtificialAnalysisBenchmarkResourceOptions = {
  pages?: readonly ArtificialAnalysisBenchmarkResourcePage[];
  timeoutMs?: number;
  concurrency?: number;
  requestJitterMs?: number;
};

export type ArtificialAnalysisBenchmarkResourceRow = {
  benchmark_key: string;
  source_url: string;
  model_id: string;
  model: string;
  provider: string;
  provider_id: string | null;
  reasoning_effort: string | null;
  score: number;
  task_run_count: number;
  cost_per_task_usd: number;
  seconds_per_task: number;
  tokens_per_task: number;
  input_tokens_per_task: number;
  output_tokens_per_task: number;
  answer_tokens_per_task: number | null;
  reasoning_tokens_per_task: number | null;
};

type ArtificialAnalysisBenchmarkResourcePayload = {
  fetched_at_epoch_seconds: number | null;
  data: ArtificialAnalysisBenchmarkResourceRow[];
};

export type ArtificialAnalysisBenchmarkResourceLookup = ReadonlyMap<
  string,
  ReadonlyMap<string, ArtificialAnalysisBenchmarkResourceRow>
>;

export const ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES = BENCHMARK_RESOURCE_PAGES.map(
  (page): ArtificialAnalysisBenchmarkResourcePage => ({
    benchmark_key: page.benchmarkKey,
    ...(page.scoreKey == null ? {} : { score_key: page.scoreKey }),
    ...(page.scorePath == null ? {} : { score_path: page.scorePath }),
    resource_key: page.resourceKey,
    url: page.url,
    task_run_count: page.taskRunCount,
  }),
);

function providerSlug(provider: string | null): string | null {
  return provider == null
    ? null
    : provider
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nestedValue(row: Record<string, unknown>, path: readonly string[]) {
  let value: unknown = row;
  for (const key of path) {
    value = asRecord(value)[key];
  }
  return value;
}

function perTask(value: number | null, taskCount: number): number | null {
  return value == null ? null : value / taskCount;
}

function tokenCount(tokenCounts: Record<string, unknown>, key: string): number | null {
  return asFiniteNumber(tokenCounts[key]);
}

function scoreValue(
  row: Record<string, unknown>,
  page: ArtificialAnalysisBenchmarkResourcePage,
): number | null {
  return asFiniteNumber(
    page.score_path == null
      ? row[page.score_key ?? page.benchmark_key]
      : nestedValue(row, page.score_path),
  );
}

function tokenCountsRecord(
  row: Record<string, unknown>,
  page: ArtificialAnalysisBenchmarkResourcePage,
): Record<string, unknown> {
  return asRecord(nestedValue(row, ["canonicalEvalTokenCounts", page.resource_key]));
}

function sourceTokenPrices(row: Record<string, unknown>): TokenPrices | null {
  const input = asFiniteNumber(row.price1mInputTokens);
  const output = asFiniteNumber(row.price1mOutputTokens);
  if (input == null || output == null) {
    return null;
  }
  return {
    input,
    output,
    cacheHit: asFiniteNumber(row.cacheHitPrice),
    cacheWrite: asFiniteNumber(row.cacheWritePrice),
  };
}

function tokenBreakdown(
  row: Record<string, unknown>,
  tokenCounts: Record<string, unknown>,
): CostCategories | null {
  const input = tokenCount(tokenCounts, "input");
  const answer = tokenCount(tokenCounts, "answer") ?? 0;
  const reasoning = tokenCount(tokenCounts, "reasoning") ?? 0;
  const cacheableInput = tokenCount(tokenCounts, "cacheableInput");
  if (input == null) {
    return null;
  }
  if (cacheableInput == null) {
    return { input, cacheHit: 0, cacheWrite: 0, answer, reasoning };
  }
  const cacheHitRate = asFiniteNumber(row.cacheHitRate);
  if (
    cacheHitRate == null ||
    cacheHitRate < 0 ||
    cacheHitRate > 1 ||
    cacheableInput < 0 ||
    cacheableInput > input
  ) {
    return null;
  }
  const cacheHit = cacheableInput * cacheHitRate;
  return {
    input: 0,
    cacheHit,
    cacheWrite: input - cacheHit,
    answer,
    reasoning,
  };
}

function categoryCosts(tokens: CostCategories, prices: TokenPrices): CostCategories {
  return {
    input: (tokens.input / 1_000_000) * prices.input,
    cacheHit: (tokens.cacheHit / 1_000_000) * (prices.cacheHit ?? prices.input),
    cacheWrite: (tokens.cacheWrite / 1_000_000) * (prices.cacheWrite ?? prices.input),
    answer: (tokens.answer / 1_000_000) * prices.output,
    reasoning: (tokens.reasoning / 1_000_000) * prices.output,
  };
}

function perTaskCost(categories: CostCategories, taskCount: number): CostPerTask {
  const input = categories.input / taskCount;
  const cacheHit = categories.cacheHit / taskCount;
  const cacheWrite = categories.cacheWrite / taskCount;
  const answer = categories.answer / taskCount;
  const reasoning = categories.reasoning / taskCount;
  return {
    total: input + cacheHit + cacheWrite + answer + reasoning,
    input,
    cacheHit,
    cacheWrite,
    answer,
    reasoning,
  };
}

function costPerTask(
  row: Record<string, unknown>,
  tokenCounts: Record<string, unknown>,
  page: ArtificialAnalysisBenchmarkResourcePage,
): CostPerTask | null {
  const tokens = tokenBreakdown(row, tokenCounts);
  const prices = sourceTokenPrices(row);
  if (tokens == null || prices == null) {
    return null;
  }
  return perTaskCost(categoryCosts(tokens, prices), page.task_run_count);
}

function secondsPerTask(
  row: Record<string, unknown>,
  outputTokensPerTask: number | null,
): number | null {
  const outputSpeed = asFiniteNumber(row.medianCanonicalAnswerOutputSpeed);
  if (outputTokensPerTask == null || outputSpeed == null || outputSpeed <= 0) {
    return null;
  }
  return outputTokensPerTask / outputSpeed;
}

function extractRowsFromPageHtml(pageHtml: string): Record<string, unknown>[] {
  const flightCorpus = extractNextFlightCorpus(pageHtml);
  const resourceRowsById = new Map<string, Record<string, unknown>>();
  let cursor = 0;
  while (true) {
    const hitIndex = flightCorpus.indexOf(`"${ROW_DETECTION_KEY}":`, cursor);
    if (hitIndex === -1) {
      break;
    }
    cursor = hitIndex + 1;
    const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
    for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
      if (flightCorpus[backIndex] !== "{") {
        continue;
      }
      const endIndex = findObjectEnd(flightCorpus, backIndex);
      if (endIndex === -1 || endIndex < hitIndex) {
        continue;
      }
      const candidateRow = parseFlightJsonObject(flightCorpus.slice(backIndex, endIndex + 1));
      const rowId = stringValue(candidateRow?.id) ?? stringValue(candidateRow?.slug);
      if (candidateRow == null || rowId == null || !(ROW_DETECTION_KEY in candidateRow)) {
        continue;
      }
      resourceRowsById.set(rowId, candidateRow);
      break;
    }
  }
  return [...resourceRowsById.values()];
}

function resourceRow(
  sourceRow: unknown,
  page: ArtificialAnalysisBenchmarkResourcePage,
): ArtificialAnalysisBenchmarkResourceRow | null {
  const row = asRecord(sourceRow);
  const modelSlug = stringValue(row.slug);
  const providerRecord = asRecord(row.creator);
  const provider = stringValue(providerRecord.name) ?? stringValue(row.modelCreatorName);
  const providerId = stringValue(providerRecord.slug) ?? providerSlug(provider);
  const fullModelName = stringValue(row.name);
  const sourceModelName = stringValue(row.shortName) ?? fullModelName;
  const model = cleanArtificialAnalysisModelName(sourceModelName) ?? modelSlug;
  const reasoningEffort =
    canonicalReasoningEffort(asRecord(row.effort).slug) ??
    parseArtificialAnalysisReasoningEffort(sourceModelName, fullModelName) ??
    reasoningEffortFromSlug(modelSlug);
  const tokenCounts = tokenCountsRecord(row, page);
  const score = scoreValue(row, page);
  const resolvedCostPerTask = costPerTask(row, tokenCounts, page);
  const inputTokensPerTask = perTask(tokenCount(tokenCounts, "input"), page.task_run_count);
  const answerTokensPerTask = perTask(tokenCount(tokenCounts, "answer"), page.task_run_count);
  const reasoningTokensPerTask = perTask(tokenCount(tokenCounts, "reasoning"), page.task_run_count);
  const effectiveOutputTokensPerTask =
    answerTokensPerTask == null && reasoningTokensPerTask == null
      ? null
      : (answerTokensPerTask ?? 0) + (reasoningTokensPerTask ?? 0);
  const tokensPerTask =
    inputTokensPerTask == null || effectiveOutputTokensPerTask == null
      ? null
      : inputTokensPerTask + effectiveOutputTokensPerTask;
  const resolvedSecondsPerTask = secondsPerTask(row, effectiveOutputTokensPerTask);
  if (
    modelSlug == null ||
    provider == null ||
    providerId == null ||
    model == null ||
    score == null ||
    resolvedCostPerTask == null ||
    resolvedSecondsPerTask == null ||
    inputTokensPerTask == null ||
    effectiveOutputTokensPerTask == null ||
    tokensPerTask == null
  ) {
    return null;
  }
  return {
    benchmark_key: page.benchmark_key,
    source_url: page.url,
    model_id: `${providerId}/${modelSlug}`,
    model,
    provider,
    provider_id: providerId,
    reasoning_effort: reasoningEffort,
    score,
    task_run_count: page.task_run_count,
    cost_per_task_usd: resolvedCostPerTask.total,
    seconds_per_task: resolvedSecondsPerTask,
    tokens_per_task: tokensPerTask,
    input_tokens_per_task: inputTokensPerTask,
    output_tokens_per_task: effectiveOutputTokensPerTask,
    answer_tokens_per_task: answerTokensPerTask,
    reasoning_tokens_per_task: reasoningTokensPerTask,
  };
}

function reasoningEffortFromSlug(modelSlug: string | null): string | null {
  if (modelSlug == null) {
    return null;
  }
  for (const suffix of REASONING_EFFORT_SUFFIXES) {
    if (modelSlug.endsWith(`-${suffix}`)) {
      if (suffix === "non-reasoning") {
        return "none";
      }
      return suffix === "extra-high" ? "xhigh" : suffix;
    }
  }
  return null;
}

export function processArtificialAnalysisBenchmarkResourceRows(
  rows: unknown[],
  page: ArtificialAnalysisBenchmarkResourcePage,
): ArtificialAnalysisBenchmarkResourceRow[] {
  return rows
    .map((row) => resourceRow(row, page))
    .filter((row): row is ArtificialAnalysisBenchmarkResourceRow => row != null)
    .sort((left, right) =>
      `${left.benchmark_key}/${left.model_id}`.localeCompare(
        `${right.benchmark_key}/${right.model_id}`,
      ),
    );
}

function modelKeyCandidates(row: ArtificialAnalysisBenchmarkResourceRow): string[] {
  return [row.model_id, row.model]
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function reasoningModelKeyCandidates(row: ArtificialAnalysisBenchmarkResourceRow): string[] {
  return modelKeyCandidates(row)
    .map(withoutEffortSuffix)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function withoutEffortSuffix(key: string): string {
  let base = key;
  for (const suffix of REASONING_EFFORT_SUFFIXES) {
    if (base.endsWith(`-${suffix}`)) {
      base = base.slice(0, -suffix.length - 1);
      break;
    }
  }
  return base;
}

function higherEffortResourceRow(
  left: ArtificialAnalysisBenchmarkResourceRow | undefined,
  right: ArtificialAnalysisBenchmarkResourceRow,
): ArtificialAnalysisBenchmarkResourceRow {
  if (left == null) {
    return right;
  }
  return reasoningEffortRank(right.reasoning_effort) > reasoningEffortRank(left.reasoning_effort)
    ? right
    : left;
}

/** Builds exact benchmark-resource lookups without collapsing effort observations. */
export function buildArtificialAnalysisResourceLookup(
  rows: ArtificialAnalysisBenchmarkResourceRow[],
): ArtificialAnalysisBenchmarkResourceLookup {
  const rowsByBenchmark = new Map<string, Map<string, ArtificialAnalysisBenchmarkResourceRow>>();
  for (const row of rows) {
    let rowsByModelKey = rowsByBenchmark.get(row.benchmark_key);
    if (rowsByModelKey == null) {
      rowsByModelKey = new Map();
      rowsByBenchmark.set(row.benchmark_key, rowsByModelKey);
    }
    for (const key of modelKeyCandidates(row)) {
      rowsByModelKey.set(key, row);
    }
  }
  return rowsByBenchmark;
}

/** Builds resource lookups whose base-model aliases resolve to the source-default observation. */
export function buildArtificialAnalysisSourceDefaultResourceLookup(
  rows: ArtificialAnalysisBenchmarkResourceRow[],
): ArtificialAnalysisBenchmarkResourceLookup {
  const rowsByBenchmark = new Map(
    [...buildArtificialAnalysisResourceLookup(rows)].map(([benchmarkKey, rowsByModel]) => [
      benchmarkKey,
      new Map(rowsByModel),
    ]),
  );
  const defaultRowsByBenchmark = new Map<
    string,
    Map<string, ArtificialAnalysisBenchmarkResourceRow>
  >();
  for (const row of rows) {
    let defaultRowsByModelKey = defaultRowsByBenchmark.get(row.benchmark_key);
    if (defaultRowsByModelKey == null) {
      defaultRowsByModelKey = new Map();
      defaultRowsByBenchmark.set(row.benchmark_key, defaultRowsByModelKey);
    }
    for (const key of reasoningModelKeyCandidates(row)) {
      defaultRowsByModelKey.set(key, higherEffortResourceRow(defaultRowsByModelKey.get(key), row));
    }
  }
  for (const row of rows) {
    const rowsByModelKey = rowsByBenchmark.get(row.benchmark_key);
    if (rowsByModelKey == null) {
      continue;
    }
    const defaultRowsByModelKey = defaultRowsByBenchmark.get(row.benchmark_key);
    const defaultModelRow = reasoningModelKeyCandidates(row).reduce<
      ArtificialAnalysisBenchmarkResourceRow | undefined
    >(
      (defaultRow, key) =>
        higherEffortResourceRow(defaultRow, defaultRowsByModelKey?.get(key) ?? row),
      undefined,
    );
    if (defaultModelRow == null) {
      continue;
    }
    for (const key of modelKeyCandidates(row)) {
      rowsByModelKey.set(key, defaultModelRow);
    }
  }
  for (const [benchmarkKey, defaultRowsByModelKey] of defaultRowsByBenchmark) {
    const rowsByModelKey = rowsByBenchmark.get(benchmarkKey);
    if (rowsByModelKey == null) {
      continue;
    }
    for (const [key, row] of defaultRowsByModelKey) {
      rowsByModelKey.set(key, row);
    }
  }
  return rowsByBenchmark;
}

export function findArtificialAnalysisBenchmarkResourceRow(
  benchmarkKey: string,
  candidateNames: unknown[],
  resourceLookup: ArtificialAnalysisBenchmarkResourceLookup,
): ArtificialAnalysisBenchmarkResourceRow | null {
  const rowsByModelKey = resourceLookup.get(benchmarkKey);
  if (rowsByModelKey == null) {
    return null;
  }
  for (const candidateName of candidateNames) {
    if (typeof candidateName !== "string" || candidateName.length === 0) {
      continue;
    }
    const row = rowsByModelKey.get(normalizeModelToken(candidateName));
    if (row != null) {
      return row;
    }
  }
  return null;
}

async function getBenchmarkResourceRows(
  page: ArtificialAnalysisBenchmarkResourcePage,
  timeoutMs: number,
): Promise<ArtificialAnalysisBenchmarkResourceRow[]> {
  const response = await fetchWithTimeout(page.url, {}, timeoutMs);
  if (!response.ok) {
    throw new Error(
      `Artificial Analysis benchmark resource scrape failed for ${page.benchmark_key}: ${response.status}`,
    );
  }
  return processArtificialAnalysisBenchmarkResourceRows(
    extractRowsFromPageHtml(await response.text()),
    page,
  );
}

/** Random start jitter spreads same-origin page requests without changing row parsing semantics. */
async function waitForRequestJitter(maxDelayMs: number): Promise<void> {
  const safeMaxDelayMs = Math.max(0, Math.floor(maxDelayMs));
  if (safeMaxDelayMs === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.floor(Math.random() * safeMaxDelayMs));
  });
}

/** Retry one page once and require at least one complete score-resource row before accepting it. */
async function getCompleteBenchmarkResourceRows(
  page: ArtificialAnalysisBenchmarkResourcePage,
  timeoutMs: number,
  requestJitterMs: number,
): Promise<ArtificialAnalysisBenchmarkResourceRow[]> {
  for (let attempt = 0; attempt < PAGE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      await waitForRequestJitter(requestJitterMs);
      const rows = await getBenchmarkResourceRows(page, timeoutMs);
      if (rows.length > 0) {
        return rows;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function getArtificialAnalysisBenchmarkResourceStats(
  options: ArtificialAnalysisBenchmarkResourceOptions = {},
): Promise<ArtificialAnalysisBenchmarkResourcePayload> {
  const pages = options.pages ?? ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const requestJitterMs = options.requestJitterMs ?? DEFAULT_REQUEST_JITTER_MS;
  const pageResults = await mapWithConcurrency(pages, concurrency, (page) =>
    getCompleteBenchmarkResourceRows(page, timeoutMs, requestJitterMs),
  );
  const allPagesComplete =
    pages.length > 0 &&
    pageResults.length === pages.length &&
    pageResults.every((rows) => rows.length > 0);
  const resourceRows = pageResults
    .flat()
    .sort((left, right) =>
      `${left.benchmark_key}/${left.model_id}`.localeCompare(
        `${right.benchmark_key}/${right.model_id}`,
      ),
    );
  return {
    fetched_at_epoch_seconds: allPagesComplete ? nowEpochSeconds() : null,
    data: resourceRows,
  };
}
