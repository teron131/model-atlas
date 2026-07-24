/** Stats matching turns scraper-first diagnostics into merged source rows for selection. */

import type { MatchDiagnosticsPayload } from "../identity";
import {
	canonicalProviderModelId,
	canonicalReasoningEffort,
	modelSlugFromModelId,
} from "../identity/normalization";
import type {
	ArtificialAnalysisModel,
	ModelAtlasSourceData,
} from "../ingest/assembly";
import { asFiniteNumber, asRecord } from "../runtime";
import {
	type BenchmarkAssignmentLookups,
	buildObservationBenchmarks,
} from "./benchmark-rows";

type MatchedRowLookups = Pick<ModelAtlasSourceData, "modelsDev"> &
	BenchmarkAssignmentLookups;

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
	const benchmarks = { ...asRecord(artificialAnalysisModel.benchmarks) };
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
	const observationNameCandidates = [
		artificialAnalysisModelId,
		artificialAnalysisSlug,
		artificialAnalysisModel.name,
	];
	const observationBenchmarks = buildObservationBenchmarks(
		observationNameCandidates,
		lookups,
		benchmarks,
		artificialAnalysisModel.reasoning_effort,
	);
	Object.assign(benchmarks, observationBenchmarks.benchmarks);
	const canonicalId = canonicalProviderModelId(
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
		name: matchedModelName,
		artificial_analysis_id: artificialAnalysisModelId,
		artificial_analysis_slug: artificialAnalysisSlug,
		provider_id: matchedModelsDev?.provider_id ?? null,
		openrouter_id: canonicalId,
		reasoning_effort: canonicalReasoningEffort(
			artificialAnalysisModel.reasoning_effort,
		),
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
		...(Object.keys(observationBenchmarks.scoringSources).length === 0
			? {}
			: { scoring_sources: observationBenchmarks.scoringSources }),
		benchmarks,
		intelligence,
		intelligence_index_cost: intelligenceIndexCost,
	};
}

export function modelRowsFromMatchDiagnostics(
	sourceData: ModelAtlasSourceData,
	matchDiagnostics: MatchDiagnosticsPayload,
): Record<string, unknown>[] {
	return matchDiagnostics.models
		.map((matchedModel) => {
			const matchedModelId = matchedModel.best_match?.model_id ?? null;
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
