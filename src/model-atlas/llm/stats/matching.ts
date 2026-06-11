/** Matching helpers for Model Atlas selection. */

/** Turn scraper-first matcher diagnostics into merged source rows. */
import {
	getScraperFallbackMatchDiagnostics,
	type LlmScraperFallbackMatchDiagnosticsPayload,
} from "../matcher";
import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../scrapers/agents-last-exam";
import { findAutomationBenchScore } from "../scrapers/automation-bench";
import { findBrowseCompScore } from "../scrapers/browsecomp";
import { findDeepSWEModelScore } from "../scrapers/deep-swe";
import { findTerminalBenchMedianAccuracy } from "../scrapers/terminal-bench";
import {
	asFiniteNumber,
	asRecord,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
} from "../shared";

import type {
	ArtificialAnalysisModel,
	LlmStatsSourceData,
	MatcherConfig,
} from "./types";

type MatchedRowLookups = Pick<
	LlmStatsSourceData,
	| "modelsDevById"
	| "deepSWEScoreByModelName"
	| "terminalBenchAccuracyByModelName"
	| "agentsLastExamScoreByModelName"
	| "automationBenchScoreByModelName"
	| "browseCompScoreByModelName"
>;

/** Helper for canonical model id. */
function canonicalModelId(
	modelId: unknown,
	providerId: unknown,
	fallbackModelId: unknown,
): string | null {
	if (typeof modelId === "string" && modelId.includes("/")) {
		return modelId;
	}
	if (typeof providerId === "string" && typeof modelId === "string") {
		return `${providerId}/${modelId}`;
	}
	if (typeof providerId === "string" && typeof fallbackModelId === "string") {
		return `${providerId}/${fallbackModelId}`;
	}
	return typeof modelId === "string" ? modelId : null;
}

/** Return configured variant labels present in a model id, preferring longer labels like flash-lite over flash. */
function variantLabels(
	modelId: string,
	matcherConfig: MatcherConfig,
): Set<string> {
	const tokens = normalizeProviderModelId(modelId)
		.split(/[-/]/)
		.filter(Boolean);
	const occupied = new Set<number>();
	const labels = new Set<string>();
	const variants = [...matcherConfig.variantTokens].sort(
		(left, right) =>
			normalizeModelToken(right).split("-").length -
			normalizeModelToken(left).split("-").length,
	);

	for (const variant of variants) {
		const variantTokens = normalizeModelToken(variant).split("-");
		for (
			let index = 0;
			index <= tokens.length - variantTokens.length;
			index += 1
		) {
			if (
				variantTokens.some((token, offset) => tokens[index + offset] !== token)
			) {
				continue;
			}
			if (
				variantTokens.some((_token, offset) => occupied.has(index + offset))
			) {
				continue;
			}
			for (let offset = 0; offset < variantTokens.length; offset += 1) {
				occupied.add(index + offset);
			}
			labels.add(variant);
		}
	}

	return labels;
}

/** Return whether a Model Atlas match candidate has a variant conflict. */
export function hasVariantConflict(
	artificialAnalysisSlug: string,
	matchedModelId: string,
	matcherConfig: MatcherConfig,
): boolean {
	const artificialAnalysisLabels = variantLabels(
		artificialAnalysisSlug,
		matcherConfig,
	);
	const matchedLabels = variantLabels(matchedModelId, matcherConfig);
	return matcherConfig.variantTokens.some(
		(token) => artificialAnalysisLabels.has(token) !== matchedLabels.has(token),
	);
}

/** Pick the first candidate that survives post-score variant validation. */
export function firstValidMatchId(
	candidates: { model_id: string }[],
	artificialAnalysisSlug: string,
	matcherConfig: MatcherConfig,
): string | null {
	for (const candidate of candidates) {
		if (
			!hasVariantConflict(
				artificialAnalysisSlug,
				candidate.model_id,
				matcherConfig,
			)
		) {
			return candidate.model_id;
		}
	}
	return null;
}

/** Build one matched row from the Artificial Analysis source model. */
function buildMatchedRow(
	aaModel: ArtificialAnalysisModel,
	matchedModelId: string,
	lookups: MatchedRowLookups,
): Record<string, unknown> {
	const aaModelId =
		typeof aaModel.model_id === "string" ? aaModel.model_id : null;
	const aaSlug = modelSlugFromModelId(aaModelId);
	const evaluations = { ...asRecord(aaModel.evaluations) };
	const intelligence = asRecord(aaModel.intelligence);
	const intelligenceIndexCost = asRecord(aaModel.intelligence_index_cost);
	const logo = typeof aaModel.logo === "string" ? aaModel.logo : null;
	const matchedModelsDev = lookups.modelsDevById.get(matchedModelId) ?? null;
	const matchedModelFields = asRecord(matchedModelsDev?.model);
	const matchedModelName =
		typeof matchedModelsDev?.model?.name === "string"
			? matchedModelsDev.model.name
			: aaModelId;
	const modelNameCandidates = [
		matchedModelName,
		matchedModelsDev?.model_id,
		matchedModelsDev?.model?.id,
		aaModelId,
		aaSlug,
	];
	const deepSWEScore = findDeepSWEModelScore(
		modelNameCandidates,
		lookups.deepSWEScoreByModelName,
	);
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExamScoreByModelName,
	);
	const scoringSources = {
		...(deepSWEScore == null ? {} : { deep_swe: deepSWEScore }),
		...(agentsLastExamScore == null
			? {}
			: { agents_last_exam: agentsLastExamScore }),
	};
	if (deepSWEScore != null) {
		evaluations.deep_swe = deepSWEScore.pass_at_1;
	}
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
	}
	const automationBenchScore = findAutomationBenchScore(
		modelNameCandidates,
		lookups.automationBenchScoreByModelName,
	);
	if (automationBenchScore != null) {
		evaluations.automation_bench = automationBenchScore;
	}
	const terminalBenchAccuracy = findTerminalBenchMedianAccuracy(
		modelNameCandidates,
		lookups.terminalBenchAccuracyByModelName,
	);
	if (terminalBenchAccuracy != null) {
		evaluations.terminal_bench_2 = terminalBenchAccuracy;
	}
	const browseCompScore = findBrowseCompScore(
		modelNameCandidates,
		lookups.browseCompScoreByModelName,
	);
	if (browseCompScore != null) {
		evaluations.browsecomp = browseCompScore;
	}
	const canonicalId = canonicalModelId(
		matchedModelsDev?.model?.id ?? matchedModelId,
		matchedModelsDev?.provider_id,
		matchedModelsDev?.model_id,
	);
	const {
		id: _matchedId,
		name: _matchedName,
		family: matchedFamily,
		model_id: _matchedModelId,
		slug: _matchedSlug,
		...modelMetadata
	} = matchedModelFields;
	const medianSpeed = asFiniteNumber(aaModel.median_speed);
	const medianTime = asFiniteNumber(aaModel.median_time);
	const medianEndToEndResponseTime = asFiniteNumber(
		aaModel.median_end_to_end_response_time,
	);

	return {
		id: canonicalId,
		provider_id: matchedModelsDev?.provider_id ?? null,
		openrouter_id: canonicalId,
		name: matchedModelName,
		aa_id: aaModelId,
		aa_slug: aaSlug,
		family: matchedFamily,
		logo,
		...modelMetadata,
		...(medianSpeed == null
			? {}
			: { median_output_tokens_per_second: medianSpeed }),
		...(medianTime == null
			? {}
			: { median_time_to_first_token_seconds: medianTime }),
		...(medianEndToEndResponseTime == null
			? {}
			: {
					median_end_to_end_response_time_seconds: medianEndToEndResponseTime,
				}),
		...(Object.keys(scoringSources).length === 0
			? {}
			: { scoring_sources: scoringSources }),
		evaluations,
		intelligence,
		intelligence_index_cost: intelligenceIndexCost,
	};
}

/** Build matched intermediate rows from precomputed scraper fallback diagnostics. */
export function modelRowsFromMatchDiagnostics(
	sourceData: LlmStatsSourceData,
	matcherConfig: MatcherConfig,
	fallbackDiagnostics: LlmScraperFallbackMatchDiagnosticsPayload,
): Record<string, unknown>[] {
	return fallbackDiagnostics.models
		.map((matchedModel) => {
			const matchedModelId = firstValidMatchId(
				matchedModel.candidates,
				matchedModel.artificial_analysis_slug,
				matcherConfig,
			);
			if (matchedModelId == null) {
				return null;
			}
			const aaModel = sourceData.artificialAnalysisBySlug.get(
				matchedModel.artificial_analysis_slug,
			);
			if (!aaModel) {
				return null;
			}
			return buildMatchedRow(aaModel, matchedModelId, sourceData);
		})
		.filter((row): row is Record<string, unknown> => row != null);
}

/** Build matched intermediate rows by running scraper fallback diagnostics and rejecting obvious variant mismatches. */
export async function buildMatchedModelRows(
	sourceData: LlmStatsSourceData,
	matcherConfig: MatcherConfig,
): Promise<Record<string, unknown>[]> {
	const fallbackDiagnostics = await getScraperFallbackMatchDiagnostics({
		scrapedRows: sourceData.artificialAnalysisRows,
		modelsDevModels: sourceData.preferredModelsDevModels,
	});
	return modelRowsFromMatchDiagnostics(
		sourceData,
		matcherConfig,
		fallbackDiagnostics,
	);
}
