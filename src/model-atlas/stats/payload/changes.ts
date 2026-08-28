/** Material change derivation owns the bounded score, rank, cause, and benchmark-alignment trail exposed by the leaderboard. */

import { BENCHMARK_LABELS } from "../../benchmarks/catalog";
import { rankedModels } from "../../pipeline/model-types";
import { benchmarkMetricValue } from "../../pipeline/scores/resource-metrics";
import { stableJson } from "../../runtime";
import type {
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasMetadata,
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoreDimension,
} from "../types";

export type RefreshRunRow = {
  refresh_id: number;
  previous_refresh_id: number | null;
  methodology_changed: boolean;
  model_change_count: number;
  score_change_count: number;
};

export type ModelScoreChangeRow = ModelAtlasScoreChange & {
  model_id: string;
  reasoning_effort: string;
};

type RefreshChanges = {
  models: ModelAtlasModel[];
  refreshRunRows: readonly RefreshRunRow[];
  modelScoreChangeRows: readonly ModelScoreChangeRow[];
};

type DimensionPolicy = {
  dimension: ModelAtlasScoreDimension;
  scoreKey: keyof ModelAtlasModel["scores"];
  confidenceKey: keyof ModelAtlasModel["confidence"];
};

const DIMENSIONS: readonly DimensionPolicy[] = [
  {
    dimension: "intelligence",
    scoreKey: "intelligence_score",
    confidenceKey: "intelligence",
  },
  { dimension: "agentic", scoreKey: "agentic_score", confidenceKey: "agentic" },
  { dimension: "speed", scoreKey: "speed_score", confidenceKey: "speed" },
  { dimension: "value", scoreKey: "value_score", confidenceKey: "value" },
];

const DIMENSION_ORDER = new Map(DIMENSIONS.map(({ dimension }, index) => [dimension, index]));
const MATERIAL_SCORE_DELTA = 0.5;
const MATERIAL_RELATIVE_RANK_DELTA = 0.25;
const MATERIAL_SUPPORT_DELTA = 10;
const MIN_RANK_CORRELATION = 0.3;
const MIN_RANK_CORRELATION_MODELS = 5;

/** Record only material adjacent changes while retaining the last material event across quiet refreshes. */
export function buildRefreshChanges(
  refreshId: number,
  previousPayload: ModelAtlasPayload | null | undefined,
  currentModels: readonly ModelAtlasModel[],
  currentScoring: ModelAtlasMetadata["scoring"],
): RefreshChanges {
  const previousModels = rankedModels(previousPayload?.models ?? []);
  const methodologyChanged =
    previousPayload != null &&
    stableJson(scoringMethodology(previousPayload.metadata.scoring)) !==
      stableJson(scoringMethodology(currentScoring));
  const previousByIdentity = new Map(
    previousModels.flatMap((model) => {
      const identity = modelIdentity(model);
      return identity == null ? [] : [[identity, model] as const];
    }),
  );
  const currentIdentitySet = new Set(
    currentModels.flatMap((model) => {
      const identity = modelIdentity(model);
      return identity == null ? [] : [identity];
    }),
  );
  const stableIdentitySet = new Set(
    [...previousByIdentity.keys()].filter((identity) => currentIdentitySet.has(identity)),
  );
  const previousStableRanks = scoreRanks(
    previousModels.filter((model) => {
      const identity = modelIdentity(model);
      return identity != null && stableIdentitySet.has(identity);
    }),
  );
  const currentStableRanks = scoreRanks(
    currentModels.filter((model) => {
      const identity = modelIdentity(model);
      return identity != null && stableIdentitySet.has(identity);
    }),
  );
  const currentRanks = scoreRanks(currentModels);
  const modelScoreChangeRows: ModelScoreChangeRow[] = [];
  const primaryChangeByIdentity = new Map<string, ModelAtlasScoreChange>();

  if (previousPayload != null) {
    for (const model of currentModels) {
      const identity = modelIdentity(model);
      if (identity == null || model.id == null) {
        continue;
      }
      const previousModel = previousByIdentity.get(identity);
      const changes = DIMENSIONS.flatMap((policy) => {
        const rankKey = rankIdentity(identity, policy.dimension);
        const change = scoreChange(
          refreshId,
          model,
          previousModel,
          policy,
          previousModel == null ? null : (previousStableRanks.get(rankKey) ?? null),
          previousModel == null
            ? (currentRanks.get(rankKey) ?? null)
            : (currentStableRanks.get(rankKey) ?? null),
          currentScoring,
          methodologyChanged,
          currentModels,
        );
        return change == null ? [] : [change];
      });
      for (const change of changes) {
        modelScoreChangeRows.push({
          ...change,
          model_id: model.id,
          reasoning_effort: model.reasoning_effort ?? "",
        });
      }
      const primaryChange = [...changes].sort(compareChangeImpact)[0];
      if (primaryChange != null) {
        primaryChangeByIdentity.set(identity, primaryChange);
      }
    }
  }

  const models = currentModels.map((model) => {
    const identity = modelIdentity(model);
    const previousChange =
      identity == null ? null : previousByIdentity.get(identity)?.latest_change;
    return {
      ...model,
      latest_change:
        identity == null ? null : (primaryChangeByIdentity.get(identity) ?? previousChange ?? null),
    };
  });
  const changedModelCount = new Set(
    modelScoreChangeRows.map(
      ({ model_id, reasoning_effort }) => `${model_id}\u0000${reasoning_effort}`,
    ),
  ).size;
  return {
    models,
    refreshRunRows: [
      {
        refresh_id: refreshId,
        previous_refresh_id: previousPayload?.fetched_at_epoch_seconds ?? null,
        methodology_changed: methodologyChanged,
        model_change_count: changedModelCount,
        score_change_count: modelScoreChangeRows.length,
      },
    ],
    modelScoreChangeRows,
  };
}

/** Emit a material public score change only when score, stable-cohort rank, or evidence support crosses policy, then attach bounded explanations. */
function scoreChange(
  refreshId: number,
  current: ModelAtlasModel,
  previous: ModelAtlasModel | undefined,
  policy: DimensionPolicy,
  rankBefore: number | null,
  rankAfter: number | null,
  scoring: ModelAtlasMetadata["scoring"],
  methodologyChanged: boolean,
  currentModels: readonly ModelAtlasModel[],
): ModelAtlasScoreChange | null {
  const scoreBefore = visibleScore(previous?.scores[policy.scoreKey]);
  const scoreAfter = visibleScore(current.scores[policy.scoreKey]);
  if (scoreAfter == null) {
    return null;
  }
  const scoreDelta = scoreBefore == null ? null : visibleScore(scoreAfter - scoreBefore);
  const scoreChanged = scoreBefore == null || scoreBefore !== scoreAfter;
  const rankChanged = rankBefore !== rankAfter;
  const confidenceBefore = visibleConfidence(previous?.confidence[policy.confidenceKey]);
  const confidenceAfter = visibleConfidence(current.confidence[policy.confidenceKey]);
  if (!scoreChanged && !rankChanged && confidenceBefore === confidenceAfter) {
    return null;
  }
  const change: ModelAtlasScoreChange = {
    refresh_id: refreshId,
    dimension: policy.dimension,
    score_before: scoreBefore,
    score_after: scoreAfter,
    score_delta: scoreDelta,
    rank_before: rankBefore,
    rank_after: rankAfter,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
    causes: [],
    rank_drivers: [],
  };
  if (!isMaterialChange(change)) {
    return null;
  }
  return {
    ...change,
    causes: changeCauses(
      current,
      previous,
      policy.dimension,
      rankBefore,
      rankAfter,
      scoring,
      methodologyChanged,
    ),
    rank_drivers: rankDriversForModel(current, currentModels, policy, scoring),
  };
}

function isMaterialChange(change: ModelAtlasScoreChange): boolean {
  if (change.score_before == null) {
    return true;
  }
  if (Math.abs(change.score_delta ?? 0) >= MATERIAL_SCORE_DELTA) {
    return true;
  }
  if (change.rank_before != null && change.rank_after != null) {
    if (
      change.rank_before !== change.rank_after &&
      (change.rank_before === 1 || change.rank_after === 1)
    ) {
      return true;
    }
    if (
      Math.abs(change.rank_after - change.rank_before) /
        Math.min(change.rank_before, change.rank_after) >=
      MATERIAL_RELATIVE_RANK_DELTA
    ) {
      return true;
    }
  }
  return (
    change.confidence_before != null &&
    change.confidence_after != null &&
    Math.abs(change.confidence_after - change.confidence_before) >= MATERIAL_SUPPORT_DELTA
  );
}

/** Identify up to three benchmarks whose population rank tracks the current dimension, using one strongest effort variant per model. */
function rankDriversForModel(
  current: ModelAtlasModel,
  currentModels: readonly ModelAtlasModel[],
  policy: DimensionPolicy,
  scoring: ModelAtlasMetadata["scoring"],
): ModelAtlasBenchmarkRankDriver[] {
  if (
    current.id == null ||
    (policy.dimension !== "intelligence" && policy.dimension !== "agentic")
  ) {
    return [];
  }
  const keys =
    policy.dimension === "intelligence"
      ? scoring.intelligence_benchmark_keys
      : scoring.agentic_benchmark_keys;
  const population = oneVariantPerModelPopulation(currentModels, current, policy.scoreKey);
  return keys
    .flatMap((benchmarkKey) => {
      const observations = population.flatMap((model) => {
        const score = finiteNumber(model.scores[policy.scoreKey]);
        const benchmark = benchmarkMetricValue(model, benchmarkKey);
        return model.id == null || score == null || benchmark == null
          ? []
          : [{ modelId: model.id, score, benchmark }];
      });
      if (observations.length < MIN_RANK_CORRELATION_MODELS) {
        return [];
      }
      const target = observations.find(({ modelId }) => modelId === current.id);
      if (target == null) {
        return [];
      }
      const correlation = spearmanRankCorrelation(
        observations.map(({ score }) => score),
        observations.map(({ benchmark }) => benchmark),
      );
      if (correlation == null || correlation < MIN_RANK_CORRELATION) {
        return [];
      }
      return [
        {
          benchmark_key: benchmarkKey,
          label: benchmarkLabel(benchmarkKey),
          benchmark_rank: competitionRank(
            observations.map(({ benchmark }) => benchmark),
            target.benchmark,
          ),
          benchmark_model_count: observations.length,
          rank_correlation: Math.round(correlation * 100) / 100,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.rank_correlation - left.rank_correlation ||
        left.benchmark_rank - right.benchmark_rank ||
        left.benchmark_key.localeCompare(right.benchmark_key),
    )
    .slice(0, 3);
}

function oneVariantPerModelPopulation(
  models: readonly ModelAtlasModel[],
  target: ModelAtlasModel,
  scoreKey: keyof ModelAtlasModel["scores"],
): ModelAtlasModel[] {
  const byModelId = new Map<string, ModelAtlasModel>();
  for (const model of models) {
    if (model.id == null) {
      continue;
    }
    const selected = byModelId.get(model.id);
    if (
      model === target ||
      selected == null ||
      (selected !== target &&
        (finiteNumber(model.scores[scoreKey]) ?? Number.NEGATIVE_INFINITY) >
          (finiteNumber(selected.scores[scoreKey]) ?? Number.NEGATIVE_INFINITY))
    ) {
      byModelId.set(model.id, model);
    }
  }
  return [...byModelId.values()];
}

function spearmanRankCorrelation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) {
    return null;
  }
  const leftRanks = averageRanks(left);
  const rightRanks = averageRanks(right);
  const leftMean = leftRanks.reduce((sum, value) => sum + value, 0) / leftRanks.length;
  const rightMean = rightRanks.reduce((sum, value) => sum + value, 0) / rightRanks.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (const [index, leftRank] of leftRanks.entries()) {
    const leftOffset = leftRank - leftMean;
    const rightOffset = (rightRanks[index] ?? rightMean) - rightMean;
    covariance += leftOffset * rightOffset;
    leftVariance += leftOffset * leftOffset;
    rightVariance += rightOffset * rightOffset;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : covariance / denominator;
}

function averageRanks(values: number[]): number[] {
  const indexes = values
    .map((_, index) => index)
    .sort((left, right) => values[right]! - values[left]!);
  const ranks = Array<number>(values.length);
  for (let start = 0; start < indexes.length;) {
    let end = start + 1;
    while (end < indexes.length && values[indexes[end]!] === values[indexes[start]!]) {
      end += 1;
    }
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) {
      ranks[indexes[index]!] = averageRank;
    }
    start = end;
  }
  return ranks;
}

function competitionRank(values: number[], target: number): number {
  return 1 + values.filter((value) => value > target).length;
}

/** Explain a material score change with bounded rank, methodology, evidence, and coverage causes, falling back to relative peer movement. */
function changeCauses(
  current: ModelAtlasModel,
  previous: ModelAtlasModel | undefined,
  dimension: ModelAtlasScoreDimension,
  rankBefore: number | null,
  rankAfter: number | null,
  scoring: ModelAtlasMetadata["scoring"],
  methodologyChanged: boolean,
): ModelAtlasScoreChangeCause[] {
  if (previous == null) {
    return [
      {
        kind: "model",
        label:
          rankAfter === 1 ? "New model entered at #1" : `New model entered at #${rankAfter ?? "—"}`,
      },
    ];
  }
  const causes: ModelAtlasScoreChangeCause[] = [];
  const rankCause = stableRankCause(rankBefore, rankAfter);
  if (rankCause != null) {
    causes.push(rankCause);
  }
  if (methodologyChanged) {
    causes.push({ kind: "methodology", label: "Scoring methodology changed" });
  }
  const evidenceLabels = changedEvidenceLabels(current, previous, dimension, scoring);
  if (evidenceLabels.length > 0) {
    const visibleLabels = evidenceLabels.slice(0, 2);
    const remainder = evidenceLabels.length - visibleLabels.length;
    causes.push({
      kind: "evidence",
      label: `Evidence: ${visibleLabels.join(", ")}${remainder > 0 ? ` +${remainder}` : ""}`,
    });
  }
  const confidenceKey = DIMENSIONS.find((policy) => policy.dimension === dimension)!.confidenceKey;
  const beforeSupport = visibleConfidence(previous.confidence[confidenceKey]);
  const afterSupport = visibleConfidence(current.confidence[confidenceKey]);
  if (beforeSupport !== afterSupport) {
    causes.push({
      kind: "coverage",
      label: `Evidence support ${formatSupport(beforeSupport)} → ${formatSupport(afterSupport)}`,
    });
  }
  if (causes.length === 0) {
    causes.push({ kind: "relative", label: "Peer comparison or rank shifted" });
  }
  return causes.slice(0, 3);
}

function stableRankCause(
  rankBefore: number | null,
  rankAfter: number | null,
): ModelAtlasScoreChangeCause | null {
  if (rankBefore == null || rankAfter == null || rankBefore === rankAfter) {
    return null;
  }
  if (rankAfter === 1) {
    return { kind: "relative", label: "Reached #1 within the stable cohort" };
  }
  if (rankBefore === 1) {
    return { kind: "relative", label: "Lost #1 within the stable cohort" };
  }
  return {
    kind: "relative",
    label: `Stable-cohort rank #${rankBefore} → #${rankAfter}`,
  };
}

function changedEvidenceLabels(
  current: ModelAtlasModel,
  previous: ModelAtlasModel,
  dimension: ModelAtlasScoreDimension,
  scoring: ModelAtlasMetadata["scoring"],
): string[] {
  if (dimension === "intelligence" || dimension === "agentic") {
    const keys =
      dimension === "intelligence"
        ? scoring.intelligence_benchmark_keys
        : scoring.agentic_benchmark_keys;
    return keys
      .filter((key) => benchmarkMetricValue(current, key) !== benchmarkMetricValue(previous, key))
      .map(benchmarkLabel);
  }
  const labels: string[] = [];
  const resourceKeys = Object.entries(scoring.benchmark_portfolio).flatMap(([key, entry]) =>
    entry.resourcePolicy == null ? [] : [key],
  );
  const taskFields =
    dimension === "speed"
      ? ["seconds", "tokens", "input_tokens", "output_tokens"]
      : ["cost", "observed_cost", "cost_price_ratio"];
  for (const key of resourceKeys) {
    const currentMetrics = current.task_metrics?.[key];
    const previousMetrics = previous.task_metrics?.[key];
    const taskChanged = taskFields.some(
      (field) =>
        currentMetrics?.[field as keyof typeof currentMetrics] !==
        previousMetrics?.[field as keyof typeof previousMetrics],
    );
    const benchmarkChanged =
      benchmarkMetricValue(current, key) !== benchmarkMetricValue(previous, key);
    if (taskChanged || benchmarkChanged) {
      labels.push(benchmarkLabel(key));
    }
  }
  if (dimension === "speed" && stableJson(current.speed) !== stableJson(previous.speed)) {
    labels.push("Provider speed");
  }
  if (dimension === "value" && stableJson(current.cost) !== stableJson(previous.cost)) {
    labels.push("Provider price");
  }
  return [...new Set(labels)];
}

function scoreRanks(models: readonly ModelAtlasModel[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const policy of DIMENSIONS) {
    const ranked = models
      .flatMap((model) => {
        const identity = modelIdentity(model);
        const score = finiteNumber(model.scores[policy.scoreKey]);
        return identity == null || score == null ? [] : [{ identity, score }];
      })
      .sort(
        (left, right) => right.score - left.score || left.identity.localeCompare(right.identity),
      );
    let previousScore: number | null = null;
    let previousRank = 0;
    for (const [index, row] of ranked.entries()) {
      const rank = row.score === previousScore ? previousRank : index + 1;
      ranks.set(rankIdentity(row.identity, policy.dimension), rank);
      previousScore = row.score;
      previousRank = rank;
    }
  }
  return ranks;
}

function compareChangeImpact(left: ModelAtlasScoreChange, right: ModelAtlasScoreChange): number {
  if (left.score_before == null && right.score_before == null) {
    const entryRankImpact =
      (left.rank_after ?? Number.MAX_SAFE_INTEGER) - (right.rank_after ?? Number.MAX_SAFE_INTEGER);
    if (entryRankImpact !== 0) {
      return entryRankImpact;
    }
  }
  const scoreImpact = Math.abs(right.score_delta ?? 0) - Math.abs(left.score_delta ?? 0);
  if (scoreImpact !== 0) {
    return scoreImpact;
  }
  const rankImpact = rankMovementImpact(right) - rankMovementImpact(left);
  return rankImpact !== 0
    ? rankImpact
    : (DIMENSION_ORDER.get(left.dimension) ?? 0) - (DIMENSION_ORDER.get(right.dimension) ?? 0);
}

function rankMovementImpact(change: ModelAtlasScoreChange): number {
  if (change.rank_after == null) {
    return 0;
  }
  if (change.rank_before == null) {
    return 1 / change.rank_after;
  }
  if (change.rank_before === change.rank_after) {
    return 0;
  }
  if (change.rank_before === 1 || change.rank_after === 1) {
    return 1;
  }
  return (
    Math.abs(change.rank_after - change.rank_before) /
    Math.min(change.rank_before, change.rank_after)
  );
}

function scoringMethodology(scoring: ModelAtlasMetadata["scoring"]): unknown {
  return {
    intelligence_benchmark_keys: scoring.intelligence_benchmark_keys,
    agentic_benchmark_keys: scoring.agentic_benchmark_keys,
    benchmark_portfolio: scoring.benchmark_portfolio,
    quality_coverage: scoring.quality_coverage,
    snapshot_preservation_version: scoring.snapshot_preservation_version,
  };
}

function modelIdentity(model: ModelAtlasModel): string | null {
  return model.id == null ? null : `${model.id}\u0000${model.reasoning_effort ?? ""}`;
}

function rankIdentity(identity: string, dimension: ModelAtlasScoreDimension): string {
  return `${identity}\u0000${dimension}`;
}

function benchmarkLabel(key: string): string {
  return (BENCHMARK_LABELS as Readonly<Record<string, string>>)[key] ?? key.replaceAll("_", " ");
}

function visibleScore(value: unknown): number | null {
  const number = finiteNumber(value);
  return number == null ? null : Math.round(number * 10) / 10;
}

function visibleConfidence(value: unknown): number | null {
  const number = finiteNumber(value);
  return number == null ? null : Math.round(number * 100);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSupport(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}
