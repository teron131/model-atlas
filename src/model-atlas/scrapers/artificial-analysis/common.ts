/** Shared Artificial Analysis page parsing, display-name, and reasoning-effort rules. */

const DISPLAY_SUFFIX_PATTERN =
	/\s*\((?:[^)]*(?:fallback|not currently available|unavailable|adaptive reasoning|max effort)[^)]*)\)\s*/gi;
const REASONING_EFFORT_BY_LABEL = {
	"non reasoning": "none",
	max: "max",
	"max effort": "max",
	xhigh: "xhigh",
	"extra high": "xhigh",
	high: "high",
	medium: "medium",
	low: "low",
} as const satisfies Readonly<Record<string, string>>;

/** Remove transient availability/fallback qualifiers from Artificial Analysis model names. */
export function cleanArtificialAnalysisModelName(
	value: unknown,
): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return null;
	}
	const cleaned = value
		.replace(DISPLAY_SUFFIX_PATTERN, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.length > 0 ? cleaned : value;
}

/** Extract reasoning-effort labels that Artificial Analysis embeds in display-name parentheticals. */
export function parseArtificialAnalysisReasoningEffort(
	value: unknown,
): string | null {
	if (typeof value !== "string") {
		return null;
	}
	for (const match of value.matchAll(/\(([^)]*)\)/g)) {
		const effort = reasoningEffortLabel(match[1]);
		if (effort != null) {
			return effort;
		}
	}
	return null;
}

function reasoningEffortLabel(value: string | undefined): string | null {
	const label = value
		?.toLowerCase()
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (label == null) {
		return null;
	}
	// Some AA labels append an effort qualifier to an explicitly non-reasoning configuration. Non-reasoning is the runnable mode, so the qualifier must not turn it into an unknown effort.
	if (/\bnon reasoning\b/.test(label)) {
		return "none";
	}
	return (
		REASONING_EFFORT_BY_LABEL[
			label as keyof typeof REASONING_EFFORT_BY_LABEL
		] ?? null
	);
}
