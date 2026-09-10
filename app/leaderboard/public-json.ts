/** Build stable public JSON views for the Model Atlas stats endpoints. */

import { applyResourceEvidenceRequirements } from "../../src/model-atlas/pipeline/scores/resource-metrics";
import type {
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasPublishedModel,
} from "../../src/model-atlas/stats/types";
import { compactModelVariants } from "./model-variants";

const SCORE_SCHEMA = "model_atlas.score";
const CORE_SCHEMA = "model_atlas.core";
const BENCHMARKS_SCHEMA = "model_atlas.benchmarks";
const SCORE_SCALE = "percentage";
const BENCHMARK_SCALE = "decimal";

export type ModelAtlasJsonView = "score" | "core" | "benchmarks" | "all" | "full" | "dashboard";

export type ModelAtlasLeaderboardRank = number;

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
type LeaderboardModel = ModelAtlasModel;

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
  payload = {
    ...payload,
    models: payload.models.map((model) =>
      applyResourceEvidenceRequirements(model, payload.metadata.scoring.benchmark_portfolio),
    ),
  };
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
  return "Model Atlas reports Intelligence, Agentic, Speed, and Value separately on 0-100 scales. These are comparative scores, not task-success probabilities. Direct benchmark results are normalized within their observed range and weighted by importance × dimension loading. Validated contextual estimates add discounted evidence support and can relax sparse-score regularization. Supported sibling estimates also enter missing task contributions in quality scores; no estimate satisfies admission. Public confidence fields report literal weighted evidence support, not statistical confidence intervals. When a model has an eligible observed aggregate index, quality blends its task mean and index mean. Effort-labelled variants use indexes with direct effort coverage, currently Artificial Analysis and CAIS; other index results remain table and admission evidence. Task influence starts at 20% with one direct task and rises smoothly to 80% at the configured direct-task threshold; indexes carry the remainder. With no direct tasks, indexes carry 100%. Each variant and dimension counts only its own direct tasks, excluding indexes and imputation. Task weights combine importance and dimension loading; index weights also include represented breadth. Adding missing tasks to the portfolio does not move the threshold. Index breadth does not create direct task observations or inflate displayed evidence support; it supplies represented coverage for admission. Other high quality means are regularized toward 50 until effective evidence reaches the aggregate-index median breadth; means below 50 are not raised. Reasoning efforts retain their own results. A missing quality task can use a sibling's direct result plus the weighted gap on at least three directly shared tasks. Donors are chosen by effective overlap, then effort proximity. Estimates enter the task mean before index blending, without filling raw benchmark fields, increasing evidence support, advancing the direct-task taper, or assuming higher effort always wins. No whole-score sibling adjustment follows. Agentic can multiply a matched benchmark contribution by 0.85-1.15 according to measured or confidence-discounted estimated token use versus directly measured independent peers at similar quality, then remaps the contribution to 0-100. The cap applies before remapping, not to the final score change. Unsupported missing token evidence is neutral; token estimates use the same validated ratio and tiered fallback policies as cost and time, keep totals separate from output-only counts, and cannot become peer evidence or move normalization anchors; Artificial Analysis aggregate tokens apply only to its own index. Value requires observed cost-and-quality coverage representing four benchmarks at the exact effort. AA contributes its catalogued breadth only with its own observed quality and resource; separately counted AA components are deducted for each resource. Variants below the required cost coverage remain in the quality-qualified table but are excluded from all graphs. Speed independently requires observed time-and-quality coverage representing four benchmarks at the exact effort, including residual AA breadth; estimated runtimes and provider speed do not count. Insufficient runtime evidence leaves Speed unavailable without suppressing eligible Value. Speed and Value assign 70% of base weight to benchmark task resources and 30% to provider speed or price, then compare resource use among nearby-quality models. Resource expectations blend a stable local trend with the peer average as support grows. The trend is evaluated at the nearest observed peer quality and bounded by observed resource amounts, avoiding unsupported extrapolation and boundary jumps. Benchmark resources require benchmark-specific telemetry; source-wide averages cannot fill missing tasks. Linear quality spread floors scale with the observed reference range, while logit coordinates retain a fixed log-odds floor. Missing costs, times, and token counts first use separately validated same-model effort ratios, then the same fixed-shrinkage global/lab/release-proximity/model fallback with at least two independent donors. Total-token and output-token estimates remain separate. Lab corrections use shrinkage 16; same-lab release proximity uses a 60-day Gaussian width; release and model corrections use shrinkage 4. Estimated resources remain discounted and do not satisfy observed-evidence thresholds. Throughput-based runtime proxies require output tokens; total tokens cannot replace output tokens. Independently learned runtime estimates use measured seconds. Weighted quantiles retain tied observation mass. Weak peer support pulls each comparison toward 50. Estimated inputs receive discounted weight, and the source-default variant supplies the shared model coverage multiplier: zero through 10% and full at 60% coverage. Each effort still reports its own evidence share. Admission needs a qualified named text-model identity, observed represented benchmark weight reaching the minimum known benchmark breadth across the selected indexes, excluding Epoch's inferred breadth, an observed input in each capability dimension, and Intelligence and Agentic scores of at least 10. Standalone tasks contribute their importance; indexes contribute represented breadth without the scoring-importance discount. Known components count once across indexes and standalone observations, while unmapped index breadth remains estimated. AA contributes only its main Intelligence Index. No particular index, index count, or release age is required. Missing specifications remain null without affecting rank eligibility. There is no release-age exception for insufficient evidence. AA specialist subindexes do not qualify. Compact views rank the strongest-Intelligence model representative and show the highest available direct effort for missing benchmark fields. All admitted models receive numeric ranks, including models with missing specifications. The all view preserves exact efforts and has no rank. Full formulas, examples, and rationales are available at /methodology.";
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
