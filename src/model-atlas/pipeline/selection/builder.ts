/** Model selection prepares quality scores before route enrichment, then finalizes resource scores, admission, and logo hydration. */

import type { FinalStageConfig, ScoringConfig } from "../../config/stage";
import { canonicalVariantKey } from "../../identity/normalization";
import { cacheModelLogos } from "../../logos/cache";
import { asRecord } from "../../runtime";
import type { ModelAtlasCandidate, ModelAtlasModel, ModelRow } from "../model-types";
import { type OpenRouterModelData, prepareOpenRouterModelData } from "../openrouter-data";
import { attachFinalScores } from "../scores";
import {
  benchmarkImputationFactors,
  type BenchmarkScoringPreparation,
  type EffortResourceImputation,
  prepareBenchmarkScoring,
  prepareEffortResourceImputation,
  taskResourceEstimates,
  withoutBenchmarkImputationForModels,
} from "../scores/imputation";
import {
  prepareEffortQualityScoringContext,
  publishedEffortResults,
} from "../scores/imputation/effort-quality";
import { blendPairwiseQualityScores } from "../scores/pairwise-quality";
import {
  buildAgenticTokenScoringContext,
  buildQualityScoringContext,
} from "../scores/quality-context";
import { applyResourceEvidenceRequirements } from "../scores/resource-metrics";
import { buildComponentScoreResult } from "../scores/score-builders";
import { buildModelCandidate, enrichModelResources } from "./candidate";
import { type ObservationUpdateOptions, stampObservationUpdates } from "./observation-updates";
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
  /** Total and output token estimates behind Agentic, kept so published models carry them. */
  tokenImputation: EffortResourceImputation;
  /** Across-effort benchmark results that pass the held-out check, by `canonicalVariantKey`, kept so published models carry them. */
  benchmarkEstimates: ReadonlyMap<string, Record<string, number>>;
};

/** Compute quality once against the complete benchmark population before choosing per-model network work. */
export function prepareModelSelection(
  rows: ModelRow[],
  scoringConfig: ScoringConfig,
  updates: ObservationUpdateOptions = {
    baselineDate: new Date().toISOString().slice(0, 10),
    observedDate: new Date().toISOString().slice(0, 10),
  },
  previousModels: readonly ModelAtlasModel[] = [],
): ModelSelection {
  const openRouterData = prepareOpenRouterModelData(rows, null);
  const modelRows = dropStaleReplacementBenchmarks(rows, previousModels, scoringConfig);
  const replacementRows = modelRows.filter(isVersionReplacementRow);
  const scoringPreparation = withoutBenchmarkImputationForModels(
    prepareBenchmarkScoring(modelRows, scoringConfig),
    replacementRows,
  );
  const candidatesWithRows = buildCandidates(modelRows, openRouterData, previousModels, updates);
  const candidates = candidatesWithRows.map(({ candidate }) => candidate);
  const imputationCandidates = candidatesWithRows
    .filter(({ row }) => !isVersionReplacementRow(row))
    .map(({ candidate }) => candidate);
  const tokenImputation = prepareEffortResourceImputation(
    imputationCandidates,
    scoringConfig,
    scoringPreparation,
    ["tokens", "output_tokens"],
  );
  const qualityContext = prepareEffortQualityScoringContext(
    imputationCandidates,
    scoringConfig,
    buildAgenticTokenScoringContext(
      candidates,
      scoringConfig,
      buildQualityScoringContext(modelRows, scoringConfig),
      tokenImputation,
    ),
  );
  const benchmarkEstimates = publishedEffortResults(
    imputationCandidates,
    scoringConfig,
    qualityContext,
  );
  const scored = candidatesWithRows.map(({ row, candidate }) => {
    const result = buildComponentScoreResult(
      asRecord(candidate),
      scoringConfig,
      qualityContext,
      benchmarkImputationFactors(scoringPreparation, row),
      versionReplacementBenchmarkWeights(row, scoringConfig),
    );
    return {
      candidate: {
        ...candidate,
        component_scores: result.componentScores,
        confidence: result.evidenceSupport,
      },
      intelligenceParts: result.intelligenceScoreParts,
    };
  });
  const qualityScoredCandidates = blendPairwiseQualityScores(
    scored.map(({ candidate }) => candidate),
    scoringConfig,
    scored.map(({ intelligenceParts }) => intelligenceParts),
  );
  return {
    modelRows,
    candidates: qualityScoredCandidates,
    scoringPreparation,
    tokenImputation,
    benchmarkEstimates,
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
  const { modelRows, candidates, scoringPreparation, tokenImputation, benchmarkEstimates } =
    selection;
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
  const selectedReferenceModels = selectReferenceModels(scoredCandidates, modelId);
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
    admittedPublicModels.map((model) => {
      const taskEstimates = taskResourceEstimates([resourceImputation, tokenImputation], model);
      const results = benchmarkEstimates.get(canonicalVariantKey(model));
      return publicModelFromCandidate(
        applyResourceEvidenceRequirements(
          {
            ...model,
            ...(taskEstimates == null ? {} : { estimated_task_metrics: taskEstimates }),
            ...(results == null ? {} : { estimated_benchmarks: results }),
          },
          scoringConfig.benchmarkPortfolio,
        ),
      )!;
    }),
    (model) => model.provider ?? model.id,
  );
}

function buildCandidates(
  rows: ModelRow[],
  openRouterData: OpenRouterModelData,
  previousModels: readonly ModelAtlasModel[],
  updates: ObservationUpdateOptions,
): { row: ModelRow; candidate: ModelAtlasCandidate }[] {
  const previousModelForRow = buildPreviousModelLookup(previousModels);
  return rows.map((row) => ({
    row,
    candidate: stampObservationUpdates(
      buildModelCandidate(row, openRouterData),
      previousModelForRow(row),
      updates,
    ),
  }));
}
