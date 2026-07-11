/** Matcher exports expose diagnostics without leaking pipeline internals into stats callers. */

export { modelNameIdentityKey } from "./name-tokens";
export { buildMatchDiagnostics } from "./pipeline";
export {
	artificialAnalysisMatchSlug,
	firstVariantCompatibleCandidate,
	hasVariantConflict,
	rankMatchCandidates,
} from "./scoring";
export type {
	MatchCandidate,
	MatchCandidateInput,
	MatchDiagnosticsOptions,
	MatchDiagnosticsPayload,
	MatcherConfig,
	MatchMappedModel,
	MatchResult,
} from "./types";
