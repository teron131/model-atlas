/** Model selection prepares quality scores before route enrichment, then finalizes resource scores, admission, and logo hydration. */

import { ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS } from "../../benchmarks/field-keys";
import type { BenchmarkAdmissionConfig, FinalStageConfig, ScoringConfig } from "../../config/stage";
import { canonicalModelKey } from "../../identity/normalization";
import { publicOpenRouterModelId } from "../../identity/openrouter";
import { cacheModelLogos } from "../../logos/cache";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasModel,
  ModelAtlasPreviewModel,
  ModelAtlasPublishedModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import { type OpenRouterModelData, prepareOpenRouterModelData } from "../openrouter-data";
import { attachFinalScores, buildPreviewResourceScoreResults } from "../scores";
import {
  benchmarkImputationConfidence,
  benchmarkImputationValues,
  type BenchmarkScoringPreparation,
  prepareBenchmarkScoring,
  prepareEffortResourceImputation,
  withoutBenchmarkImputationForModels,
} from "../scores/imputation";
import { prepareSiblingQualityScoringContext } from "../scores/imputation/sibling-quality";
import { buildAgenticTokenScoringContext } from "../scores/quality-context";
import { applyResourceEvidenceRequirements } from "../scores/resource-metrics";
import {
  buildComponentScoreResult,
  buildPreviewComponentScoreResult,
  observedBenchmarkCount,
} from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  buildModelCandidate,
  enrichModelResources,
  versionCandidateBenchmarkData,
} from "./candidate";
import {
  hasRequiredQualityScores,
  normalizePreviewModels,
  previewModelFromCandidate,
  selectPublicModels,
} from "./public-list";
import {
  buildPreviousModelLookup,
  isVersionReplacementRow,
  prepareVersionReplacementBenchmarkRows,
  versionReplacementBenchmarkWeights,
} from "./version-replacement";

const MIN_PUBLIC_QUALITY_SCORE = 10;
const PUBLIC_QUALITY_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

type BasicSpecCandidate = Pick<
  ModelAtlasCandidate,
  "id" | "name" | "release_date" | "modalities" | "cost" | "context_window" | "speed"
>;

type BenchmarkEvidenceCandidate = Pick<ModelAtlasScoredCandidate, "intelligence" | "benchmarks">;

export type ModelSelection = {
  modelRows: Record<string, unknown>[];
  candidates: ModelAtlasCandidate[];
  scoringPreparation: BenchmarkScoringPreparation;
  observedDate: string;
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
  scoringPreparation.qualityContext = prepareSiblingQualityScoringContext(
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
      benchmarkImputationConfidence(scoringPreparation, row),
      versionReplacementBenchmarkWeights(row, scoringConfig),
    );
    return { ...model, component_scores: result.componentScores, confidence: result.confidence };
  });
  return {
    modelRows,
    candidates: qualityScoredCandidates,
    scoringPreparation,
    observedDate: versioning.observedDate,
  };
}

/** Request routes only after regular or preview quality clears the existing relevance floor; missing route metrics cannot disqualify a model before fetching. */
export function selectOpenRouterModelRows(
  selection: ModelSelection,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): Record<string, unknown>[] {
  const { modelRows, candidates, scoringPreparation, observedDate } = selection;
  return modelRows.filter((_row, index) => {
    const model = candidates[index]!;
    if (
      model.id == null ||
      model.name == null ||
      model.modalities?.output?.includes("text") !== true
    ) {
      return false;
    }
    const hasBroadEvidence = hasRequiredBenchmarkEvidence(
      model,
      scoringConfig,
      finalConfig.benchmarkAdmission,
    );
    if (hasBroadEvidence && hasRequiredPublicRelevance({ scores: model.component_scores })) {
      return true;
    }
    const canPreview = hasBroadEvidence
      ? isPreviewCandidate(model, observedDate, finalConfig, scoringConfig)
      : hasRequiredCatalogSpecs(model) &&
        hasRequiredIndexEvidence(model, finalConfig.benchmarkAdmission) &&
        isRecentPreviewCandidate(model, observedDate, finalConfig.previewMaxAgeDays);
    if (!canPreview) return false;
    const preview = buildPreviewComponentScoreResult(
      asRecord(model),
      scoringConfig,
      scoringPreparation.qualityContext,
    );
    return hasRequiredPublicRelevance({ scores: preview.componentScores });
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
  const { modelRows, candidates, scoringPreparation, observedDate } = selection;
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
  const selectedReferenceModels = selectPublicModels(
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
  // Age limits only undercovered previews; benchmark-complete previews can precede a public release and complete metadata.
  const admittedPublicModels = rescoredReferenceModels
    .filter(hasRequiredBasicSpecs)
    .filter((model) =>
      hasRequiredBenchmarkEvidence(model, scoringConfig, finalConfig.benchmarkAdmission),
    )
    .filter(hasRequiredQualityScores)
    .filter(hasRequiredPublicRelevance);
  const previewModels = buildPreviewModels(
    scoredCandidates,
    admittedPublicModels,
    observedDate,
    id,
    finalConfig,
    scoringConfig,
    scoringPreparation,
  );
  return cacheModelLogos(
    [...admittedPublicModels, ...previewModels].map((model) =>
      applyResourceEvidenceRequirements(model, scoringConfig.benchmarkPortfolio),
    ),
    (model) => model.provider ?? model.id,
  );
}

/** Requires a usable non-benchmark profile before a source row becomes a leaderboard model. */
export function hasRequiredBasicSpecs(model: BasicSpecCandidate): boolean {
  return (
    hasRequiredCatalogSpecs(model) &&
    asFiniteNumber(model.cost?.input) != null &&
    asFiniteNumber(model.cost?.output) != null &&
    asFiniteNumber(model.speed.throughput_tokens_per_second_median) != null &&
    (asFiniteNumber(model.speed.latency_seconds_median) != null ||
      asFiniteNumber(model.speed.e2e_latency_seconds_median) != null)
  );
}

/** Admit variants with broad evidence, both quality dimensions, and the minimum index signal count. */
export function hasRequiredBenchmarkEvidence(
  model: BenchmarkEvidenceCandidate,
  scoringConfig: ScoringConfig,
  admissionConfig: BenchmarkAdmissionConfig,
): boolean {
  const selectedKeys = selectedBenchmarkKeys(scoringConfig);
  const observedCount = observedBenchmarkCount(model, selectedKeys);
  const observedIntelligenceCount = observedBenchmarkCount(
    model,
    scoringConfig.intelligenceBenchmarkKeys,
  );
  const observedAgenticCount = observedBenchmarkCount(model, scoringConfig.agenticBenchmarkKeys);
  return (
    observedCount >= admissionConfig.minimumObservedBenchmarks &&
    observedIntelligenceCount >= admissionConfig.minimumObservedPerDimension &&
    observedAgenticCount >= admissionConfig.minimumObservedPerDimension &&
    hasRequiredIndexEvidence(model, admissionConfig)
  );
}

/** Admit a final row when both public quality scores reach the relevance floor. */
export function hasRequiredPublicRelevance(model: {
  scores: Partial<ModelAtlasScoredCandidate["scores"]> | null;
}): boolean {
  return PUBLIC_QUALITY_SCORE_KEYS.every((key) => {
    const score = asFiniteNumber(model.scores?.[key]);
    return score != null && score >= MIN_PUBLIC_QUALITY_SCORE;
  });
}

/** Limit the undercoverage exception to released models younger than the preview window. */
export function isRecentPreviewCandidate(
  model: Pick<ModelAtlasScoredCandidate, "id" | "name" | "release_date" | "modalities">,
  observedDate: string,
  maxAgeDays: number,
): boolean {
  if (model.id == null || model.name == null || model.release_date == null) {
    return false;
  }
  if (model.modalities?.output?.includes("text") !== true) {
    return false;
  }
  const releaseDay = model.release_date.slice(0, 10);
  const observedDay = observedDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDay) || !/^\d{4}-\d{2}-\d{2}$/.test(observedDay)) {
    return false;
  }
  const releaseTimestamp = Date.parse(`${releaseDay}T00:00:00Z`);
  const observedTimestamp = Date.parse(`${observedDay}T00:00:00Z`);
  if (!Number.isFinite(releaseTimestamp) || !Number.isFinite(observedTimestamp)) {
    return false;
  }
  const ageDays = (observedTimestamp - releaseTimestamp) / MILLISECONDS_PER_DAY;
  return ageDays >= 0 && ageDays < maxAgeDays;
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

/** Allow incomplete metadata only with broad observed evidence; sparse evidence still requires recent release and complete specs. */
function isPreviewCandidate(
  model: BasicSpecCandidate & BenchmarkEvidenceCandidate,
  observedDate: string,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): boolean {
  const completeSpecs = hasRequiredBasicSpecs(model);
  if (hasRequiredBenchmarkEvidence(model, scoringConfig, finalConfig.benchmarkAdmission)) {
    return (
      !completeSpecs &&
      model.id != null &&
      /^[^/\s]+\/[^/\s]+$/.test(model.id) &&
      model.name != null &&
      model.name.trim().length > 0 &&
      model.modalities?.output?.includes("text") === true
    );
  }
  return (
    completeSpecs &&
    isRecentPreviewCandidate(model, observedDate, finalConfig.previewMaxAgeDays) &&
    hasRequiredIndexEvidence(model, finalConfig.benchmarkAdmission)
  );
}

function hasRequiredCatalogSpecs(model: BasicSpecCandidate): boolean {
  return (
    model.id != null &&
    model.name != null &&
    model.release_date != null &&
    model.modalities?.output?.includes("text") === true &&
    asFiniteNumber(model.context_window?.context) != null &&
    asFiniteNumber(model.context_window?.output) != null
  );
}

function hasRequiredIndexEvidence(
  model: BenchmarkEvidenceCandidate,
  admissionConfig: BenchmarkAdmissionConfig,
): boolean {
  return observedIndexCount(model, admissionConfig) >= admissionConfig.minimumObservedIndexes;
}

/** Score eligible previews from direct observations, then apply the same public relevance floor as ordinary models. */
function buildPreviewModels(
  scoredCandidates: ModelAtlasScoredCandidate[],
  admittedModels: ModelAtlasModel[],
  observedDate: string,
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
): ModelAtlasPreviewModel[] {
  const admittedModelIdentities = publicModelIdentitySet(admittedModels);
  const previewCandidates = scoredCandidates.map((model) => {
    if (
      hasPublicModelIdentity(admittedModelIdentities, model) ||
      !isPreviewCandidate(model, observedDate, finalConfig, scoringConfig)
    ) {
      return null;
    }
    const previewResult = buildPreviewComponentScoreResult(
      asRecord(model),
      scoringConfig,
      scoringPreparation.qualityContext,
    );
    return { model, previewResult };
  });
  const previewResourceResults = buildPreviewResourceScoreResults(
    scoredCandidates,
    previewCandidates.map((candidate) => candidate?.previewResult.componentScores ?? null),
    scoringConfig,
  );
  const previewModels = previewCandidates.flatMap((candidate, index) => {
    if (candidate == null) {
      return [];
    }
    const { model, previewResult } = candidate;
    const previewResources = previewResourceResults[index];
    const previewCandidate = {
      ...model,
      component_scores:
        previewResult.componentScores == null
          ? null
          : {
              ...previewResult.componentScores,
              speed_score: previewResources?.scores.speed_score ?? null,
            },
      confidence: {
        ...previewResult.confidence,
        speed: previewResources?.confidence.speed ?? null,
        value: previewResources?.confidence.value ?? null,
      },
      scores: {
        ...model.scores,
        intelligence_score: previewResult.componentScores?.intelligence_score ?? null,
        agentic_score: previewResult.componentScores?.agentic_score ?? null,
        speed_score: previewResources?.scores.speed_score ?? null,
        value_score: previewResources?.scores.value_score ?? null,
      },
    };
    if (!hasRequiredQualityScores(previewCandidate)) {
      return [];
    }
    const previewModel = previewModelFromCandidate(previewCandidate);
    return hasRequiredPublicRelevance(previewModel) ? [previewModel] : [];
  });
  return normalizePreviewModels(previewModels, id);
}

function selectedBenchmarkKeys(scoringConfig: ScoringConfig): string[] {
  return [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
}

function observedIndexCount(
  model: BenchmarkEvidenceCandidate,
  admissionConfig: BenchmarkAdmissionConfig,
): number {
  const intelligence = asRecord(model.intelligence);
  const artificialAnalysisIndexCount = admissionConfig.indexBenchmarkKeys.includes(
    "aa_intelligence_index",
  )
    ? ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS.reduce(
        (count, key) => count + (asFiniteNumber(intelligence[key]) == null ? 0 : 1),
        0,
      )
    : 0;
  const otherIndexKeys = admissionConfig.indexBenchmarkKeys.filter(
    (key) => key !== "aa_intelligence_index",
  );
  return artificialAnalysisIndexCount + observedBenchmarkCount(model, otherIndexKeys);
}

function publicModelIdentitySet(
  models: readonly Pick<ModelAtlasScoredCandidate, "id" | "name">[],
): Set<string> {
  return new Set(models.flatMap(publicModelIdentityKeys));
}

function hasPublicModelIdentity(
  identities: ReadonlySet<string>,
  model: Pick<ModelAtlasScoredCandidate, "id" | "name">,
): boolean {
  return publicModelIdentityKeys(model).some((key) => identities.has(key));
}

function publicModelIdentityKeys(model: Pick<ModelAtlasScoredCandidate, "id" | "name">): string[] {
  const publicId = publicOpenRouterModelId(model.id);
  return [canonicalModelKey(model), ...(publicId == null ? [] : [`id:${publicId}`])];
}
