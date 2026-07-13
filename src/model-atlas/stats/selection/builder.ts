/** Final model building owns candidate scoring, public admission, rescoring, and logo cache hydration. */

import { cacheStatsLogos } from "../../logo-cache";
import { asFiniteNumber } from "../../shared";
import { attachFinalScores } from "../scores";
import { prepareBenchmarkScoring } from "../scores/benchmark-imputation";
import type {
	FinalStageConfig,
	LlmStatsEnrichmentResult,
	LlmStatsModel,
	LlmStatsModelCandidate,
	LlmStatsScoredCandidate,
	ScoringConfig,
} from "../types";
import { buildModelCandidate } from "./model-candidate";
import { selectPublicModels } from "./public-list";

function hasPublicScores(
	model: LlmStatsScoredCandidate,
): model is LlmStatsModel {
	return (
		model.component_scores?.intelligence_score != null &&
		model.component_scores.agentic_score != null &&
		model.scores?.intelligence_score != null &&
		model.scores.agentic_score != null &&
		asFiniteNumber(model.scores.overall_score) != null
	);
}

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
	// Basic-spec admission is output-only and must not redefine the scoring reference population.
	const admittedPublicModels = rescoredReferenceModels
		.filter(hasRequiredBasicSpecs)
		.filter(hasPublicScores);
	return cacheStatsLogos(
		admittedPublicModels,
		(model) => model.provider ?? model.id,
	);
}
