/** Public model selection owns score gating, sparse benchmark pruning, and route collapse. */

import { BENCHMARK_KEYS } from "../../benchmarks/registry";
import type { FinalStageConfig, ScoringConfig } from "../../config/stage";
import {
  hasPublicFreeRouteLabel,
  isOpenRouterFreeRouteId,
  publicOpenRouterModelId,
  publicOpenRouterModelName,
} from "../../identity/openrouter";
import { asFiniteNumber } from "../../runtime";
import type {
  ModelAtlasCandidateComponentScores,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
} from "../model-types";

const REQUIRED_QUALITY_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;

function sortByIntelligenceScore<Model extends ModelAtlasModel>(models: Model[]): Model[] {
  return [...models].sort((left, right) => {
    const leftIntelligence = asFiniteNumber(left.scores.intelligence_score);
    const rightIntelligence = asFiniteNumber(right.scores.intelligence_score);
    if (leftIntelligence == null || rightIntelligence == null) {
      if (leftIntelligence == null && rightIntelligence == null) {
        return (left.id ?? "").localeCompare(right.id ?? "");
      }
      return leftIntelligence == null ? 1 : -1;
    }
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
function publishedModelFields(model: ModelAtlasScoredCandidate) {
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
  };
}

function toPublicModel(model: ModelAtlasScoredCandidate & ModelAtlasModel): ModelAtlasModel {
  return {
    ...publishedModelFields(model),
    ...(model.latest_change == null ? {} : { latest_change: model.latest_change }),
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

/** Prune only unregistered, null-heavy benchmark fields; the public projection already fixes every top-level field. */
function pruneSparseBenchmarks<Model extends ModelAtlasModel>(
  models: Model[],
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): Model[] {
  if (models.length === 0) return models;
  // Baseline observations stay visible even when they do not contribute to capability scores.
  const retainedKeys = new Set([
    ...BENCHMARK_KEYS,
    ...scoringConfig.intelligenceBenchmarkKeys,
    ...scoringConfig.agenticBenchmarkKeys,
  ]);
  const candidates = new Set(models.flatMap((model) => Object.keys(model.benchmarks ?? {})));
  const sample = selectPruneSampleModels(models, finalConfig);
  const sparseKeys = new Set(
    [...candidates].filter(
      (key) =>
        !retainedKeys.has(key) &&
        sample.filter((model) => model.benchmarks?.[key] == null).length / sample.length >
          finalConfig.nullFieldPruneThreshold,
    ),
  );
  if (sparseKeys.size === 0) return models;
  return models.map((model) =>
    model.benchmarks == null
      ? model
      : {
          ...model,
          benchmarks: Object.fromEntries(
            Object.entries(model.benchmarks).filter(([key]) => !sparseKeys.has(key)),
          ),
        },
  );
}

/** Free routes collapse within each reasoning variant so the dashboard can expand variants without duplicate routes. */
function collapseFreeRoutesByVariant<Model extends ModelAtlasModel>(models: Model[]): Model[] {
  const modelByPublicId = new Map<string, { model: Model; isFreeRoute: boolean }>();
  const passthrough: Model[] = [];

  for (const model of models) {
    const publicId = publicOpenRouterModelId(model.id);
    const publicName = publicOpenRouterModelName(model.name, publicId);
    const normalizedModel = {
      ...model,
      id: publicId,
      name: publicName,
    } as Model;
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

function normalizedModelsForId<Model extends ModelAtlasModel>(
  models: Model[],
  id: string | null | undefined,
): Model[] {
  const normalizedModels = collapseFreeRoutesByVariant(models);
  const normalizedId = publicOpenRouterModelId(id ?? null);
  return normalizedId == null
    ? normalizedModels
    : normalizedModels.filter((model) => publicOpenRouterModelId(model.id) === normalizedId);
}

/** Select public-facing rows while retaining each winning route's provenance for final scoring and admission. */
export function selectReferenceModels(
  scoredCandidates: ModelAtlasScoredCandidate[],
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): (ModelAtlasModel & Pick<ModelAtlasScoredCandidate, "scoring_sources">)[] {
  const signalModels = scoredCandidates.flatMap((model) => {
    const publicModel = publicModelFromCandidate(model);
    return publicModel == null ? [] : [{ ...publicModel, scoring_sources: model.scoring_sources }];
  });
  const sortedModels = sortByIntelligenceScore(signalModels);
  const prunedModels = pruneSparseBenchmarks(sortedModels, finalConfig, scoringConfig);
  return normalizedModelsForId(prunedModels, id);
}
