/** Missing benchmark scores use observations from another effort and measured gaps on shared benchmarks; estimates never become reference evidence. */

import { isAggregateIndex } from "../../../benchmarks/index-policy";
import { benchmarkDimensionWeight } from "../../../benchmarks/registry";
import type { ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../../identity/normalization";
import { clamp, weightedMeanOfFinite } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import {
  effortQualityKey,
  normalizedQualityBenchmarkValue,
  type QualityScoringContext,
} from "../quality-context";
import { benchmarkMetricValue } from "../resource-metrics";

const MIN_SHARED_BENCHMARKS = 3;

/** Prepare missing benchmark estimates from observed results at other efforts before scoring variants. */
export function prepareEffortQualityScoringContext(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): QualityScoringContext {
  const groups = new Map<string, ModelAtlasCandidate[]>();
  for (const model of models) {
    if (canonicalReasoningEffort(model.reasoning_effort) == null) continue;
    const modelKey = canonicalModelKey(model);
    const group = groups.get(modelKey) ?? [];
    group.push(model);
    groups.set(modelKey, group);
  }
  const estimates = new Map<string, ReadonlyMap<string, number>>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const dimension of ["intelligence", "agentic"] as const) {
      const keys =
        dimension === "intelligence"
          ? scoringConfig.intelligenceBenchmarkKeys
          : scoringConfig.agenticBenchmarkKeys;
      const variants = group.map((model) => ({
        model,
        inputs: keys.flatMap((key) => {
          if (
            dimension === "intelligence" &&
            !isAggregateIndex(key) &&
            scoringConfig.intelligenceGroupWeights[
              scoringConfig.benchmarkPortfolio[key]?.group ?? "baseline"
            ] === 0
          ) {
            return [];
          }
          const weight = benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio);
          if (!(weight > 0) || isAggregateIndex(key)) return [];
          const rawValue = benchmarkMetricValue(model, key);
          if (rawValue == null) return [];
          const value = normalizedQualityBenchmarkValue(
            model,
            key,
            rawValue,
            dimension,
            qualityContext,
          );
          return value == null ? [] : [{ key, value, weight }];
        }),
      }));
      for (const target of variants) {
        const observedKeys = new Set(target.inputs.map(({ key }) => key));
        const referenceVariants = variants
          .flatMap((referenceVariant) => {
            if (
              canonicalReasoningEffort(referenceVariant.model.reasoning_effort) ===
              canonicalReasoningEffort(target.model.reasoning_effort)
            )
              return [];
            const common = target.inputs.flatMap((input) => {
              const paired = referenceVariant.inputs.find((other) => other.key === input.key);
              return paired == null
                ? []
                : [{ value: input.value - paired.value, weight: input.weight }];
            });
            if (common.length < MIN_SHARED_BENCHMARKS) return [];
            const weight = common.reduce((sum, input) => sum + input.weight, 0);
            const effectiveBenchmarkCount =
              weight ** 2 / common.reduce((sum, input) => sum + input.weight ** 2, 0);
            return [
              { ...referenceVariant, gap: weightedMeanOfFinite(common)!, effectiveBenchmarkCount },
            ];
          })
          .sort(
            (left, right) =>
              right.effectiveBenchmarkCount - left.effectiveBenchmarkCount ||
              Math.abs(
                reasoningEffortRank(left.model.reasoning_effort) -
                  reasoningEffortRank(target.model.reasoning_effort),
              ) -
                Math.abs(
                  reasoningEffortRank(right.model.reasoning_effort) -
                    reasoningEffortRank(target.model.reasoning_effort),
                ) ||
              String(left.model.reasoning_effort).localeCompare(
                String(right.model.reasoning_effort),
              ),
          );
        const predicted = new Map<string, number>();
        for (const referenceVariant of referenceVariants) {
          for (const input of referenceVariant.inputs) {
            if (predicted.has(input.key) || observedKeys.has(input.key)) continue;
            predicted.set(input.key, clamp(input.value + referenceVariant.gap, 0, 100));
          }
        }
        if (predicted.size > 0) estimates.set(effortQualityKey(target.model, dimension), predicted);
      }
    }
  }
  return { ...qualityContext, effortQualityEstimates: estimates };
}
