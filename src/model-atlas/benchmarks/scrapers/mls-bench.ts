/**
 * MLS-Bench Lite leaderboard results from the official leaderboard.
 *
 * Page source: https://mls-bench.com/leaderboard
 */

import {
  benchmarkModelEffort,
  modelNameWithoutCreatorPrefix,
  normalizeModelToken,
} from "../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { htmlAttribute, percentToUnitScore, stripHtmlTags } from "../../scrapers/parsing";
import type { BenchmarkObservationPayload, BenchmarkObservationRow } from "../observation";

export const MLS_BENCH_LEADERBOARD_URL = "https://mls-bench.com/leaderboard";

const DEFAULT_TIMEOUT_MS = 30_000;

function htmlRows(tableBody: string): string[] {
  return [...tableBody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? "");
}

function htmlCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1] ?? "");
}

function classSpanText(html: string, className: string): string | null {
  const match = html.match(
    new RegExp(
      `<span\\b[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    ),
  );
  const text = match == null ? "" : stripHtmlTags(match[1] ?? "");
  return text.length > 0 ? text : null;
}

function harnessName(html: string): string | null {
  const name = html.match(/<span\b[^>]*text-muted-foreground[^>]*>\s*([^<]+)/i)?.[1]?.trim();
  return name == null || name.length === 0 ? null : name;
}

/** Normalize the rendered leaderboard only, excluding duplicate Next.js Flight payload rows. */
export function processMlsBenchLeaderboardHtml(
  pageHtml: string,
  sourceUrl = MLS_BENCH_LEADERBOARD_URL,
): BenchmarkObservationRow[] {
  const tableBody = pageHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (tableBody == null) return [];

  return htmlRows(tableBody).flatMap((rowHtml) => {
    const cells = htmlCells(rowHtml);
    if (cells.length !== 4) return [];

    const [rankCell = "", modelCell = "", harnessCell = "", scoreCell = ""] = cells;
    const rank = Number(stripHtmlTags(rankCell));
    const model = classSpanText(modelCell, "font-medium text-foreground");
    const creator = htmlAttribute(modelCell, "alt");
    const harness = harnessName(harnessCell);
    const effort =
      stripHtmlTags(harnessCell)
        .match(/\b(max|xhigh)\b/i)?.[1]
        ?.toLowerCase() ?? null;
    const score = Number(stripHtmlTags(scoreCell));
    const canonicalScore = percentToUnitScore(String(score));
    if (
      !Number.isInteger(rank) ||
      rank < 1 ||
      model == null ||
      creator == null ||
      harness == null ||
      canonicalScore == null
    ) {
      return [];
    }

    const parsedModel = benchmarkModelEffort(model);
    const hasFallback = /with fallback/i.test(stripHtmlTags(harnessCell));
    return [
      {
        benchmark_key: "mls_bench",
        source_url: sourceUrl,
        model_id: null,
        model,
        base_model: modelNameWithoutCreatorPrefix(parsedModel.baseModel, creator),
        reasoning_effort: effort ?? parsedModel.reasoningEffort,
        model_creator_id: normalizeModelToken(creator),
        model_creator: creator,
        inference_provider: null,
        rank,
        reported_value: score,
        reported_unit: "percent",
        canonical_value: canonicalScore,
        canonical_unit: "proportion",
        score_eligible: true,
        standard_error: null,
        confidence_low: null,
        confidence_high: null,
        observed_at: null,
        metadata: {
          ...(hasFallback ? { fallback: true } : {}),
          harness,
        },
      },
    ];
  });
}

/** Fetch the current official MLS-Bench Lite leaderboard without refreshing any persisted data. */
export async function getMlsBenchStats(
  sourceUrl = MLS_BENCH_LEADERBOARD_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(sourceUrl, {}, timeoutMs);
    if (!response.ok) throw new Error(`MLS-Bench scrape failed: ${response.status}`);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processMlsBenchLeaderboardHtml(await response.text(), sourceUrl),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
