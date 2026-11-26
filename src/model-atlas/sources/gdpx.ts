/**
 * GDPx scores, cost per task, and output tokens per task from SemiAnalysis's leaderboard bundle.
 *
 * Page source: https://gdpx.semianalysis.com
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../benchmarks/observation";
import { canonicalReasoningEffort, modelEffortLabel } from "../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../runtime";
import { htmlAttribute, mapWithCompetitionRank, percentToUnitScore } from "./parsing";
import { fetchSourceText } from "./request-scheduler";

// A domain record in the bundle's domain list: {slug:"chip-design",name:"Chip Design",shortName:"Chip",…} → `chip-design`.
const DOMAIN_PATTERN = /\{slug:"([a-z0-9-]+)",name:"[^"]+",shortName:/g;

// A partner registration call, whatever the minifier names its function: a("aria","Aria","chip-design","/partners/aria.png") → `aria`, `chip-design`.
const PARTNER_PATTERN = /[\w$]+\("([a-z0-9-]+)","[^"]+","([a-z0-9-]+)"/g;

// A JSON module inlined as a single-quoted string, escapes included: JSON.parse('{"a":"it\'s"}') → `{"a":"it\'s"}`.
const JSON_MODULE_PATTERN = /JSON\.parse\('((?:[^'\\]|\\.)*)'\)/g;

// The version beside the logo in the page header: <span class="font-mono …">v1.0</span> → `1.0`.
const VERSION_PATTERN = />v(\d+(?:\.\d+)+)<\/span>/;

type GdpxModel = {
  id: string;
  name: string;
  lab: string | null;
  harness: string;
  reasoning: string;
};

type GdpxResult = { modelId: string; partnerId: string; score: number };

/** Fetch the page and every script it loads; the results live in one chunk, which is found by content because chunk names change with each deploy. */
export async function getGdpxStats(sourceUrl: string): Promise<BenchmarkObservationPayload> {
  const pageHtml = await fetchSourceText(sourceUrl);
  const chunks = await Promise.all(
    scriptUrls(pageHtml, sourceUrl).map((url) => fetchSourceText(url)),
  );
  const bundle = chunks.find((source) => source.includes('"partnerId"'));
  const data =
    bundle == null
      ? []
      : processGdpxBundle(bundle, pageHtml.match(VERSION_PATTERN)?.[1] ?? null, sourceUrl);
  return {
    fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
    data,
  };
}

/**
 * Score every general model as the leaderboard does: each partner's published score, averaged within its domain, then across domains with equal weight.
 * Domain-specialist models, which ran one domain only, are left out. A bundle whose results name a partner outside the domain list yields no rows, so a changed layout keeps the cached rows instead of scoring a different basket.
 */
export function processGdpxBundle(
  bundle: string,
  version: string | null,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const domains = new Set(Array.from(bundle.matchAll(DOMAIN_PATTERN), (match) => match[1]!));
  const domainByPartner = new Map(
    Array.from(bundle.matchAll(PARTNER_PATTERN))
      .filter((match) => domains.has(match[2]!))
      .map((match) => [match[1]!, match[2]!]),
  );
  const data = resultsModule(bundle);
  if (data == null || domains.size === 0) return [];
  const results = parseResults(data.results);
  if (results.some(({ partnerId }) => !domainByPartner.has(partnerId))) return [];

  const scored = parseModels(data.models).flatMap((model) => {
    const partnerScores = new Map<string, number[]>();
    for (const result of results) {
      if (result.modelId !== model.id) continue;
      const domain = domainByPartner.get(result.partnerId)!;
      partnerScores.set(domain, [...(partnerScores.get(domain) ?? []), result.score]);
    }
    // A model missing a domain would average a different task set than the rest of the board.
    if (partnerScores.size !== domains.size) return [];
    const score = percentToUnitScore(mean([...partnerScores.values()].map(mean)));
    return score == null ? [] : [{ model, score }];
  });

  return mapWithCompetitionRank(
    scored.sort((left, right) => right.score - left.score),
    ({ score }) => score,
    ({ model, score }, rank): BenchmarkObservationRow => {
      const resources = asRecord(data.overall[model.id]);
      const cost = asFiniteNumber(resources.costPerTask);
      const outputTokens = asFiniteNumber(resources.tokensPerTask);
      // "Highest" and "Default" name the model's own top or default setting rather than a level, which Atlas reads from an unlabelled row.
      const reasoningEffort = /^(?:highest|default)$/i.test(model.reasoning)
        ? null
        : canonicalReasoningEffort(model.reasoning);
      return {
        benchmark_key: "gdpx",
        source_url: sourceUrl,
        model_id: null,
        model: modelEffortLabel(model.name, reasoningEffort),
        base_model: model.name,
        reasoning_effort: reasoningEffort,
        model_creator: model.lab,
        rank,
        canonical_value: score,
        ...(cost == null ? {} : { cost }),
        observed_at: null,
        metadata: {
          ...(version == null ? {} : { benchmark_version: version }),
          harness: model.harness,
          ...(outputTokens == null ? {} : { output_tokens_per_task: outputTokens }),
        },
      };
    },
  );
}

/** Same-origin script chunks in page order: `<script src="/_next/static/x.js" async="">` → `https://gdpx.semianalysis.com/_next/static/x.js`. */
function scriptUrls(pageHtml: string, sourceUrl: string): string[] {
  const origin = new URL(sourceUrl).origin;
  return [...pageHtml.matchAll(/<script\b[^>]*>/gi)].flatMap((tag) => {
    const src = htmlAttribute(tag[0], "src");
    if (src == null) return [];
    const url = new URL(src, sourceUrl);
    return url.origin === origin && url.pathname.endsWith(".js") ? [url.href] : [];
  });
}

/** The inlined JSON module holding the models and their per-partner results, with JavaScript's quote and backslash escapes undone before JSON parsing. */
function resultsModule(
  bundle: string,
): { models: unknown[]; results: unknown[]; overall: Record<string, unknown> } | null {
  for (const match of bundle.matchAll(JSON_MODULE_PATTERN)) {
    const text = match[1]!.replace(/\\(['\\])/g, "$1");
    if (!text.includes('"partnerId"')) continue;
    const { models, results, overall } = asRecord(JSON.parse(text));
    return Array.isArray(models) && Array.isArray(results)
      ? { models, results, overall: asRecord(overall) }
      : null;
  }
  return null;
}

function parseModels(models: readonly unknown[]): GdpxModel[] {
  return models.flatMap((entry) => {
    const model = asRecord(entry);
    const { id, name, lab, harness, reasoning } = model;
    if (
      model.specialist != null ||
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof harness !== "string" ||
      typeof reasoning !== "string"
    ) {
      return [];
    }
    return [{ id, name, lab: typeof lab === "string" ? lab : null, harness, reasoning }];
  });
}

/** A result counts only once some of its tasks were scored, as the leaderboard requires. */
function parseResults(results: readonly unknown[]): GdpxResult[] {
  return results.flatMap((entry) => {
    const result = asRecord(entry);
    const score = asFiniteNumber(result.score);
    const tasksScored = asFiniteNumber(result.tasksScored);
    if (
      typeof result.modelId !== "string" ||
      typeof result.partnerId !== "string" ||
      score == null ||
      tasksScored == null ||
      tasksScored <= 0
    ) {
      return [];
    }
    return [{ modelId: result.modelId, partnerId: result.partnerId, score }];
  });
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
