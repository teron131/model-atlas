/** Build final LLM stats rows from enriched model candidates. */

import { cacheStatsLogos } from "../../logo-cache";
import { attachFinalScores } from "../scores";
import { prepareBenchmarkScoring } from "../scores/benchmark-imputation";
import type {
	FinalStageConfig,
	LlmStatsEnrichmentResult,
	LlmStatsModel,
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
		model.scores.agentic_score != null
	);
}

export async function buildFinalModels(
	enrichedRows: LlmStatsEnrichmentResult,
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): Promise<LlmStatsModel[]> {
	const { benchmarkImputationByModel, qualityContext } =
		prepareBenchmarkScoring(enrichedRows.rows, scoringConfig);
	const candidateModels = enrichedRows.rows.map((row) =>
		buildModelCandidate(
			row,
			enrichedRows.openRouterSpeedById,
			enrichedRows.openRouterPricingById,
			enrichedRows.speedOutputTokenAnchors,
			scoringConfig,
			benchmarkImputationByModel,
			qualityContext,
		),
	);
	const scoredCandidates = attachFinalScores(candidateModels, scoringConfig);
	const publicModels = selectPublicModels(
		scoredCandidates,
		id,
		finalConfig,
		scoringConfig,
	);
	const rescoredPublicModels = attachFinalScores(
		publicModels.map((model) => ({
			...model,
			scores: null,
		})),
		scoringConfig,
	).filter(hasPublicScores);
	return cacheStatsLogos(
		rescoredPublicModels,
		(model) => model.provider ?? model.id,
	);
}
