/** Matching helpers for Model Atlas selection. */

/** Turn scraper-first matcher diagnostics into merged source rows. */
import { getMatchDiagnostics, type MatchDiagnosticsPayload } from "../matcher";
import {
	asFiniteNumber,
	asRecord,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
} from "../shared";

import {
	type BenchmarkEnrichmentLookups,
	benchmarkEnrichment,
} from "./benchmarks";
import type {
	ArtificialAnalysisModel,
	LlmStatsSourceData,
	MatcherConfig,
} from "./types";

type MatchedRowLookups = Pick<LlmStatsSourceData, "modelsDev"> &
	BenchmarkEnrichmentLookups;

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

function buildMatchedRow(
	artificialAnalysisModel: ArtificialAnalysisModel,
	matchedModelId: string,
	lookups: MatchedRowLookups,
): Record<string, unknown> {
	const artificialAnalysisModelId =
		typeof artificialAnalysisModel.model_id === "string"
			? artificialAnalysisModel.model_id
			: null;
	const artificialAnalysisSlug = modelSlugFromModelId(
		artificialAnalysisModelId,
	);
	const evaluations = { ...asRecord(artificialAnalysisModel.evaluations) };
	const intelligence = asRecord(artificialAnalysisModel.intelligence);
	const intelligenceIndexCost = asRecord(
		artificialAnalysisModel.intelligence_index_cost,
	);
	const logo =
		typeof artificialAnalysisModel.logo === "string"
			? artificialAnalysisModel.logo
			: null;
	const matchedModelsDev = lookups.modelsDev.byId.get(matchedModelId) ?? null;
	const matchedModelFields = asRecord(matchedModelsDev?.model);
	const matchedModelName =
		typeof matchedModelsDev?.model?.name === "string"
			? matchedModelsDev.model.name
			: artificialAnalysisModelId;
	const modelNameCandidates = [
		matchedModelName,
		matchedModelsDev?.model_id,
		matchedModelsDev?.model?.id,
		artificialAnalysisModelId,
		artificialAnalysisSlug,
	];
	const benchmarkFields = benchmarkEnrichment(
		modelNameCandidates,
		lookups,
		evaluations,
	);
	Object.assign(evaluations, benchmarkFields.evaluations);
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
	const medianSpeed = asFiniteNumber(artificialAnalysisModel.median_speed);
	const medianTime = asFiniteNumber(artificialAnalysisModel.median_time);
	const medianEndToEndResponseTime = asFiniteNumber(
		artificialAnalysisModel.median_end_to_end_response_time,
	);

	return {
		id: canonicalId,
		provider_id: matchedModelsDev?.provider_id ?? null,
		openrouter_id: canonicalId,
		name: matchedModelName,
		artificial_analysis_id: artificialAnalysisModelId,
		artificial_analysis_slug: artificialAnalysisSlug,
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
		...(Object.keys(benchmarkFields.scoringSources).length === 0
			? {}
			: { scoring_sources: benchmarkFields.scoringSources }),
		evaluations,
		intelligence,
		intelligence_index_cost: intelligenceIndexCost,
	};
}

export function modelRowsFromMatchDiagnostics(
	sourceData: LlmStatsSourceData,
	matcherConfig: MatcherConfig,
	matchDiagnostics: MatchDiagnosticsPayload,
): Record<string, unknown>[] {
	return matchDiagnostics.models
		.map((matchedModel) => {
			const matchedModelId = firstValidMatchId(
				matchedModel.candidates,
				matchedModel.artificial_analysis_slug,
				matcherConfig,
			);
			if (matchedModelId == null) {
				return null;
			}
			const artificialAnalysisModel = sourceData.artificialAnalysis.bySlug.get(
				matchedModel.artificial_analysis_slug,
			);
			if (!artificialAnalysisModel) {
				return null;
			}
			return buildMatchedRow(
				artificialAnalysisModel,
				matchedModelId,
				sourceData,
			);
		})
		.filter((row): row is Record<string, unknown> => row != null);
}

/** Build matched intermediate rows by running match diagnostics and rejecting obvious variant mismatches. */
export async function buildMatchedModelRows(
	sourceData: LlmStatsSourceData,
	matcherConfig: MatcherConfig,
): Promise<Record<string, unknown>[]> {
	const matchDiagnostics = await getMatchDiagnostics({
		scrapedRows: sourceData.artificialAnalysis.rows,
		modelsDevModels: sourceData.modelsDev.rows,
	});
	return modelRowsFromMatchDiagnostics(
		sourceData,
		matcherConfig,
		matchDiagnostics,
	);
}
