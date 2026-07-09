/** Shared Artificial Analysis page parsing, display-name, and reasoning-effort rules. */

import { asRecord, type JsonObject } from "../../shared";

const DISPLAY_SUFFIX_PATTERN =
	/\s*\((?:[^)]*(?:fallback|not currently available|unavailable|adaptive reasoning|max effort)[^)]*)\)\s*/gi;
const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
const REASONING_EFFORT_BY_LABEL = {
	"non reasoning": "non-reasoning",
	max: "max",
	"max effort": "max",
	xhigh: "xhigh",
	"extra high": "xhigh",
	high: "high",
	medium: "medium",
	low: "low",
} as const satisfies Readonly<Record<string, string>>;

/** Decode escaped Next.js flight payload chunks while preserving malformed chunks for best-effort parsing. */
function decodeFlightChunk(raw: string): string {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw;
	}
}

/** Collect Artificial Analysis Next.js flight chunks into the flight text searched by page-specific row extractors. */
export function extractArtificialAnalysisFlightCorpus(
	pageHtml: string,
): string {
	return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)]
		.map((match) => decodeFlightChunk(match[1] ?? ""))
		.join("\n");
}

/** Find the matching object boundary in flight text without being fooled by quoted braces. */
export function findArtificialAnalysisFlightObjectEnd(
	flightCorpus: string,
	startIndex: number,
): number {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = startIndex; index < flightCorpus.length; index += 1) {
		const char = flightCorpus[index];
		if (inString) {
			if (escaping) {
				escaping = false;
			} else if (char === "\\") {
				escaping = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

/** Parse a candidate flight object into an inspectable record without throwing on malformed snippets. */
export function parseArtificialAnalysisFlightObject(
	value: string,
): JsonObject | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}

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
	return label == null
		? null
		: (REASONING_EFFORT_BY_LABEL[
				label as keyof typeof REASONING_EFFORT_BY_LABEL
			] ?? null);
}
