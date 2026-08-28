/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

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
import type { OpenRouterModelData } from "../openrouter-data";
import { attachFinalScores, buildPreviewResourceScoreResults } from "../scores";
import {
  prepareBenchmarkScoring,
  prepareEffortResourceImputation,
  withoutBenchmarkImputationForModels,
} from "../scores/imputation";
import {
  buildPreviewComponentScoreResult,
  calibrateSparseEffortQualityScores,
  observedBenchmarkCount,
} from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  buildModelCandidate,
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

const MIN_PUBLIC_COMPONENT_SCORE = 10;
const PUBLIC_COMPONENT_SCORE_KEYS = [
  "intelligence_score",
  "agentic_score",
  "speed_score",
  "value_score",
] as const;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

type BasicSpecCandidate = Pick<
  ModelAtlasCandidate,
  "id" | "name" | "release_date" | "modalities" | "cost" | "context_window" | "speed"
>;
type BenchmarkEvidenceCandidate = Pick<ModelAtlasScoredCandidate, "intelligence" | "benchmarks">;

function publicModelIdentityKeys(model: Pick<ModelAtlasScoredCandidate, "id" | "name">): string[] {
  const publicId = publicOpenRouterModelId(model.id);
  return [canonicalModelKey(model), ...(publicId == null ? [] : [`id:${publicId}`])];
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

function selectedBenchmarkKeys(scoringConfig: ScoringConfig): string[] {
  return [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
}

/** Requires a usable non-benchmark profile before a source row becomes a leaderboard model. */
export function hasRequiredBasicSpecs(model: BasicSpecCandidate): boolean {
  return (
    model.id != null &&
    model.name != null &&
    model.release_date != null &&
    model.modalities?.output?.includes("text") === true &&
    asFiniteNumber(model.cost?.input) != null &&
    asFiniteNumber(model.cost?.output) != null &&
    asFiniteNumber(model.context_window?.context) != null &&
    asFiniteNumber(model.context_window?.output) != null &&
    asFiniteNumber(model.speed.throughput_tokens_per_second_median) != null &&
    (asFiniteNumber(model.speed.latency_seconds_median) != null ||
      asFiniteNumber(model.speed.e2e_latency_seconds_median) != null)
  );
}

/** Admit variants with broad evidence, both quality dimensions, and at least one aggregate index. */
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
  const observedIndexCount = observedBenchmarkCount(model, admissionConfig.indexBenchmarkKeys);
  return (
    observedCount >= admissionConfig.minimumObservedBenchmarks &&
    observedIntelligenceCount >= admissionConfig.minimumObservedPerDimension &&
    observedAgenticCount >= admissionConfig.minimumObservedPerDimension &&
    observedIndexCount >= 1
  );
}

/** Admit a final row when at least one primary score reaches the public relevance floor. */
export function hasRequiredPublicRelevance(
  model: Pick<ModelAtlasScoredCandidate, "scores">,
): boolean {
  return PUBLIC_COMPONENT_SCORE_KEYS.some((key) => {
    const score = asFiniteNumber(model.scores?.[key]);
    return score != null && score >= MIN_PUBLIC_COMPONENT_SCORE;
  });
}

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

/** Build visibly provisional rows without allowing their alternate score policy into official admission or ranking. */
function buildPreviewModels(
  scoredCandidates: ModelAtlasScoredCandidate[],
  admittedModels: ModelAtlasModel[],
  observedDate: string,
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
  scoringPreparation: ReturnType<typeof prepareBenchmarkScoring>,
): ModelAtlasPreviewModel[] {
  const admittedModelIdentities = publicModelIdentitySet(admittedModels);
  const previewCandidates = scoredCandidates.map((model) => {
    if (
      hasPublicModelIdentity(admittedModelIdentities, model) ||
      !isRecentPreviewCandidate(model, observedDate, finalConfig.previewMaxAgeDays) ||
      !hasRequiredBasicSpecs(model)
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

function buildCandidates(
  openRouterData: OpenRouterModelData,
  scoringConfig: ScoringConfig,
  scoringPreparation: ReturnType<typeof prepareBenchmarkScoring>,
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

/** Build the publication cohort through versioning, imputation calibration, effort scoring, public admission, preview isolation, and logo hydration. */
export async function buildFinalModels(
  openRouterData: OpenRouterModelData,
  id: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
  versioning: BenchmarkVersioningOptions = {
    baselineDate: new Date().toISOString().slice(0, 10),
    observedDate: new Date().toISOString().slice(0, 10),
  },
  previousModels: readonly ModelAtlasModel[] = [],
): Promise<ModelAtlasPublishedModel[]> {
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
  const candidateModels = calibrateSparseEffortQualityScores(
    provisionalCandidates,
    scoringConfig,
    scoringPreparation.qualityContext,
  );
  const resourceImputation = prepareEffortResourceImputation(
    candidateModels,
    scoringConfig,
    scoringPreparation,
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
  const previousOfficialModelIdentities = publicModelIdentitySet(previousModels);
  // Public admission is output-only and must not redefine the scoring reference population.
  // Preview status applies only to newly surfaced recent models; prior official models retain normal admission and rank.
  const admittedPublicModels = rescoredReferenceModels
    .filter(
      (model) =>
        hasPublicModelIdentity(previousOfficialModelIdentities, model) ||
        !isRecentPreviewCandidate(model, versioning.observedDate, finalConfig.previewMaxAgeDays),
    )
    .filter(hasRequiredBasicSpecs)
    .filter((model) =>
      hasRequiredBenchmarkEvidence(model, scoringConfig, finalConfig.benchmarkAdmission),
    )
    .filter(hasRequiredQualityScores)
    .filter(hasRequiredPublicRelevance);
  const previewModels = buildPreviewModels(
    scoredCandidates,
    admittedPublicModels,
    versioning.observedDate,
    id,
    finalConfig,
    scoringConfig,
    scoringPreparation,
  );
  return cacheModelLogos(
    [...admittedPublicModels, ...previewModels],
    (model) => model.provider ?? model.id,
  );
}
