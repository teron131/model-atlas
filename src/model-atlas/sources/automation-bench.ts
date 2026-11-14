/**
 * AutomationBench strict-completion results from Zapier's official leaderboard module.
 *
 * Page source: https://zapier.com/benchmarks
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../benchmarks/observation";
import { parseModelEffort } from "../identity/normalization";
import { nowEpochSeconds } from "../runtime";
import { htmlAttribute, percentToUnitScore } from "./parsing";
import { fetchSource, fetchSourceText } from "./request-scheduler";

// One row of the module's minified leaderboard array, capturing rank, name, percent, and cost label: [1,`GPT-5 (high)§`,`45.2%`,`$1.23 est.`] → `1`, `GPT-5 (high)§`, `45.2`, `$1.23 est.`.
const LEADERBOARD_ROW_PATTERN =
  /\[(\d+),`([^`]*)`,`([0-9]+(?:\.[0-9]+)?)%`,`(\$[0-9]+(?:\.[0-9]+)?[^`]*)`\]/g;

// The version string the module assigns just before the array of arrays: e=`1.0.3`,t=[[ → `1.0.3`.
const VERSION_PATTERN = /\b\w+=`(\d+\.\d+\.\d+)`,\w+=\[\[/;

/** Fetch current official Zapier results without treating partial-credit or fallback systems as model scores. */
export async function getAutomationBenchStats(
  sourceUrl: string,
): Promise<BenchmarkObservationPayload> {
  const pageHtml = await fetchSourceText(sourceUrl);
  const moduleSource = await fetchLeaderboardModule(pageHtml);
  if (moduleSource == null) return { fetched_at_epoch_seconds: null, data: [] };
  const data = processAutomationBenchModule(moduleSource, sourceUrl);
  return {
    fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
    data,
  };
}

/** Parse the complete versioned leaderboard array and exclude rows that combine multiple models. */
export function processAutomationBenchModule(
  moduleSource: string,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const version = moduleSource.match(VERSION_PATTERN)?.[1] ?? null;
  const rows: BenchmarkObservationRow[] = [];
  for (const match of moduleSource.matchAll(LEADERBOARD_ROW_PATTERN)) {
    const rank = Number(match[1]);
    // Names carry trailing footnote markers, such as § on preliminary results, that are not part of the model name.
    const model = match[2]?.trim().replace(/[*†‡§]+$/, "") ?? "";
    const canonicalValue = percentToUnitScore(match[3]);
    const costLabel = match[4] ?? "";
    const { cost, annotation } = parseCostLabel(costLabel);
    if (
      !Number.isInteger(rank) ||
      rank <= 0 ||
      model.length === 0 ||
      canonicalValue == null ||
      /\bwith\b.+\bfallback\b/i.test(model)
    ) {
      continue;
    }
    const parsed = parseModelEffort(model);
    rows.push({
      benchmark_key: "automation_bench",
      source_url: sourceUrl,
      model_id: null,
      model,
      base_model: parsed.baseModel,
      reasoning_effort: parsed.reasoningEffort,
      model_creator: null,
      rank,
      canonical_value: canonicalValue,
      ...(cost == null ? {} : { cost }),
      observed_at: null,
      metadata: {
        metric: "task_completed_correctly",
        ...(version == null ? {} : { benchmark_version: version }),
        ...(annotation == null ? {} : { cost_annotation: annotation }),
      },
    });
  }
  return rows;
}

/** Cached AutomationBench rows must retain the strict completion metric used by the parser. */
export function automationBenchCacheMatches(rows: readonly BenchmarkObservationRow[]): boolean {
  return rows.every((row) => row.metadata.metric === "task_completed_correctly");
}

async function fetchLeaderboardModule(pageHtml: string): Promise<string | null> {
  const modules = await Promise.all(
    modulePreloadUrls(pageHtml).map((url) =>
      fetchSource(url, {}, async (response) => (response.ok ? response.text() : "")).catch(
        () => "",
      ),
    ),
  );
  return modules.find((source) => source.includes("task_completed_correctly")) ?? null;
}

/** Framer's own runtime chunks never hold the leaderboard, so they are not fetched: `…/sites/abc/react.B1x9.mjs` is skipped, `…/sites/abc/Leaderboard.Xy12.mjs` kept. */
function modulePreloadUrls(pageHtml: string): string[] {
  return [...pageHtml.matchAll(/<link\b[^>]*>/gi)]
    .flatMap((tag) => {
      const html = tag[0];
      if (htmlAttribute(html, "rel") !== "modulepreload") return [];
      const href = htmlAttribute(html, "href");
      return href?.startsWith("https://framerusercontent.com/sites/") ? [href] : [];
    })
    .filter(
      (url) =>
        !/(?:script_main|react|motion|framer|shared|rolldown-runtime)\.[^/]+\.mjs$/.test(url),
    );
}

/** Splits a dollar amount from the note after it: `$1.23 est.` → cost `1.23`, annotation `est.`. */
function parseCostLabel(value: string): { cost: number | null; annotation: string | null } {
  const match = value.match(/^\$([0-9]+(?:\.[0-9]+)?)(.*)$/);
  const cost = Number(match?.[1]);
  const annotation = match?.[2]?.trim() ?? "";
  return {
    cost: Number.isFinite(cost) && cost >= 0 ? cost : null,
    annotation: annotation.length > 0 ? annotation : null,
  };
}
