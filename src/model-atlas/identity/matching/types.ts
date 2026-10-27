/** Contracts for LLM source-row matching diagnostics and candidate scoring. */

/** Catalog model shape required by matcher ranking; source adapters may supply richer rows. */
export type ModelsDevModel = {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model: {
    id?: string;
    name?: string;
    modalities?: {
      input?: string[];
      output?: string[];
    };
    [key: string]: unknown;
  };
};

export type MatcherSourceModel = {
  sourceId: string | null;
  sourceSlug: string;
  sourceProvider?: string | null;
  matchSlugOverride?: string;
  sourceName: string | null;
  sourceReleaseDate: string | null;
};

/** Variant labels that must agree between source slugs and catalog model ids. */
export type MatcherConfig = {
  variantTokens: readonly string[];
};

export type MatchCandidateInput = {
  model_id: string;
  provider_id: string;
  provider_name: string;
  model_name: string | null;
};

export type MatchCandidate = MatchCandidateInput & {
  score: number;
};

export type MatchResult = MatchCandidate | null;

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
  artificialAnalysisRows: unknown[];
  matchSlugOverridesBySourceId?: ReadonlyMap<string, string>;
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
  openRouter: ModelsDevModel[];
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
