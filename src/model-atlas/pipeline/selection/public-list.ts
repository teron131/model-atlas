/** Public model selection owns score gating, compact-model projection, sparse-field pruning, and route collapse. */

import {
  type BenchmarkObservationsByKey,
  buildBenchmarkObservationLookup,
  findBenchmarkObservations,
} from "../../benchmarks/observation";
import {
  BENCHMARK_KEYS,
  benchmarkValueLocation,
  transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import type { FinalStageConfig, ScoringConfig } from "../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../identity/normalization";
import {
  hasPublicFreeRouteLabel,
  isOpenRouterFreeRouteId,
  publicOpenRouterModelId,
  publicOpenRouterModelName,
} from "../../identity/openrouter";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
  ModelAtlasCandidateComponentScores,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import { benchmarkMetricValue } from "../scores/resource-metrics";

const STABLE_TOP_LEVEL_KEYS = new Set<string>([
  "id",
  "name",
  "provider",
  "logo",
  "reasoning",
  "reasoning_effort",
  "release_date",
  "modalities",
  "open_weights",
  "cost",
  "context_window",
  "speed",
  "intelligence",
  "task_metrics",
  "benchmarks",
  "benchmark_dates",
  "confidence",
  "component_scores",
  "scores",
]);
const REQUIRED_QUALITY_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;

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
    let hasModelObservation = false;

    for (const key of BENCHMARK_KEYS) {
      if (benchmarkMetricValue(representative, key) != null) {
        continue;
      }
      const observations = variants.flatMap((model) => {
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
      let directObservation =
        sourceObservation == null
          ? (observations[0] ?? null)
          : (observations.find(
              ({ model }) => canonicalReasoningEffort(model.reasoning_effort) === sourceEffort,
            ) ?? null);
      if (sourceObservation == null) {
        for (const observation of observations.slice(1)) {
          if (
            reasoningEffortRank(observation.model.reasoning_effort) >
            reasoningEffortRank(directObservation?.model.reasoning_effort)
          ) {
            directObservation = observation;
          }
        }
      }
      const value =
        sourceObservation == null
          ? (directObservation?.value ?? null)
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
        directObservation?.model.benchmark_dates?.[key] ?? sourceObservation?.observed_at ?? null;
      if (observedAt != null) {
        benchmarkDates[key] = observedAt;
      }
      const directTaskMetrics = directObservation?.model.task_metrics?.[key];
      if (directTaskMetrics != null) {
        taskMetrics[key] = directTaskMetrics;
      } else if (sourceObservation?.cost != null) {
        taskMetrics[key] = {
          cost: sourceObservation.cost,
          observed_cost: sourceObservation.cost,
          cost_price_ratio: 1,
          observed_at: sourceObservation.observed_at,
        };
      }
      hasModelObservation = true;
    }

    return hasModelObservation
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

function sortByIntelligenceScore(models: ModelAtlasModel[]): ModelAtlasModel[] {
  return [...models].sort((left, right) => {
    const leftIntelligence = left.scores.intelligence_score;
    const rightIntelligence = right.scores.intelligence_score;
    if (leftIntelligence !== rightIntelligence) {
      return rightIntelligence - leftIntelligence;
    }
    const leftKey = left.id ?? "";
    const rightKey = right.id ?? "";
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/** Public rows need finite core quality scores; evidence sufficiency is enforced separately. */
export function hasRequiredQualityScores(
  model: ModelAtlasScoredCandidate,
): model is ModelAtlasScoredCandidate & ModelAtlasModel {
  const componentScores: ModelAtlasCandidateComponentScores | null = model.component_scores;
  if (componentScores == null) {
    return false;
  }
  const hasRequiredComponentScores = REQUIRED_QUALITY_SCORE_KEYS.every((key) => {
    const value = componentScores[key];
    return value != null;
  });
  if (!hasRequiredComponentScores) {
    return false;
  }
  const scores = model.scores;
  return REQUIRED_QUALITY_SCORE_KEYS.every((key) => asFiniteNumber(scores[key]) != null);
}

/** Project scored candidates onto the public contract before pruning can preserve internal fields. */
function toPublicModel(model: ModelAtlasScoredCandidate & ModelAtlasModel): ModelAtlasModel {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    logo: model.logo,
    reasoning: model.reasoning,
    reasoning_effort: model.reasoning_effort,
    release_date: model.release_date,
    modalities: model.modalities,
    open_weights: model.open_weights,
    cost: model.cost,
    context_window: model.context_window,
    speed: model.speed,
    intelligence: model.intelligence,
    task_metrics: model.task_metrics,
    benchmarks: model.benchmarks,
    benchmark_dates: model.benchmark_dates,
    confidence: { ...model.confidence },
    component_scores: {
      intelligence_score: model.component_scores.intelligence_score,
      agentic_score: model.component_scores.agentic_score,
      speed_score: model.component_scores.speed_score,
    },
    scores: {
      intelligence_score: model.scores.intelligence_score,
      agentic_score: model.scores.agentic_score,
      speed_score: model.scores.speed_score,
      value_score: model.scores.value_score,
    },
  };
}

/** Validate and project one scored candidate onto the exact public model contract. */
export function publicModelFromCandidate(model: ModelAtlasScoredCandidate): ModelAtlasModel | null {
  return hasRequiredQualityScores(model) ? toPublicModel(model) : null;
}

function isPlainObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isWithinRecentLookback(releaseDate: string | null, lookbackDays: number): boolean {
  if (typeof releaseDate !== "string" || releaseDate.length === 0) {
    return false;
  }
  const releaseTimestampMs = Date.parse(releaseDate);
  if (!Number.isFinite(releaseTimestampMs)) {
    return false;
  }
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return releaseTimestampMs >= cutoffMs;
}

function selectPruneSampleModels(
  models: ModelAtlasModel[],
  finalConfig: FinalStageConfig,
): ModelAtlasModel[] {
  const recentModels = models.filter((model) =>
    isWithinRecentLookback(model.release_date, finalConfig.nullFieldPruneRecentLookbackDays),
  );
  return recentModels.length > 0 ? recentModels : models;
}

/** Null-heavy optional fields are pruned from recent public rows while stable contract fields remain fixed. */
function pruneSparseFields(
  models: ModelAtlasModel[],
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): ModelAtlasModel[] {
  if (models.length === 0) {
    return models;
  }

  const selectedBenchmarkKeys = new Set([
    ...scoringConfig.intelligenceBenchmarkKeys,
    ...scoringConfig.agenticBenchmarkKeys,
  ]);
  const sampleModels = selectPruneSampleModels(models, finalConfig);
  const sampleTotal = sampleModels.length;
  const topLevelKeys = new Set<string>();
  const nestedKeysByParent = new Map<string, Set<string>>();

  for (const model of models) {
    for (const [key, value] of Object.entries(model)) {
      topLevelKeys.add(key);
      if (!isPlainObject(value)) {
        continue;
      }
      const nestedKeys = nestedKeysByParent.get(key) ?? new Set<string>();
      for (const nestedKey of Object.keys(value)) {
        nestedKeys.add(nestedKey);
      }
      nestedKeysByParent.set(key, nestedKeys);
    }
  }

  const topLevelKeysToPrune = new Set<string>();
  for (const key of topLevelKeys) {
    if (STABLE_TOP_LEVEL_KEYS.has(key)) {
      continue;
    }
    const nullCount = sampleModels.reduce((count, model) => {
      const modelRecord = asRecord(model);
      return modelRecord[key] == null ? count + 1 : count;
    }, 0);
    if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
      topLevelKeysToPrune.add(key);
    }
  }

  const nestedKeysToPruneByParent = new Map<string, Set<string>>();
  for (const [parentKey, nestedKeys] of nestedKeysByParent) {
    if (parentKey !== "benchmarks") {
      continue;
    }
    const keysToPrune = new Set<string>();
    for (const nestedKey of nestedKeys) {
      if (selectedBenchmarkKeys.has(nestedKey)) {
        continue;
      }
      const nullCount = sampleModels.reduce((count, model) => {
        const modelRecord = asRecord(model);
        const parentValue = modelRecord[parentKey];
        if (!isPlainObject(parentValue) || parentValue[nestedKey] == null) {
          return count + 1;
        }
        return count;
      }, 0);
      if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
        keysToPrune.add(nestedKey);
      }
    }
    if (keysToPrune.size > 0) {
      nestedKeysToPruneByParent.set(parentKey, keysToPrune);
    }
  }

  return models.map((model) => {
    const nextModel: JsonObject = { ...model };
    for (const key of topLevelKeysToPrune) {
      delete nextModel[key];
    }
    for (const [parentKey, nestedKeysToPrune] of nestedKeysToPruneByParent) {
      const parentValue = nextModel[parentKey];
      if (!isPlainObject(parentValue)) {
        continue;
      }
      const nextParentValue: JsonObject = { ...parentValue };
      for (const nestedKey of nestedKeysToPrune) {
        delete nextParentValue[nestedKey];
      }
      nextModel[parentKey] = nextParentValue;
    }
    return nextModel as ModelAtlasModel;
  });
}

/** Free routes collapse within each reasoning variant so the dashboard can expand variants without duplicate routes. */
function collapseFreeRoutesByVariant(models: ModelAtlasModel[]): ModelAtlasModel[] {
  const modelByPublicId = new Map<string, { model: ModelAtlasModel; isFreeRoute: boolean }>();
  const passthrough: ModelAtlasModel[] = [];

  for (const model of models) {
    const publicId = publicOpenRouterModelId(model.id);
    const publicName = publicOpenRouterModelName(model.name, publicId);
    const normalizedModel: ModelAtlasModel = {
      ...model,
      id: publicId,
      name: publicName,
    };
    if (!publicId) {
      passthrough.push(normalizedModel);
      continue;
    }
    const candidateIsFreeRoute =
      isOpenRouterFreeRouteId(model.id) || hasPublicFreeRouteLabel(model.name);
    const variantId = `${publicId}\u0000${model.reasoning_effort ?? ""}`;
    const existing = modelByPublicId.get(variantId);
    if (!existing || (existing.isFreeRoute && !candidateIsFreeRoute)) {
      modelByPublicId.set(variantId, {
        model: normalizedModel,
        isFreeRoute: candidateIsFreeRoute,
      });
    }
  }

  return sortByIntelligenceScore([
    ...passthrough,
    ...[...modelByPublicId.values()].map(({ model }) => model),
  ]);
}

export function selectPublicModels(
  scoredCandidates: ModelAtlasScoredCandidate[],
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): ModelAtlasModel[] {
  const signalModels = scoredCandidates.flatMap((model) => {
    const publicModel = publicModelFromCandidate(model);
    return publicModel == null ? [] : [publicModel];
  });
  const sortedModels = sortByIntelligenceScore(signalModels);
  const prunedModels = pruneSparseFields(sortedModels, finalConfig, scoringConfig);
  const normalizedModels = collapseFreeRoutesByVariant(prunedModels);
  const normalizedId = publicOpenRouterModelId(id ?? null);
  return normalizedId == null
    ? normalizedModels
    : normalizedModels.filter((model) => publicOpenRouterModelId(model.id) === normalizedId);
}
