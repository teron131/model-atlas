/** Build stable public JSON views for the Model Atlas stats endpoints, with their serialized bodies and validators. */

import { createHash } from "node:crypto";

import { INDEX_REPRESENTED_BENCHMARK_MEDIAN } from "../../src/model-atlas/benchmarks/index-policy";
import type { BenchmarkObservationEvidenceRow } from "../../src/model-atlas/benchmarks/observation";
import { applyResourceEvidenceRequirements } from "../../src/model-atlas/pipeline/scores/resource-metrics";
import {
  displayResourceRatios,
  type ResourceRatioKind,
  resourceRatioReferenceSets,
  type ResourceRatios,
  type ResourceRatioSummary,
} from "../../src/model-atlas/stats/resource-ratios";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { providerLogo } from "../dashboard/shared/provider-theme";
import { compactModelVariants } from "./model-variants";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "relative_0_100";
const BENCHMARK_SCALE = "decimal";
const DASHBOARD_OBSERVATION_METADATA_KEYS = [
  "observation_role",
  "fusion_collapsed",
  "cost",
  "seconds_per_task",
  "tokens_per_task",
  "output_tokens_per_task",
] as const;

export type ModelAtlasJsonView = "score" | "core" | "benchmarks" | "all" | "dashboard";

type PublicJsonPayload =
  | ScoreJsonPayload
  | CoreJsonPayload
  | BenchmarksJsonPayload
  | FullJsonPayload
  | ModelAtlasPayload;

type SerializedPublicJson = { body: string; etag: string };

const serializedBySnapshot = new WeakMap<
  ModelAtlasPayload,
  {
    /** Each view with site-relative URLs; its hash is the view's validator whichever site origin is asked for. */
    views: Partial<Record<ModelAtlasJsonView, SerializedPublicJson>>;
    /** The dashboard view's body with absolute icon URLs, for the site origin last asked for. */
    dashboard?: { siteOrigin: string; body: string };
  }
>();

type CoreJsonPayload = {
  schema: typeof CORE_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  score_scale: typeof SCORE_SCALE;
  methodology: string;
  columns: string[];
  models: CoreJsonModel[];
};

export type FullJsonPayload = Omit<ModelAtlasPayload, "models" | "benchmark_observations"> & {
  models: PublicFullJsonModel[];
};

type PublicFullJsonModel = Omit<ModelAtlasModel, "reasoning" | "logo"> & {
  resource_ratios: Record<ResourceRatioKind, PublicResourceRatio>;
};

type PublicResourceRatio = {
  ratio: number | null;
  benchmark_count: number;
  source_count: number;
};

type ScoreJsonPayload = {
  schema: typeof SCORE_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  score_scale: typeof SCORE_SCALE;
  methodology: string;
  scores: ScoreJsonModel[];
};

type ScoreJsonModel = {
  rank: number;
  id: string | null;
  name: string | null;
  provider: string | null;
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

type BenchmarksJsonPayload = {
  schema: typeof BENCHMARKS_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  benchmark_scale: typeof BENCHMARK_SCALE;
  methodology: string;
  benchmarks: BenchmarksJsonModel[];
};

type BenchmarksJsonModel = {
  rank: number;
  id: string | null;
  name: string | null;
  provider: string | null;
  benchmarks: Record<string, number | null>;
  benchmark_dates: Record<string, string | null>;
};

type CoreJsonModel = {
  rank: number;
  id: string | null;
  name: string | null;
  provider: string | null;
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
type LeaderboardRow = {
  model: ModelAtlasModel;
  rank: number;
};

/** Bound cached representations to the supported views and canonicalize aliases before serialization. */
export function publicJsonView(view: string | null): ModelAtlasJsonView {
  switch (view) {
    case "full":
      return "all";
    case "all":
    case "dashboard":
    case "core":
    case "benchmarks":
      return view;
    default:
      return "score";
  }
}

/**
 * Keep the default public endpoint loader-friendly; callers opt into heavier table, benchmark, or full views explicitly.
 *
 * `siteOrigin` is the public address the response is served from, such as `https://example.com`; the dashboard view prefixes its icon URLs with it, and without it they stay relative to the site.
 */
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  view: "dashboard",
  siteOrigin?: string,
): ModelAtlasPayload;
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  view: string | null,
  siteOrigin?: string,
): PublicJsonPayload;
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  view: string | null,
  siteOrigin = "",
): PublicJsonPayload {
  payload = {
    ...payload,
    models: payload.models.map((model) =>
      applyResourceEvidenceRequirements(model, payload.metadata.scoring.benchmark_portfolio),
    ),
  };
  switch (publicJsonView(view)) {
    case "dashboard":
      return dashboardJsonPayload(payload, siteOrigin);
    case "all":
      return fullJsonPayload(payload);
    case "core":
      return coreJsonPayload(payload);
    case "benchmarks":
      return benchmarksJsonPayload(payload);
    default:
      return scoreJsonPayload(payload);
  }
}

/**
 * Serialize a view once per snapshot object, so the stats endpoint answers every request for that snapshot from one body and validator.
 *
 * The validator is a hash of the site-relative body, so it changes with the snapshot's data and with the view's shape, and the same snapshot yields the same validator wherever it is asked for.
 * It stays valid for a body with absolute URLs because a validator only ever compares responses for one URL, whose host fixes the origin.
 */
export function serializedPublicJson(
  snapshot: ModelAtlasPayload,
  view: ModelAtlasJsonView,
  siteOrigin = "",
): SerializedPublicJson {
  let serialized = serializedBySnapshot.get(snapshot);
  if (!serialized) {
    serialized = { views: {} };
    serializedBySnapshot.set(snapshot, serialized);
  }
  let relative = serialized.views[view];
  if (!relative) {
    const body = JSON.stringify(publicJsonPayload(snapshot, view));
    relative = { body, etag: `W/"${createHash("sha256").update(body).digest("hex")}"` };
    serialized.views[view] = relative;
  }
  if (view !== "dashboard" || siteOrigin === "") return relative;
  if (serialized.dashboard?.siteOrigin !== siteOrigin) {
    serialized.dashboard = {
      siteOrigin,
      body: JSON.stringify(publicJsonPayload(snapshot, view, siteOrigin)),
    };
  }
  return { body: serialized.dashboard.body, etag: relative.etag };
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
  const { benchmark_observations: observations, ...leaderboard } = payload;
  const dashboard = {
    ...leaderboard,
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

/** The core view is the compact table contract: stable scalar columns without dashboard-only decoration. */
export function coreJsonPayload(payload: ModelAtlasPayload): CoreJsonPayload {
  const rows = compactLeaderboardRows(payload);
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

/** The score view is the default public ranking surface and exposes the four relative scores. */
export function scoreJsonPayload(payload: ModelAtlasPayload): ScoreJsonPayload {
  const rows = compactLeaderboardRows(payload);
  return {
    schema: SCORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    scores: rows.map(({ model, rank }) => scoreJsonModel(model, rank)),
  };
}

/** Benchmark rows stay in their native decimal scale so downstream users can distinguish raw task scores from Atlas scores. */
export function benchmarksJsonPayload(payload: ModelAtlasPayload): BenchmarksJsonPayload {
  const rows = compactLeaderboardRows(payload);
  return {
    schema: BENCHMARKS_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    benchmark_scale: BENCHMARK_SCALE,
    methodology: methodologyText(),
    benchmarks: rows.map(({ model, rank }) => benchmarksJsonModel(model, rank)),
  };
}

/** Preserve every scored variant for power users while removing fields that only make sense in the rendered dashboard. */
export function fullJsonPayload(payload: ModelAtlasPayload): FullJsonPayload {
  const { benchmark_observations: _benchmarkObservations, models, ...publicPayload } = payload;
  const ratios = resourceRatios(payload, models);
  return {
    ...publicPayload,
    models: models.map(({ logo: _logo, reasoning: _reasoning, ...model }, index) => {
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

/** Measure a view's rows against medians from every published variant, as the leaderboard does. */
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
  return `Model Atlas reports Intelligence, Agentic, Speed, and Value as separate relative 0-100 scores, not task-success probabilities. Each benchmark maps its weakest observed result to 0 and its strongest to 100, with base weight importance × dimension allocation, and each reasoning effort is scored separately. Intelligence and Agentic blend the mean of available frontier benchmark results, weighted at 1.5 times the full portfolio's dimension weight, with assigned aggregate indexes, each weighted by dimension weight times the benchmarks it represents after overlap deductions; ECI counts ${INDEX_REPRESENTED_BENCHMARK_MEDIAN}. Effort-specific indexes count on their effort, model-level indexes on the source-default variant. Intelligence blends a 20% pairwise comparison on shared benchmarks into its frontier mean, reads each index result off the frontier scale at the frontier mean of variants with the same index standing, gives efforts without that index the measured efforts' offset, and takes a bounded Trust Me Bro and Slop correction. Agentic multiplies each benchmark contribution by 0.85-1.15 for token use versus similar-quality peers. A missing benchmark result can be estimated from another effort of the same model plus their weighted gap on at least three shared benchmarks, and enters the benchmark mean; validated estimates from the model's other benchmarks affect evidence support and score retention, but do not enter the benchmark mean. Estimates never fill raw benchmark fields or count toward admission. Scores keep 85% through 1.2 supported benchmark weight, rising smoothly to 100% at 12. Confidence fields report the supported share of portfolio weight, not statistical intervals. Speed and Value compare time and cost per task with nearby-quality models, weighting benchmark task resources 70% and provider speed or price 30%. Speed needs observed time coverage and Value observed cost coverage, each representing four benchmarks at the exact effort; otherwise the score is null. Missing resources use validated same-model effort ratios, then a shrunken global, lab, release-proximity, and model fallback; these estimates are discounted and never satisfy evidence thresholds. Weak peer support pulls a comparison toward 50, and the source-default variant's coverage sets a shared multiplier, zero through 10% and full at 60%. Resource ratios (task_cost_ratio, task_time_ratio, total_token_ratio, and the all view's resource_ratios) are descriptive and do not feed Speed or Value: each is the weighted median of observed cost, runtime, or total tokens relative to each benchmark's median, so 1 is typical and lower means less use. Listed models need a qualified, named text-model identity; observed benchmark weight reaching the smallest known index breadth, with each index counting its represented benchmarks and known overlap counted once; observed evidence in both capabilities; two observed indexes or one AA Intelligence or Epoch Capabilities index; and Intelligence and Agentic above 10. Compact views rank each model's strongest-Intelligence effort, fill missing benchmark fields from its highest available effort, and hide OpenAI Pro, Gemini Deep Think, and Claude Mythos configurations; the all view keeps every effort, unranked. Full formulas, examples, and rationales are available at /methodology.`;
}

/** Compact variants, then assign competition ranks: tied Intelligence scores share a rank and leave the next ordinal gap. */
function compactLeaderboardRows(payload: ModelAtlasPayload): LeaderboardRow[] {
  const models = compactModelVariants(payload.models, payload.benchmark_observations);
  const rows: LeaderboardRow[] = [];
  const sortedModels = [...models].sort(
    (left, right) => right.scores.intelligence_score - left.scores.intelligence_score,
  );
  let previousScore: number | null = null;
  let previousRank = 0;
  for (const [index, model] of sortedModels.entries()) {
    const score = model.scores.intelligence_score;
    const rank = score === previousScore ? previousRank : index + 1;
    rows.push({ model, rank });
    previousScore = score;
    previousRank = rank;
  }
  return rows;
}

function scoreJsonModel(model: ModelAtlasModel, rank: number): ScoreJsonModel {
  return {
    rank,
    id: model.id,
    name: model.name,
    provider: model.provider,
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

function benchmarksJsonModel(model: ModelAtlasModel, rank: number): BenchmarksJsonModel {
  return {
    rank,
    id: model.id,
    name: model.name,
    provider: model.provider,
    benchmarks: Object.fromEntries(
      Object.entries(model.benchmarks ?? {}).map(([key, value]) => [key, value ?? null]),
    ),
    benchmark_dates: Object.fromEntries(
      Object.keys(model.benchmarks ?? {}).map((key) => [key, model.benchmark_dates?.[key] ?? null]),
    ),
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
