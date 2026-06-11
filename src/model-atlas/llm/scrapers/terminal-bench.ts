/**
 * Terminal-Bench leaderboard scraper helpers.
 *
 * Page source: https://www.tbench.ai/leaderboard/terminal-bench/2.0
 */
import { quantileFromSorted } from "../../math-utils";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { asRecord, type JsonObject, normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL =
	"https://www.tbench.ai/leaderboard/terminal-bench/2.0";
const DEFAULT_TIMEOUT_MS = 30_000;
const ACCURACY_FIELD_MARKER = '"accuracy":';
const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
const OPAQUE_MODEL_LABEL = "multiple";

export type TerminalBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type TerminalBenchAgentModelAccuracyRow = {
	agent: string;
	model: string;
	accuracy: number;
};

export type TerminalBenchModelMedianAccuracyRow = {
	model: string;
	median_accuracy: number;
	mean_accuracy: number;
	frequency: number;
};

export type TerminalBenchAccuracyByModelName = Map<
	string,
	TerminalBenchModelMedianAccuracyRow
>;

export type TerminalBenchAgentModelAccuracyPayload = {
	fetched_at_epoch_seconds: number | null;
	data: TerminalBenchAgentModelAccuracyRow[];
};

export type TerminalBenchModelMedianAccuracyPayload = {
	fetched_at_epoch_seconds: number | null;
	data: TerminalBenchModelMedianAccuracyRow[];
};

type RawTerminalBenchLeaderboardRow = {
	agent: string;
	model: string[];
	accuracy: number;
};

/** Decode one escaped Next flight chunk from the page HTML. */
function decodeFlightChunk(escapedChunk: string): string {
	try {
		return JSON.parse(`"${escapedChunk}"`) as string;
	} catch {
		return escapedChunk;
	}
}

/** Extract and decode the full Next flight corpus used by Terminal-Bench pages. */
function extractFlightCorpus(pageHtml: string): string {
	return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)]
		.map((match) => decodeFlightChunk(match[1] ?? ""))
		.join("\n");
}

/** Return the end offset of a JSON object starting at startIndex. */
function findObjectEnd(corpus: string, startIndex: number): number {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = startIndex; index < corpus.length; index += 1) {
		const char = corpus[index];
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

/** Parse JSON objects while scanning Terminal-Bench scraper data. */
function parseJsonObject(value: string): JsonObject | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}

/** Return only string values from a possible Terminal-Bench model list. */
function normalizeModelList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

/** Validate the raw row shape used by the Terminal-Bench leaderboard payload. */
function asRawLeaderboardRow(
	value: unknown,
): RawTerminalBenchLeaderboardRow | null {
	const row = asRecord(value);
	if (
		!row ||
		typeof row.agent !== "string" ||
		typeof row.accuracy !== "number" ||
		!Number.isFinite(row.accuracy)
	) {
		return null;
	}
	const model = normalizeModelList(row.model);
	return model.join(", ").length > 0
		? {
				agent: row.agent,
				model,
				accuracy: row.accuracy,
			}
		: null;
}

/** Find the smallest valid leaderboard row object around an accuracy field. */
function findLeaderboardRowAt(
	corpus: string,
	accuracyFieldIndex: number,
): RawTerminalBenchLeaderboardRow | null {
	for (let startIndex = accuracyFieldIndex; startIndex >= 0; startIndex -= 1) {
		if (corpus[startIndex] !== "{") {
			continue;
		}
		const endIndex = findObjectEnd(corpus, startIndex);
		if (endIndex === -1 || endIndex < accuracyFieldIndex) {
			continue;
		}
		const row = asRawLeaderboardRow(
			parseJsonObject(corpus.slice(startIndex, endIndex + 1)),
		);
		if (row) {
			return row;
		}
	}
	return null;
}

/** Extract raw leaderboard rows from a decoded Next flight corpus. */
function extractRowsFromCorpus(
	corpus: string,
): RawTerminalBenchLeaderboardRow[] {
	const rows: RawTerminalBenchLeaderboardRow[] = [];
	let cursor = 0;
	while (cursor < corpus.length) {
		const accuracyFieldIndex = corpus.indexOf(ACCURACY_FIELD_MARKER, cursor);
		if (accuracyFieldIndex === -1) {
			break;
		}
		const row = findLeaderboardRowAt(corpus, accuracyFieldIndex);
		if (row) {
			rows.push(row);
		}
		cursor = accuracyFieldIndex + ACCURACY_FIELD_MARKER.length;
	}
	return rows;
}

/** Normalize raw Terminal-Bench rows to the minimal agent/model/accuracy surface. */
export function processTerminalBenchLeaderboardRows(
	rows: JsonObject[] | RawTerminalBenchLeaderboardRow[],
): TerminalBenchAgentModelAccuracyRow[] {
	return rows
		.map((row) => asRawLeaderboardRow(row))
		.filter((row): row is RawTerminalBenchLeaderboardRow => row != null)
		.map((row) => ({
			agent: row.agent,
			model: row.model.join(", "),
			accuracy: row.accuracy,
		}));
}

/** Return the median of finite values. */
function median(values: number[]): number | null {
	return quantileFromSorted(
		[...values].sort((left, right) => left - right),
		0.5,
	);
}

/** Return the Terminal-Bench score used for model matching. */
function terminalBenchScore(row: TerminalBenchModelMedianAccuracyRow): number {
	return Math.max(row.median_accuracy, row.mean_accuracy);
}

/** Expand specific multi-model rows and drop opaque aggregate labels. */
function expandModelNames(model: string): string[] {
	return model
		.split(",")
		.map((value) => value.trim())
		.filter(
			(value) => value.length > 0 && value.toLowerCase() !== OPAQUE_MODEL_LABEL,
		);
}

/** Group Terminal-Bench agent/model rows into model median accuracy rows. */
export function summarizeTerminalBenchModelMedianAccuracy(
	rows: TerminalBenchAgentModelAccuracyRow[],
): TerminalBenchModelMedianAccuracyRow[] {
	const accuracyByModel = new Map<string, number[]>();
	for (const row of rows) {
		for (const model of expandModelNames(row.model)) {
			const values = accuracyByModel.get(model) ?? [];
			values.push(row.accuracy);
			accuracyByModel.set(model, values);
		}
	}
	return [...accuracyByModel.entries()]
		.map(([model, values]) => ({
			model,
			median_accuracy: median(values),
			mean_accuracy:
				values.reduce((sum, value) => sum + value, 0) / values.length,
			frequency: values.length,
		}))
		.filter(
			(row): row is TerminalBenchModelMedianAccuracyRow =>
				row.median_accuracy != null && row.mean_accuracy != null,
		)
		.sort(
			(left, right) => terminalBenchScore(right) - terminalBenchScore(left),
		);
}

/** Build Terminal-Bench 2.0 median accuracy rows by normalized model name. */
export function buildTerminalBenchAccuracyByModelName(
	rows: TerminalBenchModelMedianAccuracyRow[],
): TerminalBenchAccuracyByModelName {
	const accuracyByModelName: TerminalBenchAccuracyByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length === 0) {
			continue;
		}
		const existing = accuracyByModelName.get(key);
		if (
			!existing ||
			row.frequency > existing.frequency ||
			(row.frequency === existing.frequency &&
				terminalBenchScore(row) > terminalBenchScore(existing))
		) {
			accuracyByModelName.set(key, row);
		}
	}
	return accuracyByModelName;
}

/** Find a Terminal-Bench 2.0 score from model labels that may differ by punctuation. */
export function findTerminalBenchMedianAccuracy(
	candidateNames: unknown[],
	terminalBenchAccuracyByModelName: TerminalBenchAccuracyByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = terminalBenchAccuracyByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return terminalBenchScore(row);
		}
	}
	return null;
}

/** Fetch Terminal-Bench agent/model/accuracy leaderboard rows. */
export async function getTerminalBenchAgentModelAccuracyStats(
	options: TerminalBenchScraperOptions = {},
): Promise<TerminalBenchAgentModelAccuracyPayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Terminal-Bench scrape failed: ${response.status}`);
		}
		const pageHtml = await response.text();
		const rows = processTerminalBenchLeaderboardRows(
			extractRowsFromCorpus(extractFlightCorpus(pageHtml)),
		);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: rows,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}

/** Fetch Terminal-Bench model median accuracy rows. */
export async function getTerminalBenchModelMedianAccuracyStats(
	options: TerminalBenchScraperOptions = {},
): Promise<TerminalBenchModelMedianAccuracyPayload> {
	const payload = await getTerminalBenchAgentModelAccuracyStats(options);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: summarizeTerminalBenchModelMedianAccuracy(payload.data),
	};
}
