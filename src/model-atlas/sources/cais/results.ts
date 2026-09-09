/**
 * Scrape benchmark results from the CAIS AI Dashboard.
 *
 * Page source: https://dashboard.safe.ai/
 */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { canonicalReasoningEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import { fetchSource } from "../request-scheduler";

type CaisSource = Omit<Extract<BenchmarkObservationLoader, { kind: "cais_dashboard" }>, "kind">;
type CaisDashboardModel = {
  raw: Record<string, unknown>;
  name: string;
  modelId: string;
  provider: string | null;
  releaseDate: string | null;
  scores: Record<string, unknown>;
  scoreNotes: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DASHBOARD_SCRIPT_MARKER = "JSON.parse('";
const SOURCE_FAMILY = "cais_dashboard";
const METRIC = "dashboard_score";

const TEXT_COMPONENTS = ["hle", "textquests"] as const;
const VISION_COMPONENTS = ["enigmaeval", "erqa", "intphys2", "mindcube", "spatialviz"] as const;
const COMPONENTS = [...TEXT_COMPONENTS, ...VISION_COMPONENTS] as const;

const inFlightPages = new Map<string, Promise<CaisDashboardPage>>();

type CaisDashboardPage = {
  models: unknown[];
  revision: string;
  fetchedAt: number;
};

/** Fetch one dashboard deployment once while concurrent benchmark bindings consume its shared page. */
export async function getCaisDashboardStats(
  benchmarkKey: string,
  source: CaisSource,
): Promise<BenchmarkObservationPayload> {
  try {
    const page = await loadCaisDashboardPage(source.sourceUrl);
    const data = processCaisDashboardModels(
      page.models,
      benchmarkKey,
      source.sourceUrl,
      page.revision,
    );
    return {
      fetched_at_epoch_seconds: data.length > 0 ? page.fetchedAt : null,
      data,
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Reject cached rows from a different CAIS source contract or benchmark metric. */
export function caisCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  source: CaisSource,
): boolean {
  return rows.every(
    (row) =>
      row.source_url === source.sourceUrl &&
      row.metadata.source_family === SOURCE_FAMILY &&
      row.metadata.metric === METRIC,
  );
}

/** Convert dashboard model records into one complete benchmark-specific observation series. */
export function processCaisDashboardModels(
  models: readonly unknown[],
  benchmarkKey: string,
  sourceUrl: string,
  revision: string,
): BenchmarkObservationRow[] {
  const parsedModels = models.flatMap(parseModel);
  const rows =
    benchmarkKey === "cais_capabilities_index"
      ? parsedModels.flatMap((model) => aggregateRow(model, benchmarkKey, sourceUrl, revision))
      : parsedModels.flatMap((model) => componentRow(model, benchmarkKey, sourceUrl, revision));
  return rows
    .sort(
      (left, right) =>
        right.canonical_value - left.canonical_value ||
        left.base_model.localeCompare(right.base_model),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function parseModel(value: unknown): CaisDashboardModel[] {
  const raw = asRecord(value);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const modelId = typeof raw.id === "string" ? raw.id.trim() : "";
  if (name.length === 0 || modelId.length === 0) return [];
  return [
    {
      raw,
      name,
      modelId,
      provider: typeof raw.provider === "string" ? raw.provider : null,
      releaseDate: typeof raw.releaseDate === "string" ? raw.releaseDate : null,
      scores: asRecord(raw.scores),
      scoreNotes: asRecord(raw.scoreNotes),
    },
  ];
}

function componentRow(
  model: CaisDashboardModel,
  benchmarkKey: string,
  sourceUrl: string,
  revision: string,
): BenchmarkObservationRow[] {
  if (!(COMPONENTS as readonly string[]).includes(benchmarkKey)) return [];
  const score = asFiniteNumber(model.scores[benchmarkKey]);
  if (score == null || score < 0 || score > 100) return [];
  return [buildRow(model, benchmarkKey, score, sourceUrl, revision, "component")];
}

function aggregateRow(
  model: CaisDashboardModel,
  benchmarkKey: string,
  sourceUrl: string,
  revision: string,
): BenchmarkObservationRow[] {
  const scores = Object.fromEntries(
    COMPONENTS.map((component) => [component, asFiniteNumber(model.scores[component])]),
  ) as Record<(typeof COMPONENTS)[number], number | null>;
  if (Object.values(scores).some((score) => score == null || score < 0 || score > 100)) return [];
  const hasCompositeResult = COMPONENTS.some((component) => {
    const note = model.scoreNotes[component];
    return typeof note === "string" && /fallback|fall back/i.test(note);
  });
  if (hasCompositeResult) return [];
  const textScore =
    TEXT_COMPONENTS.reduce((sum, component) => sum + scores[component]!, 0) /
    TEXT_COMPONENTS.length;
  const visionScore =
    VISION_COMPONENTS.reduce((sum, component) => sum + scores[component]!, 0) /
    VISION_COMPONENTS.length;
  const score = (2 * textScore + 5 * visionScore) / 7;
  return [
    buildRow(model, benchmarkKey, score, sourceUrl, revision, "aggregate", {
      component_count: COMPONENTS.length,
      component_scores_json: JSON.stringify(scores),
      index_formula:
        "(2 * mean(hle, textquests) + 5 * mean(enigmaeval, erqa, intphys2, mindcube, spatialviz)) / 7",
      text_components_json: JSON.stringify(TEXT_COMPONENTS),
      vision_components_json: JSON.stringify(VISION_COMPONENTS),
    }),
  ];
}

function buildRow(
  model: CaisDashboardModel,
  benchmarkKey: string,
  score: number,
  sourceUrl: string,
  revision: string,
  observationKind: "aggregate" | "component",
  extraMetadata: Record<string, string | number> = {},
): BenchmarkObservationRow {
  const identity = modelIdentity(model);
  const note = model.scoreNotes[benchmarkKey];
  return {
    benchmark_key: benchmarkKey,
    source_url: sourceUrl,
    model_id: model.modelId,
    model: identity.model,
    base_model: identity.baseModel,
    reasoning_effort: identity.reasoningEffort,
    model_creator: model.provider,
    rank: null,
    canonical_value: Number((score / 100).toFixed(6)),
    observed_at: null,
    metadata: {
      source_family: SOURCE_FAMILY,
      source_model: model.name,
      source_model_id: model.modelId,
      source_revision: revision,
      metric: METRIC,
      observation_kind: observationKind,
      model_release_date: model.releaseDate,
      score_note: typeof note === "string" ? note : null,
      raw_model_json: JSON.stringify(model.raw),
      ...extraMetadata,
    },
  };
}

function modelIdentity(model: CaisDashboardModel): {
  model: string;
  baseModel: string;
  reasoningEffort: string | null;
} {
  const baseModel =
    model.provider === "anthropic" && /^(?:Fable|Haiku|Opus|Sonnet)\b/.test(model.name)
      ? `Claude ${model.name}`
      : model.name;
  const reasoningEffort = caisReasoningEffort(model.modelId);
  return {
    model: reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
    baseModel,
    reasoningEffort,
  };
}

function caisReasoningEffort(modelId: string): string | null {
  if (/(?:-|\b)thinking(?:-\d+k)?$/i.test(modelId)) return "max";
  const match = modelId.match(/-(low|medium|high|xhigh|max)$/i);
  return match == null ? null : canonicalReasoningEffort(match[1]);
}

async function loadCaisDashboardPage(sourceUrl: string): Promise<CaisDashboardPage> {
  const existing = inFlightPages.get(sourceUrl);
  if (existing != null) return existing;
  const request = fetchCaisDashboardPage(sourceUrl);
  inFlightPages.set(sourceUrl, request);
  try {
    return await request;
  } finally {
    if (inFlightPages.get(sourceUrl) === request) inFlightPages.delete(sourceUrl);
  }
}

async function fetchCaisDashboardPage(sourceUrl: string): Promise<CaisDashboardPage> {
  const html = await fetchSource(sourceUrl, {}, DEFAULT_TIMEOUT_MS, async (response) => {
    if (!response.ok) throw new Error(`CAIS dashboard fetch failed: ${response.status}`);
    return response.text();
  });
  const scriptUrls = [
    ...new Set(
      [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
        (match) => new URL(match[1]!, sourceUrl).href,
      ),
    ),
  ];
  const scripts = await Promise.all(
    scriptUrls.map((url) =>
      fetchSource(url, {}, DEFAULT_TIMEOUT_MS, async (scriptResponse) =>
        scriptResponse.ok ? scriptResponse.text() : null,
      ).catch(() => null),
    ),
  );
  for (let index = 0; index < scripts.length; index += 1) {
    const script = scripts[index];
    if (script == null) continue;
    const models = extractModels(script);
    if (models != null && models.length > 0) {
      return {
        models,
        revision: scriptUrls[index]!,
        fetchedAt: nowEpochSeconds(),
      };
    }
  }
  throw new Error("CAIS dashboard did not expose a model matrix");
}

function extractModels(script: string): unknown[] | null {
  let searchStart = 0;
  while (true) {
    const start = script.indexOf(DASHBOARD_SCRIPT_MARKER, searchStart);
    if (start === -1) return null;
    const contentStart = start + DASHBOARD_SCRIPT_MARKER.length;
    const contentEnd = singleQuotedStringEnd(script, contentStart);
    if (contentEnd === -1) return null;
    try {
      // Decode the JavaScript string layer before parsing the JSON document it contains.
      const literal = script
        .slice(contentStart, contentEnd)
        .replace(/\\(?:'|"|\\|\/|b|f|n|r|t|v|0|x[\da-f]{2}|u[\da-f]{4})/gi, (escape) => {
          if (escape === "\\'") return "'";
          if (escape === "\\v") return "\u000b";
          if (escape === "\\0") return "\u0000";
          if (escape.startsWith("\\x"))
            return String.fromCharCode(Number.parseInt(escape.slice(2), 16));
          return JSON.parse(`"${escape}"`) as string;
        });
      const parsed: unknown = JSON.parse(literal);
      if (
        Array.isArray(parsed) &&
        parsed.some((value) => {
          const model = asRecord(value);
          return typeof model.name === "string" && Object.keys(asRecord(model.scores)).length > 0;
        })
      ) {
        return parsed;
      }
    } catch {
      // Other dashboard chunks contain unrelated JSON islands; keep searching this script.
    }
    searchStart = contentEnd + 1;
  }
}

function singleQuotedStringEnd(value: string, start: number): number {
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (value[index] === "\\") {
      escaped = true;
      continue;
    }
    if (value[index] === "'") return index;
  }
  return -1;
}
