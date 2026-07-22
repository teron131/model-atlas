/** Scraper parsing normalizes CSV, Flight, HTML, and scalar source values at the adapter boundary. */

import { asRecord, type JsonObject } from "../runtime";

const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

/** Parse RFC 4180-style CSV text into rows without coercing source values. */
function parseCsvRows(csv: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < csv.length; index += 1) {
		const character = csv[index] ?? "";
		if (quoted) {
			if (character === '"' && csv[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				field += character;
			}
			continue;
		}
		if (character === '"' && field.length === 0) {
			quoted = true;
		} else if (character === ",") {
			row.push(field);
			field = "";
		} else if (character === "\n") {
			row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += character;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
		rows.push(row);
	}
	return rows;
}

/** Map CSV body rows to their source header names. */
export function parseCsvRecords(csv: string): Record<string, string>[] {
	const [headers, ...rows] = parseCsvRows(csv);
	if (headers == null) return [];
	return rows
		.filter((row) => row.some((value) => value.length > 0))
		.map((row) =>
			Object.fromEntries(
				headers.map((header, index) => [header, row[index] ?? ""]),
			),
		);
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

/** Accepts only non-empty string fields from scraped payloads. */
export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
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
