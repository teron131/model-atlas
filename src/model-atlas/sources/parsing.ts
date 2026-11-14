/** Scraper parsing normalizes CSV, Flight, HTML, and scalar source values at the adapter boundary. */

import { asFiniteNumber, asRecord, type JsonObject } from "../runtime";

// Captures the still-escaped string in each `self.__next_f.push([1,"…"])</script>` Flight chunk: `self.__next_f.push([1,"a:{\"x\":1}"])</script>` → `a:{\"x\":1}`.
const NEXT_FLIGHT_CHUNK_REGEX = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

export function parseCsvRecords(csv: string): Record<string, string>[] {
  const [headers, ...rows] = parseCsvRows(csv);
  if (headers == null) return [];
  return rows
    .filter((row) => row.some((value) => value.length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

/** Collect escaped Next.js Flight chunks into searchable decoded text. */
export function extractNextFlightCorpus(pageHtml: string): string {
  return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)]
    .map((match) => decodeFlightChunk(match[1] ?? ""))
    .join("\n");
}

/** Find one JSON or JavaScript object literal's closing brace without treating braces inside double-quoted or template strings as structure. */
export function findObjectEnd(value: string, startIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaping = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (quote != null) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "`") {
      quote = char;
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

/** Yield each object literal that starts at an occurrence of `marker`, skipping unterminated and malformed candidates. */
export function* flightObjects(corpus: string, marker: string): Generator<JsonObject> {
  for (
    let start = corpus.indexOf(marker);
    start !== -1;
    start = corpus.indexOf(marker, start + 1)
  ) {
    const end = findObjectEnd(corpus, start);
    if (end === -1) continue;
    const object = parseFlightJsonObject(corpus.slice(start, end + 1));
    if (object != null) yield object;
  }
}

/** Parse a candidate Flight object without letting malformed page fragments abort a scrape. */
export function parseFlightJsonObject(value: string): JsonObject | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

export function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** The first quoted attribute whose name starts after whitespace or `<`, so `alt` skips `data-alt`: (`<img data-alt="x" alt="OpenAI logo">`, `alt`) → `OpenAI logo`. */
export function htmlAttribute(html: string, name: string): string | null {
  const namePattern = escapeRegExp(name);
  const match = html.match(new RegExp(`(?:^|[\\s<])${namePattern}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  return match == null ? null : decodeHtmlEntities(match[2] ?? "").trim();
}

export function providerFromLogoAlt(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  const provider = value.replace(/\s+logo$/i, "").trim();
  return provider.length > 0 ? provider : null;
}

/** Source percentages enter benchmark scoring on the shared 0-1 scale: `"45.2"` or `45.2` → `0.452`; anything but a number or numeric string, a blank string, and out-of-range values → `null`. */
export function percentToUnitScore(value: unknown): number | null {
  const score =
    typeof value === "number" || typeof value === "string" ? asFiniteNumber(value) : null;
  if (score == null || score < 0 || score > 100) {
    return null;
  }
  return Number((score / 100).toFixed(6));
}

/** Map rows already in rank order to competition ranks: adjacent equal scores share a rank and the next score skips past them (1, 2, 2, 4). */
export function mapWithCompetitionRank<T, R>(
  rows: readonly T[],
  score: (row: T) => number,
  map: (row: T, rank: number) => R,
): R[] {
  let rank = 0;
  let previousScore: number | null = null;
  return rows.map((row, index) => {
    const value = score(row);
    if (value !== previousScore) rank = index + 1;
    previousScore = value;
    return map(row, rank);
  });
}

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

function decodeFlightChunk(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
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

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
