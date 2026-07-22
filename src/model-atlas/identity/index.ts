/** Model identity matching surface: exposes diagnostics without leaking pipeline internals into stats callers. */

export { modelNameIdentityKey } from "./matching/name-tokens";
export { buildMatchDiagnostics } from "./matching/pipeline";
export {
	artificialAnalysisMatchSlug,
	firstVariantCompatibleCandidate,
	hasVariantConflict,
	rankMatchCandidates,
} from "./matching/scoring";
export type {
	MatchDiagnosticsPayload,
	MatcherConfig,
} from "./matching/types";
