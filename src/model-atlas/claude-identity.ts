/** Claude identity parsing normalizes historical and current tier/version order without absorbing configuration labels. */

import { normalizeModelToken } from "./shared";

const CLAUDE_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
const CLAUDE_TIER_PATTERN = CLAUDE_TIERS.join("|");
const COMPACT_CLAUDE_VERSION_ALIASES = new Map([["35", "3.5"]]);
const VERSION_FIRST_PATTERN = new RegExp(
	`(?:^|[-/])claude-(\\d{1,2})(?:-(\\d{1,2}))?-(${CLAUDE_TIER_PATTERN})(?:-|$)`,
);
const TIER_FIRST_PATTERN = new RegExp(
	`(?:^|[-/])claude-(${CLAUDE_TIER_PATTERN})-(\\d{1,2})(?:-(\\d{1,2}))?(?:-|$)`,
);

type ClaudeTier = (typeof CLAUDE_TIERS)[number];

type ClaudeIdentity = {
	tier: ClaudeTier;
	version: string;
};

function buildClaudeIdentity(
	tier: string | undefined,
	major: string | undefined,
	minor: string | undefined,
): ClaudeIdentity | null {
	if (
		!CLAUDE_TIERS.includes(tier as ClaudeTier) ||
		major == null ||
		major.length === 0
	) {
		return null;
	}
	return {
		tier: tier as ClaudeTier,
		version:
			minor == null
				? (COMPACT_CLAUDE_VERSION_ALIASES.get(major) ?? major)
				: `${major}.${minor}`,
	};
}

/** Parses historical ordering and the compact `35` token alongside current tier-first names. */
export function parseClaudeIdentity(value: string): ClaudeIdentity | null {
	const normalized = normalizeModelToken(value);
	const versionFirstMatch = normalized.match(VERSION_FIRST_PATTERN);
	if (versionFirstMatch != null) {
		return buildClaudeIdentity(
			versionFirstMatch[3],
			versionFirstMatch[1],
			versionFirstMatch[2],
		);
	}
	const tierFirstMatch = normalized.match(TIER_FIRST_PATTERN);
	return tierFirstMatch == null
		? null
		: buildClaudeIdentity(
				tierFirstMatch[1],
				tierFirstMatch[2],
				tierFirstMatch[3],
			);
}

/** Formats a parsed Claude tier/version as its canonical model identity. */
export function claudeIdentityKey(identity: ClaudeIdentity): string {
	return `claude-${identity.tier}-${identity.version}`;
}

/** Returns the normal route-form identity only when the input contains no extra configuration labels. */
export function claudeRouteIdentityKey(value: string): string | null {
	const identity = parseClaudeIdentity(value);
	if (identity == null) {
		return null;
	}
	const normalized = normalizeModelToken(value).split("/").at(-1);
	const versionToken = identity.version.replace(".", "-");
	if (
		normalized !== `claude-${identity.tier}-${versionToken}` &&
		normalized !== `claude-${versionToken}-${identity.tier}`
	) {
		return null;
	}
	return claudeIdentityKey(identity);
}
