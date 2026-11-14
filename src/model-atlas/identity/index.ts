/** Model identity matching surface for callers outside `identity/`: the name identity key, candidate ranking and variant checks, and match diagnostics, while matching internals stay private to `matching/`. */

export { modelNameIdentityKey } from "./matching/name-tokens";
export { buildMatchDiagnostics } from "./matching/pipeline";
export {
  firstVariantCompatibleCandidate,
  hasVariantConflict,
  rankMatchCandidates,
} from "./matching/scoring";
export type { MatchCandidateInput, MatchDiagnosticsPayload, MatcherConfig } from "./matching/types";
