/** Build final LLM stats rows from enriched model candidates. */

import { cacheStatsLogos } from "../../../logo-cache";
import { attachRelativeScores } from "../scores";
import { prepareBenchmarkScoring } from "../scores/benchmark-imputation";
import type {
	FinalStageConfig,
	LlmStatsEnrichmentResult,
	LlmStatsModel,
	ScoringConfig,
} from "../types";
import { buildModelCandidate } from "./model-candidate";
import { selectPublicModels } from "./public-list";

/** Build the final LLM stats model list and attach the normalized ranking layer used for ordering. */
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
	return cacheStatsLogos(
		selectPublicModels(scoredCandidates, id, finalConfig, scoringConfig),
		(model) => model.provider ?? model.id,
	);
}
