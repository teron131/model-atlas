/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

import { cacheStatsLogos } from "../../logo-cache";
import { asFiniteNumber } from "../../shared";
import { attachFinalScores } from "../scores";
import { prepareBenchmarkScoring } from "../scores/benchmark-imputation";
import {
	observedBenchmarkCount,
	observedBenchmarkPortfolioCoverage,
} from "../scores/score-builders";
import type {
	BenchmarkCoverageAdmissionConfig,
	FinalStageConfig,
	LlmStatsEnrichmentResult,
	LlmStatsModel,
	LlmStatsModelCandidate,
	LlmStatsScoredCandidate,
	ScoringConfig,
} from "../types";
import { buildModelCandidate } from "./model-candidate";
import { hasRequiredQualityScores, selectPublicModels } from "./public-list";

const MIN_PUBLIC_COMPONENT_SCORE = 10;
const PUBLIC_COMPONENT_SCORE_KEYS = [
	"intelligence_score",
	"agentic_score",
	"speed_score",
	"value_score",
] as const;

type BasicSpecCandidate = Pick<
	LlmStatsModelCandidate,
	| "id"
	| "name"
	| "release_date"
	| "modalities"
	| "cost"
	| "context_window"
	| "speed"
>;
type BenchmarkCoverageCandidate = Pick<
	LlmStatsScoredCandidate,
	"intelligence" | "evaluations"
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

/** Admit variants with enough observed evidence across the selected benchmark portfolio. */
export function hasRequiredBenchmarkCoverage(
	model: BenchmarkCoverageCandidate,
	scoringConfig: ScoringConfig,
	coverageConfig: BenchmarkCoverageAdmissionConfig,
): boolean {
	const selectedKeys = [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	];
	const observedCount = observedBenchmarkCount(model, selectedKeys);
	const observedWeight = observedBenchmarkPortfolioCoverage(
		model,
		selectedKeys,
		scoringConfig,
	);
	return (
		observedCount >= coverageConfig.minimumObservedBenchmarks &&
		observedWeight != null &&
		observedWeight >= coverageConfig.minimumObservedWeight
	);
}

/** Admit a final row when at least one primary score reaches the public relevance floor. */
export function hasRequiredPublicScore(
	model: Pick<LlmStatsScoredCandidate, "scores">,
): boolean {
	return PUBLIC_COMPONENT_SCORE_KEYS.some((key) => {
		const score = asFiniteNumber(model.scores?.[key]);
		return score != null && score >= MIN_PUBLIC_COMPONENT_SCORE;
	});
}

function buildCandidates(
	rows: Record<string, unknown>[],
	enrichedRows: LlmStatsEnrichmentResult,
	scoringConfig: ScoringConfig,
	scoringPreparation: ReturnType<typeof prepareBenchmarkScoring>,
): LlmStatsModelCandidate[] {
	return rows.map((row) =>
		buildModelCandidate(
			row,
			enrichedRows.openRouterSpeedById,
			enrichedRows.openRouterPricingById,
			enrichedRows.speedOutputTokenAnchors,
			scoringConfig,
			scoringPreparation.benchmarkImputationByModel,
			scoringPreparation.benchmarkImputationConfidenceByModel,
			scoringPreparation.qualityContext,
		),
	);
}

export async function buildFinalModels(
	enrichedRows: LlmStatsEnrichmentResult,
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): Promise<LlmStatsModel[]> {
	const scoringPreparation = prepareBenchmarkScoring(
		enrichedRows.rows,
		scoringConfig,
	);
	const candidateModels = buildCandidates(
		enrichedRows.rows,
		enrichedRows,
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
			hasRequiredBenchmarkCoverage(
				model,
				scoringConfig,
				finalConfig.benchmarkCoverage,
			),
		)
		.filter(hasRequiredQualityScores)
		.filter(hasRequiredPublicScore);
	return cacheStatsLogos(
		admittedPublicModels,
		(model) => model.provider ?? model.id,
	);
}
