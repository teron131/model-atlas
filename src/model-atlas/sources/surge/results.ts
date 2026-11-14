/**
 * Benchmark leaderboard results from Surge AI.
 *
 * Page sources:
 * - https://surgehq.ai/benchmarks/chartography
 * - https://surgehq.ai/benchmarks/complex-constraints
 * - https://surgehq.ai/benchmarks/gdp-pdf
 * - https://surgehq.ai/benchmarks/gdp-xlsx
 * - https://surgehq.ai/benchmarks/handbook
 * - https://surgehq.ai/benchmarks/hemingway-bench
 * - https://surgehq.ai/benchmarks/sudo-l7
 * - https://surgehq.ai/benchmarks
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { parseModelEffort } from "../../identity/normalization";
import { nowEpochSeconds } from "../../runtime";
import {
  escapeRegExp,
  htmlAttribute,
  mapWithCompetitionRank,
  percentToUnitScore,
  providerFromLogoAlt,
  stripHtmlTags,
} from "../parsing";
import { fetchSourceText } from "../request-scheduler";

/** One leaderboard row is a Webflow `role="listitem"` div up to the next one or a `<section>`: `<div role="listitem">A</div><div role="listitem">B</div><section>` → the A row and the B row. */
const LIST_ITEM_PATTERN =
  /<div\b[^>]*\brole\s*=\s*["']listitem["'][\s\S]*?(?=<div\b[^>]*\brole\s*=\s*["']listitem["']|<section\b|$)/gi;

const MODEL_RANKINGS_PATTERN = />\s*Model Rankings\s*</i;

/** One Intelligence Index row is a `data-ii-item` div up to the next item or the `data-ii-status` footer, the same split as `LIST_ITEM_PATTERN`. */
const INTELLIGENCE_INDEX_ITEM_PATTERN =
  /<div\b[^>]*\bdata-ii-item(?:\s*=\s*["'][^"']*["'])?[^>]*>[\s\S]*?(?=<div\b[^>]*\bdata-ii-item|<div\b[^>]*\bdata-ii-status|$)/gi;

export type SurgeLeaderboardScoreRow = {
  provider: string | null;
  model: string;
  score: number;
  last_updated: string | null;
};

type SurgeScoreKind = "percent" | "elo";

/** Fetch the aggregate Surge Intelligence Index without inventing resource measurements. */
export async function getSurgeIntelligenceIndexStats(
  benchmarkKey: string,
  sourceUrl: string,
): Promise<BenchmarkObservationPayload> {
  const pageHtml = await fetchSourceText(sourceUrl);
  return {
    fetched_at_epoch_seconds: nowEpochSeconds(),
    data: processSurgeIntelligenceIndexPageHtml(pageHtml, benchmarkKey, sourceUrl),
  };
}

export async function getSurgeLeaderboardStats(
  benchmarkKey: string,
  sourceUrl: string,
  scoreKind: SurgeScoreKind = "percent",
): Promise<BenchmarkObservationPayload> {
  const pageHtml = await fetchSourceText(sourceUrl);
  return {
    fetched_at_epoch_seconds: nowEpochSeconds(),
    data: processSurgeBenchmarkPageHtml(pageHtml, benchmarkKey, sourceUrl, scoreKind),
  };
}

export function withSurgeVersion(
  payload: BenchmarkObservationPayload,
  version: string,
): BenchmarkObservationPayload {
  return {
    ...payload,
    data: payload.data.map((row) => ({
      ...row,
      metadata: { ...row.metadata, declared_version: version },
    })),
  };
}

/** Only rows stamped with the declared version can serve as cache, so rows from before an unannounced rerun never rejoin it. */
export function surgeCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  version: string,
): boolean {
  return rows.every((row) => row.metadata.declared_version === version);
}

export function surgeLeaderboardScoreRows(pageHtml: string): SurgeLeaderboardScoreRow[] {
  const lastUpdated = surgeLastUpdated(pageHtml);
  return surgeLeaderboardRowHtml(pageHtml)
    .map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated))
    .filter((row): row is SurgeLeaderboardScoreRow => row != null);
}

export function processSurgeBenchmarkPageHtml(
  pageHtml: string,
  benchmarkKey: string,
  sourceUrl: string,
  scoreKind: SurgeScoreKind = "percent",
): BenchmarkObservationRow[] {
  const lastUpdated = surgeLastUpdated(pageHtml);
  const rows = surgeLeaderboardRowHtml(pageHtml)
    .map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated, scoreKind))
    .filter((row): row is SurgeLeaderboardScoreRow => row != null);
  return mapWithCompetitionRank(
    rows,
    (row) => row.score,
    (row, rank): BenchmarkObservationRow => {
      // A trailing bracket names the harness: GPT-5 [Codex] → model GPT-5, harness Codex.
      const [suffix, harness] = row.model.match(/\s*\[([^\]]+)\]\s*$/) ?? [];
      const model = suffix == null ? row.model : row.model.slice(0, -suffix.length).trim();
      const parsed = parseModelEffort(model);
      return {
        benchmark_key: benchmarkKey,
        source_url: sourceUrl,
        model_id: null,
        model,
        base_model: parsed.baseModel,
        reasoning_effort: parsed.reasoningEffort,
        model_creator: row.provider,
        rank,
        canonical_value: row.score,
        observed_at: row.last_updated,
        metadata: harness == null ? {} : { harness: harness.trim() },
      };
    },
  );
}

/** Parse the aggregate Intelligence Index separately from Surge's benchmark leaderboards. */
export function processSurgeIntelligenceIndexPageHtml(
  pageHtml: string,
  benchmarkKey: string,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const articleStart = pageHtml.search(/<article\b[^>]*\bid\s*=\s*["']intelligence-index["']/i);
  if (articleStart === -1) return [];
  const articleEnd = pageHtml.indexOf("</article>", articleStart);
  const segment = pageHtml.slice(articleStart, articleEnd === -1 ? undefined : articleEnd);
  const rows = [...segment.matchAll(INTELLIGENCE_INDEX_ITEM_PATTERN)]
    .map((match) => {
      const rowHtml = match[0] ?? "";
      const model = attributeElementText(rowHtml, "data-ii-model-bound");
      const score = percentToUnitScore(attributeElementText(rowHtml, "data-ii-score-paragraph"));
      if (model == null || score == null) return null;
      const provider = surgeProvider(rowHtml);
      const reasoningLabel = attributeElementText(rowHtml, "data-ii-reasoning-bound");
      const sourceModel =
        reasoningLabel == null || reasoningLabel.toLowerCase() === "default"
          ? model
          : `${model} (${reasoningLabel})`;
      const parsed = parseModelEffort(sourceModel);
      return {
        provider,
        model,
        baseModel: parsed.baseModel,
        reasoningEffort: parsed.reasoningEffort,
        score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  return mapWithCompetitionRank(
    rows,
    (row) => row.score,
    (row, rank) => ({
      benchmark_key: benchmarkKey,
      source_url: sourceUrl,
      model_id: null,
      model: row.model,
      base_model: row.baseModel,
      reasoning_effort: row.reasoningEffort,
      model_creator: row.provider,
      rank,
      canonical_value: row.score,
      observed_at: null,
      metadata: {},
    }),
  );
}

function surgeLastUpdated(pageHtml: string): string | null {
  const match = stripHtmlTags(pageHtml).match(/Last updated\s+(\d{2}\/\d{2}\/\d{4})/i);
  return match?.[1] ?? null;
}

function surgeLeaderboardRowHtml(pageHtml: string): string[] {
  return [...surgeLeaderboardSegment(pageHtml).matchAll(LIST_ITEM_PATTERN)].map(
    (match) => match[0] ?? "",
  );
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

function surgeModelName(rowHtml: string): string | null {
  return combinedModelName(
    classText(rowHtml, "head-rank-table-brand"),
    classText(rowHtml, "head-rank-table-name"),
  );
}

/** Text of the first element whose class list contains `className`: head-rank-table-brand in `<div class="row head-rank-table-brand x">OpenAI</div>` → OpenAI. */
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

function surgeScoreText(rowHtml: string): string | null {
  const attributeScore = htmlAttribute(rowHtml, "data-score");
  if (attributeScore != null && attributeScore.length > 0) {
    return attributeScore;
  }
  // Without a `data-score` value, the score is the inner HTML of a `data-score` or `fs-list-field="foundational-score"` div: `<div fs-list-field="foundational-score"><b>1432</b></div>` → 1432 once tags are stripped.
  const scoreMatch = rowHtml.match(
    /<div[^>]*(?:data-score|fs-list-field\s*=\s*["']foundational-score["'])[^>]*>([\s\S]*?)<\/div>/i,
  );
  const score = scoreMatch == null ? null : stripHtmlTags(scoreMatch[1] ?? "");
  return score != null && score.length > 0 ? score : null;
}

function surgeProvider(rowHtml: string): string | null {
  return providerFromLogoAlt(htmlAttribute(rowHtml, "alt"));
}

/** Text of the first element carrying `attributeName`, valued or bare: data-ii-model-bound in `<span data-ii-model-bound>Claude Opus 4.5</span>` → Claude Opus 4.5. */
function attributeElementText(html: string, attributeName: string): string | null {
  const match = html.match(
    new RegExp(
      `<[^>]*\\b${escapeRegExp(attributeName)}(?:\\s*=\\s*["'][^"']*["'])?[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ),
  );
  const value = match == null ? null : stripHtmlTags(match[1] ?? "");
  return value != null && value.length > 0 ? value : null;
}
