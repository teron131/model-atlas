/** Contracts for LLM source-row matching diagnostics and candidate scoring. */

import type { ModelsDevFlatModel } from "../scrapers/models-dev";

export type ModelsDevModel = ModelsDevFlatModel;

export type MatcherSourceModel = {
	sourceId: string | null;
	sourceSlug: string;
	sourceName: string | null;
	sourceReleaseDate: string | null;
};

/** Variant labels that must agree between source slugs and catalog model ids. */
export type MatcherConfig = {
	variantTokens: readonly string[];
};

/** Identity fields needed to score one candidate against a source slug. */
export type MatchCandidateInput = {
	model_id: string;
	provider_id: string;
	provider_name: string;
	model_name: string | null;
};

/** Candidate model from models.dev for one Artificial Analysis source model. */
export type MatchCandidate = MatchCandidateInput & {
	score: number;
};

export type MatchResult = MatchCandidate | null;

/** Mapping entry for one Artificial Analysis model and its ranked match candidates. */
type MatchMappedModel = {
	artificial_analysis_id: string | null;
	artificial_analysis_slug: string;
	artificial_analysis_name: string | null;
	artificial_analysis_release_date: string | null;
	best_match: MatchResult;
	candidates: MatchCandidate[];
};

export type MatchDiagnosticsOptions = {
	matcherConfig: MatcherConfig;
	maxCandidates?: number;
	modelsDevModels: ModelsDevModel[];
	scrapedRows: unknown[];
};

export type MatchDiagnosticsPayload = {
	total_scraped_models: number;
	total_models_dev_models: number;
	max_candidates: number;
	pre_void_matched_count: number;
	pre_void_unmatched_count: number;
	void_mode: "maxmin_range";
	void_threshold: number | null;
	voided_count: number;
	matched_count: number;
	unmatched_count: number;
	models: MatchMappedModel[];
};

export type PreferredProviderPools = {
	primary: ModelsDevModel[];
	fallback: ModelsDevModel[];
};

export type MatcherRunOutput = {
	models: MatchMappedModel[];
	voidThreshold: number | null;
	voidedCount: number;
	preVoidMatchedCount: number;
	preVoidUnmatchedCount: number;
	matchedCount: number;
	unmatchedCount: number;
};
