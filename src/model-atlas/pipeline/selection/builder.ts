/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

import type { BenchmarkAdmissionConfig, FinalStageConfig, ScoringConfig } from "../../config/stage";
import { cacheModelLogos } from "../../logos/cache";
import { asFiniteNumber } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasModel,
  ModelAtlasScoredCandidate,
} from "../model-types";
import type { OpenRouterModelData } from "../openrouter-data";
import { attachFinalScores } from "../scores";
import { prepareBenchmarkScoring, prepareEffortResourceImputation } from "../scores/imputation";
import { observedBenchmarkCount } from "../scores/score-builders";
import {
  type BenchmarkVersioningOptions,
  buildModelCandidate,
  versionCandidateBenchmarkData,
} from "./candidate";
import { hasRequiredQualityScores, selectPublicModels } from "./public-list";

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
  const selectedKeys = [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
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
  const previousByVariant = new Map(
    previousModels.map((model) => [
      `${model.id ?? ""}\u0000${model.reasoning_effort ?? ""}`,
      model,
    ]),
  );
  return openRouterData.modelRows.map((row) => {
    const candidate = buildModelCandidate(
      row,
      openRouterData.speedByModelId,
      openRouterData.pricingByModelId,
      openRouterData.outputTokenAnchors,
      scoringConfig,
      scoringPreparation,
    );
    return versionCandidateBenchmarkData(
      candidate,
      previousByVariant.get(`${candidate.id ?? ""}\u0000${candidate.reasoning_effort ?? ""}`),
      versioning,
    );
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
  const scoringPreparation = prepareBenchmarkScoring(openRouterData.modelRows, scoringConfig);
  const candidateModels = buildCandidates(
    openRouterData,
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
