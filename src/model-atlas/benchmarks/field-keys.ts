/** Shared benchmark field keys used by stats and database payload reconstruction. */

export const ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS = [
  "intelligence_index",
  "agentic_index",
  "coding_index",
  "omniscience_index",
] as const;

export const ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS = [
  ...ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS,
  "omniscience_accuracy",
] as const;

export const INTELLIGENCE_INDEX_KEYS = [
  "intelligence_index",
  "artificial_analysis_intelligence_index",
] as const;

export const AGENTIC_INDEX_KEYS = ["agentic_index", "artificial_analysis_agentic_index"] as const;
