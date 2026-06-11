/** Build final LLM stats rows from enriched model candidates. */

import { cacheStatsLogos } from "../../../logo-cache";
import { attachRelativeScores } from "../scores";
import {
	buildBenchmarkImputationByModel,
	buildQualityScoringContext,
} from "../scores/benchmark-imputation";
import type {
	EnrichedRows,
	FinalStageConfig,
	LlmStatsModel,
	LlmStatsScoredCandidate,
	ScoringConfig,
} from "../types";
import { projectLlmStatsCandidate } from "./model-projection";
import {
	filterLowSignalModels,
	filterModelsById,
	normalizePublicFreeRoutes,
	pruneSparseFields,
	sortModelsByIntelligenceRelativeScore,
} from "./public-list";

/** Build candidate models and attach nullable normalized ranking data. */
export function buildScoredModelCandidates(
	enrichedRows: EnrichedRows,
	scoringConfig: ScoringConfig,
): LlmStatsScoredCandidate[] {
	const benchmarkImputationByModel = buildBenchmarkImputationByModel(
		enrichedRows.rows,
		scoringConfig,
	);
	const qualityContext = buildQualityScoringContext(
		enrichedRows.rows,
		scoringConfig,
		benchmarkImputationByModel,
	);
	const models = enrichedRows.rows.map((row) =>
		projectLlmStatsCandidate(
			row,
			enrichedRows.openRouterSpeedById,
			enrichedRows.openRouterPricingById,
			enrichedRows.speedOutputTokenAnchors,
			scoringConfig,
			benchmarkImputationByModel,
			qualityContext,
		),
	);
	return attachRelativeScores(models, scoringConfig);
}

/** Build the final LLM stats model list and attach the normalized ranking layer used for ordering. */
export async function buildFinalModels(
	enrichedRows: EnrichedRows,
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): Promise<LlmStatsModel[]> {
	const scoredCandidates = buildScoredModelCandidates(
		enrichedRows,
		scoringConfig,
	);
	const signalModels = filterLowSignalModels(scoredCandidates);
	const sortedModels = sortModelsByIntelligenceRelativeScore(signalModels);
	const prunedModels = pruneSparseFields(
		sortedModels,
		finalConfig,
		scoringConfig,
	);
	const normalizedModels = normalizePublicFreeRoutes(prunedModels);
	return cacheStatsLogos(
		filterModelsById(normalizedModels, id),
		(model) => model.provider ?? model.id,
	);
}
