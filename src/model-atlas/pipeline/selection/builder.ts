/** Model selection prepares quality scores before route enrichment, then finalizes resource scores, admission, and logo hydration. */

import {
  indexPolicy,
  isAggregateIndex,
  reportedIndexBenchmarkCount,
} from "../../benchmarks/index-policy";
import type { BenchmarkAdmissionConfig, FinalStageConfig, ScoringConfig } from "../../config/stage";
import { cacheModelLogos } from "../../logos/cache";
import { asFiniteNumber, asRecord } from "../../runtime";
import { advanceCapabilities, type CapabilityState } from "../../timeline/capability";
import type {
  ModelAtlasCandidate,
  ModelAtlasModel,
  ModelAtlasPublishedModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import { type OpenRouterModelData, prepareOpenRouterModelData } from "../openrouter-data";
import { attachFinalScores } from "../scores";
import {
  benchmarkImputationFactors,
  benchmarkImputationValues,
  type BenchmarkScoringPreparation,
  prepareBenchmarkScoring,
  prepareEffortResourceImputation,
  withoutBenchmarkImputationForModels,
} from "../scores/imputation";
import { prepareEffortQualityScoringContext } from "../scores/imputation/effort-quality";
import { buildAgenticTokenScoringContext } from "../scores/quality-context";
import { applyResourceEvidenceRequirements } from "../scores/resource-metrics";
import { buildComponentScoreResult, observedBenchmarkCount } from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  buildModelCandidate,
  enrichModelResources,
  versionCandidateBenchmarkData,
} from "./candidate";
import {
  hasRequiredQualityScores,
  publicModelFromCandidate,
  selectReferenceModels,
} from "./public-list";
import {
  buildPreviousModelLookup,
  isVersionReplacementRow,
  prepareVersionReplacementBenchmarkRows,
  versionReplacementBenchmarkWeights,
} from "./version-replacement";

const MIN_PUBLIC_RELATIVE_SCORE = 10;
const PUBLIC_QUALITY_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;

type IdentityCandidate = Pick<ModelAtlasCandidate, "id" | "name" | "modalities">;

type BenchmarkEvidenceCandidate = Pick<
  ModelAtlasScoredCandidate,
  "intelligence" | "benchmarks" | "scoring_sources"
>;

export type ModelSelection = {
  modelRows: Record<string, unknown>[];
  candidates: ModelAtlasCandidate[];
  scoringPreparation: BenchmarkScoringPreparation;
  capabilityState?: CapabilityState;
};

/** Compute quality once against the complete benchmark population before choosing per-model network work. */
export function prepareModelSelection(
  rows: Record<string, unknown>[],
  scoringConfig: ScoringConfig,
  versioning: BenchmarkVersioningOptions = {
    baselineDate: new Date().toISOString().slice(0, 10),
    observedDate: new Date().toISOString().slice(0, 10),
  },
  previousModels: readonly ModelAtlasModel[] = [],
  capabilityState?: CapabilityState,
): ModelSelection {
  const openRouterData = prepareOpenRouterModelData(rows, scoringConfig, null);
  const modelRows = prepareVersionReplacementBenchmarkRows(
    openRouterData.modelRows,
    previousModels,
    scoringConfig,
  );
  const preparedOpenRouterData = { ...openRouterData, modelRows };
  const replacementRows = modelRows.filter((row) => isVersionReplacementRow(asRecord(row)));
  const scoringPreparation = withoutBenchmarkImputationForModels(
    prepareBenchmarkScoring(modelRows, scoringConfig),
    replacementRows,
  );
  const provisionalCandidates = buildCandidates(
    preparedOpenRouterData,
    scoringConfig,
    scoringPreparation,
    previousModels,
    versioning,
  );
  const imputationCandidates = provisionalCandidates.filter(
    (_model, index) => !isVersionReplacementRow(asRecord(modelRows[index])),
  );
  const tokenImputation = prepareEffortResourceImputation(
    imputationCandidates,
    scoringConfig,
    scoringPreparation,
    ["tokens", "output_tokens"],
  );
  scoringPreparation.qualityContext = buildAgenticTokenScoringContext(
    provisionalCandidates,
    scoringConfig,
    scoringPreparation.qualityContext,
    tokenImputation,
  );
  scoringPreparation.qualityContext = prepareEffortQualityScoringContext(
    imputationCandidates,
    scoringConfig,
    scoringPreparation.qualityContext,
  );
  const qualityScoredCandidates = provisionalCandidates.map((model, index) => {
    const row = asRecord(modelRows[index]);
    const result = buildComponentScoreResult(
      asRecord(model),
      model.speed,
      openRouterData.outputTokenAnchors,
      scoringConfig,
      scoringPreparation.qualityContext,
      benchmarkImputationValues(scoringPreparation, row),
      benchmarkImputationFactors(scoringPreparation, row),
      versionReplacementBenchmarkWeights(row, scoringConfig),
    );
    return { ...model, component_scores: result.componentScores, confidence: result.confidence };
  });
  if (capabilityState) {
    capabilityState = advanceCapabilities(
      capabilityState,
      qualityScoredCandidates,
      versioning.observedAt ?? new Date().toISOString(),
    );
  }
  return {
    modelRows,
    candidates: qualityScoredCandidates,
    scoringPreparation,
    capabilityState,
  };
}

/** Fetch routes for evidence-qualified configurations that clear the relative capability floor. */
export function selectOpenRouterModelRows(
  selection: ModelSelection,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): Record<string, unknown>[] {
  const { modelRows, candidates } = selection;
  return modelRows.filter((_row, index) => {
    const model = candidates[index]!;
    if (
      model.id == null ||
      model.name == null ||
      model.modalities?.output?.includes("text") !== true
    ) {
      return false;
    }
    const broadEvidence = hasRequiredBenchmarkEvidence(
      model,
      scoringConfig,
      finalConfig.benchmarkAdmission,
    );
    return broadEvidence && hasRequiredPublicRelevance({ scores: model.component_scores });
  });
}

/** Enrich the prepared population with route telemetry, then finish resource scoring and public admission. */
export async function buildFinalModels(
  selection: ModelSelection,
  openRouterData: OpenRouterModelData,
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): Promise<ModelAtlasPublishedModel[]> {
  const { modelRows, candidates, scoringPreparation } = selection;
  const candidateModels = candidates.map((model, index) =>
    enrichModelResources(model, modelRows[index]!, openRouterData),
  );
  const resourceImputation = prepareEffortResourceImputation(
    candidateModels,
    scoringConfig,
    scoringPreparation,
    ["cost", "time"],
  );
  const scoredCandidates = attachFinalScores(
    candidateModels,
    scoringConfig,
    scoringPreparation,
    resourceImputation,
  );
  const selectedReferenceModels = selectReferenceModels(
    scoredCandidates,
    id,
    finalConfig,
    scoringConfig,
  );
  const rescoredReferenceModels = attachFinalScores(
    selectedReferenceModels.map((model) => ({
      ...model,
      scores: null,
    })),
    scoringConfig,
    scoringPreparation,
    resourceImputation,
  );
  // Public admission is output-only and must not redefine the scoring reference population.
  const admittedPublicModels = rescoredReferenceModels
    .filter(hasRequiredModelIdentity)
    .filter((model) =>
      hasRequiredBenchmarkEvidence(model, scoringConfig, finalConfig.benchmarkAdmission),
    )
    .filter(hasRequiredQualityScores)
    .filter(hasRequiredPublicRelevance);
  return cacheModelLogos(
    admittedPublicModels.map((model) =>
      publicModelFromCandidate(
        applyResourceEvidenceRequirements(model, scoringConfig.benchmarkPortfolio),
      )!,
    ),
    (model) => model.provider ?? model.id,
  );
}

/** Require observed breadth and both dimensions, plus two indexes or one trusted AA/Epoch index; estimates cannot satisfy admission. */
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
      const components = new Set(policy.standaloneComponents);
      opaqueWeight += Math.max(
        0,
        (reportedIndexBenchmarkCount(model, key) ?? policy.representedBenchmarks) - components.size,
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
  return PUBLIC_QUALITY_SCORE_KEYS.every((key) => {
    const score = asFiniteNumber(model.scores?.[key]);
    return score != null && score > MIN_PUBLIC_RELATIVE_SCORE;
  });
}

function buildCandidates(
  openRouterData: OpenRouterModelData,
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
  previousModels: readonly ModelAtlasModel[],
  versioning: BenchmarkVersioningOptions,
): ModelAtlasCandidate[] {
  const previousModelForRow = buildPreviousModelLookup(previousModels);
  return openRouterData.modelRows.map((row) => {
    const candidate = buildModelCandidate(
      row,
      openRouterData.speedByModelId,
      openRouterData.pricingByModelId,
      openRouterData.outputTokenAnchors,
      scoringConfig,
      scoringPreparation,
      versionReplacementBenchmarkWeights(asRecord(row), scoringConfig),
    );
    return versionCandidateBenchmarkData(candidate, previousModelForRow(asRecord(row)), versioning);
  });
}

function selectedBenchmarkKeys(scoringConfig: ScoringConfig): string[] {
  return [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
}

/** Admission requires an identified text model; optional specifications stay nullable. */
function hasRequiredModelIdentity(model: IdentityCandidate): boolean {
  return (
    model.id != null &&
    /^[^/\s]+\/[^/\s]+$/.test(model.id) &&
    model.name != null &&
    model.name.trim().length > 0 &&
    model.modalities?.output?.includes("text") === true
  );
}
