/**
 * Benchmark leaderboard results from Surge AI.
 *
 * Page sources:
 * - https://surgehq.ai/benchmarks/chartography
 * - https://surgehq.ai/benchmarks/complex-constraints
 * - https://surgehq.ai/benchmarks/enterprisebench-corecraft
 * - https://surgehq.ai/benchmarks/handbook
 * - https://surgehq.ai/benchmarks/hemingway-bench
 * - https://surgehq.ai/leaderboards/gdp-pdf
 */

import {
  benchmarkModelEffort,
  modelNameWithoutCreatorPrefix,
} from "../../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../../runtime";
import {
  htmlAttribute,
  percentToUnitScore,
  providerFromLogoAlt,
  stripHtmlTags,
} from "../../../scrapers/parsing";
import type { BenchmarkObservationPayload, BenchmarkObservationRow } from "../../observation";

const DEFAULT_TIMEOUT_MS = 30_000;
const LIST_ITEM_PATTERN =
  /<div\b[^>]*\brole\s*=\s*["']listitem["'][\s\S]*?(?=<div\b[^>]*\brole\s*=\s*["']listitem["']|<section\b|$)/gi;
const MODEL_RANKINGS_PATTERN = />\s*Model Rankings\s*</i;

type SurgeLeaderboardScoreRow = {
  provider: string | null;
  model: string;
  score: number;
  last_updated: string | null;
};

type SurgeScoreKind = "percent" | "elo";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classText(html: string, className: string): string | null {
  const classPattern = escapeRegExp(className);
  const match = html.match(
    new RegExp(
      `<[^>]*class\\s*=\\s*["'](?:[^"']*\\s)?${classPattern}(?:\\s[^"']*)?["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ),
  );
  const text = match == null ? null : stripHtmlTags(match[1] ?? "");
  return text != null && text.length > 0 ? text : null;
}

/** Combines brand and model text without duplicating a repeated brand. */
function combinedModelName(brand: string | null, name: string | null): string | null {
  if (name == null || name.length === 0) {
    return null;
  }
  if (brand == null || brand.length === 0) {
    return name;
  }
  return name.toLowerCase().startsWith(brand.toLowerCase()) ? name : `${brand} ${name}`;
}

/** Limits parsing to the Model Rankings section when present. */
function surgeLeaderboardSegment(pageHtml: string): string {
  const markerMatch = pageHtml.match(MODEL_RANKINGS_PATTERN);
  const start = markerMatch?.index ?? -1;
  if (start === -1) {
    return pageHtml;
  }
  const nextSectionStart = pageHtml.indexOf("<section", start + 1);
  return nextSectionStart === -1 ? pageHtml.slice(start) : pageHtml.slice(start, nextSectionStart);
}

function surgeLeaderboardRows(pageHtml: string): string[] {
  return [...surgeLeaderboardSegment(pageHtml).matchAll(LIST_ITEM_PATTERN)].map(
    (match) => match[0] ?? "",
  );
}

function surgeLastUpdated(pageHtml: string): string | null {
  const match = stripHtmlTags(pageHtml).match(/Last updated\s+(\d{2}\/\d{2}\/\d{4})/i);
  return match?.[1] ?? null;
}

function surgeModelName(rowHtml: string): string | null {
  const legacyModel = classText(rowHtml, "corecraft-model");
  if (legacyModel != null) {
    return legacyModel;
  }
  return combinedModelName(
    classText(rowHtml, "head-rank-table-brand"),
    classText(rowHtml, "head-rank-table-name"),
  );
}

function surgeProvider(rowHtml: string): string | null {
  return providerFromLogoAlt(htmlAttribute(rowHtml, "alt"));
}

function surgeScoreText(rowHtml: string): string | null {
  const attributeScore = htmlAttribute(rowHtml, "data-score");
  if (attributeScore != null && attributeScore.length > 0) {
    return attributeScore;
  }
  const scoreMatch = rowHtml.match(
    /<div[^>]*(?:data-score|fs-list-field\s*=\s*["']foundational-score["'])[^>]*>([\s\S]*?)<\/div>/i,
  );
  const score = scoreMatch == null ? null : stripHtmlTags(scoreMatch[1] ?? "");
  return score != null && score.length > 0 ? score : null;
}

function surgeLeaderboardScoreRow(
  rowHtml: string,
  lastUpdated: string | null,
  scoreKind: SurgeScoreKind = "percent",
): SurgeLeaderboardScoreRow | null {
  const model = surgeModelName(rowHtml);
  const scoreText = surgeScoreText(rowHtml);
  if (model == null || scoreText == null) return null;
  const reportedValue = Number(scoreText);
  const canonicalValue = scoreKind === "percent" ? percentToUnitScore(scoreText) : reportedValue;
  if (!Number.isFinite(reportedValue) || canonicalValue == null) return null;
  return {
    provider: surgeProvider(rowHtml),
    model,
    score: canonicalValue,
    last_updated: lastUpdated,
  };
}

export function surgeLeaderboardScoreRows(pageHtml: string): SurgeLeaderboardScoreRow[] {
  const lastUpdated = surgeLastUpdated(pageHtml);
  return surgeLeaderboardRows(pageHtml)
    .map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated))
    .filter((row): row is SurgeLeaderboardScoreRow => row != null)
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      score: row.score,
      last_updated: row.last_updated,
    }));
}

export function processSurgeBenchmarkPageHtml(
  pageHtml: string,
  benchmarkKey: string,
  sourceUrl: string,
  scoreKind: SurgeScoreKind = "percent",
): BenchmarkObservationRow[] {
  const lastUpdated = surgeLastUpdated(pageHtml);
  const rows = surgeLeaderboardRows(pageHtml)
    .map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated, scoreKind))
    .filter((row): row is SurgeLeaderboardScoreRow => row != null);
  let rank = 0;
  let previousScore: number | null = null;
  return rows.map((row, index) => {
    if (previousScore == null || row.score !== previousScore) {
      rank = index + 1;
    }
    previousScore = row.score;
    const parsed = benchmarkModelEffort(row.model);
    return {
      benchmark_key: benchmarkKey,
      source_url: sourceUrl,
      model_id: null,
      model: row.model,
      base_model: modelNameWithoutCreatorPrefix(parsed.baseModel, row.provider),
      reasoning_effort: parsed.reasoningEffort,
      model_creator: row.provider,
      rank,
      canonical_value: row.score,
      observed_at: row.last_updated,
      metadata: {},
    };
  });
}

export async function getSurgeLeaderboardStats(
  benchmarkKey: string,
  sourceUrl: string,
  scoreKind: SurgeScoreKind = "percent",
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(sourceUrl, {}, DEFAULT_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Surge ${benchmarkKey} scrape failed: ${response.status}`);
    const pageHtml = await response.text();
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processSurgeBenchmarkPageHtml(pageHtml, benchmarkKey, sourceUrl, scoreKind),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
