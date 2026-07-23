/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

import type {
	BenchmarkAdmissionConfig,
	FinalStageConfig,
	ScoringConfig,
} from "../../config/stage";
import { cacheModelLogos } from "../../logos/cache";
import { asFiniteNumber } from "../../runtime";
import type {
	ModelAtlasModel,
	ModelAtlasModelCandidate,
	ModelAtlasScoredCandidate,
} from "../model-types";
import type { ModelAtlasEnrichmentResult } from "../openrouter-enrichment";
import { attachFinalScores } from "../scores";
import { prepareBenchmarkScoring } from "../scores/benchmark-imputation";
import { observedBenchmarkCount } from "../scores/score-builders";
import { buildModelCandidate } from "./candidate";
import { hasRequiredQualityScores, selectPublicModels } from "./public-list";

const MIN_PUBLIC_COMPONENT_SCORE = 10;
const PUBLIC_COMPONENT_SCORE_KEYS = [
	"intelligence_score",
	"agentic_score",
	"speed_score",
	"value_score",
] as const;

type BasicSpecCandidate = Pick<
	ModelAtlasModelCandidate,
	| "id"
	| "name"
	| "release_date"
	| "modalities"
	| "cost"
	| "context_window"
	| "speed"
>;
type BenchmarkEvidenceCandidate = Pick<
	ModelAtlasScoredCandidate,
	"intelligence" | "benchmarks"
>;

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
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	];
	const observedCount = observedBenchmarkCount(model, selectedKeys);
	const observedIntelligenceCount = observedBenchmarkCount(
		model,
		scoringConfig.intelligenceBenchmarkKeys,
	);
	const observedAgenticCount = observedBenchmarkCount(
		model,
		scoringConfig.agenticBenchmarkKeys,
	);
	const observedIndexCount = observedBenchmarkCount(
		model,
		admissionConfig.indexBenchmarkKeys,
	);
	return (
		observedCount >= admissionConfig.minimumObservedBenchmarks &&
		observedIntelligenceCount >=
			admissionConfig.minimumObservedBenchmarksPerDimension &&
		observedAgenticCount >=
			admissionConfig.minimumObservedBenchmarksPerDimension &&
		observedIndexCount >= 1
	);
}

/** Admit a final row when at least one primary score reaches the public relevance floor. */
export function hasRequiredPublicScore(
	model: Pick<ModelAtlasScoredCandidate, "scores">,
): boolean {
	return PUBLIC_COMPONENT_SCORE_KEYS.some((key) => {
		const score = asFiniteNumber(model.scores?.[key]);
		return score != null && score >= MIN_PUBLIC_COMPONENT_SCORE;
	});
}

function buildCandidates(
	rows: Record<string, unknown>[],
	enrichment: ModelAtlasEnrichmentResult,
	scoringConfig: ScoringConfig,
	scoringPreparation: ReturnType<typeof prepareBenchmarkScoring>,
): ModelAtlasModelCandidate[] {
	return rows.map((row) =>
		buildModelCandidate(
			row,
			enrichment.openRouterSpeedById,
			enrichment.openRouterPricingById,
			enrichment.speedOutputTokenAnchors,
			scoringConfig,
			scoringPreparation.benchmarkImputationByModel,
			scoringPreparation.benchmarkImputationConfidenceByModel,
			scoringPreparation.qualityContext,
		),
	);
}

export async function buildFinalModels(
	enrichment: ModelAtlasEnrichmentResult,
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): Promise<ModelAtlasModel[]> {
	const scoringPreparation = prepareBenchmarkScoring(
		enrichment.rows,
		scoringConfig,
	);
	const candidateModels = buildCandidates(
		enrichment.rows,
		enrichment,
		scoringConfig,
		scoringPreparation,
	);
	const scoredCandidates = attachFinalScores(candidateModels, scoringConfig);
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
	);
	// Public admission is output-only and must not redefine the scoring reference population.
	const admittedPublicModels = rescoredReferenceModels
		.filter(hasRequiredBasicSpecs)
		.filter((model) =>
			hasRequiredBenchmarkEvidence(
				model,
				scoringConfig,
				finalConfig.benchmarkAdmission,
			),
		)
		.filter(hasRequiredQualityScores)
		.filter(hasRequiredPublicScore);
	return cacheModelLogos(
		admittedPublicModels,
		(model) => model.provider ?? model.id,
	);
}
