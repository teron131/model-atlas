/** Build stable public JSON views for the Model Atlas stats endpoints. */

import { isPreviewModel, rankedModels } from "../../pipeline/model-types";
import { compactModelVariants, strongestModelVariants } from "../../pipeline/selection/public-list";
import type {
  ModelAtlasLeaderboardRank,
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasPreviewModel,
  ModelAtlasPublishedModel,
  ModelAtlasScores,
} from "../types";

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
  return "Model Atlas reports INTELLIGENCE, AGENTIC, SPEED, and VALUE separately. Models released fewer than 30 days ago may appear as previews before they satisfy official admission; preview quality uses direct observations without quality regularization, while a validated aggregate-index prior may stabilize sparse quality without increasing evidence support. Preview Speed and Value assign 70% to available provider speed or price specifications and 30% to directly observed benchmark task resources, falling back to specifications alone when the matching resource is absent; they use no imputation or missing-coverage regularization, while confidence still reports literal evidence support. Aggregate indexes have normal portfolio importance of 0.5; only index-only previews combine Artificial Analysis, Epoch, Surge, and Vals using represented benchmark breadth, with Epoch derived as the median of the other three indexes. Compact views place previews by Intelligence alongside official models but expose `preview` instead of a numeric rank, so previews do not consume or shift official ranks. Compact views otherwise rank each model by its strongest variant and show the highest available direct effort for missing benchmark fields; the all view stays exact-effort only and exposes no rank. Quality scores normalize and weight direct observations; validated estimates add discounted evidence support and relax regularization without changing the observed benchmark mean. Public confidence fields report literal weighted evidence support, while sparse high quality means are separately regularized toward 50 through 10% of the aggregate-index median evidence breadth and become unadjusted from that median. Each aggregate index can learn separate model-held-out monotonic mappings to broadly observed Intelligence and Agentic task quality; accepted mappings provide an evidence-weighted prior only for an undercovered model family's evidence-leading variant and never add a downward penalty, evidence mass, admission credit, model relationship, or rank bound. Unlabelled family evidence belongs to the source-default variant and does not claim an explicit effort run. A sparse effort score can use the best-observed sibling plus their directly measured common-benchmark gap, without assuming monotonic effort order or filling missing benchmark fields. Other missing values use validated, non-recursive imputation and never satisfy admission. Official SPEED and VALUE assign 70% to benchmark task resources and 30% to provider speed or price inputs, then compare resource use among nearby-quality models after quality adjustment.";
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
  const rankedModels: LeaderboardRow[] = [];
  const sortedModels = [...models].sort(
    (left, right) => right.scores.intelligence_score - left.scores.intelligence_score,
  );
  let previousScore: number | null = null;
  let previousRank = 0;
  for (const [index, model] of sortedModels.entries()) {
    const score = model.scores.intelligence_score;
    const rank = score === previousScore ? previousRank : index + 1;
    rankedModels.push({ model, rank });
    previousScore = score;
    previousRank = rank;
  }
  return rankedModels;
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
