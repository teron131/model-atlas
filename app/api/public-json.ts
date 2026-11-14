/** Build the stats API's slices of the published snapshot, each serialized once with its validator, and the dashboard's own feed. */

import { createHash } from "node:crypto";

import {
  BENCHMARK_COLUMNS,
  BENCHMARK_DISPLAY_ORDER,
  BENCHMARK_LABELS,
  type BenchmarkKey,
} from "../../src/model-atlas/benchmarks/catalog";
import type { BenchmarkGroup } from "../../src/model-atlas/benchmarks/factory";
import { INDEX_REPRESENTED_BENCHMARK_MEDIAN } from "../../src/model-atlas/benchmarks/index-policy";
import type { BenchmarkObservationEvidenceRow } from "../../src/model-atlas/benchmarks/observation";
import { benchmarkValue } from "../../src/model-atlas/benchmarks/registry";
import { readDisplayPayload } from "../../src/model-atlas/database/runtime-snapshot";
import { applyResourceEvidenceRequirements } from "../../src/model-atlas/pipeline/scores/resource-metrics";
import {
  intelligenceRanks,
  modelsForVariantDisplay,
} from "../../src/model-atlas/stats/model-variants";
import {
  displayResourceRatios,
  type ResourceRatioKind,
  resourceRatioReferenceSets,
  type ResourceRatios,
  type ResourceRatioSummary,
} from "../../src/model-atlas/stats/resource-ratios";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { providerLogo } from "../dashboard/shared/provider-theme";
import { matchesEtag, NO_STORE_HEADERS, SNAPSHOT_CACHE_HEADERS } from "./cache-headers";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const MODEL_SCHEMA = "model_atlas.model";
const BENCHMARK_INDEX_SCHEMA = "model_atlas.benchmark_index";
const BENCHMARK_SCHEMA = "model_atlas.benchmark";
const SCORE_SCALE = "relative_0_100";
const DASHBOARD_OBSERVATION_METADATA_KEYS = [
  "observation_role",
  "fusion_collapsed",
  "cost",
  "seconds_per_task",
  "tokens_per_task",
  "output_tokens_per_task",
] as const;

/** A part of the snapshot one request receives; every stats endpoint names one, so no response carries the whole snapshot except the dashboard's feed. */
export type PublicJsonSlice =
  | { kind: "scores"; display: LeaderboardDisplay }
  | { kind: "models"; display: LeaderboardDisplay }
  | { kind: "model"; id: string }
  | { kind: "benchmarks" }
  | { kind: "benchmark"; key: string }
  | { kind: "dashboard" };

/** The dashboard table's two row modes: one row per model, or one per variant, a model at one reasoning effort. */
type LeaderboardDisplay = "models" | "variants";

type PublicJsonPayload =
  | ScoreJsonPayload
  | CoreJsonPayload
  | ModelJsonPayload
  | BenchmarkIndexJsonPayload
  | BenchmarkJsonPayload
  | ModelAtlasPayload;

type SerializedPublicJson = { body: string; etag: string };

const serializedBySnapshot = new WeakMap<
  ModelAtlasPayload,
  {
    /** Each slice with site-relative URLs; its hash is the slice's validator whichever site origin is asked for. */
    slices: Map<string, SerializedPublicJson>;
    /** The dashboard feed's body with absolute icon URLs, for the site origin last asked for. */
    dashboard?: { siteOrigin: string; body: string };
  }
>();

type ScoreJsonPayload = {
  schema: typeof SCORE_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  score_scale: typeof SCORE_SCALE;
  methodology: string;
  scores: ScoreJsonModel[];
};

type ModelScores = {
  score: {
    intelligence: number;
    agentic: number;
    speed: number | null;
    value: number | null;
  };
  confidence: {
    speed: number | null;
    value: number | null;
  };
};

type ScoreJsonModel = {
  rank: number;
  id: string | null;
  name: string | null;
  provider: string | null;
  reasoning_effort: string | null;
} & ModelScores;

type CoreJsonPayload = {
  schema: typeof CORE_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  score_scale: typeof SCORE_SCALE;
  methodology: string;
  columns: string[];
  models: CoreJsonModel[];
};

type CoreJsonModel = {
  rank: number;
  id: string | null;
  name: string | null;
  provider: string | null;
  reasoning_effort: string | null;
  release_date: string | null;
  input_modalities: string[];
  output_modalities: string[];
  open_weights: boolean | null;
  intelligence_score: number;
  agentic_score: number;
  speed_score: number | null;
  speed_confidence: number | null;
  value_score: number | null;
  value_confidence: number | null;
  task_cost_ratio: number | null;
  task_time_ratio: number | null;
  total_token_ratio: number | null;
  blended_price: number | null;
  context_window_tokens: number | null;
  input_price_per_million_tokens: number | null;
  cache_read_price_per_million_tokens: number | null;
  output_price_per_million_tokens: number | null;
  throughput_tokens_per_second_median: number | null;
  latency_seconds_median: number | null;
  e2e_latency_seconds_median: number | null;
};

const CORE_MODEL_COLUMNS = [
  "rank",
  "id",
  "name",
  "provider",
  "reasoning_effort",
  "release_date",
  "input_modalities",
  "output_modalities",
  "open_weights",
  "intelligence_score",
  "agentic_score",
  "speed_score",
  "speed_confidence",
  "value_score",
  "value_confidence",
  "task_cost_ratio",
  "task_time_ratio",
  "total_token_ratio",
  "blended_price",
  "context_window_tokens",
  "input_price_per_million_tokens",
  "cache_read_price_per_million_tokens",
  "output_price_per_million_tokens",
  "throughput_tokens_per_second_median",
  "latency_seconds_median",
  "e2e_latency_seconds_median",
] as const;

type ModelJsonPayload = {
  schema: typeof MODEL_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  id: string;
  efforts: PublicFullJsonModel[];
};

type PublicFullJsonModel = Omit<ModelAtlasModel, "reasoning" | "logo"> & {
  resource_ratios: Record<ResourceRatioKind, PublicResourceRatio>;
};

type PublicResourceRatio = {
  ratio: number | null;
  benchmark_count: number;
  source_count: number;
};

type BenchmarkIndexJsonPayload = {
  schema: typeof BENCHMARK_INDEX_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  benchmarks: { key: BenchmarkKey; name: string; class: BenchmarkGroup }[];
};

type BenchmarkJsonPayload = {
  schema: typeof BENCHMARK_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  key: BenchmarkKey;
  name: string;
  class: BenchmarkGroup;
  version: string | null;
  /** How to read `value`: a percent arrives as a fraction of 1, and the other formats in the source's own units. */
  format: (typeof BENCHMARK_COLUMNS)[BenchmarkKey]["format"];
  results: BenchmarkJsonResult[];
};

type BenchmarkJsonResult = {
  id: string | null;
  name: string | null;
  provider: string | null;
  value: number;
  date: string | null;
  leaderboard_rank: number;
};

type LeaderboardRow = {
  model: ModelAtlasModel;
  rank: number;
};

/**
 * Answer a stats request with one slice of the current snapshot, or 304 when the caller's validator still matches.
 *
 * A model or benchmark the snapshot does not hold answers 404 with the endpoint that lists what it does hold.
 */
export async function publicJsonResponse(
  request: Request,
  slice: PublicJsonSlice,
): Promise<Response> {
  try {
    const serialized = serializedPublicJson(await readDisplayPayload(), slice, siteOrigin(request));
    if (serialized == null) {
      return Response.json(
        { error: missingSliceMessage(slice) },
        { status: 404, headers: SNAPSHOT_CACHE_HEADERS },
      );
    }
    const headers = new Headers(SNAPSHOT_CACHE_HEADERS);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("ETag", serialized.etag);
    const unchanged = matchesEtag(request.headers.get("if-none-match"), serialized.etag);
    return new Response(unchanged ? null : serialized.body, {
      status: unchanged ? 304 : 200,
      headers,
    });
  } catch {
    return new Response("Unable to read stats", {
      status: 500,
      headers: { ...NO_STORE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * Serialize a slice once per snapshot object, so every request for that slice of that snapshot is answered from one body and validator; null when the snapshot holds no such model or benchmark.
 *
 * The validator is a hash of the site-relative body, so it changes with the snapshot's data and with the slice's shape, and the same snapshot yields the same validator wherever it is asked for.
 * It stays valid for a body with absolute URLs because a validator only ever compares responses for one URL, whose host fixes the origin.
 */
export function serializedPublicJson(
  snapshot: ModelAtlasPayload,
  slice: PublicJsonSlice,
  siteOrigin = "",
): SerializedPublicJson | null {
  let serialized = serializedBySnapshot.get(snapshot);
  if (!serialized) {
    serialized = { slices: new Map() };
    serializedBySnapshot.set(snapshot, serialized);
  }
  const sliceKey = JSON.stringify(slice);
  let relative = serialized.slices.get(sliceKey);
  if (!relative) {
    const payload = publicJsonPayload(snapshot, slice);
    if (payload == null) return null;
    const body = JSON.stringify(payload);
    relative = { body, etag: `W/"${createHash("sha256").update(body).digest("hex")}"` };
    serialized.slices.set(sliceKey, relative);
  }
  if (slice.kind !== "dashboard" || siteOrigin === "") return relative;
  if (serialized.dashboard?.siteOrigin !== siteOrigin) {
    serialized.dashboard = {
      siteOrigin,
      body: JSON.stringify(publicJsonPayload(snapshot, slice, siteOrigin)),
    };
  }
  return { body: serialized.dashboard.body, etag: relative.etag };
}

/**
 * Build one slice from a snapshot after applying the resource-evidence requirements every public score honours; null when the snapshot holds no such model or benchmark.
 *
 * `siteOrigin` is the public address the response is served from, such as `https://example.com`; the dashboard feed prefixes its icon URLs with it, and without it they stay relative to the site.
 */
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  slice: { kind: "dashboard" },
  siteOrigin?: string,
): ModelAtlasPayload;
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  slice: PublicJsonSlice,
  siteOrigin?: string,
): PublicJsonPayload | null;
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  slice: PublicJsonSlice,
  siteOrigin = "",
): PublicJsonPayload | null {
  payload = {
    ...payload,
    models: payload.models.map((model) =>
      applyResourceEvidenceRequirements(model, payload.metadata.scoring.benchmark_portfolio),
    ),
  };
  switch (slice.kind) {
    case "scores":
      return scoreJsonPayload(payload, slice.display);
    case "models":
      return coreJsonPayload(payload, slice.display);
    case "model":
      return modelJsonPayload(payload, slice.id);
    case "benchmarks":
      return benchmarkIndexJsonPayload(payload);
    case "benchmark":
      return benchmarkJsonPayload(payload, slice.key);
    case "dashboard":
      return dashboardJsonPayload(payload, siteOrigin);
  }
}

/**
 * Keep complete model and benchmark evidence for immediate rendering without shipping ingestion diagnostics that no dashboard consumer reads.
 *
 * A model's logo is the URL of its provider's icon file where the app serves one, as the dashboard draws it, and the snapshot's embedded image otherwise.
 * The URL is absolute when `siteOrigin` is given, so a caller on another host can load it, and relative to the site without it.
 * Repeating one embedded image per model would make up most of the compressed response.
 */
export function dashboardJsonPayload(
  payload: ModelAtlasPayload,
  siteOrigin = "",
): ModelAtlasPayload {
  const {
    benchmark_observations: observations,
    metadata: { source_health: _sourceHealth, ...metadata },
    ...leaderboard
  } = payload;
  const dashboard = {
    ...leaderboard,
    metadata,
    models: leaderboard.models.map((model) => {
      const iconPath = providerLogo(model.provider);
      return iconPath ? { ...model, logo: `${siteOrigin}${iconPath}` } : model;
    }),
  };
  if (observations == null) return dashboard;
  return {
    ...dashboard,
    benchmark_observations: Object.fromEntries(
      Object.entries(observations).map(([key, rows]) => [key, rows.map(dashboardObservation)]),
    ),
  };
}

/** The score slice is the default public ranking surface and exposes the four relative scores. */
export function scoreJsonPayload(
  payload: ModelAtlasPayload,
  display: LeaderboardDisplay = "models",
): ScoreJsonPayload {
  const rows = rankedRows(payload, display);
  return {
    schema: SCORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    scores: rows.map(({ model, rank }) => ({
      rank,
      id: model.id,
      name: model.name,
      provider: model.provider,
      reasoning_effort: model.reasoning_effort,
      ...modelScores(model),
    })),
  };
}

/** The core slice is the compact table contract: stable scalar columns without dashboard-only decoration. */
export function coreJsonPayload(
  payload: ModelAtlasPayload,
  display: LeaderboardDisplay = "models",
): CoreJsonPayload {
  const rows = rankedRows(payload, display);
  const ratios = resourceRatios(
    payload,
    rows.map(({ model }) => model),
  );
  return {
    schema: CORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    columns: [...CORE_MODEL_COLUMNS],
    models: rows.map(({ model, rank }, index) => coreJsonModel(model, rank, ratios[index]!)),
  };
}

/** One model's every scored variant, strongest Intelligence first, with all its public fields, including configurations the ranked slices hide; null when no scored variant has the id. */
export function modelJsonPayload(payload: ModelAtlasPayload, id: string): ModelJsonPayload | null {
  const variants = byIntelligence(payload.models.filter((model) => model.id === id));
  if (variants.length === 0) return null;
  const ratios = resourceRatios(payload, variants);
  return {
    schema: MODEL_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    id,
    efforts: variants.map(({ logo: _logo, reasoning: _reasoning, ...model }, index) => {
      const { cost, time, tokens } = ratios[index]!;
      return {
        ...model,
        resource_ratios: {
          cost: publicResourceRatio(cost),
          time: publicResourceRatio(time),
          tokens: publicResourceRatio(tokens),
        },
      };
    }),
  };
}

/** The snapshot's portfolio in dashboard order, naming the keys the benchmark slice accepts and each benchmark's class in that snapshot. */
export function benchmarkIndexJsonPayload(payload: ModelAtlasPayload): BenchmarkIndexJsonPayload {
  return {
    schema: BENCHMARK_INDEX_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    benchmarks: portfolioBenchmarks(payload).map((benchmark) => ({
      key: benchmark.key,
      name: BENCHMARK_LABELS[benchmark.key],
      class: benchmark.class,
    })),
  };
}

/**
 * One benchmark's results for the ranked models, best first, in the source's units; null when the key is not in the portfolio.
 *
 * Each model is its leaderboard row, so a value can come from a higher effort that filled a field the ranked effort lacks.
 */
export function benchmarkJsonPayload(
  payload: ModelAtlasPayload,
  requestedKey: string,
): BenchmarkJsonPayload | null {
  const benchmark = portfolioBenchmarks(payload).find(({ key }) => key === requestedKey);
  if (benchmark == null) return null;
  const { key } = benchmark;
  const results = rankedRows(payload, "models").flatMap(({ model, rank }) => {
    const value = benchmarkValue(model, key);
    return value == null
      ? []
      : [
          {
            id: model.id,
            name: model.name,
            provider: model.provider,
            value,
            date: model.benchmark_dates?.[key] ?? null,
            leaderboard_rank: rank,
          },
        ];
  });
  return {
    schema: BENCHMARK_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    key,
    name: BENCHMARK_LABELS[key],
    class: benchmark.class,
    version: payload.metadata.benchmark_versions?.[key] ?? null,
    format: BENCHMARK_COLUMNS[key].format,
    results: results.sort((left, right) => right.value - left.value),
  };
}

/** A ranked slice lists one row per reasoning effort when asked with `efforts=all`, as the dashboard table's Variants view does. */
export function leaderboardDisplay(request: Request): LeaderboardDisplay {
  return new URL(request.url).searchParams.get("efforts") === "all" ? "variants" : "models";
}

/**
 * The public address to prefix a response's own URLs with.
 *
 * Vercel's production domain is used where it is known, so the body is the same for every host that may share the CDN's copy.
 * Elsewhere it is the address the server itself reports for the request, which a local server gives as `localhost`.
 * Forwarding headers are never read: a client can set them, and this response is cached for other callers.
 */
function siteOrigin(request: Request): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return productionHost ? `https://${productionHost}` : new URL(request.url).origin;
}

function missingSliceMessage(slice: PublicJsonSlice): string {
  if (slice.kind === "model") {
    return `No scored model has the id "${slice.id}"; /api/llm-stats lists the ranked models' ids.`;
  }
  if (slice.kind === "benchmark") {
    return `No portfolio benchmark has the key "${slice.key}"; /api/llm-stats/benchmarks lists every key.`;
  }
  throw new Error(`The ${slice.kind} slice exists in every snapshot`);
}

/** Measure a slice's rows against medians from every published variant, as the leaderboard does. */
function resourceRatios(
  payload: ModelAtlasPayload,
  models: readonly ModelAtlasModel[],
): ResourceRatios[] {
  const portfolio = payload.metadata.scoring.benchmark_portfolio;
  return displayResourceRatios(
    models,
    portfolio,
    resourceRatioReferenceSets(payload.models, portfolio),
  );
}

function publicResourceRatio({
  ratio,
  benchmarkCount,
  sourceCount,
}: ResourceRatioSummary): PublicResourceRatio {
  return { ratio, benchmark_count: benchmarkCount, source_count: sourceCount };
}

/** The snapshot's portfolio benchmarks that the catalog defines, in dashboard order, each with its class in that snapshot. */
function portfolioBenchmarks(
  payload: ModelAtlasPayload,
): { key: BenchmarkKey; class: BenchmarkGroup }[] {
  const portfolio = payload.metadata.scoring.benchmark_portfolio;
  return BENCHMARK_DISPLAY_ORDER.flatMap((key) => {
    const entry = portfolio[key];
    return entry == null ? [] : [{ key, class: entry.group }];
  });
}

/** Fused rows arrive as whole crosswalk rows, so only the evidence fields the row type declares are published. */
function dashboardObservation(
  row: BenchmarkObservationEvidenceRow,
): BenchmarkObservationEvidenceRow {
  const evidence = {
    model_id: row.model_id,
    model: row.model,
    base_model: row.base_model,
    reasoning_effort: row.reasoning_effort,
    canonical_value: row.canonical_value,
    cost: row.cost,
    tokens_per_task: row.tokens_per_task,
    observed_at: row.observed_at,
    task_run_count: row.task_run_count,
    total_cost_usd: row.total_cost_usd,
    total_tokens: row.total_tokens,
  };
  const { metadata } = row;
  if (metadata == null) return evidence;
  return {
    ...evidence,
    metadata: Object.fromEntries(
      DASHBOARD_OBSERVATION_METADATA_KEYS.filter((field) => Object.hasOwn(metadata, field)).map(
        (field) => [field, metadata[field]!],
      ),
    ),
  };
}

function methodologyText(): string {
  return `Model Atlas reports Intelligence, Agentic, Speed, and Value as separate relative 0-100 scores, not task-success probabilities. Each benchmark maps its weakest observed result to 0 and its strongest to 100, with base weight importance × dimension allocation, and each reasoning effort is scored separately. Intelligence and Agentic blend the mean of available frontier benchmark results, weighted at 1.5 times the full portfolio's dimension weight, with assigned aggregate indexes, each weighted by dimension weight times the benchmarks it represents after overlap deductions; ECI counts ${INDEX_REPRESENTED_BENCHMARK_MEDIAN}. Effort-specific indexes count on their effort, model-level indexes on the source-default variant. Intelligence blends a 20% pairwise comparison on shared benchmarks into its frontier mean, reads each index result off the frontier scale at the frontier mean of variants with the same index standing, gives efforts without that index the measured efforts' offset, and takes a bounded Trust Me Bro and Slop correction. Agentic multiplies each benchmark contribution by 0.85-1.15 for token use versus similar-quality peers. A missing benchmark result can be estimated from another effort of the same model plus their weighted gap on at least three shared benchmarks, and enters the benchmark mean; validated estimates from the model's other benchmarks affect evidence support and score retention, but do not enter the benchmark mean. Estimates never fill raw benchmark fields or count toward admission. Scores keep 85% through 1.2 supported benchmark weight, rising smoothly to 100% at 12. Confidence fields report the supported share of portfolio weight, not statistical intervals. Speed and Value compare time and cost per task with nearby-quality models, weighting benchmark task resources 70% and provider speed or price 30%. Speed needs observed time coverage and Value observed cost coverage, each representing four benchmarks at the exact effort; otherwise the score is null. Missing resources use validated same-model effort ratios, then a shrunken global, lab, release-proximity, and model fallback; these estimates are discounted and never satisfy evidence thresholds. Weak peer support pulls a comparison toward 50, and the source-default variant's coverage sets a shared multiplier, zero through 10% and full at 60%. Resource ratios (task_cost_ratio, task_time_ratio, total_token_ratio, and a model's resource_ratios) are descriptive and do not feed Speed or Value: each is the weighted median of observed cost, runtime, or total tokens relative to each benchmark's median, so 1 is typical and lower means less use. Listed models need a qualified, named text-model identity; observed benchmark weight reaching the smallest known index breadth, with each index counting its represented benchmarks and known overlap counted once; observed evidence in both capabilities; two observed indexes or one AA Intelligence or Epoch Capabilities index; and Intelligence and Agentic above 10. Ranked slices rank each model's strongest-Intelligence effort, filling missing benchmark fields from its highest available effort, or with efforts=all rank every reasoning effort separately, and hide OpenAI Pro, Gemini Deep Think, and Claude Mythos configurations; a model's own slice keeps every effort, unranked. Full formulas, examples, and rationales are available at /methodology.`;
}

/** The rows the dashboard table shows in this display, best Intelligence first, each with its competition rank. */
function rankedRows(payload: ModelAtlasPayload, display: LeaderboardDisplay): LeaderboardRow[] {
  const models = modelsForVariantDisplay(
    payload.models,
    display === "variants",
    payload.benchmark_observations,
  );
  const ranks = intelligenceRanks(models);
  return models
    .map((model, index) => ({ model, rank: ranks[index]! }))
    .sort((left, right) => left.rank - right.rank);
}

function byIntelligence(models: readonly ModelAtlasModel[]): ModelAtlasModel[] {
  return [...models].sort(
    (left, right) => right.scores.intelligence_score - left.scores.intelligence_score,
  );
}

function modelScores(model: ModelAtlasModel): ModelScores {
  return {
    score: {
      intelligence: model.scores.intelligence_score,
      agentic: model.scores.agentic_score,
      speed: model.scores.speed_score,
      value: model.scores.value_score,
    },
    confidence: {
      speed: model.confidence.speed,
      value: model.confidence.value,
    },
  };
}

function coreJsonModel(
  model: ModelAtlasModel,
  rank: number,
  ratios: ResourceRatios,
): CoreJsonModel {
  return {
    rank,
    id: model.id,
    name: model.name,
    provider: model.provider,
    reasoning_effort: model.reasoning_effort,
    release_date: model.release_date,
    input_modalities: [...(model.modalities?.input ?? [])],
    output_modalities: [...(model.modalities?.output ?? [])],
    open_weights: model.open_weights,
    intelligence_score: model.scores.intelligence_score,
    agentic_score: model.scores.agentic_score,
    speed_score: model.scores.speed_score,
    speed_confidence: model.confidence.speed,
    value_score: model.scores.value_score,
    value_confidence: model.confidence.value,
    task_cost_ratio: ratios.cost.ratio,
    task_time_ratio: ratios.time.ratio,
    total_token_ratio: ratios.tokens.ratio,
    blended_price: model.cost?.blended_price ?? null,
    context_window_tokens: model.context_window?.context ?? null,
    input_price_per_million_tokens: model.cost?.weighted_input ?? null,
    cache_read_price_per_million_tokens: model.cost?.weighted_cache_read ?? null,
    output_price_per_million_tokens: model.cost?.weighted_output ?? null,
    throughput_tokens_per_second_median: model.speed.throughput_tokens_per_second_median,
    latency_seconds_median: model.speed.latency_seconds_median,
    e2e_latency_seconds_median: model.speed.e2e_latency_seconds_median,
  };
}
