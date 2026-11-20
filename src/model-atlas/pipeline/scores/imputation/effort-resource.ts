/** Validated resource ratios between a model's efforts, and the imputation that applies them to cost, time, and token-use scoring. */

import { indexPolicy } from "../../../benchmarks/index-policy";
import { benchmarkValue } from "../../../benchmarks/registry";
import { MAX_NORMALIZED_IMPUTATION_ERROR, type ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  canonicalVariantKey,
  reasoningEffortRank,
} from "../../../identity/normalization";
import { clamp01, medianOfFinite, positiveFiniteNumber } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import { heldOutResourceScorer } from "../resource-efficiency";
import { benchmarkQualityEvidence, type BenchmarkScoringPreparation } from "./benchmark";
import { prepareBroaderResourceEstimator } from "./broader-resource";
import {
  directTaskResource,
  type EffortResourceImputation,
  type ImputedTaskResource,
  MIN_RESOURCE_EVIDENCE_FACTOR,
  resourceImputationKeys,
  TASK_RESOURCE_KINDS,
  type TaskResourceKind,
} from "./resource-evidence";

const MIN_PAIRED_BENCHMARKS = 3;
const MAX_MEDIAN_LOG_RESOURCE_ERROR = Math.LN2;

type IndexedVariant = { index: number; model: ModelAtlasCandidate };

/** One benchmark's quality and direct amount for every model, indexed like `models`. */
type ResourcePopulation = {
  qualities: (number | null)[];
  amounts: (number | null)[];
};

type PairedBenchmark = {
  population: ResourcePopulation;
  targetAmount: number;
  sourceAmount: number;
};

type ValidatedEffortRatio = {
  evidenceFactor: number;
  kind: TaskResourceKind;
  logRatio: number;
  source: IndexedVariant;
  targetIndex: number;
};

/** A missing task amount takes the broader estimate built on other models' ratio for the same benchmark first, then the validated ratio from the model's nearest effort; observed amounts are never replaced. */
export function prepareEffortResourceImputation(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
  kinds: readonly TaskResourceKind[] = TASK_RESOURCE_KINDS,
): EffortResourceImputation {
  const variantsByModel = new Map<string, IndexedVariant[]>();
  for (const [index, model] of models.entries()) {
    const effort = canonicalReasoningEffort(model.reasoning_effort);
    if (effort == null || reasoningEffortRank(effort) < 0) {
      continue;
    }
    const key = canonicalModelKey(model);
    variantsByModel.set(key, [...(variantsByModel.get(key) ?? []), { index, model }]);
  }
  const ratios = kinds.flatMap((kind) =>
    validatedEffortRatios(models, variantsByModel, scoringConfig, kind),
  );

  const broaderEstimators = new Map(
    kinds.map((kind) => [kind, prepareBroaderResourceEstimator(models, scoringConfig, kind)]),
  );
  const byVariant = new Map<
    string,
    Map<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>
  >();
  for (const [targetIndex, target] of models.entries()) {
    const targetEffortRank = reasoningEffortRank(target.reasoning_effort);
    const effortDistance = ({ model }: IndexedVariant) =>
      Math.abs(reasoningEffortRank(model.reasoning_effort) - targetEffortRank);
    const targetRatios = ratios
      .filter((ratio) => ratio.targetIndex === targetIndex)
      .sort(
        (left, right) =>
          effortDistance(left.source) - effortDistance(right.source) ||
          right.evidenceFactor - left.evidenceFactor ||
          left.source.index - right.source.index,
      );
    const references = (variantsByModel.get(canonicalModelKey(target)) ?? [])
      .filter(({ index }) => index !== targetIndex)
      .sort((left, right) => effortDistance(left) - effortDistance(right));
    const estimates = new Map<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>();
    const targetKeys = Object.entries(scoringConfig.benchmarkPortfolio)
      .filter(
        ([key, entry]) =>
          (entry.resourcePolicy != null || indexPolicy(key)?.resources != null) &&
          benchmarkQualityEvidence(target, key, scoringPreparation) != null,
      )
      .map(([key]) => key);
    const broaderEstimate = (key: string, kind: TaskResourceKind) => {
      for (const reference of references) {
        const estimate = broaderEstimators.get(kind)!(target, reference.model, key);
        if (estimate != null) return estimate;
      }
      return null;
    };
    const ownRatioEstimate = (key: string, kind: TaskResourceKind): ImputedTaskResource | null => {
      for (const ratio of targetRatios) {
        if (ratio.kind !== kind) continue;
        const sourceAmount = directTaskResource(ratio.source.model, key, scoringConfig, kind);
        const amount =
          sourceAmount == null
            ? null
            : positiveFiniteNumber(sourceAmount * Math.exp(ratio.logRatio));
        if (amount != null) return { amount, evidenceFactor: ratio.evidenceFactor };
      }
      return null;
    };
    for (const key of targetKeys) {
      for (const kind of kinds) {
        if (directTaskResource(target, key, scoringConfig, kind) != null) continue;
        // Other models' ratio comes first: how much more a higher effort uses depends more on the benchmark than on the model, and its last step still moves toward the model's own ratios; held-out amounts and Speed and Value both come out closer this way.
        const estimate = broaderEstimate(key, kind) ?? ownRatioEstimate(key, kind);
        if (estimate != null) estimates.set(key, { ...estimates.get(key), [kind]: estimate });
      }
    }
    if (estimates.size > 0) {
      byVariant.set(canonicalVariantKey(target), estimates);
    }
  }
  return { byVariant };
}

/** Validate every ordered pair of one model's efforts for one resource kind. */
function validatedEffortRatios(
  models: readonly ModelAtlasCandidate[],
  variantsByModel: ReadonlyMap<string, readonly IndexedVariant[]>,
  scoringConfig: ScoringConfig,
  kind: TaskResourceKind,
): ValidatedEffortRatio[] {
  const populations = resourceImputationKeys(scoringConfig, kind).map((key) => ({
    qualities: models.map((model) => benchmarkValue(model, key)),
    amounts: models.map((model) => directTaskResource(model, key, scoringConfig, kind)),
  }));
  const ratios: ValidatedEffortRatio[] = [];
  for (const variants of variantsByModel.values()) {
    for (const target of variants) {
      // The scoring population leaves out only the target, so one scorer per benchmark serves every reference effort.
      const scorers = new Map<ResourcePopulation, (logResource: number) => number | null>();
      const scoreTarget = (population: ResourcePopulation, amount: number) => {
        let scorer = scorers.get(population);
        if (scorer == null) {
          scorer = heldOutResourceScorer(
            models,
            population.qualities,
            population.amounts.map((value) => (value == null ? null : Math.log(value))),
            target.index,
          );
          scorers.set(population, scorer);
        }
        return scorer(Math.log(amount));
      };
      for (const source of variants) {
        if (source === target) {
          continue;
        }
        const ratio = validatedEffortRatio(
          pairedBenchmarks(populations, target.index, source.index),
          scoreTarget,
        );
        if (ratio != null) {
          ratios.push({ ...ratio, kind, source, targetIndex: target.index });
        }
      }
    }
  }
  return ratios;
}

function pairedBenchmarks(
  populations: readonly ResourcePopulation[],
  targetIndex: number,
  sourceIndex: number,
): PairedBenchmark[] {
  return populations.flatMap((population) => {
    const targetAmount = population.amounts[targetIndex];
    const sourceAmount = population.amounts[sourceIndex];
    return targetAmount == null ||
      sourceAmount == null ||
      population.qualities[targetIndex] == null ||
      population.qualities[sourceIndex] == null
      ? []
      : [{ population, targetAmount, sourceAmount }];
  });
}

function validatedEffortRatio(
  paired: readonly PairedBenchmark[],
  scoreTarget: (population: ResourcePopulation, amount: number) => number | null,
): Pick<ValidatedEffortRatio, "evidenceFactor" | "logRatio"> | null {
  if (paired.length < MIN_PAIRED_BENCHMARKS) return null;
  // Amounts are positive, so every log ratio is finite and each held-out median has at least two values.
  const logRatios = paired.map(({ targetAmount, sourceAmount }) =>
    Math.log(targetAmount / sourceAmount),
  );
  const predictedAmounts = paired.map(
    ({ sourceAmount }, heldOut) =>
      sourceAmount * Math.exp(medianOfFinite(logRatios.filter((_, index) => index !== heldOut))!),
  );
  const medianLogError = medianOfFinite(
    paired.map(({ targetAmount }, index) =>
      Math.abs(Math.log(predictedAmounts[index]! / targetAmount)),
    ),
  )!;
  const logFactor = clamp01(1 - medianLogError / MAX_MEDIAN_LOG_RESOURCE_ERROR);
  // Scoring held-out amounts is the costly check, so it runs only for a ratio whose amounts already pass.
  if (logFactor < MIN_RESOURCE_EVIDENCE_FACTOR) return null;
  const scoreErrors = paired.flatMap(({ population, targetAmount }, index) => {
    const actualScore = scoreTarget(population, targetAmount);
    const predictedScore = scoreTarget(population, predictedAmounts[index]!);
    return actualScore == null || predictedScore == null
      ? []
      : [Math.abs(predictedScore - actualScore)];
  });
  const medianScoreError = medianOfFinite(scoreErrors);
  if (scoreErrors.length < MIN_PAIRED_BENCHMARKS || medianScoreError == null) return null;
  const evidenceFactor = Math.min(
    logFactor,
    clamp01(1 - medianScoreError / MAX_NORMALIZED_IMPUTATION_ERROR),
  );
  return evidenceFactor < MIN_RESOURCE_EVIDENCE_FACTOR
    ? null
    : { evidenceFactor, logRatio: medianOfFinite(logRatios)! };
}
