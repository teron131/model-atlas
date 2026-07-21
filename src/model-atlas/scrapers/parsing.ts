/** Shared parser rules for benchmark pages that expose loose HTML, embedded JSON, and text-only rows. */

import { asFiniteNumber, asRecord, type JsonObject } from "../shared";

const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

type ZeroEvalModelScoreFields = {
	model: string;
	provider: string;
	provider_name?: string | null;
	score: number;
	source_url?: string | null;
	analysis_method?: string | null;
	verified?: boolean | null;
	self_reported?: boolean | null;
};

/** Accepts only non-empty string fields from scraped payloads. */
export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function decodeFlightChunk(raw: string): string {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw;
	}
}

/** Collect escaped Next.js Flight chunks into searchable decoded text. */
export function extractNextFlightCorpus(pageHtml: string): string {
	return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)]
		.map((match) => decodeFlightChunk(match[1] ?? ""))
		.join("\n");
}

/** Find one JSON object's closing brace without treating quoted braces as structure. */
export function findObjectEnd(value: string, startIndex: number): number {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = startIndex; index < value.length; index += 1) {
		const char = value[index];
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

/** Parse a candidate Flight object without letting malformed page fragments abort a scrape. */
export function parseFlightJsonObject(value: string): JsonObject | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}

/** Accepts source scores that are already on the 0-1 benchmark scale. */
function unitScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	if (score == null || score < 0 || score > 1) {
		return null;
	}
	return Number(score.toFixed(6));
}

/** Source-page percentages enter benchmark scoring on the shared 0-1 scale. */
export function percentToUnitScore(
	value: string | null | undefined,
): number | null {
	if (value == null) {
		return null;
	}
	const score = Number(value);
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return null;
	}
	return Number((score / 100).toFixed(6));
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&#xA0;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&mdash;/g, "\u2014")
		.replace(/&#8212;/g, "\u2014");
}

export function stripHtmlTags(value: string): string {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

/** Escapes user-visible labels before building scraper regular expressions. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function htmlAttribute(html: string, name: string): string | null {
	const namePattern = escapeRegExp(name);
	const match = html.match(
		new RegExp(`(?:^|[\\s<])${namePattern}\\s*=\\s*(['"])(.*?)\\1`, "i"),
	);
	return match == null ? null : decodeHtmlEntities(match[2] ?? "").trim();
}

/** Turns scraped HTML into normalized visible text lines. */
export function htmlTextLines(pageHtml: string): string[] {
	return decodeHtmlEntities(
		pageHtml
			.replace(/<script[\s\S]*?<\/script>/g, " ")
			.replace(/<style[\s\S]*?<\/style>/g, " ")
			.replace(/<[^>]+>/g, "\n"),
	)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => line.length > 0);
}

export function providerFromLogoAlt(value: string | null): string | null {
	if (value == null) {
		return null;
	}
	const provider = value.replace(/\s+logo$/i, "").trim();
	return provider.length > 0 ? provider : null;
}

export function zeroEvalModelScoreFields(
	value: unknown,
): ZeroEvalModelScoreFields | null {
	const row = asRecord(value);
	const model = stringValue(row?.model_name);
	const provider = stringValue(row?.organization_id);
	const score = unitScore(row?.normalized_score) ?? unitScore(row?.score);
	if (model == null || provider == null || score == null) {
		return null;
	}
	return {
		model,
		provider,
		provider_name: stringValue(row?.organization_name),
		score,
		source_url: stringValue(row?.self_reported_source),
		analysis_method: stringValue(row?.analysis_method),
		verified: booleanValue(row?.verified),
		self_reported: booleanValue(row?.self_reported),
	};
}

/** Collects normalized ZeroEval model rows from a payload. */
export function zeroEvalModelRows<T>(
	payload: unknown,
	modelScoreRow: (value: unknown) => T | null,
): T[] {
	const root = asRecord(payload);
	const modelRows = Array.isArray(root?.models) ? root.models : [];
	const rows: T[] = [];
	for (const modelRow of modelRows) {
		const row = modelScoreRow(modelRow);
		if (row != null) {
			rows.push(row);
		}
	}
	return rows;
}
