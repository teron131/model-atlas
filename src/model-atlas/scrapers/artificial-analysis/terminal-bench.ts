/**
 * Artificial Analysis Terminal-Bench resource scraper helpers.
 *
 * This benchmark-specific page supplements the AA main leaderboard with per-task cost, runtime, token, and harness data for Terminal-Bench.
 */

import { normalizeModelToken } from "../../shared";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../../utils";
import {
	cleanArtificialAnalysisModelName,
	parseArtificialAnalysisReasoningEffort,
} from "./common";

const DEFAULT_EVALUATION_URL =
	"https://artificialanalysis.ai/evaluations/terminalbench-v2-1";
const DEFAULT_TIMEOUT_MS = 30_000;
const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
const ROW_DETECTION_KEY = "evalTimePerTask";
const MODEL_SEARCH_BACKTRACK_CHARS = 70_000;
const TERMINAL_BENCH_TASK_RUNS = 89 * 3;

export type TerminalBenchAAOptions = {
	url?: string;
	timeoutMs?: number;
};

export type TerminalBenchAAResourceRow = {
	model_id: string;
	model: string;
	provider: string;
	provider_id: string | null;
	reasoning_effort: string | null;
	cost_per_task_usd: number;
	seconds_per_task: number;
	tokens_per_task: number;
	input_tokens_per_task: number;
	output_tokens_per_task: number;
};

export type TerminalBenchAAResourcePayload = {
	fetched_at_epoch_seconds: number | null;
	data: TerminalBenchAAResourceRow[];
};

export type TerminalBenchAAResourceByModelName = Map<
	string,
	TerminalBenchAAResourceRow
>;

function decodeFlightChunk(raw: string): string {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw;
	}
}

function extractFlightCorpus(pageHtml: string): string {
	return [...pageHtml.matchAll(NEXT_FLIGHT_CHUNK_REGEX)]
		.map((match) => decodeFlightChunk(match[1] ?? ""))
		.join("\n");
}

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

function parseJsonObject(value: string): Record<string, unknown> | null {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}

function providerSlug(provider: string | null): string | null {
	return provider == null
		? null
		: provider
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function perTask(value: number | null): number | null {
	return value == null ? null : value / TERMINAL_BENCH_TASK_RUNS;
}

function terminalBenchResourceRow(
	value: unknown,
): TerminalBenchAAResourceRow | null {
	const row = asRecord(value);
	const modelSlug = stringValue(row.slug);
	const providerRecord = asRecord(row.model_creators);
	const provider =
		stringValue(providerRecord.name) ?? stringValue(row.modelCreatorName);
	const providerId = stringValue(providerRecord.slug) ?? providerSlug(provider);
	const sourceModelName =
		stringValue(row.short_name) ?? stringValue(row.shortName) ?? row.name;
	const model = cleanArtificialAnalysisModelName(sourceModelName) ?? modelSlug;
	const reasoningEffort =
		parseArtificialAnalysisReasoningEffort(sourceModelName);
	const cost = asRecord(row.evalCost);
	const tokenCounts = asRecord(row.tokenCounts);
	const costPerTask = perTask(asFiniteNumber(cost.total));
	const secondsPerTask = asFiniteNumber(row.evalTimePerTask);
	const inputTokensPerTask = perTask(asFiniteNumber(tokenCounts.inputTokens));
	const outputTokensPerTask = perTask(asFiniteNumber(tokenCounts.outputTokens));
	const tokensPerTask =
		inputTokensPerTask == null || outputTokensPerTask == null
			? null
			: inputTokensPerTask + outputTokensPerTask;
	if (
		modelSlug == null ||
		provider == null ||
		providerId == null ||
		model == null ||
		costPerTask == null ||
		secondsPerTask == null ||
		inputTokensPerTask == null ||
		outputTokensPerTask == null ||
		tokensPerTask == null
	) {
		return null;
	}
	return {
		model_id: `${providerId}/${modelSlug}`,
		model,
		provider,
		provider_id: providerId,
		reasoning_effort: reasoningEffort,
		cost_per_task_usd: costPerTask,
		seconds_per_task: secondsPerTask,
		tokens_per_task: tokensPerTask,
		input_tokens_per_task: inputTokensPerTask,
		output_tokens_per_task: outputTokensPerTask,
	};
}

function extractRowsFromCorpus(corpus: string): Record<string, unknown>[] {
	const rowsById = new Map<string, Record<string, unknown>>();
	let cursor = 0;
	while (true) {
		const hitIndex = corpus.indexOf(`"${ROW_DETECTION_KEY}":`, cursor);
		if (hitIndex === -1) {
			break;
		}
		cursor = hitIndex + 1;
		const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
		for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
			if (corpus[backIndex] !== "{") {
				continue;
			}
			const endIndex = findObjectEnd(corpus, backIndex);
			if (endIndex === -1 || endIndex < hitIndex) {
				continue;
			}
			const row = parseJsonObject(corpus.slice(backIndex, endIndex + 1));
			const rowId = stringValue(row?.id) ?? stringValue(row?.slug);
			if (row == null || rowId == null || !(ROW_DETECTION_KEY in row)) {
				continue;
			}
			rowsById.set(rowId, row);
			break;
		}
	}
	return [...rowsById.values()];
}

export function processTerminalBenchAARows(
	rows: unknown[],
): TerminalBenchAAResourceRow[] {
	return rows
		.map((row) => terminalBenchResourceRow(row))
		.filter((row): row is TerminalBenchAAResourceRow => row != null)
		.sort((left, right) => left.model_id.localeCompare(right.model_id));
}

export function processTerminalBenchAAPageHtml(
	pageHtml: string,
): TerminalBenchAAResourceRow[] {
	return processTerminalBenchAARows(
		extractRowsFromCorpus(extractFlightCorpus(pageHtml)),
	);
}

function modelKeyCandidates(row: TerminalBenchAAResourceRow): string[] {
	return [row.model_id, row.model]
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

export function buildTerminalBenchAAMap(
	rows: TerminalBenchAAResourceRow[],
): TerminalBenchAAResourceByModelName {
	const rowByModelName: TerminalBenchAAResourceByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row)) {
			rowByModelName.set(key, row);
		}
	}
	return rowByModelName;
}

export function findTerminalBenchAAResourceRow(
	candidateNames: unknown[],
	rowsByModelName: TerminalBenchAAResourceByModelName,
): TerminalBenchAAResourceRow | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = rowsByModelName.get(normalizeModelToken(candidateName));
		if (row != null) {
			return row;
		}
	}
	return null;
}

export async function getTerminalBenchAAResourceStats(
	options: TerminalBenchAAOptions = {},
): Promise<TerminalBenchAAResourcePayload> {
	try {
		const url = options.url ?? DEFAULT_EVALUATION_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(
				`Artificial Analysis Terminal-Bench scrape failed: ${response.status}`,
			);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processTerminalBenchAAPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
