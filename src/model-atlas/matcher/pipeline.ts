/** Internal matcher pipeline: scope provider pools, collect candidates, and apply the final void threshold. */

import {
	asRecord,
	FALLBACK_PROVIDER_IDS,
	modelSlugFromModelId,
	PRIMARY_PROVIDER_ID,
} from "../shared";

import {
	artificialAnalysisMatchSlug,
	compareCandidates,
	firstVariantCompatibleCandidate,
	rankMatchCandidates,
} from "./scoring";
import type {
	MatchCandidate,
	MatchDiagnosticsOptions,
	MatchDiagnosticsPayload,
	MatcherConfig,
	MatcherRunOutput,
	MatcherSourceModel,
	MatchResult,
	ModelsDevModel,
	PreferredProviderPools,
} from "./types";

const DEFAULT_MAX_CANDIDATES = 5;
const VOID_THRESHOLD_RANGE_RATIO = 0.35;

/** Collect candidate models.dev rows for a normalized source slug. */
function collectCandidatesForSourceSlug(
	sourceSlug: string,
	modelsDevModels: ModelsDevModel[],
): MatchCandidate[] {
	return rankMatchCandidates(
		sourceSlug,
		modelsDevModels.map((modelsDevModel) => {
			const modelsDevModelName =
				typeof modelsDevModel.model.name === "string"
					? modelsDevModel.model.name
					: "";
			return {
				model_id: modelsDevModel.model_id,
				provider_id: modelsDevModel.provider_id,
				provider_name: modelsDevModel.provider_name,
				model_name: modelsDevModelName || null,
			};
		}),
	);
}

function applyMaxMinRangeVoid<
	T extends { best_match: MatchResult; candidates?: unknown[] },
>(models: T[]): { threshold: number | null; voided: number } {
	const scores = models
		.map((model) => model.best_match?.score)
		.filter((score): score is number => Number.isFinite(score))
		.sort((left, right) => left - right);
	if (scores.length === 0) {
		return { threshold: null, voided: 0 };
	}

	const minScore = scores[0] as number;
	const maxScore = scores.at(-1) as number;
	const threshold =
		minScore + (maxScore - minScore) * VOID_THRESHOLD_RANGE_RATIO;
	let voided = 0;
	for (const model of models) {
		const score = model.best_match?.score;
		if (score != null && score < threshold) {
			model.best_match = null;
			if ("candidates" in model && Array.isArray(model.candidates)) {
				model.candidates = [];
			}
			voided += 1;
		}
	}
	return { threshold, voided };
}

/** Run the matcher over source rows and return ranked candidates plus post-void summary counts. */
export function runMatcher(
	sourceModels: MatcherSourceModel[],
	providerPools: PreferredProviderPools,
	maxCandidates: number,
	matcherConfig: MatcherConfig,
): MatcherRunOutput {
	const models = sourceModels.map((sourceModel) => {
		const matchSlug = artificialAnalysisMatchSlug(sourceModel.sourceSlug);
		const primaryCandidates = collectCandidatesForSourceSlug(
			matchSlug,
			providerPools.primary,
		);
		const fallbackCandidates = collectCandidatesForSourceSlug(
			matchSlug,
			providerPools.fallback,
		);
		const candidates = (
			primaryCandidates.length === 0
				? fallbackCandidates
				: [...primaryCandidates, ...fallbackCandidates].sort(compareCandidates)
		).slice(0, maxCandidates);
		return {
			artificial_analysis_id: sourceModel.sourceId,
			artificial_analysis_slug: sourceModel.sourceSlug,
			artificial_analysis_name: sourceModel.sourceName,
			artificial_analysis_release_date: sourceModel.sourceReleaseDate,
			best_match: firstVariantCompatibleCandidate(
				matchSlug,
				candidates,
				matcherConfig,
			),
			candidates,
		};
	});

	const preVoidMatchedCount = models.filter(
		(model) => model.best_match != null,
	).length;
	const preVoidUnmatchedCount = models.length - preVoidMatchedCount;
	const voidStats = applyMaxMinRangeVoid(models);
	const matchedCount = models.filter(
		(model) => model.best_match != null,
	).length;
	const unmatchedCount = models.length - matchedCount;

	return {
		models,
		voidThreshold: voidStats.threshold,
		voidedCount: voidStats.voided,
		preVoidMatchedCount,
		preVoidUnmatchedCount,
		matchedCount,
		unmatchedCount,
	};
}

/** Build deterministic diagnostics from caller-supplied normalized rows without fetching sources. */
export function buildMatchDiagnostics(
	options: MatchDiagnosticsOptions,
): MatchDiagnosticsPayload {
	const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
	const providerPools = {
		primary: options.modelsDevModels.filter(
			(modelsDevModel) => modelsDevModel.provider_id === PRIMARY_PROVIDER_ID,
		),
		fallback: options.modelsDevModels.filter((modelsDevModel) =>
			FALLBACK_PROVIDER_IDS.has(modelsDevModel.provider_id),
		),
	};
	const totalScopedModels = new Set(
		[...providerPools.primary, ...providerPools.fallback].map(
			(modelsDevModel) => modelsDevModel.model_id,
		),
	).size;
	const sourceModels = options.scrapedRows.map((scrapedRow) => {
		const scrapedRowRecord = asRecord(scrapedRow);
		const modelId =
			typeof scrapedRowRecord.model_id === "string"
				? scrapedRowRecord.model_id
				: null;
		const sourceSlug = modelSlugFromModelId(modelId) ?? "";
		return {
			sourceId: modelId,
			sourceSlug,
			sourceName:
				typeof scrapedRowRecord.name === "string"
					? scrapedRowRecord.name
					: null,
			sourceReleaseDate:
				typeof scrapedRowRecord.release_date === "string"
					? scrapedRowRecord.release_date
					: null,
		};
	});
	const matcherOutput = runMatcher(
		sourceModels,
		providerPools,
		maxCandidates,
		options.matcherConfig,
	);

	return {
		total_scraped_models: options.scrapedRows.length,
		total_models_dev_models: totalScopedModels,
		max_candidates: maxCandidates,
		pre_void_matched_count: matcherOutput.preVoidMatchedCount,
		pre_void_unmatched_count: matcherOutput.preVoidUnmatchedCount,
		void_mode: "maxmin_range",
		void_threshold: matcherOutput.voidThreshold,
		voided_count: matcherOutput.voidedCount,
		matched_count: matcherOutput.matchedCount,
		unmatched_count: matcherOutput.unmatchedCount,
		models: matcherOutput.models,
	};
}
