/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

import type { BenchmarkAdmissionConfig, FinalStageConfig, ScoringConfig } from "../../config/stage";
import { cacheModelLogos } from "../../logos/cache";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import type { OpenRouterModelData } from "../openrouter-data";
import { attachFinalScores } from "../scores";
import {
  prepareBenchmarkScoring,
  prepareEffortResourceImputation,
  withoutBenchmarkImputationForModels,
} from "../scores/imputation";
import { observedBenchmarkCount } from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  buildModelCandidate,
  versionCandidateBenchmarkData,
} from "./candidate";
import { hasRequiredQualityScores, selectPublicModels } from "./public-list";
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

type BasicSpecCandidate = Pick<
  ModelAtlasCandidate,
  "id" | "name" | "release_date" | "modalities" | "cost" | "context_window" | "speed"
>;
type BenchmarkEvidenceCandidate = Pick<ModelAtlasScoredCandidate, "intelligence" | "benchmarks">;

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
): Promise<ModelAtlasModel[]> {
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
  const candidateModels = buildCandidates(
    preparedOpenRouterData,
    scoringConfig,
    scoringPreparation,
    previousModels,
    versioning,
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
  // Public admission is output-only and must not redefine the scoring reference population.
  const admittedPublicModels = rescoredReferenceModels
    .filter(hasRequiredBasicSpecs)
    .filter((model) =>
      hasRequiredBenchmarkEvidence(model, scoringConfig, finalConfig.benchmarkAdmission),
    )
    .filter(hasRequiredQualityScores)
    .filter(hasRequiredPublicRelevance);
  return cacheModelLogos(admittedPublicModels, (model) => model.provider ?? model.id);
}
