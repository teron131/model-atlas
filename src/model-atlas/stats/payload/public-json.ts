/** Build stable public JSON views for the Model Atlas stats endpoints. */

import { compactModelVariants } from "../../pipeline/selection/public-list";
import type { ModelAtlasModel, ModelAtlasPayload } from "../types";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "percentage";
const BENCHMARK_SCALE = "decimal";

export type ModelAtlasJsonView = "score" | "core" | "benchmarks" | "all" | "full" | "dashboard";

type PublicJsonPayload =
  | ScoreJsonPayload
  | CoreJsonPayload
  | BenchmarksJsonPayload
  | FullJsonPayload
  | ModelAtlasPayload;

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

type PublicFullJsonModel = Omit<ModelAtlasModel, "reasoning" | "logo">;

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
  blended_price: number | null;
  context_window_tokens: number | null;
  effective_input_price_per_million_tokens: number | null;
  effective_output_price_per_million_tokens: number | null;
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
  "blended_price",
  "context_window_tokens",
  "effective_input_price_per_million_tokens",
  "effective_output_price_per_million_tokens",
  "throughput_tokens_per_second_median",
  "latency_seconds_median",
  "e2e_latency_seconds_median",
] as const;

type RankedModel = {
  model: ModelAtlasModel;
  rank: number;
};

/** Keep the default public endpoint loader-friendly; callers opt into heavier table, benchmark, or full views explicitly. */
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  view: string | null,
): PublicJsonPayload {
  switch (view) {
    case "dashboard":
      return payload;
    case "all":
    case "full":
      return fullJsonPayload(payload);
    case "core":
      return coreJsonPayload(payload);
    case "benchmarks":
      return benchmarksJsonPayload(payload);
    default:
      return scoreJsonPayload(payload);
  }
}

/** The core view is the compact table contract: stable scalar columns without dashboard-only decoration. */
export function coreJsonPayload(payload: ModelAtlasPayload): CoreJsonPayload {
  const rankedModels = compactRankedModels(payload);
  return {
    schema: CORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    columns: [...CORE_MODEL_COLUMNS],
    models: rankedModels.map(({ model, rank }) => coreJsonModel(model, rank)),
  };
}

/** The score view is the default public ranking surface and exposes only Atlas 0-100 score fields. */
export function scoreJsonPayload(payload: ModelAtlasPayload): ScoreJsonPayload {
  const rankedModels = compactRankedModels(payload);
  return {
    schema: SCORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    scores: rankedModels.map(({ model, rank }) => scoreJsonModel(model, rank)),
  };
}

/** Benchmark rows stay in their native decimal scale so downstream users can distinguish raw task scores from Atlas scores. */
export function benchmarksJsonPayload(payload: ModelAtlasPayload): BenchmarksJsonPayload {
  const rankedModels = compactRankedModels(payload);
  return {
    schema: BENCHMARKS_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    benchmark_scale: BENCHMARK_SCALE,
    methodology: methodologyText(),
    benchmarks: rankedModels.map(({ model, rank }) => benchmarksJsonModel(model, rank)),
  };
}

/** Preserve every scored variant for power users while removing fields that only make sense in the rendered dashboard. */
export function fullJsonPayload(payload: ModelAtlasPayload): FullJsonPayload {
  const { benchmark_observations: _benchmarkObservations, models, ...publicPayload } = payload;
  return {
    ...publicPayload,
    models: models.map(({ logo: _logo, reasoning: _reasoning, ...model }) => model),
  };
}

function methodologyText(): string {
  return "Model Atlas reports INTELLIGENCE, AGENTIC, SPEED, and VALUE separately. Compact views rank each model by its strongest variant and show the highest available direct effort for missing benchmark fields; the all view stays exact-effort only. Quality scores normalize and weight selected benchmarks, then apply validation-weighted evidence confidence. Observed efforts bound missing sibling scoring proxies to offset confidence bias toward sparsely measured efforts without changing stored results. Other missing values use validated, non-recursive imputation and never satisfy admission. SPEED and VALUE compare resource use among nearby-quality models.";
}

function compactRankedModels(payload: ModelAtlasPayload): RankedModel[] {
  return rankModelsByIntelligence(
    compactModelVariants(payload.models, payload.benchmark_observations),
  );
}

/** Use competition ranking semantics: tied intelligence scores share a rank and leave the next ordinal gap. */
function rankModelsByIntelligence(models: ModelAtlasModel[]): RankedModel[] {
  const rankedModels: RankedModel[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;
  for (const [index, model] of models.entries()) {
    const score = model.scores.intelligence_score;
    const rank = score === previousScore ? previousRank : index + 1;
    rankedModels.push({ model, rank });
    previousScore = score;
    previousRank = rank;
  }
  return rankedModels;
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

function coreJsonModel(model: ModelAtlasModel, rank: number): CoreJsonModel {
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
    blended_price: model.cost?.blended_price ?? null,
    context_window_tokens: model.context_window?.context ?? null,
    effective_input_price_per_million_tokens: model.cost?.weighted_input ?? null,
    effective_output_price_per_million_tokens: model.cost?.weighted_output ?? null,
    throughput_tokens_per_second_median: model.speed.throughput_tokens_per_second_median,
    latency_seconds_median: model.speed.latency_seconds_median,
    e2e_latency_seconds_median: model.speed.e2e_latency_seconds_median,
  };
}
