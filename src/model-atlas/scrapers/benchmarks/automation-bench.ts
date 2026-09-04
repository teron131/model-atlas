/**
 * AutomationBench strict-completion results from Zapier's official leaderboard module.
 *
 * Page source: https://zapier.com/benchmarks
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { benchmarkModelEffort } from "../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { htmlAttribute, percentToUnitScore } from "../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_ROW_PATTERN =
  /\[(\d+),`([^`]*)`,`([0-9]+(?:\.[0-9]+)?)%`,`(\$[0-9]+(?:\.[0-9]+)?[^`]*)`\]/g;
const VERSION_PATTERN = /\b\w+=`(\d+\.\d+\.\d+)`,\w+=\[\[/;

type AutomationBenchOptions = {
  sourceUrl: string;
  timeoutMs?: number;
};

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

function parseCostLabel(value: string): { cost: number | null; annotation: string | null } {
  const match = value.match(/^\$([0-9]+(?:\.[0-9]+)?)(.*)$/);
  const cost = Number(match?.[1]);
  const annotation = match?.[2]?.trim() ?? "";
  return {
    cost: Number.isFinite(cost) && cost >= 0 ? cost : null,
    annotation: annotation.length > 0 ? annotation : null,
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
    const model = match[2]?.trim() ?? "";
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
    const parsed = benchmarkModelEffort(model);
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

async function fetchLeaderboardModule(pageHtml: string, timeoutMs: number): Promise<string | null> {
  const modules = await Promise.all(
    modulePreloadUrls(pageHtml).map(async (url) => {
      try {
        const response = await fetchWithTimeout(url, {}, timeoutMs);
        return response.ok ? await response.text() : "";
      } catch {
        return "";
      }
    }),
  );
  return modules.find((source) => source.includes("task_completed_correctly")) ?? null;
}

/** Fetch current official Zapier results without treating partial-credit or fallback systems as model scores. */
export async function getAutomationBenchStats(
  options: AutomationBenchOptions,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(
      options.sourceUrl,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`Zapier AutomationBench scrape failed: ${response.status}`);
    const moduleSource = await fetchLeaderboardModule(
      await response.text(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (moduleSource == null) return { fetched_at_epoch_seconds: null, data: [] };
    const data = processAutomationBenchModule(moduleSource, options.sourceUrl);
    return {
      fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
      data,
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
