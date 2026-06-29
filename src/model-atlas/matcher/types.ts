/** Contracts for LLM source-row matching diagnostics and candidate scoring. */

/** Shared public and intermediate types for the LLM matcher pipeline. */
import type { getModelsDevStats } from "../scrapers/models-dev";

export type ModelsDevModel = Awaited<
	ReturnType<typeof getModelsDevStats>
>["models"][number];

export type MatcherSourceModel = {
	sourceSlug: string;
	sourceMatchSlug?: string;
	sourceName: string | null;
	sourceReleaseDate: string | null;
};

/** Candidate model from models.dev for one Artificial Analysis source model. */
export type MatchCandidate = {
	model_id: string;
	provider_id: string;
	provider_name: string;
	model_name: string | null;
	score: number;
};

export type MatchResult = MatchCandidate | null;

/** Mapping entry for one Artificial Analysis model and its ranked match candidates. */
export type MatchMappedModel = {
	artificial_analysis_slug: string;
	artificial_analysis_name: string | null;
	artificial_analysis_release_date: string | null;
	best_match: MatchResult;
	candidates: MatchCandidate[];
};

export type MatchDiagnosticsOptions = {
	maxCandidates?: number;
	modelsDevModels?: ModelsDevModel[];
	scrapedRows?: unknown[];
};

export type MatchDiagnosticsPayload = {
	scraped_fetched_at_epoch_seconds: number | null;
	models_dev_fetched_at_epoch_seconds: number | null;
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
