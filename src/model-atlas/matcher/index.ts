/** Matcher exports expose diagnostics without leaking pipeline internals into stats callers. */

export { getMatchDiagnostics } from "./pipeline";
export type {
	MatchCandidate,
	MatchDiagnosticsOptions,
	MatchDiagnosticsPayload,
	MatchMappedModel,
	MatchResult,
} from "./types";
