/** Model selection prepares quality scores before route enrichment, then finalizes resource scores, admission, and logo hydration. */

import type { FinalStageConfig, ScoringConfig } from "../../config/stage";
import { cacheModelLogos } from "../../logos/cache";
import { asRecord } from "../../runtime";
import { advanceCapabilityState, type CapabilityState } from "../../timeline/capability";
import type { ModelAtlasCandidate, ModelAtlasModel, ModelRow } from "../model-types";
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
import { blendPairwiseQualityScores } from "../scores/pairwise-quality";
import { buildAgenticTokenScoringContext } from "../scores/quality-context";
import { applyResourceEvidenceRequirements } from "../scores/resource-metrics";
import { buildComponentScoreResult } from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  versionCandidateBenchmarkData,
} from "./benchmark-versioning";
import { buildModelCandidate, enrichModelResources } from "./candidate";
import {
  hasRequiredBenchmarkEvidence,
  hasRequiredModelIdentity,
  hasRequiredPublicRelevance,
  hasRequiredQualityScores,
  publicModelFromCandidate,
  selectReferenceModels,
} from "./public-list";
import {
  buildPreviousModelLookup,
  dropStaleReplacementBenchmarks,
  isVersionReplacementRow,
  versionReplacementBenchmarkWeights,
} from "./version-replacement";

export type ModelSelection = {
  modelRows: ModelRow[];
  candidates: ModelAtlasCandidate[];
  scoringPreparation: BenchmarkScoringPreparation;
  capabilityState?: CapabilityState;
};

/** Compute quality once against the complete benchmark population before choosing per-model network work. */
export function prepareModelSelection(
  rows: ModelRow[],
  scoringConfig: ScoringConfig,
  versioning: BenchmarkVersioningOptions = {
    baselineDate: new Date().toISOString().slice(0, 10),
    observedDate: new Date().toISOString().slice(0, 10),
  },
  previousModels: readonly ModelAtlasModel[] = [],
  capabilityState?: CapabilityState,
): ModelSelection {
  const openRouterData = prepareOpenRouterModelData(rows, scoringConfig, null);
  const modelRows = dropStaleReplacementBenchmarks(rows, previousModels, scoringConfig);
  const replacementRows = modelRows.filter(isVersionReplacementRow);
  const scoringPreparation = withoutBenchmarkImputationForModels(
    prepareBenchmarkScoring(modelRows, scoringConfig),
    replacementRows,
  );
  const candidatesWithRows = buildCandidates(
    modelRows,
    openRouterData,
    scoringConfig,
    scoringPreparation,
    previousModels,
    versioning,
  );
  const provisionalCandidates = candidatesWithRows.map(({ candidate }) => candidate);
  const imputationCandidates = candidatesWithRows
    .filter(({ row }) => !isVersionReplacementRow(row))
    .map(({ candidate }) => candidate);
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
  const rescored = candidatesWithRows.map(({ row, candidate }) => {
    const result = buildComponentScoreResult(
      asRecord(candidate),
      candidate.speed,
      openRouterData.outputTokenAnchors,
      scoringConfig,
      scoringPreparation.qualityContext,
      benchmarkImputationValues(scoringPreparation, row),
      benchmarkImputationFactors(scoringPreparation, row),
      versionReplacementBenchmarkWeights(row, scoringConfig),
    );
    return {
      candidate: {
        ...candidate,
        component_scores: result.componentScores,
        confidence: result.confidence,
      },
      intelligenceParts: result.intelligenceScoreParts,
    };
  });
  const qualityScoredCandidates = blendPairwiseQualityScores(
    rescored.map(({ candidate }) => candidate),
    scoringConfig,
    rescored.map(({ intelligenceParts }) => intelligenceParts),
  );
  if (capabilityState) {
    capabilityState = advanceCapabilityState(
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
): ModelRow[] {
  const { modelRows, candidates } = selection;
  return modelRows.filter((_row, index) => {
    const candidate = candidates[index]!;
    if (
      candidate.id == null ||
      candidate.name == null ||
      candidate.modalities?.output?.includes("text") !== true
    ) {
      return false;
    }
    const broadEvidence = hasRequiredBenchmarkEvidence(
      candidate,
      scoringConfig,
      finalConfig.benchmarkAdmission,
    );
    return broadEvidence && hasRequiredPublicRelevance({ scores: candidate.component_scores });
  });
}

/** Enrich the prepared population with OpenRouter telemetry, then finish resource scoring and public admission. */
export async function buildFinalModels(
  selection: ModelSelection,
  openRouterData: OpenRouterModelData,
  modelId: string | null | undefined,
  finalConfig: FinalStageConfig,
  scoringConfig: ScoringConfig,
): Promise<ModelAtlasModel[]> {
  const { modelRows, candidates, scoringPreparation } = selection;
  const enrichedCandidates = candidates.map((candidate, index) =>
    enrichModelResources(candidate, modelRows[index]!, openRouterData),
  );
  const resourceImputation = prepareEffortResourceImputation(
    enrichedCandidates,
    scoringConfig,
    scoringPreparation,
    ["cost", "time"],
  );
  const scoredCandidates = attachFinalScores(
    enrichedCandidates,
    scoringConfig,
    scoringPreparation,
    resourceImputation,
  );
  const selectedReferenceModels = selectReferenceModels(
    scoredCandidates,
    modelId,
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

function buildCandidates(
  rows: ModelRow[],
  openRouterData: OpenRouterModelData,
  scoringConfig: ScoringConfig,
  scoringPreparation: BenchmarkScoringPreparation,
  previousModels: readonly ModelAtlasModel[],
  versioning: BenchmarkVersioningOptions,
): { row: ModelRow; candidate: ModelAtlasCandidate }[] {
  const previousModelForRow = buildPreviousModelLookup(previousModels);
  return rows.map((row) => {
    const candidate = buildModelCandidate(
      row,
      openRouterData,
      scoringConfig,
      scoringPreparation,
      versionReplacementBenchmarkWeights(row, scoringConfig),
    );
    return {
      row,
      candidate: versionCandidateBenchmarkData(candidate, previousModelForRow(row), versioning),
    };
  });
}
