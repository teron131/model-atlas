/** Missing quality tasks use direct sibling observations and measured shared-task gaps; predictions never become donor evidence. */

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
  normalizedQualityBenchmarkValue,
  type QualityScoringContext,
  siblingQualityKey,
} from "../quality-context";
import { benchmarkMetricValue } from "../resource-metrics";

const MIN_SIBLING_COMPARISON_BENCHMARKS = 3;

/** Prepare missing task estimates from direct sibling observations before any variant is scored. */
export function prepareSiblingQualityScoringContext(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
): QualityScoringContext {
  const groups = new Map<string, ModelAtlasCandidate[]>();
  for (const model of models) {
    if (canonicalReasoningEffort(model.reasoning_effort) == null) continue;
    const family = canonicalModelKey(model);
    const group = groups.get(family) ?? [];
    group.push(model);
    groups.set(family, group);
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
        const donors = variants
          .flatMap((donor) => {
            if (
              canonicalReasoningEffort(donor.model.reasoning_effort) ===
              canonicalReasoningEffort(target.model.reasoning_effort)
            )
              return [];
            const common = target.inputs.flatMap((input) => {
              const paired = donor.inputs.find((other) => other.key === input.key);
              return paired == null
                ? []
                : [{ value: input.value - paired.value, weight: input.weight }];
            });
            if (common.length < MIN_SIBLING_COMPARISON_BENCHMARKS) return [];
            const weight = common.reduce((sum, input) => sum + input.weight, 0);
            const support = weight ** 2 / common.reduce((sum, input) => sum + input.weight ** 2, 0);
            return [{ ...donor, gap: weightedMeanOfFinite(common)!, support }];
          })
          .sort(
            (left, right) =>
              right.support - left.support ||
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
        for (const donor of donors) {
          for (const input of donor.inputs) {
            if (
              predicted.has(input.key) ||
              target.inputs.some((observed) => observed.key === input.key)
            )
              continue;
            predicted.set(input.key, clamp(input.value + donor.gap, 0, 100));
          }
        }
        if (predicted.size > 0)
          estimates.set(siblingQualityKey(target.model, dimension), predicted);
      }
    }
  }
  return { ...qualityContext, siblingQualityEstimates: estimates };
}
