/** Guarded sibling-effort task-resource imputation for Speed and Value scoring. */

import { MAX_NORMALIZED_IMPUTATION_ERROR, type ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../../identity/normalization";
import { clamp01, medianOfFinite, positiveFiniteNumber } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import { benchmarkResourceEfficiencyScores } from "../resource-efficiency";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  effectiveTaskSeconds,
} from "../resource-metrics";
import { benchmarkQualityEvidence, type BenchmarkScoringPreparation } from "./benchmark";

const MIN_PAIRED_TASKS = 3;
const MAX_MEDIAN_LOG_RESOURCE_ERROR = Math.LN2;
const TASK_RESOURCE_KINDS = ["cost", "time"] as const;

export type TaskResourceKind = (typeof TASK_RESOURCE_KINDS)[number];

export type ImputedTaskResource = {
  amount: number;
  confidence: number;
};

export type EffortResourceImputation = {
  byVariant: ReadonlyMap<
    string,
    ReadonlyMap<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>
  >;
};

type ValidatedEffortRatio = {
  confidence: number;
  kind: TaskResourceKind;
  logRatio: number;
  sourceIndex: number;
  targetIndex: number;
};

function variantKey(model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">) {
  return `${canonicalModelKey(model)}\u0000${canonicalReasoningEffort(model.reasoning_effort) ?? ""}`;
}

function directTaskResource(
  model: ModelAtlasCandidate,
  key: string,
  scoringConfig: ScoringConfig,
  kind: TaskResourceKind,
): number | null {
  const policy = scoringConfig.benchmarkPortfolio[key]?.resourcePolicy;
  if (policy?.source !== "benchmark") {
    return null;
  }
  const metrics = benchmarkTaskMetrics(model, key, policy);
  return kind === "cost"
    ? positiveFiniteNumber(metrics?.cost)
    : effectiveTaskSeconds(model, metrics);
}

function validatedEffortRatio(
  models: readonly ModelAtlasCandidate[],
  targetIndex: number,
  sourceIndex: number,
  scoringConfig: ScoringConfig,
  kind: TaskResourceKind,
): ValidatedEffortRatio | null {
  const target = models[targetIndex];
  const source = models[sourceIndex];
  if (target == null || source == null) {
    return null;
  }
  const pairedKeys = Object.entries(scoringConfig.benchmarkPortfolio)
    .filter(([, entry]) => entry.resourcePolicy?.source === "benchmark")
    .map(([key]) => key)
    .filter(
      (key) =>
        benchmarkMetricValue(target, key) != null &&
        benchmarkMetricValue(source, key) != null &&
        directTaskResource(target, key, scoringConfig, kind) != null &&
        directTaskResource(source, key, scoringConfig, kind) != null,
    );
  if (pairedKeys.length < MIN_PAIRED_TASKS) {
    return null;
  }
  const logRatios = pairedKeys.map((key) =>
    Math.log(
      (directTaskResource(target, key, scoringConfig, kind) ?? 1) /
        (directTaskResource(source, key, scoringConfig, kind) ?? 1),
    ),
  );
  const rawErrors: number[] = [];
  const scoreErrors: number[] = [];
  for (const [heldOutIndex, key] of pairedKeys.entries()) {
    const logRatio = medianOfFinite(
      logRatios.filter((_, ratioIndex) => ratioIndex !== heldOutIndex),
    );
    const sourceAmount = directTaskResource(source, key, scoringConfig, kind);
    const actualTargetAmount = directTaskResource(target, key, scoringConfig, kind);
    if (logRatio == null || sourceAmount == null || actualTargetAmount == null) {
      continue;
    }
    const predictedTargetAmount = sourceAmount * Math.exp(logRatio);
    rawErrors.push(Math.abs(Math.log(predictedTargetAmount / actualTargetAmount)));

    const policy = scoringConfig.benchmarkPortfolio[key]?.resourcePolicy;
    if (policy == null) {
      continue;
    }
    const qualities = models.map((model) => benchmarkMetricValue(model, key));
    const actualResources = models.map((model) => {
      const amount = directTaskResource(model, key, scoringConfig, kind);
      return amount == null ? null : Math.log(amount);
    });
    const calibrationMask = models.map(
      (_, index) =>
        index !== targetIndex && qualities[index] != null && actualResources[index] != null,
    );
    const actualScores = benchmarkResourceEfficiencyScores(
      models,
      qualities,
      actualResources,
      policy.qualityCoordinate,
      calibrationMask,
    );
    const predictedResources = [...actualResources];
    predictedResources[targetIndex] = Math.log(predictedTargetAmount);
    const predictedScores = benchmarkResourceEfficiencyScores(
      models,
      qualities,
      predictedResources,
      policy.qualityCoordinate,
      calibrationMask,
    );
    const actualScore = actualScores[targetIndex] ?? null;
    const predictedScore = predictedScores[targetIndex] ?? null;
    if (actualScore != null && predictedScore != null) {
      scoreErrors.push(Math.abs(predictedScore - actualScore));
    }
  }
  const medianLogError = medianOfFinite(rawErrors);
  const medianScoreError = medianOfFinite(scoreErrors);
  if (
    rawErrors.length < MIN_PAIRED_TASKS ||
    scoreErrors.length < MIN_PAIRED_TASKS ||
    medianLogError == null ||
    medianScoreError == null ||
    medianLogError >= MAX_MEDIAN_LOG_RESOURCE_ERROR ||
    medianScoreError >= MAX_NORMALIZED_IMPUTATION_ERROR
  ) {
    return null;
  }
  const logRatio = medianOfFinite(logRatios);
  if (logRatio == null) {
    return null;
  }
  return {
    confidence: Math.min(
      clamp01(1 - medianLogError / MAX_MEDIAN_LOG_RESOURCE_ERROR),
      clamp01(1 - medianScoreError / MAX_NORMALIZED_IMPUTATION_ERROR),
    ),
    kind,
    logRatio,
    sourceIndex,
    targetIndex,
  };
}

/** Fit validated effort ratios, then fill missing benchmark-source task costs and runtimes. */
export function prepareEffortResourceImputation(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  benchmarkPreparation: BenchmarkScoringPreparation,
): EffortResourceImputation {
  const indexesByModel = new Map<string, number[]>();
  for (const [index, model] of models.entries()) {
    const effort = canonicalReasoningEffort(model.reasoning_effort);
    if (effort == null || reasoningEffortRank(effort) < 0) {
      continue;
    }
    const key = canonicalModelKey(model);
    indexesByModel.set(key, [...(indexesByModel.get(key) ?? []), index]);
  }

  const ratios: ValidatedEffortRatio[] = [];
  for (const indexes of indexesByModel.values()) {
    for (const targetIndex of indexes) {
      for (const sourceIndex of indexes) {
        if (targetIndex === sourceIndex) {
          continue;
        }
        for (const kind of TASK_RESOURCE_KINDS) {
          const ratio = validatedEffortRatio(models, targetIndex, sourceIndex, scoringConfig, kind);
          if (ratio != null) {
            ratios.push(ratio);
          }
        }
      }
    }
  }

  const byVariant = new Map<
    string,
    Map<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>
  >();
  for (const [targetIndex, target] of models.entries()) {
    const targetEffortRank = reasoningEffortRank(target.reasoning_effort);
    const targetRatios = ratios
      .filter((ratio) => ratio.targetIndex === targetIndex)
      .sort((left, right) => {
        const leftSource = models[left.sourceIndex];
        const rightSource = models[right.sourceIndex];
        const distanceDifference =
          Math.abs(reasoningEffortRank(leftSource?.reasoning_effort) - targetEffortRank) -
          Math.abs(reasoningEffortRank(rightSource?.reasoning_effort) - targetEffortRank);
        return (
          distanceDifference ||
          right.confidence - left.confidence ||
          left.sourceIndex - right.sourceIndex
        );
      });
    if (targetRatios.length === 0) {
      continue;
    }
    const estimates = new Map<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>();
    for (const [key, entry] of Object.entries(scoringConfig.benchmarkPortfolio)) {
      if (
        entry.resourcePolicy?.source !== "benchmark" ||
        benchmarkQualityEvidence(target, key, benchmarkPreparation) == null
      ) {
        continue;
      }
      for (const kind of TASK_RESOURCE_KINDS) {
        if (directTaskResource(target, key, scoringConfig, kind) != null) {
          continue;
        }
        for (const ratio of targetRatios) {
          if (ratio.kind !== kind) {
            continue;
          }
          const source = models[ratio.sourceIndex];
          const sourceAmount =
            source == null ? null : directTaskResource(source, key, scoringConfig, kind);
          const amount =
            sourceAmount == null
              ? null
              : positiveFiniteNumber(sourceAmount * Math.exp(ratio.logRatio));
          if (amount == null) {
            continue;
          }
          estimates.set(key, {
            ...estimates.get(key),
            [kind]: {
              amount,
              confidence: ratio.confidence,
            },
          });
          break;
        }
      }
    }
    if (estimates.size > 0) {
      byVariant.set(variantKey(target), estimates);
    }
  }
  return { byVariant };
}

/** Look up a validated scoring-only task resource for a projected model variant. */
export function imputedTaskResource(
  preparation: EffortResourceImputation,
  model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">,
  key: string,
  kind: TaskResourceKind,
): ImputedTaskResource | null {
  return preparation.byVariant.get(variantKey(model))?.get(key)?.[kind] ?? null;
}
