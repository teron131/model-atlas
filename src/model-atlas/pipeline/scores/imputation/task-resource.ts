/** Guarded sibling-effort task-resource imputation for cost, time, and token-use scoring. */

import { MAX_NORMALIZED_IMPUTATION_ERROR, type ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../../identity/normalization";
import { clamp01, medianOfFinite, positiveFiniteNumber } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import { benchmarkResourceEfficiencyScores } from "../resource-efficiency";
import { benchmarkMetricValue } from "../resource-metrics";
import { benchmarkQualityEvidence, type BenchmarkScoringPreparation } from "./benchmark";
import {
  directTaskResource,
  type EffortResourceImputation,
  type ImputedTaskResource,
  resourceImputationKeys,
  resourceVariantKey,
  TASK_RESOURCE_KINDS,
  type TaskResourceKind,
} from "./resource-evidence";
import { prepareTieredResourceEstimator } from "./resource-tiers";

const MIN_PAIRED_TASKS = 3;
const MAX_MEDIAN_LOG_RESOURCE_ERROR = Math.LN2;
type ValidatedEffortRatio = {
  confidence: number;
  kind: TaskResourceKind;
  logRatio: number;
  sourceIndex: number;
  targetIndex: number;
};

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
  const pairedKeys = resourceImputationKeys(scoringConfig, kind).filter(
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

    const policy =
      scoringConfig.benchmarkPortfolio[key]?.resourcePolicy ??
      (key === "aa_intelligence_index" ? { qualityCoordinate: "linear" as const } : null);
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

/** Fit validated effort ratios, then fill missing benchmark-specific task costs, runtimes, and token amounts. */
export function prepareEffortResourceImputation(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  benchmarkPreparation: BenchmarkScoringPreparation,
  kinds: readonly TaskResourceKind[] = TASK_RESOURCE_KINDS,
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

  const tieredEstimators = new Map(
    kinds.map((kind) => [kind, prepareTieredResourceEstimator(models, scoringConfig, kind)]),
  );
  const ratios: ValidatedEffortRatio[] = [];
  for (const indexes of indexesByModel.values()) {
    for (const targetIndex of indexes) {
      for (const sourceIndex of indexes) {
        if (targetIndex === sourceIndex) {
          continue;
        }
        for (const kind of kinds) {
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
    const siblingIndexes = (indexesByModel.get(canonicalModelKey(target)) ?? [])
      .filter((index) => index !== targetIndex)
      .sort(
        (left, right) =>
          Math.abs(reasoningEffortRank(models[left]?.reasoning_effort) - targetEffortRank) -
          Math.abs(reasoningEffortRank(models[right]?.reasoning_effort) - targetEffortRank),
      );
    const estimates = new Map<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>();
    const targetKeys = Object.entries(scoringConfig.benchmarkPortfolio)
      .filter(
        ([key, entry]) =>
          (entry.resourcePolicy != null || key === "aa_intelligence_index") &&
          benchmarkQualityEvidence(target, key, benchmarkPreparation) != null,
      )
      .map(([key]) => key);
    for (const key of targetKeys) {
      for (const kind of kinds) {
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
    for (const key of targetKeys) {
      for (const kind of kinds) {
        if (
          estimates.get(key)?.[kind] != null ||
          directTaskResource(target, key, scoringConfig, kind) != null
        )
          continue;
        for (const index of siblingIndexes) {
          const estimate = tieredEstimators.get(kind)!(target, models[index]!, key);
          if (estimate == null) continue;
          estimates.set(key, { ...estimates.get(key), [kind]: estimate });
          break;
        }
      }
    }
    if (estimates.size > 0) {
      byVariant.set(resourceVariantKey(target), estimates);
    }
  }
  return { byVariant };
}
