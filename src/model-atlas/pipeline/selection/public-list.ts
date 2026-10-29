/** Public model selection owns admission (identity, observed evidence, quality, and relevance gates) and route collapse. */

import {
  indexPolicy,
  isAggregateIndex,
  reportedIndexBenchmarkCount,
  residualIndexBreadth,
} from "../../benchmarks/index-policy";
import {
  type BenchmarkAdmissionConfig,
  type ScoringConfig,
  selectedBenchmarkKeys,
} from "../../config/stage";
import {
  hasPublicFreeRouteLabel,
  isOpenRouterFreeRouteId,
  publicOpenRouterModelId,
  publicOpenRouterModelName,
} from "../../identity/openrouter";
import { asFiniteNumber } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasCandidateComponentScores,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import { observedBenchmarkCount } from "../scores/score-builders";

const REQUIRED_QUALITY_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;
const MIN_PUBLIC_RELATIVE_SCORE = 10;

type IdentityCandidate = Pick<ModelAtlasCandidate, "id" | "name" | "modalities">;

type BenchmarkEvidenceCandidate = Pick<
  ModelAtlasScoredCandidate,
  "intelligence" | "benchmarks" | "scoring_sources"
>;

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

/** Require observed breadth and both dimensions, plus two indexes or one trusted Artificial Analysis or Epoch index; estimates cannot satisfy admission. */
export function hasRequiredBenchmarkEvidence(
  model: BenchmarkEvidenceCandidate,
  scoringConfig: ScoringConfig,
  admissionConfig: BenchmarkAdmissionConfig,
): boolean {
  const observedWeight = observedBenchmarkWeight(model, scoringConfig);
  const observedIntelligenceCount = observedBenchmarkCount(
    model,
    scoringConfig.intelligenceBenchmarkKeys,
  );
  const observedAgenticCount = observedBenchmarkCount(model, scoringConfig.agenticBenchmarkKeys);
  const selectedIndexes = selectedBenchmarkKeys(scoringConfig).filter(isAggregateIndex);
  const observedIndexCount = observedBenchmarkCount(model, selectedIndexes);
  const hasTrustedIndex = selectedIndexes.some(
    (key) =>
      (key === "aa_intelligence_index" || key === "epoch_capabilities_index") &&
      observedBenchmarkCount(model, [key]) > 0,
  );
  return (
    observedWeight >= admissionConfig.minimumObservedWeight &&
    observedIntelligenceCount >= admissionConfig.minimumObservedPerDimension &&
    observedAgenticCount >= admissionConfig.minimumObservedPerDimension &&
    (observedIndexCount >= admissionConfig.minimumObservedIndexes || hasTrustedIndex)
  );
}

/** Union known component evidence and add opaque index breadth; imputed values never enter this observed-only measure. */
function observedBenchmarkWeight(
  model: BenchmarkEvidenceCandidate,
  scoringConfig: ScoringConfig,
): number {
  const namedWeights = new Map<string, number>();
  let opaqueWeight = 0;
  for (const key of selectedBenchmarkKeys(scoringConfig)) {
    if (observedBenchmarkCount(model, [key]) === 0) continue;
    const policy = indexPolicy(key);
    if (policy != null) {
      const components = new Set(policy.componentBenchmarkKeys ?? []);
      opaqueWeight += Math.max(
        0,
        residualIndexBreadth(key, [], reportedIndexBenchmarkCount(model, key)) - components.size,
      );
      for (const component of components) {
        namedWeights.set(component, Math.max(namedWeights.get(component) ?? 0, 1));
      }
    } else {
      const importance = scoringConfig.benchmarkPortfolio[key]?.benchmarkImportance ?? 0;
      namedWeights.set(key, Math.max(namedWeights.get(key) ?? 0, importance));
    }
  }
  return opaqueWeight + [...namedWeights.values()].reduce((sum, weight) => sum + weight, 0);
}

/** Relative Intelligence and Agentic must both exceed 10; release age remains a dashboard filter. */
export function hasRequiredPublicRelevance(model: {
  scores: Partial<ModelAtlasScoredCandidate["scores"]> | null;
}): boolean {
  return REQUIRED_QUALITY_SCORE_KEYS.every((key) => {
    const score = asFiniteNumber(model.scores?.[key]);
    return score != null && score > MIN_PUBLIC_RELATIVE_SCORE;
  });
}

/** Admission requires an identified text model; optional specifications stay nullable. */
export function hasRequiredModelIdentity(model: IdentityCandidate): boolean {
  return (
    model.id != null &&
    /^[^/\s]+\/[^/\s]+$/.test(model.id) &&
    model.name != null &&
    model.name.trim().length > 0 &&
    model.modalities?.output?.includes("text") === true
  );
}

/** Project scored candidates onto the public contract before pruning can preserve internal fields. */
function publicModelFields(model: ModelAtlasScoredCandidate) {
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
    ...publicModelFields(model),
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

export function publicModelFromCandidate(model: ModelAtlasScoredCandidate): ModelAtlasModel | null {
  return hasRequiredQualityScores(model) ? toPublicModel(model) : null;
}

/** Free routes collapse within each reasoning variant so the dashboard can expand variants without duplicate routes. */
function collapseFreeRoutesByVariant<Model extends ModelAtlasModel>(models: Model[]): Model[] {
  const modelByVariantId = new Map<string, { model: Model; isFreeRoute: boolean }>();
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
    const existing = modelByVariantId.get(variantId);
    if (!existing || (existing.isFreeRoute && !candidateIsFreeRoute)) {
      modelByVariantId.set(variantId, {
        model: normalizedModel,
        isFreeRoute: candidateIsFreeRoute,
      });
    }
  }

  return sortByIntelligenceScore([
    ...passthrough,
    ...[...modelByVariantId.values()].map(({ model }) => model),
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
  modelId: string | null | undefined,
): (ModelAtlasModel & Pick<ModelAtlasScoredCandidate, "scoring_sources">)[] {
  const signalModels = scoredCandidates.flatMap((model) => {
    const publicModel = publicModelFromCandidate(model);
    return publicModel == null ? [] : [{ ...publicModel, scoring_sources: model.scoring_sources }];
  });
  return normalizedModelsForId(sortByIntelligenceScore(signalModels), modelId);
}
