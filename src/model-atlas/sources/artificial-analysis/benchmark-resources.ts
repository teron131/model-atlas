/**
 * Artificial Analysis benchmark scores and per-task resource measurements from public evaluation pages.
 *
 * Page source: https://artificialanalysis.ai/evaluations
 * Page source: https://artificialanalysis.ai/methodology/intelligence-benchmarking
 */

import { ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES as BENCHMARK_RESOURCE_PAGES } from "../../benchmarks/registry";
import {
  canonicalReasoningEffort,
  normalizeModelToken,
  reasoningEffortRank,
} from "../../identity/normalization";
import {
  asFiniteNumber,
  asNonEmptyString,
  asRecord,
  mapWithConcurrency,
  nowEpochSeconds,
} from "../../runtime";
import { stripHtmlTags } from "../parsing";
import { fetchSource, SourceQueueTimeoutError } from "../request-scheduler";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "./model-labels";
import { getArtificialAnalysisPage } from "./page-data";

const METHODOLOGY_URL = "https://artificialanalysis.ai/methodology/intelligence-benchmarking";

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_CONCURRENCY = 3;

const PAGE_FETCH_ATTEMPTS = 2;

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

type TokenCategoryAmounts = {
  input: number;
  cacheHit: number;
  cacheWrite: number;
  answer: number;
  reasoning: number;
};

type CostPerTask = {
  total: number;
} & Partial<TokenCategoryAmounts>;

type ArtificialAnalysisBenchmarkResourcePage = {
  benchmark_key: string;
  score_key?: string;
  score_path?: JsonPath;
  resource_key: string;
  url: string;
  methodology_name: string;
  version?: string;
};

type RunCountedPage = Omit<ArtificialAnalysisBenchmarkResourcePage, "methodology_name"> & {
  task_run_count: number;
};

type ArtificialAnalysisBenchmarkResourceOptions = {
  pages?: readonly ArtificialAnalysisBenchmarkResourcePage[];
  methodologyUrl?: string;
  timeoutMs?: number;
  concurrency?: number;
};

export type ArtificialAnalysisBenchmarkResourceRow = {
  benchmark_key: string;
  source_url: string;
  /** The version in the evaluation page's title; null where the title carries none. */
  benchmark_version: string | null;
  model_id: string;
  model: string;
  provider: string;
  provider_id: string | null;
  reasoning_effort: string | null;
  score: number;
  task_run_count: number;
  cost_per_task_usd: number | null;
  seconds_per_task: number | null;
  tokens_per_task: number | null;
  input_tokens_per_task: number | null;
  output_tokens_per_task: number | null;
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
    methodology_name: page.methodologyName,
    ...(page.version == null ? {} : { version: page.version }),
  }),
);

export async function getArtificialAnalysisBenchmarkResourceStats(
  options: ArtificialAnalysisBenchmarkResourceOptions = {},
): Promise<ArtificialAnalysisBenchmarkResourcePayload> {
  const pages = options.pages ?? ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (pages.length === 0) return { fetched_at_epoch_seconds: null, data: [] };
  let runCounts: ReadonlyMap<string, number>;
  try {
    runCounts = await getArtificialAnalysisRunCounts(
      options.methodologyUrl ?? METHODOLOGY_URL,
      timeoutMs,
    );
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
  // A page the methodology table no longer lists cannot be divided into runs, so it completes nothing and its cached rows stay in place.
  const pageResults = await mapWithConcurrency(pages, concurrency, async (page) => {
    const taskRunCount = runCounts.get(evaluationName(page.methodology_name));
    return taskRunCount == null
      ? []
      : getCompleteBenchmarkResourceRows({ ...page, task_run_count: taskRunCount }, timeoutMs);
  });
  const allPagesComplete =
    pageResults.length === pages.length && pageResults.every((rows) => rows.length > 0);
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

/** Each methodology table row gives an evaluation's questions and repeats, whose product is its runs; a name listed twice, or a count given only approximately, resolves to nothing. */
export function processArtificialAnalysisRunCounts(html: string): Map<string, number> {
  const runs = new Map<string, number>();
  const repeatedNames = new Set<string>();
  for (const table of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const headers = tableCells(table, "th");
    const columns = ["Evaluation", "Questions", "Repeats"].map((header) => headers.indexOf(header));
    if (columns.some((column) => column < 0)) continue;
    for (const tableRow of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const cells = tableCells(tableRow, "td");
      if (cells.length === 0) continue;
      // Leading cells such as the category span several rows, so the rows after the first omit them.
      const offset = headers.length - cells.length;
      const [name, questions, repeats] = columns.map((column) => cells[column - offset]);
      const questionCount = leadingCount(questions);
      const repeatCount = leadingCount(repeats);
      if (name == null || questionCount == null || repeatCount == null) continue;
      const key = evaluationName(name);
      if (runs.has(key)) repeatedNames.add(key);
      runs.set(key, questionCount * repeatCount);
    }
  }
  for (const name of repeatedNames) runs.delete(name);
  return runs;
}

export function processArtificialAnalysisBenchmarkResourceRows(
  rows: unknown[],
  page: RunCountedPage,
  version: string | null,
): ArtificialAnalysisBenchmarkResourceRow[] {
  if (page.version != null && version !== page.version) return [];
  return rows
    .map((row) => resourceRow(row, page, version))
    .filter((row): row is ArtificialAnalysisBenchmarkResourceRow => row != null)
    .sort((left, right) =>
      `${left.benchmark_key}/${left.model_id}`.localeCompare(
        `${right.benchmark_key}/${right.model_id}`,
      ),
    );
}

/** Artificial Analysis titles an evaluation page "<name>[: subtitle] Benchmark | Artificial Analysis"; the version is the name's last word when that word is a dotted number, with or without a leading `v`. */
export function artificialAnalysisEvaluationVersion(title: string | null): string | null {
  const name =
    title
      ?.replace(/ \| .*$/, "")
      .replace(/:.*$/, "")
      .replace(/ Benchmark$/, "") ?? "";
  return /\sv?(\d+(?:\.\d+)*)$/.exec(name)?.[1] ?? null;
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
    for (const key of resourceRowKeyCandidates(row)) {
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
    for (const key of baseModelKeyCandidates(row)) {
      defaultRowsByModelKey.set(key, higherEffortResourceRow(defaultRowsByModelKey.get(key), row));
    }
  }
  for (const row of rows) {
    const rowsByModelKey = rowsByBenchmark.get(row.benchmark_key);
    if (rowsByModelKey == null) {
      continue;
    }
    const defaultRowsByModelKey = defaultRowsByBenchmark.get(row.benchmark_key);
    const defaultModelRow = baseModelKeyCandidates(row).reduce<
      ArtificialAnalysisBenchmarkResourceRow | undefined
    >(
      (defaultRow, key) =>
        higherEffortResourceRow(defaultRow, defaultRowsByModelKey?.get(key) ?? row),
      undefined,
    );
    if (defaultModelRow == null) {
      continue;
    }
    for (const key of resourceRowKeyCandidates(row)) {
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

async function getArtificialAnalysisRunCounts(
  url: string,
  timeoutMs: number,
): Promise<Map<string, number>> {
  const html = await fetchSource(url, {}, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`Artificial Analysis methodology failed: ${response.status}`);
    return response.text();
  });
  return processArtificialAnalysisRunCounts(html);
}

/** Version tokens are dropped so a methodology row keeps matching its page across versions. */
function evaluationName(name: string): string {
  return name
    .split(/\s+/)
    .filter((token) => !/^v?\d+(?:\.\d+)*$/.test(token))
    .join(" ");
}

function tableCells(html: string, tag: "td" | "th"): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((match) =>
    stripHtmlTags(match[1] ?? ""),
  );
}

function leadingCount(cell: string | undefined): number | null {
  const digits = /^\d[\d,]*/.exec(cell ?? "")?.[0];
  return digits == null ? null : Number(digits.replaceAll(",", ""));
}

/** Retry one complete dataset once; a preview or missing dataset never advances source freshness. */
async function getCompleteBenchmarkResourceRows(
  page: RunCountedPage,
  timeoutMs: number,
): Promise<ArtificialAnalysisBenchmarkResourceRow[]> {
  for (let attempt = 0; attempt < PAGE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const { title, models } = await getArtificialAnalysisPage(page.url, timeoutMs);
      const rows = processArtificialAnalysisBenchmarkResourceRows(
        models,
        page,
        artificialAnalysisEvaluationVersion(title),
      );
      if (rows.length > 0) {
        return rows;
      }
    } catch (error) {
      if (error instanceof SourceQueueTimeoutError) break;
    }
  }
  return [];
}

function resourceRow(
  sourceRow: unknown,
  page: RunCountedPage,
  version: string | null,
): ArtificialAnalysisBenchmarkResourceRow | null {
  const row = asRecord(sourceRow);
  const modelSlug = asNonEmptyString(row.slug);
  const creatorRecord = asRecord(row.creator);
  const creatorName =
    asNonEmptyString(creatorRecord.name) ?? asNonEmptyString(row.modelCreatorName);
  const creatorId = asNonEmptyString(creatorRecord.slug) ?? creatorNameSlug(creatorName);
  const fullModelName = asNonEmptyString(row.name);
  const sourceModelName = asNonEmptyString(row.shortName) ?? fullModelName;
  const model = cleanArtificialAnalysisModelName(sourceModelName) ?? modelSlug;
  const reasoningEffort =
    canonicalReasoningEffort(asRecord(row.effort).slug) ??
    parseArtificialAnalysisReasoningEffort(sourceModelName, fullModelName) ??
    reasoningEffortFromSlug(modelSlug);
  const tokenCounts = tokenCountsRecord(row, page);
  const score = scoreValue(row, page);
  const costPerTask = rowCostPerTask(row, tokenCounts, page);
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
  const secondsPerTask = rowSecondsPerTask(row, effectiveOutputTokensPerTask);
  if (
    modelSlug == null ||
    creatorName == null ||
    creatorId == null ||
    model == null ||
    score == null
  ) {
    return null;
  }
  return {
    benchmark_key: page.benchmark_key,
    source_url: page.url,
    benchmark_version: version,
    model_id: `${creatorId}/${modelSlug}`,
    model,
    provider: creatorName,
    provider_id: creatorId,
    reasoning_effort: reasoningEffort,
    score,
    task_run_count: page.task_run_count,
    cost_per_task_usd: costPerTask?.total ?? null,
    seconds_per_task: secondsPerTask,
    tokens_per_task: tokensPerTask,
    input_tokens_per_task: inputTokensPerTask,
    output_tokens_per_task: effectiveOutputTokensPerTask,
    answer_tokens_per_task: answerTokensPerTask,
    reasoning_tokens_per_task: reasoningTokensPerTask,
  };
}

function creatorNameSlug(creatorName: string | null): string | null {
  return creatorName == null
    ? null
    : creatorName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
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

function tokenCountsRecord(
  row: Record<string, unknown>,
  page: RunCountedPage,
): Record<string, unknown> {
  return asRecord(nestedValue(row, ["canonicalEvalTokenCounts", page.resource_key]));
}

function nestedValue(row: Record<string, unknown>, path: readonly string[]) {
  let value: unknown = row;
  for (const key of path) {
    value = asRecord(value)[key];
  }
  return value;
}

function scoreValue(row: Record<string, unknown>, page: RunCountedPage): number | null {
  return asFiniteNumber(
    page.score_path == null
      ? row[page.score_key ?? page.benchmark_key]
      : nestedValue(row, page.score_path),
  );
}

function rowCostPerTask(
  row: Record<string, unknown>,
  tokenCounts: Record<string, unknown>,
  page: RunCountedPage,
): CostPerTask | null {
  const tokens = categoryTokenCounts(row, tokenCounts);
  const prices = sourceTokenPrices(row);
  if (tokens == null || prices == null) {
    return null;
  }
  return costPerTaskFromTotals(categoryCosts(tokens, prices), page.task_run_count);
}

function categoryTokenCounts(
  row: Record<string, unknown>,
  tokenCounts: Record<string, unknown>,
): TokenCategoryAmounts | null {
  const input = tokenCount(tokenCounts, "input");
  const answerTokens = tokenCount(tokenCounts, "answer");
  const reasoningTokens = tokenCount(tokenCounts, "reasoning");
  const cacheableInput = tokenCount(tokenCounts, "cacheableInput");
  if (input == null || (answerTokens == null && reasoningTokens == null)) {
    return null;
  }
  const answer = answerTokens ?? 0;
  const reasoning = reasoningTokens ?? 0;
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

function tokenCount(tokenCounts: Record<string, unknown>, key: string): number | null {
  return asFiniteNumber(tokenCounts[key]);
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

function costPerTaskFromTotals(categories: TokenCategoryAmounts, taskCount: number): CostPerTask {
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

function categoryCosts(tokens: TokenCategoryAmounts, prices: TokenPrices): TokenCategoryAmounts {
  return {
    input: (tokens.input / 1_000_000) * prices.input,
    cacheHit: (tokens.cacheHit / 1_000_000) * (prices.cacheHit ?? prices.input),
    cacheWrite: (tokens.cacheWrite / 1_000_000) * (prices.cacheWrite ?? prices.input),
    answer: (tokens.answer / 1_000_000) * prices.output,
    reasoning: (tokens.reasoning / 1_000_000) * prices.output,
  };
}

function perTask(value: number | null, taskCount: number): number | null {
  return value == null ? null : value / taskCount;
}

function rowSecondsPerTask(
  row: Record<string, unknown>,
  outputTokensPerTask: number | null,
): number | null {
  const outputSpeed = asFiniteNumber(row.medianCanonicalAnswerOutputSpeed);
  if (outputTokensPerTask == null || outputSpeed == null || outputSpeed <= 0) {
    return null;
  }
  return outputTokensPerTask / outputSpeed;
}

function resourceRowKeyCandidates(row: ArtificialAnalysisBenchmarkResourceRow): string[] {
  return [row.model_id, row.model]
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function baseModelKeyCandidates(row: ArtificialAnalysisBenchmarkResourceRow): string[] {
  return resourceRowKeyCandidates(row)
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
