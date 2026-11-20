/** Missing benchmark scores use observations from another effort and measured gaps on shared benchmarks; estimates never become reference evidence, and only held-out-checked ones are published as results. */

import { isAggregateIndex } from "../../../benchmarks/index-policy";
import { benchmarkAllocation, benchmarkValue } from "../../../benchmarks/registry";
import { countsTowardIntelligence, type ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  canonicalVariantKey,
  reasoningEffortRank,
} from "../../../identity/normalization";
import { weightedMeanOfFinite, weightedMedianOfFinite } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import { clampScore } from "../normalization";
import {
  effortQualityKey,
  normalizedQualityBenchmarkValue,
  type QualityScoringContext,
} from "../quality-context";

const MIN_SHARED_BENCHMARKS = 3;

/** Published estimates need held-out predictions for at least this many base models: a median over fewer can rest on one or two models, and few models report several efforts on most benchmarks. */
const MIN_PUBLISHED_VALIDATION_MODELS = 8;

/** The largest model-balanced median held-out miss, in 0–100 score points, at which a benchmark's estimates are published: about the typical difference between neighbouring efforts of one model, so a looser limit publishes estimates that miss by more than adjacent efforts differ. */
const MAX_PUBLISHED_ERROR = 5;

const CAPABILITIES = ["intelligence", "agentic"] as const;
type Capability = (typeof CAPABILITIES)[number];

type VariantInputs = {
  model: ModelAtlasCandidate;
  inputs: { key: string; value: number; weight: number }[];
};

/** Each missing benchmark takes the first reference variant's value plus the measured gap, references ranked by effort distance, then effective shared-benchmark count. */
export function prepareEffortQualityScoringContext(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): QualityScoringContext {
  const estimates = new Map<string, ReadonlyMap<string, number>>();
  for (const group of effortGroups(models)) {
    for (const capability of CAPABILITIES) {
      const variants = variantInputs(group, capability, scoringConfig, qualityContext);
      for (const target of variants) {
        const predicted = predictedScores(target, variants);
        if (predicted.size > 0)
          estimates.set(effortQualityKey(target.model, capability), predicted);
      }
    }
  }
  return { ...qualityContext, effortQualityEstimates: estimates };
}

/**
 * The same estimates in each benchmark's own units, by `canonicalVariantKey`, for benchmarks where they predict withheld results closely.
 * A result converts back only from a score without a token adjustment, so a benchmark takes Intelligence's estimate, or Agentic's when Intelligence does not count it and Agentic adjusts none of its results.
 */
export function publishedEffortResults(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): ReadonlyMap<string, Record<string, number>> {
  const groups = effortGroups(models);
  const intelligenceKeys = new Set(scoredKeys("intelligence", scoringConfig));
  const publishedCapability = (key: string): Capability | null => {
    if (intelligenceKeys.has(key)) return "intelligence";
    return qualityContext.agenticTokenAdjustments?.has(key) ? null : "agentic";
  };
  const results = new Map<string, Record<string, number>>();
  for (const capability of CAPABILITIES) {
    const groupVariants = groups.map((group) =>
      variantInputs(group, capability, scoringConfig, qualityContext),
    );
    const checked = checkedKeys(groupVariants, (key) => publishedCapability(key) === capability);
    for (const variants of groupVariants) {
      for (const target of variants) {
        const variantKey = canonicalVariantKey(target.model);
        for (const [key, score] of predictedScores(target, variants)) {
          const range = qualityContext.benchmarkRangesByKey.get(key);
          if (!checked.has(key) || range == null) continue;
          const variantResults = results.get(variantKey) ?? {};
          variantResults[key] = range.min + (score / 100) * (range.max - range.min);
          results.set(variantKey, variantResults);
        }
      }
    }
  }
  return results;
}

/** Withhold each observed score whose variant has another effort, predict it from the rest, and keep the benchmarks whose predictions pass. */
function checkedKeys(
  groupVariants: readonly (readonly VariantInputs[])[],
  isCandidate: (key: string) => boolean,
): Set<string> {
  const errorsByKey = new Map<string, { base: string; error: number }[]>();
  for (const variants of groupVariants) {
    for (const target of variants) {
      for (const input of target.inputs) {
        if (!isCandidate(input.key)) continue;
        const withheld = {
          model: target.model,
          inputs: target.inputs.filter(({ key }) => key !== input.key),
        };
        const predicted = predictedScores(
          withheld,
          variants.map((variant) => (variant === target ? withheld : variant)),
        ).get(input.key);
        if (predicted == null) continue;
        const errors = errorsByKey.get(input.key) ?? [];
        errors.push({
          base: canonicalModelKey(target.model),
          error: Math.abs(predicted - input.value),
        });
        errorsByKey.set(input.key, errors);
      }
    }
  }
  const keys = new Set<string>();
  for (const [key, errors] of errorsByKey) {
    const casesByBase = new Map<string, number>();
    for (const { base } of errors) casesByBase.set(base, (casesByBase.get(base) ?? 0) + 1);
    if (casesByBase.size < MIN_PUBLISHED_VALIDATION_MODELS) continue;
    const error = weightedMedianOfFinite(
      errors.map(({ base, error }) => ({ value: error, weight: 1 / casesByBase.get(base)! })),
    );
    if (error != null && error <= MAX_PUBLISHED_ERROR) keys.add(key);
  }
  return keys;
}

/** A base model's variants with named efforts, for models with at least two. */
function effortGroups(models: readonly ModelAtlasCandidate[]): ModelAtlasCandidate[][] {
  const groups = new Map<string, ModelAtlasCandidate[]>();
  for (const model of models) {
    if (canonicalReasoningEffort(model.reasoning_effort) == null) continue;
    const modelKey = canonicalModelKey(model);
    const group = groups.get(modelKey) ?? [];
    group.push(model);
    groups.set(modelKey, group);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

function scoredKeys(capability: Capability, scoringConfig: ScoringConfig): string[] {
  const keys =
    capability === "intelligence"
      ? scoringConfig.intelligenceBenchmarkKeys
      : scoringConfig.agenticBenchmarkKeys;
  return keys.filter(
    (key) =>
      (capability !== "intelligence" || countsTowardIntelligence(key, scoringConfig)) &&
      benchmarkAllocation(key, capability, scoringConfig.benchmarkPortfolio) > 0 &&
      !isAggregateIndex(key),
  );
}

function variantInputs(
  group: readonly ModelAtlasCandidate[],
  capability: Capability,
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): VariantInputs[] {
  const keys = scoredKeys(capability, scoringConfig);
  return group.map((model) => ({
    model,
    inputs: keys.flatMap((key) => {
      const rawValue = benchmarkValue(model, key);
      if (rawValue == null) return [];
      const value = normalizedQualityBenchmarkValue(
        model,
        key,
        rawValue,
        capability,
        qualityContext,
      );
      const weight = benchmarkAllocation(key, capability, scoringConfig.benchmarkPortfolio);
      return value == null ? [] : [{ key, value, weight }];
    }),
  }));
}

function predictedScores(
  target: VariantInputs,
  variants: readonly VariantInputs[],
): Map<string, number> {
  const observedKeys = new Set(target.inputs.map(({ key }) => key));
  const effortDistance = ({ model }: VariantInputs) =>
    Math.abs(
      reasoningEffortRank(model.reasoning_effort) -
        reasoningEffortRank(target.model.reasoning_effort),
    );
  const referenceVariants = variants
    .flatMap((referenceVariant) => {
      if (
        canonicalReasoningEffort(referenceVariant.model.reasoning_effort) ===
        canonicalReasoningEffort(target.model.reasoning_effort)
      )
        return [];
      const common = target.inputs.flatMap((input) => {
        const paired = referenceVariant.inputs.find((other) => other.key === input.key);
        return paired == null ? [] : [{ value: input.value - paired.value, weight: input.weight }];
      });
      if (common.length < MIN_SHARED_BENCHMARKS) return [];
      const weight = common.reduce((sum, input) => sum + input.weight, 0);
      const effectiveBenchmarkCount =
        weight ** 2 / common.reduce((sum, input) => sum + input.weight ** 2, 0);
      return [{ ...referenceVariant, gap: weightedMeanOfFinite(common)!, effectiveBenchmarkCount }];
    })
    // Distance comes first: held-out estimates from the nearest effort miss less, while the breadth of shared benchmarks barely changes the miss.
    .sort(
      (left, right) =>
        effortDistance(left) - effortDistance(right) ||
        right.effectiveBenchmarkCount - left.effectiveBenchmarkCount ||
        String(left.model.reasoning_effort).localeCompare(String(right.model.reasoning_effort)),
    );
  const predicted = new Map<string, number>();
  for (const referenceVariant of referenceVariants) {
    for (const input of referenceVariant.inputs) {
      if (predicted.has(input.key) || observedKeys.has(input.key)) continue;
      predicted.set(input.key, clampScore(input.value + referenceVariant.gap));
    }
  }
  return predicted;
}
