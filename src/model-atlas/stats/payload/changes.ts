/** Material change derivation owns each update's score moves, the model inputs behind them, the per-score cause and benchmark-alignment trail, and the change history assembled from the stored log. */

import { BENCHMARK_LABELS } from "../../benchmarks/catalog";
import { pearsonCorrelation } from "../../math-utils";
import { benchmarkValue } from "../../pipeline/scores/resource-metrics";
import { stableJson } from "../../runtime";
import type {
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasChangeMark,
  ModelAtlasInputChange,
  ModelAtlasMetadata,
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoreDimension,
  ModelAtlasScoreMove,
  ModelAtlasTaskMetricValues,
  ModelAtlasVariantChanges,
} from "../types";

export type RefreshRunRow = {
  refresh_id: number;
  previous_refresh_id: number | null;
  methodology_changed: boolean;
  model_change_count: number;
  score_change_count: number;
};

/** One score's material move with that score's own causes and rank drivers, as the change history stores it. */
type ScoreChange = ModelAtlasScoreMove & {
  refresh_id: number;
  causes: ModelAtlasScoreChangeCause[];
  rank_drivers: ModelAtlasBenchmarkRankDriver[];
};

export type ModelScoreChangeRow = ScoreChange & {
  model_id: string;
  reasoning_effort: string;
};

/** The update-level facts of one variant's material update, stored once beside its per-score rows. */
export type ModelChangeDetailRow = {
  refresh_id: number;
  model_id: string;
  reasoning_effort: string;
  entry: ModelAtlasScoreChange["entry"];
  inputs: ModelAtlasInputChange[];
};

type RefreshChanges = {
  models: ModelAtlasModel[];
  refreshRunRows: readonly RefreshRunRow[];
  modelScoreChangeRows: readonly ModelScoreChangeRow[];
  modelChangeDetailRows: readonly ModelChangeDetailRow[];
};

type LoggedRefresh = Pick<
  RefreshRunRow,
  "refresh_id" | "previous_refresh_id" | "methodology_changed"
>;

export type ChangeLog = {
  refreshRuns: readonly LoggedRefresh[];
  scoreChanges: readonly ModelScoreChangeRow[];
  details: readonly ModelChangeDetailRow[];
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
/** Inputs are compared at three significant digits, so differences the card cannot show are not reported as changes. */
const INPUT_SIGNIFICANT_DIGITS = 3;
const TASK_INPUTS = [
  { kind: "task_cost", field: "cost" },
  { kind: "task_time", field: "seconds" },
  { kind: "task_tokens", field: "tokens" },
] as const satisfies readonly {
  kind: ModelAtlasInputChange["kind"];
  field: keyof ModelAtlasTaskMetricValues;
}[];
const RESULT_CHANGE_ORDER = ["added", "revised", "removed"] as const;
export const CHANGE_HISTORY_SECONDS = 30 * 86_400;
const RECENT_CHANGE_MARKS = 12;

/**
 * Record only material adjacent changes while retaining the last material event across quiet refreshes.
 * `previousMethodology` is the fingerprint the previous checkpoint stored, because a payload read back from a checkpoint carries the current config's scoring; a checkpoint that predates it falls back to the payload's scoring.
 */
export function buildRefreshChanges(
  refreshId: number,
  previousRefreshId: number | null,
  previousPayload: ModelAtlasPayload | null | undefined,
  previousMethodology: string | null,
  currentModels: readonly ModelAtlasModel[],
  currentScoring: ModelAtlasMetadata["scoring"],
): RefreshChanges {
  const previousModels = previousPayload?.models ?? [];
  const methodologyChanged =
    previousPayload != null &&
    (previousMethodology ?? scoringMethodologyJson(previousPayload.metadata.scoring)) !==
      scoringMethodologyJson(currentScoring);
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
  const previousModelIds = new Set(previousModels.map((model) => model.id));
  const modelScoreChangeRows: ModelScoreChangeRow[] = [];
  const modelChangeDetailRows: ModelChangeDetailRow[] = [];
  const latestChangeByIdentity = new Map<string, ModelAtlasScoreChange>();

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
      const [primaryChange, ...otherChanges] = [...changes].sort(compareChangeImpact);
      if (primaryChange != null) {
        const entry =
          previousModel != null ? null : previousModelIds.has(model.id) ? "variant" : "model";
        const inputs =
          previousModel == null ? [] : inputChanges(model, previousModel, currentScoring);
        modelChangeDetailRows.push({
          refresh_id: refreshId,
          model_id: model.id,
          reasoning_effort: model.reasoning_effort ?? "",
          entry,
          inputs,
        });
        latestChangeByIdentity.set(
          identity,
          scoreUpdate([primaryChange, ...otherChanges], {
            entry,
            methodology_changed: methodologyChanged,
            inputs,
          }),
        );
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
        identity == null ? null : (latestChangeByIdentity.get(identity) ?? previousChange ?? null),
    };
  });
  const changedModelCount = new Set(
    modelScoreChangeRows.map(({ model_id, reasoning_effort }) =>
      variantKey(model_id, reasoning_effort),
    ),
  ).size;
  return {
    models,
    refreshRunRows: [
      {
        refresh_id: refreshId,
        previous_refresh_id: previousRefreshId,
        methodology_changed: methodologyChanged,
        model_change_count: changedModelCount,
        score_change_count: modelScoreChangeRows.length,
      },
    ],
    modelScoreChangeRows,
    modelChangeDetailRows,
  };
}

/**
 * Assemble each variant's updates from the stored change log, oldest first.
 * Only refreshes on the newest refresh's chain of predecessors count, so a run that a later run replaced never appears, and the chain stops CHANGE_HISTORY_SECONDS before the newest refresh.
 * Updates logged before update-level facts were stored carry null entry and inputs.
 */
export function buildChangeHistory({
  refreshRuns,
  scoreChanges,
  details,
}: ChangeLog): ModelAtlasVariantChanges[] {
  const runs = new Map(refreshRuns.map((run) => [run.refresh_id, run]));
  const newest = Math.max(...runs.keys());
  const chain = new Map<number, LoggedRefresh>();
  for (
    let run = runs.get(newest);
    run != null && run.refresh_id >= newest - CHANGE_HISTORY_SECONDS;
    run = run.previous_refresh_id == null ? undefined : runs.get(run.previous_refresh_id)
  ) {
    chain.set(run.refresh_id, run);
  }
  const detailByUpdate = new Map(details.map((detail) => [updateKey(detail), detail]));
  const updates = new Map<
    string,
    { run: LoggedRefresh; moves: [ModelScoreChangeRow, ...ModelScoreChangeRow[]] }
  >();
  for (const row of scoreChanges) {
    const run = chain.get(row.refresh_id);
    if (run != null) {
      const moves = updates.get(updateKey(row))?.moves;
      updates.set(updateKey(row), { run, moves: moves == null ? [row] : [...moves, row] });
    }
  }
  const variants = new Map<string, ModelAtlasVariantChanges>();
  for (const [key, { run, moves }] of updates) {
    const [{ model_id, reasoning_effort }] = moves;
    const detail = detailByUpdate.get(key);
    const identity = variantKey(model_id, reasoning_effort);
    const variant: ModelAtlasVariantChanges = variants.get(identity) ?? {
      model_id,
      reasoning_effort: reasoning_effort === "" ? null : reasoning_effort,
      updates: [],
    };
    variant.updates.push(
      scoreUpdate(moves.sort(compareChangeImpact), {
        entry: detail?.entry ?? null,
        methodology_changed: run.methodology_changed,
        inputs: detail?.inputs ?? null,
      }),
    );
    variants.set(identity, variant);
  }
  return [...variants.values()].map((variant) => ({
    ...variant,
    updates: variant.updates.sort((left, right) => left.refresh_id - right.refresh_id),
  }));
}

/** A variant's identity in the change log, which stores a model without a reasoning effort as "". */
export function variantKey(modelId: string, reasoningEffort: string | null): string {
  return `${modelId}\u0000${reasoningEffort ?? ""}`;
}

/** The scoring settings whose change marks a refresh's moves as methodology-driven, as stable JSON. */
export function scoringMethodologyJson(scoring: ModelAtlasMetadata["scoring"]): string {
  const intelligence = scoring.intelligence_scoring;
  return stableJson({
    intelligence_scoring: intelligence && {
      group_weights: intelligence.group_weights,
      pairwise_weight: intelligence.pairwise_weight,
    },
    intelligence_benchmark_keys: scoring.intelligence_benchmark_keys,
    agentic_benchmark_keys: scoring.agentic_benchmark_keys,
    benchmark_portfolio: scoring.benchmark_portfolio,
    agentic_token_modifier_cap: scoring.agentic_token_modifier_cap,
    snapshot_preservation_version: scoring.snapshot_preservation_version,
  });
}

export function recentChangeMarks(
  updates: readonly ModelAtlasScoreChange[],
): ModelAtlasChangeMark[] {
  return updates
    .slice(-RECENT_CHANGE_MARKS)
    .map(({ refresh_id, dimension, score_delta }) => ({ refresh_id, dimension, score_delta }));
}

function updateKey(row: {
  refresh_id: number;
  model_id: string;
  reasoning_effort: string;
}): string {
  return `${row.refresh_id}\u0000${variantKey(row.model_id, row.reasoning_effort)}`;
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
): ScoreChange | null {
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
  const change: ScoreChange = {
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
      policy,
      rankBefore,
      rankAfter,
      scoring,
      methodologyChanged,
    ),
    rank_drivers: rankDriversForModel(current, currentModels, policy, scoring),
  };
}

function isMaterialChange(change: ModelAtlasScoreMove): boolean {
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
        const benchmark = benchmarkValue(model, benchmarkKey);
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
  return pearsonCorrelation(leftRanks, rightRanks);
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
  policy: DimensionPolicy,
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
  const evidenceLabels = changedEvidenceLabels(current, previous, policy.dimension, scoring);
  if (evidenceLabels.length > 0) {
    const visibleLabels = evidenceLabels.slice(0, 2);
    const remainder = evidenceLabels.length - visibleLabels.length;
    causes.push({
      kind: "evidence",
      label: `Evidence: ${visibleLabels.join(", ")}${remainder > 0 ? ` +${remainder}` : ""}`,
    });
  }
  const beforeSupport = visibleConfidence(previous.confidence[policy.confidenceKey]);
  const afterSupport = visibleConfidence(current.confidence[policy.confidenceKey]);
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
      .filter((key) => benchmarkValue(current, key) !== benchmarkValue(previous, key))
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
    const benchmarkChanged = benchmarkValue(current, key) !== benchmarkValue(previous, key);
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

/** An update as published, built one way for the latest change and the history: the headline move with its causes and rank drivers, then every move in impact order. */
function scoreUpdate(
  [headline, ...others]: readonly [ScoreChange, ...ScoreChange[]],
  facts: Pick<ModelAtlasScoreChange, "entry" | "methodology_changed" | "inputs">,
): ModelAtlasScoreChange {
  return {
    refresh_id: headline.refresh_id,
    ...scoreMove(headline),
    causes: headline.causes,
    rank_drivers: headline.rank_drivers,
    entry: facts.entry,
    methodology_changed: facts.methodology_changed,
    scores: [headline, ...others].map(scoreMove),
    inputs: facts.inputs,
  };
}

function scoreMove(change: ScoreChange): ModelAtlasScoreMove {
  return {
    dimension: change.dimension,
    score_before: change.score_before,
    score_after: change.score_after,
    score_delta: change.score_delta,
    rank_before: change.rank_before,
    rank_after: change.rank_after,
    confidence_before: change.confidence_before,
    confidence_after: change.confidence_after,
  };
}

/** List the variant's own scored inputs that changed: benchmark results first, then per-task resources of benchmarks whose result held, then provider price and speed. */
function inputChanges(
  current: ModelAtlasModel,
  previous: ModelAtlasModel,
  scoring: ModelAtlasMetadata["scoring"],
): ModelAtlasInputChange[] {
  const resourceKeys = Object.entries(scoring.benchmark_portfolio).flatMap(([key, entry]) =>
    entry.resourcePolicy == null ? [] : [key],
  );
  const benchmarkKeys = new Set([
    ...scoring.intelligence_benchmark_keys,
    ...scoring.agentic_benchmark_keys,
    ...resourceKeys,
  ]);
  const results = [...benchmarkKeys]
    .flatMap((key) =>
      changedInput(
        "result",
        key,
        benchmarkLabel(key),
        benchmarkValue(previous, key),
        benchmarkValue(current, key),
      ),
    )
    .sort(
      (left, right) =>
        RESULT_CHANGE_ORDER.indexOf(resultChange(left)) -
          RESULT_CHANGE_ORDER.indexOf(resultChange(right)) || left.label.localeCompare(right.label),
    );
  const changedResultKeys = new Set(results.map(({ key }) => key));
  const resources = resourceKeys
    .filter((key) => !changedResultKeys.has(key))
    .flatMap((key) =>
      TASK_INPUTS.flatMap(({ kind, field }) =>
        changedInput(
          kind,
          key,
          benchmarkLabel(key),
          finiteNumber(previous.task_metrics?.[key]?.[field]),
          finiteNumber(current.task_metrics?.[key]?.[field]),
        ),
      ),
    );
  const provider = [
    changedInput(
      "provider_price",
      "blended_price",
      "Blended price",
      finiteNumber(previous.cost?.blended_price),
      finiteNumber(current.cost?.blended_price),
    ),
    changedInput(
      "provider_speed",
      "throughput",
      "Throughput",
      finiteNumber(previous.speed.throughput_tokens_per_second_median),
      finiteNumber(current.speed.throughput_tokens_per_second_median),
    ),
    changedInput(
      "provider_latency",
      "latency",
      "Latency",
      finiteNumber(previous.speed.latency_seconds_median),
      finiteNumber(current.speed.latency_seconds_median),
    ),
    changedInput(
      "provider_latency",
      "e2e_latency",
      "End-to-end latency",
      finiteNumber(previous.speed.e2e_latency_seconds_median),
      finiteNumber(current.speed.e2e_latency_seconds_median),
    ),
  ].flat();
  return [...results, ...resources, ...provider];
}

function changedInput(
  kind: ModelAtlasInputChange["kind"],
  key: string,
  label: string,
  before: number | null,
  after: number | null,
): ModelAtlasInputChange[] {
  const same =
    before == null || after == null
      ? before === after
      : before.toPrecision(INPUT_SIGNIFICANT_DIGITS) ===
        after.toPrecision(INPUT_SIGNIFICANT_DIGITS);
  return same ? [] : [{ kind, key, label, before, after }];
}

function resultChange(input: ModelAtlasInputChange): (typeof RESULT_CHANGE_ORDER)[number] {
  return input.before == null ? "added" : input.after == null ? "removed" : "revised";
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

function compareChangeImpact(left: ModelAtlasScoreMove, right: ModelAtlasScoreMove): number {
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

function rankMovementImpact(change: ModelAtlasScoreMove): number {
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

function modelIdentity(model: ModelAtlasModel): string | null {
  return model.id == null ? null : variantKey(model.id, model.reasoning_effort);
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
