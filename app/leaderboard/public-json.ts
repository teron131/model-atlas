/** Build stable public JSON views for the Model Atlas stats endpoints. */

import { strongestModelVariants } from "../../src/model-atlas/stats/model-variants";
import { isPreviewModel, rankedModels } from "../../src/model-atlas/stats/types";
import type {
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasPreviewModel,
  ModelAtlasPublishedModel,
  ModelAtlasScores,
} from "../../src/model-atlas/stats/types";
import { compactModelVariants } from "./model-variants";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "percentage";
const BENCHMARK_SCALE = "decimal";

export type ModelAtlasJsonView = "score" | "core" | "benchmarks" | "all" | "full" | "dashboard";

export type ModelAtlasLeaderboardRank = number | "preview";

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

type PublicFullJsonModel = Omit<ModelAtlasPublishedModel, "reasoning" | "logo">;

type ScoreJsonPayload = {
  schema: typeof SCORE_SCHEMA;
  fetched_at_epoch_seconds: number | null;
  score_scale: typeof SCORE_SCALE;
  methodology: string;
  scores: ScoreJsonModel[];
};

type ScoreJsonModel = {
  rank: ModelAtlasLeaderboardRank;
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
  rank: ModelAtlasLeaderboardRank;
  id: string | null;
  name: string | null;
  provider: string | null;
  benchmarks: Record<string, number | null>;
  benchmark_dates: Record<string, string | null>;
};

type CoreJsonModel = {
  rank: ModelAtlasLeaderboardRank;
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

type PreviewLeaderboardModel = ModelAtlasPreviewModel & { scores: ModelAtlasScores };
type LeaderboardModel = ModelAtlasModel | PreviewLeaderboardModel;

type LeaderboardRow = {
  model: LeaderboardModel;
  rank: ModelAtlasLeaderboardRank;
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

/** Keep the default public endpoint loader-friendly; callers opt into heavier table, benchmark, or full views explicitly. */
export function publicJsonPayload(
  payload: ModelAtlasPayload,
  view: string | null,
): PublicJsonPayload {
  switch (publicJsonView(view)) {
    case "dashboard":
      return payload;
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

/** The core view is the compact table contract: stable scalar columns without dashboard-only decoration. */
export function coreJsonPayload(payload: ModelAtlasPayload): CoreJsonPayload {
  const rows = compactLeaderboardRows(payload);
  return {
    schema: CORE_SCHEMA,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    score_scale: SCORE_SCALE,
    methodology: methodologyText(),
    columns: [...CORE_MODEL_COLUMNS],
    models: rows.map(({ model, rank }) => coreJsonModel(model, rank)),
  };
}

/** The score view is the default public ranking surface and exposes only Atlas 0-100 score fields. */
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
  return {
    ...publicPayload,
    models: models.map(({ logo: _logo, reasoning: _reasoning, ...model }) => model),
  };
}

function methodologyText(): string {
  return "Model Atlas reports Intelligence, Agentic, Speed, and Value separately on 0-100 scales. These are comparative scores, not task-success probabilities. Direct benchmark results are normalized within their observed range and weighted by importance × dimension loading. Validated estimates add discounted evidence support and can relax sparse-score regularization without changing the observed benchmark mean; they never satisfy admission. Public confidence fields report literal weighted evidence support, not statistical confidence intervals. When a model has an observed aggregate index but incomplete direct task coverage, its quality mean weights index scores by represented breadth: Artificial Analysis 9, Epoch 8, Surge 8, and Vals 7. Task benchmarks keep their ordinary weights. Index breadth does not add independent observations or inflate evidence support. At complete task coverage, indexes return to importance 0.5 and their configured dimension loadings. Other ordinary high quality means are regularized toward 50 until effective evidence reaches the aggregate-index median breadth; means below 50 are not raised. Reasoning efforts retain their own results. A sparse effort can use a broadly measured sibling's score plus its measured gap on at least three common benchmarks, without filling benchmark fields, increasing support, or assuming higher effort always wins. Agentic can multiply a matched benchmark contribution by 0.85-1.15 according to direct token use versus independent peers at similar quality, then remaps the contribution to 0-100. The cap applies before remapping, not to the final score change. Missing token evidence is neutral; Artificial Analysis aggregate tokens apply only to its own index. Ordinary Speed and Value assign 70% of base weight to benchmark task resources and 30% to provider speed or price, then compare resource use among nearby-quality models. Weak peer support pulls each comparison toward 50. Estimated inputs receive discounted weight, and the source-default variant supplies the shared model coverage multiplier: zero through 10% and full at 60% coverage. Each effort still reports its own evidence share. Ordinary admission needs a complete basic profile, broad observed benchmark coverage, at least two index signals, and Intelligence and Agentic scores of at least 10. It has no minimum release age. Previews cover two cases: released models younger than 30 days with a complete profile but incomplete benchmark coverage, or models with full observed benchmark coverage but incomplete metadata. Both need an identified text model and the same quality floor; sparse evidence and incomplete metadata together do not qualify. Preview resources use 70% available provider specifications and 30% direct task resources, falling back to specifications alone when task resources are absent. With no usable specification, the resource score stays unavailable. Preview resource scores use no imputation or coverage multiplier. Compact views rank the strongest-Intelligence model representative and show the highest available direct effort for missing benchmark fields. Eligible previews appear alongside official models with a preview label instead of a numeric rank; they do not shift official ranks. The all view preserves exact efforts and has no rank. Full formulas, examples, and rationales are available at /methodology.";
}

function compactLeaderboardRows(payload: ModelAtlasPayload): LeaderboardRow[] {
  const officialModels = compactModelVariants(
    rankedModels(payload.models),
    payload.benchmark_observations,
  );
  const previewModels = strongestModelVariants(payload.models.filter(isPreviewLeaderboardModel));
  const rows: LeaderboardRow[] = [
    ...rankModelsByIntelligence(officialModels),
    ...previewModels.map((model) => ({ model, rank: "preview" as const })),
  ];
  return rows.sort(
    (left, right) => right.model.scores.intelligence_score - left.model.scores.intelligence_score,
  );
}

/** Use competition ranking semantics: tied intelligence scores share a rank and leave the next ordinal gap. */
function rankModelsByIntelligence(models: readonly ModelAtlasModel[]): LeaderboardRow[] {
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

function isPreviewLeaderboardModel(
  model: ModelAtlasPublishedModel,
): model is PreviewLeaderboardModel {
  return (
    isPreviewModel(model) &&
    typeof model.scores.intelligence_score === "number" &&
    Number.isFinite(model.scores.intelligence_score) &&
    typeof model.scores.agentic_score === "number" &&
    Number.isFinite(model.scores.agentic_score)
  );
}

function scoreJsonModel(model: LeaderboardModel, rank: ModelAtlasLeaderboardRank): ScoreJsonModel {
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

function benchmarksJsonModel(
  model: LeaderboardModel,
  rank: ModelAtlasLeaderboardRank,
): BenchmarksJsonModel {
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

function coreJsonModel(model: LeaderboardModel, rank: ModelAtlasLeaderboardRank): CoreJsonModel {
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
