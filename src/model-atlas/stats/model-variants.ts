/** Variant projections give each canonical model one row for the leaderboard, public JSON, and dashboard, either its strongest scored variant or that variant with results it lacks filled from the model's other efforts, and rank any listing by Intelligence with tied scores sharing a rank. */

import {
  type BenchmarkObservationEvidenceRow,
  type BenchmarkObservationGroupLookup,
  type BenchmarkObservationsByKey,
  buildBenchmarkObservationGroupLookup,
  candidateModelKeys,
  findBenchmarkObservations,
} from "../benchmarks/observation";
import {
  BENCHMARK_KEYS,
  benchmarkValue,
  benchmarkValueLocation,
  transformBenchmarkSourceValue,
} from "../benchmarks/registry";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../identity/normalization";
import { competitionRank } from "../math-utils";
import { modelDisplayExclusion } from "./model-visibility";
import type { ModelAtlasModel } from "./types";

type IntelligenceScoredModel = {
  id?: unknown;
  name?: unknown;
  scores: {
    intelligence_score: number;
  };
};

/** Select the highest-intelligence variant as the representative row for each model. */
export function strongestModelVariants<Model extends IntelligenceScoredModel>(
  models: readonly Model[],
): Model[] {
  const strongestByModel = new Map<string, Model>();
  for (const model of models) {
    const key = canonicalModelKey(model);
    const existing = strongestByModel.get(key);
    if (existing == null || model.scores.intelligence_score > existing.scores.intelligence_score) {
      strongestByModel.set(key, model);
    }
  }
  return [...strongestByModel.values()];
}

export function modelVariantKey(model: ModelAtlasModel): string {
  return `${canonicalModelKey(model)}\u0000${model.reasoning_effort ?? ""}`;
}

/** Expand every reasoning variant when requested; otherwise one row per model: its strongest variant, without an effort label, with results it lacks filled from the model's other efforts. */
export function modelsForVariantDisplay(
  models: readonly ModelAtlasModel[],
  showVariants: boolean,
  benchmarkObservations: BenchmarkObservationsByKey = {},
): ModelAtlasModel[] {
  const variantsByIdentity = new Map<string, ModelAtlasModel>();
  for (const model of models) {
    if (modelDisplayExclusion(model) != null) continue;
    const key = modelVariantKey(model);
    const existing = variantsByIdentity.get(key);
    if (existing == null || model.scores.intelligence_score > existing.scores.intelligence_score) {
      variantsByIdentity.set(key, model);
    }
  }
  const modelVariants = [...variantsByIdentity.values()];
  if (showVariants) return modelVariants;
  return compactModelVariants(modelVariants, benchmarkObservations).map((model) => ({
    ...model,
    reasoning_effort: null,
  }));
}

/**
 * One row per model: its strongest variant, without an effort label.
 * A row carries only that variant's own results, which is all score, identity, and filter readers use; the leaderboard's collapsed rows from `modelsForVariantDisplay` also fill benchmark results from other efforts, at several times the cost.
 */
export function collapsedModels(models: readonly ModelAtlasModel[]): ModelAtlasModel[] {
  return strongestModelVariants(modelsForVariantDisplay(models, true)).map((model) => ({
    ...model,
    reasoning_effort: null,
  }));
}

/** Competition ranks by Intelligence, aligned with `models`: tied scores share a rank and leave the next ordinal gap. */
export function intelligenceRanks(models: readonly IntelligenceScoredModel[]): number[] {
  const scores = models.map((model) => model.scores.intelligence_score);
  return scores.map((score) => competitionRank(scores, score));
}

type ObservationLookups = ReadonlyMap<
  string,
  {
    variants: BenchmarkObservationGroupLookup<BenchmarkObservationEvidenceRow>;
    collapsed: BenchmarkObservationGroupLookup<BenchmarkObservationEvidenceRow>;
  }
>;

// Payload observations are immutable once published, so every projection of one payload shares its lookups.
const observationLookupsByPayload = new WeakMap<BenchmarkObservationsByKey, ObservationLookups>();

/**
 * One row per model from its strongest variant, display-excluded families dropped; the effort label is kept.
 * A benchmark's fused cross-effort observation, when the payload has one, replaces the representative's value.
 * Otherwise a missing result is filled from the highest-effort source observation, with the matching variant's dates and task metrics, or failing that from the highest-effort variant that has one.
 */
export function compactModelVariants(
  models: readonly ModelAtlasModel[],
  benchmarkObservations: BenchmarkObservationsByKey = {},
): ModelAtlasModel[] {
  const variantsByModel = new Map<string, ModelAtlasModel[]>();
  const observationLookups = benchmarkObservationLookups(benchmarkObservations);
  for (const model of models) {
    if (modelDisplayExclusion(model) != null) continue;
    const key = canonicalModelKey(model);
    const variants = variantsByModel.get(key) ?? [];
    variants.push(model);
    variantsByModel.set(key, variants);
  }

  return [...variantsByModel.values()].map((variants) => {
    const representative = strongestModelVariants(variants)[0]!;
    const candidateKeys = candidateModelKeys(
      variants.flatMap((variant) => [variant.id, variant.name]),
    );

    const intelligence = { ...representative.intelligence };
    const benchmarks = { ...representative.benchmarks };
    const benchmarkDates = { ...representative.benchmark_dates };
    const taskMetrics = { ...representative.task_metrics };
    let hasAddedBenchmarks = false;

    for (const key of BENCHMARK_KEYS) {
      const lookups = observationLookups.get(key)!;
      const fused = findBenchmarkObservations(candidateKeys, lookups.collapsed)[0];
      if (fused != null) {
        benchmarks[key] = fused.canonical_value;
        const metadata = fused.metadata!;
        taskMetrics[key] = {
          cost: typeof metadata.cost === "number" ? metadata.cost : null,
          seconds: typeof metadata.seconds_per_task === "number" ? metadata.seconds_per_task : null,
          tokens: typeof metadata.tokens_per_task === "number" ? metadata.tokens_per_task : null,
          output_tokens:
            typeof metadata.output_tokens_per_task === "number"
              ? metadata.output_tokens_per_task
              : null,
          observed_at: fused.observed_at,
        };
        if (fused.observed_at != null) benchmarkDates[key] = fused.observed_at;
        hasAddedBenchmarks = true;
        continue;
      }
      if (benchmarkValue(representative, key) != null) {
        continue;
      }
      const variantObservations = variants.flatMap((model) => {
        const value = benchmarkValue(model, key);
        return value == null ? [] : [{ model, value }];
      });
      const sourceObservations = findBenchmarkObservations(candidateKeys, lookups.variants);
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

function benchmarkObservationLookups(
  benchmarkObservations: BenchmarkObservationsByKey,
): ObservationLookups {
  const cached = observationLookupsByPayload.get(benchmarkObservations);
  if (cached != null) return cached;
  const lookups: ObservationLookups = new Map(
    BENCHMARK_KEYS.map((key) => {
      const rows = benchmarkObservations[key] ?? [];
      return [
        key,
        {
          variants: buildBenchmarkObservationGroupLookup(rows),
          collapsed: buildBenchmarkObservationGroupLookup(
            rows.filter((row) => row.metadata?.fusion_collapsed === true),
          ),
        },
      ];
    }),
  );
  observationLookupsByPayload.set(benchmarkObservations, lookups);
  return lookups;
}
