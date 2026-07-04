/** Build final LLM stats rows from enriched model candidates. */

import { cacheStatsLogos } from "../../logo-cache";
import { attachRelativeScores } from "../scores";
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

function publicModelCandidate(model: LlmStatsModel): LlmStatsModelCandidate {
	return {
		...model,
		relative_scores: null,
	};
}

function hasPublicRelativeScores(
	model: LlmStatsScoredCandidate,
): model is LlmStatsModel {
	return (
		model.scores?.intelligence_score != null &&
		model.scores.agentic_score != null &&
		model.relative_scores.intelligence_score != null &&
		model.relative_scores.agentic_score != null
	);
}

function attachPublicRelativeScores(
	models: LlmStatsModel[],
	scoringConfig: ScoringConfig,
): LlmStatsModel[] {
	return attachRelativeScores(
		models.map(publicModelCandidate),
		scoringConfig,
	).filter(hasPublicRelativeScores);
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
	const scoredCandidates = attachRelativeScores(candidateModels, scoringConfig);
	const publicModels = selectPublicModels(
		scoredCandidates,
		id,
		finalConfig,
		scoringConfig,
	);
	return cacheStatsLogos(
		attachPublicRelativeScores(publicModels, scoringConfig),
		(model) => model.provider ?? model.id,
	);
}
