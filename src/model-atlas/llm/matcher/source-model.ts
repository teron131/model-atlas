/** Build matcher source rows from Artificial Analysis API rows or scraper rows. */
import { asRecord, modelSlugFromModelId } from "../shared";

import type { ArtificialAnalysisModel, MatcherSourceModel } from "./types";

const ARTIFICIAL_ANALYSIS_EFFORT_SUFFIXES = [
	"-non-reasoning",
	"-adaptive",
	"-xhigh",
	"-high",
	"-medium",
	"-low",
	"-minimal",
] as const;

/** Collapse AA effort-specific rows to the base slug used for model matching. */
function artificialAnalysisMatchSlug(sourceSlug: string): string {
	for (const suffix of ARTIFICIAL_ANALYSIS_EFFORT_SUFFIXES) {
		if (sourceSlug.endsWith(suffix)) {
			return sourceSlug.slice(0, -suffix.length);
		}
	}
	return sourceSlug;
}

/** Build matcher source rows from the Artificial Analysis API payload. */
export function buildSourceModelsFromArtificialAnalysis(
	artificialAnalysisModels: ArtificialAnalysisModel[],
): MatcherSourceModel[] {
	return artificialAnalysisModels.map((artificialAnalysisModel) => {
		const sourceSlug =
			typeof artificialAnalysisModel.slug === "string"
				? artificialAnalysisModel.slug
				: "";
		return {
			sourceSlug,
			sourceMatchSlug: artificialAnalysisMatchSlug(sourceSlug),
			sourceName:
				typeof artificialAnalysisModel.name === "string"
					? artificialAnalysisModel.name
					: null,
			sourceReleaseDate:
				typeof artificialAnalysisModel.release_date === "string"
					? artificialAnalysisModel.release_date
					: null,
		};
	});
}

/** Build matcher source rows from scraper rows when the API path is unavailable. */
export function buildSourceModelsFromScrapedRows(
	scrapedRows: unknown[],
): MatcherSourceModel[] {
	return scrapedRows.map((scrapedRow) => {
		const scrapedRowRecord = asRecord(scrapedRow);
		const modelId =
			typeof scrapedRowRecord.model_id === "string"
				? scrapedRowRecord.model_id
				: null;
		const sourceSlug = modelSlugFromModelId(modelId) ?? "";
		return {
			sourceSlug,
			sourceMatchSlug: artificialAnalysisMatchSlug(sourceSlug),
			sourceName: modelId,
			sourceReleaseDate: null,
		};
	});
}
