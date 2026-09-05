/** Compact leaderboard projections combine reasoning-variant evidence for dashboard rows and public JSON without changing canonical backend models. */

import {
  type BenchmarkObservationsByKey,
  buildBenchmarkObservationLookup,
  findBenchmarkObservations,
} from "../../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_KEYS,
  benchmarkValueLocation,
  transformBenchmarkSourceValue,
} from "../../src/model-atlas/benchmarks/registry";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../src/model-atlas/identity/normalization";
import { benchmarkMetricValue } from "../../src/model-atlas/pipeline/scores/resource-metrics";
import { strongestModelVariants } from "../../src/model-atlas/stats/model-variants";
import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";

/** Collapse each model's variants while applying model-level benchmark observation policy. */
export function compactModelVariants(
  models: readonly ModelAtlasModel[],
  benchmarkObservations: BenchmarkObservationsByKey = {},
): ModelAtlasModel[] {
  const variantsByModel = new Map<string, ModelAtlasModel[]>();
  const observationLookups = new Map(
    BENCHMARK_KEYS.map((key) => [
      key,
      buildBenchmarkObservationLookup(benchmarkObservations[key] ?? []),
    ]),
  );
  for (const model of models) {
    const key = canonicalModelKey(model);
    const variants = variantsByModel.get(key) ?? [];
    variants.push(model);
    variantsByModel.set(key, variants);
  }

  return [...variantsByModel.values()].map((variants) => {
    const representative = strongestModelVariants(variants)[0]!;
    const modelNames = variants.flatMap((variant) => [variant.id, variant.name]);

    const intelligence = { ...representative.intelligence };
    const benchmarks = { ...representative.benchmarks };
    const benchmarkDates = { ...representative.benchmark_dates };
    const taskMetrics = { ...representative.task_metrics };
    let hasAddedBenchmarks = false;

    for (const key of BENCHMARK_KEYS) {
      if (benchmarkMetricValue(representative, key) != null) {
        continue;
      }
      const variantObservations = variants.flatMap((model) => {
        const value = benchmarkMetricValue(model, key);
        return value == null ? [] : [{ model, value }];
      });
      const sourceObservations = findBenchmarkObservations(
        modelNames,
        observationLookups.get(key)!,
      );
      let sourceObservation = sourceObservations[0] ?? null;
      for (const observation of sourceObservations.slice(1)) {
        if (
          reasoningEffortRank(observation.reasoning_effort) >
          reasoningEffortRank(sourceObservation?.reasoning_effort)
        ) {
          sourceObservation = observation;
        }
      }
      const sourceEffort = canonicalReasoningEffort(sourceObservation?.reasoning_effort);
      let variantObservation =
        sourceObservation == null
          ? (variantObservations[0] ?? null)
          : (variantObservations.find(
              ({ model }) => canonicalReasoningEffort(model.reasoning_effort) === sourceEffort,
            ) ?? null);
      if (sourceObservation == null) {
        for (const observation of variantObservations.slice(1)) {
          if (
            reasoningEffortRank(observation.model.reasoning_effort) >
            reasoningEffortRank(variantObservation?.model.reasoning_effort)
          ) {
            variantObservation = observation;
          }
        }
      }
      const value =
        sourceObservation == null
          ? (variantObservation?.value ?? null)
          : transformBenchmarkSourceValue(key, sourceObservation.canonical_value);
      if (value == null) {
        continue;
      }
      const location = benchmarkValueLocation(key);
      if (location?.kind === "intelligence") {
        intelligence[location.field] = value;
      } else {
        benchmarks[key] = value;
      }
      const observedAt =
        variantObservation?.model.benchmark_dates?.[key] ?? sourceObservation?.observed_at ?? null;
      if (observedAt != null) {
        benchmarkDates[key] = observedAt;
      }
      const variantTaskMetrics = variantObservation?.model.task_metrics?.[key];
      if (variantTaskMetrics != null) {
        taskMetrics[key] = variantTaskMetrics;
      } else if (sourceObservation?.cost != null) {
        taskMetrics[key] = {
          cost: sourceObservation.cost,
          observed_cost: sourceObservation.cost,
          cost_price_ratio: 1,
          observed_at: sourceObservation.observed_at,
        };
      }
      hasAddedBenchmarks = true;
    }

    return hasAddedBenchmarks
      ? {
          ...representative,
          intelligence: Object.keys(intelligence).length === 0 ? null : intelligence,
          benchmarks: Object.keys(benchmarks).length === 0 ? null : benchmarks,
          benchmark_dates: Object.keys(benchmarkDates).length === 0 ? null : benchmarkDates,
          task_metrics: Object.keys(taskMetrics).length === 0 ? null : taskMetrics,
        }
      : representative;
  });
}
