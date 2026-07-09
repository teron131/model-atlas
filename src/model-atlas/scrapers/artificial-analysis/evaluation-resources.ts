/**
 * Artificial Analysis evaluation-page resource scraping for benchmark-level per-task telemetry.
 *
 * The Artificial Analysis main leaderboard is the score table. Individual evaluation pages carry benchmark-specific cost, time, and token resources, so this scraper centralizes the hydrated-page parser while keeping page-specific task-count assumptions explicit.
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

const DEFAULT_TIMEOUT_MS = 30_000;
const NEXT_FLIGHT_CHUNK_REGEX =
	/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
const ROW_DETECTION_KEY = "evalTimePerTask";
const MODEL_SEARCH_BACKTRACK_CHARS = 70_000;
const REASONING_EFFORT_RANK = {
	"non-reasoning": 0,
	low: 1,
	medium: 2,
	high: 3,
	xhigh: 4,
	max: 5,
} as const satisfies Readonly<Record<string, number>>;
const REASONING_EFFORT_SUFFIXES = [
	"non-reasoning",
	"extra-high",
	"xhigh",
	"high",
	"medium",
	"low",
	"max",
] as const;

export type ArtificialAnalysisEvaluationResourcePage = {
	benchmark_key: string;
	score_key?: string;
	score_path?: readonly string[];
	cost_path?: readonly string[];
	token_counts_path?: readonly string[];
	seconds_per_task?: "eval_time_per_task" | "briefcase_estimate";
	row_detection_key?: string;
	url: string;
	task_run_count: number;
};

export type ArtificialAnalysisEvaluationResourceOptions = {
	pages?: readonly ArtificialAnalysisEvaluationResourcePage[];
	timeoutMs?: number;
};

export type ArtificialAnalysisEvaluationResourceRow = {
	benchmark_key: string;
	source_url: string;
	model_id: string;
	model: string;
	provider: string;
	provider_id: string | null;
	reasoning_effort: string | null;
	score: number;
	task_run_count: number;
	cost_per_task_usd: number;
	seconds_per_task: number;
	tokens_per_task: number;
	input_tokens_per_task: number;
	output_tokens_per_task: number;
	answer_tokens_per_task: number | null;
	reasoning_tokens_per_task: number | null;
};

export type ArtificialAnalysisEvaluationResourcePayload = {
	fetched_at_epoch_seconds: number | null;
	data: ArtificialAnalysisEvaluationResourceRow[];
};

export type ArtificialAnalysisEvaluationResourceByBenchmark = ReadonlyMap<
	string,
	ReadonlyMap<string, ArtificialAnalysisEvaluationResourceRow>
>;

export const ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES = [
	{
		benchmark_key: "aa_briefcase",
		score_path: ["briefcase", "elo"],
		cost_path: ["briefcaseCost"],
		token_counts_path: ["canonicalEvalTokenCounts", "briefcase"],
		seconds_per_task: "briefcase_estimate",
		row_detection_key: "briefcase",
		url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
		task_run_count: 91,
	},
	{
		benchmark_key: "apex_agents",
		url: "https://artificialanalysis.ai/evaluations/apex-agents-aa",
		task_run_count: 452,
	},
	{
		benchmark_key: "critpt",
		url: "https://artificialanalysis.ai/evaluations/critpt",
		task_run_count: 70,
	},
	{
		benchmark_key: "gdpval_normalized",
		url: "https://artificialanalysis.ai/evaluations/gdpval-aa",
		task_run_count: 220,
	},
	{
		benchmark_key: "hle",
		url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
		task_run_count: 2_158,
	},
	{
		benchmark_key: "tau_banking",
		url: "https://artificialanalysis.ai/evaluations/tau3-banking",
		task_run_count: 97,
	},
	{
		benchmark_key: "terminalbench_v21",
		score_key: "terminalbench_v2_1",
		url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
		task_run_count: 89 * 3,
	},
] as const satisfies readonly ArtificialAnalysisEvaluationResourcePage[];

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

function nestedValue(row: Record<string, unknown>, path: readonly string[]) {
	let value: unknown = row;
	for (const key of path) {
		value = asRecord(value)[key];
	}
	return value;
}

function perTask(value: number | null, taskCount: number): number | null {
	return value == null ? null : value / taskCount;
}

function tokenCount(
	tokenCounts: Record<string, unknown>,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = asFiniteNumber(tokenCounts[key]);
		if (value != null) {
			return value;
		}
	}
	return null;
}

function scoreValue(
	row: Record<string, unknown>,
	page: ArtificialAnalysisEvaluationResourcePage,
): number | null {
	return asFiniteNumber(
		page.score_path == null
			? row[page.score_key ?? page.benchmark_key]
			: nestedValue(row, page.score_path),
	);
}

function costRecord(
	row: Record<string, unknown>,
	page: ArtificialAnalysisEvaluationResourcePage,
): Record<string, unknown> {
	return asRecord(
		page.cost_path == null ? row.evalCost : nestedValue(row, page.cost_path),
	);
}

function tokenCountsRecord(
	row: Record<string, unknown>,
	page: ArtificialAnalysisEvaluationResourcePage,
): Record<string, unknown> {
	return asRecord(
		page.token_counts_path == null
			? row.tokenCounts
			: nestedValue(row, page.token_counts_path),
	);
}

function estimatedBriefcaseSecondsPerTask(
	row: Record<string, unknown>,
	outputTokensPerTask: number | null,
	page: ArtificialAnalysisEvaluationResourcePage,
): number | null {
	const outputSpeed = asFiniteNumber(
		asRecord(row.timescaleData).median_output_speed,
	);
	const toolMs = asFiniteNumber(nestedValue(row, ["briefcase", "totalToolMs"]));
	if (outputSpeed == null || outputTokensPerTask == null || toolMs == null) {
		return null;
	}
	return (
		outputTokensPerTask / outputSpeed + toolMs / 1000 / page.task_run_count
	);
}

function secondsPerTask(
	row: Record<string, unknown>,
	outputTokensPerTask: number | null,
	page: ArtificialAnalysisEvaluationResourcePage,
): number | null {
	return page.seconds_per_task === "briefcase_estimate"
		? estimatedBriefcaseSecondsPerTask(row, outputTokensPerTask, page)
		: asFiniteNumber(row.evalTimePerTask);
}

function extractArtificialAnalysisEvaluationRowsFromPageHtml(
	pageHtml: string,
	page: ArtificialAnalysisEvaluationResourcePage,
): Record<string, unknown>[] {
	const corpus = extractFlightCorpus(pageHtml);
	const rowsById = new Map<string, Record<string, unknown>>();
	const rowDetectionKey = page.row_detection_key ?? ROW_DETECTION_KEY;
	let cursor = 0;
	while (true) {
		const hitIndex = corpus.indexOf(`"${rowDetectionKey}":`, cursor);
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
			if (row == null || rowId == null || !(rowDetectionKey in row)) {
				continue;
			}
			rowsById.set(rowId, row);
			break;
		}
	}
	return [...rowsById.values()];
}

function artificialAnalysisEvaluationResourceRow(
	value: unknown,
	page: ArtificialAnalysisEvaluationResourcePage,
): ArtificialAnalysisEvaluationResourceRow | null {
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
	const cost = costRecord(row, page);
	const tokenCounts = tokenCountsRecord(row, page);
	const score = scoreValue(row, page);
	const costPerTask = perTask(asFiniteNumber(cost.total), page.task_run_count);
	const inputTokensPerTask = perTask(
		tokenCount(tokenCounts, ["inputTokens", "input"]),
		page.task_run_count,
	);
	const outputTokensPerTask = perTask(
		tokenCount(tokenCounts, ["outputTokens", "output"]),
		page.task_run_count,
	);
	const answerTokensPerTask = perTask(
		tokenCount(tokenCounts, ["answerTokens", "answer"]),
		page.task_run_count,
	);
	const reasoningTokensPerTask = perTask(
		tokenCount(tokenCounts, ["reasoningTokens", "reasoning"]),
		page.task_run_count,
	);
	const outputTokensPerTaskValue =
		outputTokensPerTask ??
		(answerTokensPerTask == null && reasoningTokensPerTask == null
			? null
			: (answerTokensPerTask ?? 0) + (reasoningTokensPerTask ?? 0));
	const tokensPerTask =
		inputTokensPerTask == null || outputTokensPerTaskValue == null
			? null
			: inputTokensPerTask + outputTokensPerTaskValue;
	const secondsPerTaskValue = secondsPerTask(
		row,
		outputTokensPerTaskValue,
		page,
	);
	if (
		modelSlug == null ||
		provider == null ||
		providerId == null ||
		model == null ||
		score == null ||
		costPerTask == null ||
		secondsPerTaskValue == null ||
		inputTokensPerTask == null ||
		outputTokensPerTaskValue == null ||
		tokensPerTask == null
	) {
		return null;
	}
	return {
		benchmark_key: page.benchmark_key,
		source_url: page.url,
		model_id: `${providerId}/${modelSlug}`,
		model,
		provider,
		provider_id: providerId,
		reasoning_effort: reasoningEffort,
		score,
		task_run_count: page.task_run_count,
		cost_per_task_usd: costPerTask,
		seconds_per_task: secondsPerTaskValue,
		tokens_per_task: tokensPerTask,
		input_tokens_per_task: inputTokensPerTask,
		output_tokens_per_task: outputTokensPerTaskValue,
		answer_tokens_per_task: answerTokensPerTask,
		reasoning_tokens_per_task: reasoningTokensPerTask,
	};
}

export function processArtificialAnalysisEvaluationResourceRows(
	rows: unknown[],
	page: ArtificialAnalysisEvaluationResourcePage,
): ArtificialAnalysisEvaluationResourceRow[] {
	return rows
		.map((row) => artificialAnalysisEvaluationResourceRow(row, page))
		.filter(
			(row): row is ArtificialAnalysisEvaluationResourceRow => row != null,
		)
		.sort((left, right) =>
			`${left.benchmark_key}/${left.model_id}`.localeCompare(
				`${right.benchmark_key}/${right.model_id}`,
			),
		);
}

function processArtificialAnalysisEvaluationResourcePageHtml(
	pageHtml: string,
	page: ArtificialAnalysisEvaluationResourcePage,
): ArtificialAnalysisEvaluationResourceRow[] {
	return processArtificialAnalysisEvaluationResourceRows(
		extractArtificialAnalysisEvaluationRowsFromPageHtml(pageHtml, page),
		page,
	);
}

function modelKeyCandidates(
	row: ArtificialAnalysisEvaluationResourceRow,
): string[] {
	return [row.model_id, row.model]
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

function familyModelKeyCandidates(
	row: ArtificialAnalysisEvaluationResourceRow,
): string[] {
	return modelKeyCandidates(row)
		.map(withoutReasoningEffortSuffix)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

function withoutReasoningEffortSuffix(key: string): string {
	let base = key;
	for (const suffix of REASONING_EFFORT_SUFFIXES) {
		if (base.endsWith(`-${suffix}`)) {
			base = base.slice(0, -suffix.length - 1);
			break;
		}
	}
	return base;
}

function reasoningEffortRank(
	row: ArtificialAnalysisEvaluationResourceRow,
): number {
	return row.reasoning_effort == null
		? 0
		: (REASONING_EFFORT_RANK[
				row.reasoning_effort as keyof typeof REASONING_EFFORT_RANK
			] ?? 0);
}

function higherEffortResourceRow(
	left: ArtificialAnalysisEvaluationResourceRow | undefined,
	right: ArtificialAnalysisEvaluationResourceRow,
): ArtificialAnalysisEvaluationResourceRow {
	if (left == null) {
		return right;
	}
	return reasoningEffortRank(right) > reasoningEffortRank(left) ? right : left;
}

export function buildArtificialAnalysisEvaluationResourceMap(
	rows: ArtificialAnalysisEvaluationResourceRow[],
): ArtificialAnalysisEvaluationResourceByBenchmark {
	const rowsByBenchmark = new Map<
		string,
		Map<string, ArtificialAnalysisEvaluationResourceRow>
	>();
	const bestRowsByBenchmarkAndFamily = new Map<
		string,
		Map<string, ArtificialAnalysisEvaluationResourceRow>
	>();
	for (const row of rows) {
		let rowsByModelName = rowsByBenchmark.get(row.benchmark_key);
		if (rowsByModelName == null) {
			rowsByModelName = new Map();
			rowsByBenchmark.set(row.benchmark_key, rowsByModelName);
		}
		for (const key of modelKeyCandidates(row)) {
			rowsByModelName.set(key, row);
		}
		let bestRowsByFamily = bestRowsByBenchmarkAndFamily.get(row.benchmark_key);
		if (bestRowsByFamily == null) {
			bestRowsByFamily = new Map();
			bestRowsByBenchmarkAndFamily.set(row.benchmark_key, bestRowsByFamily);
		}
		for (const key of familyModelKeyCandidates(row)) {
			bestRowsByFamily.set(
				key,
				higherEffortResourceRow(bestRowsByFamily.get(key), row),
			);
		}
	}
	for (const [benchmarkKey, bestRowsByFamily] of bestRowsByBenchmarkAndFamily) {
		const rowsByModelName = rowsByBenchmark.get(benchmarkKey);
		if (rowsByModelName == null) {
			continue;
		}
		for (const row of rows.filter(
			(item) => item.benchmark_key === benchmarkKey,
		)) {
			const bestFamilyRow = familyModelKeyCandidates(row).reduce<
				ArtificialAnalysisEvaluationResourceRow | undefined
			>(
				(bestRow, key) =>
					higherEffortResourceRow(bestRow, bestRowsByFamily.get(key) ?? row),
				undefined,
			);
			if (bestFamilyRow == null) {
				continue;
			}
			for (const key of modelKeyCandidates(row)) {
				rowsByModelName.set(key, bestFamilyRow);
			}
		}
		for (const [key, row] of bestRowsByFamily) {
			rowsByModelName.set(key, row);
		}
	}
	return rowsByBenchmark;
}

export function findArtificialAnalysisEvaluationResourceRow(
	benchmarkKey: string,
	candidateNames: unknown[],
	rowsByBenchmark: ArtificialAnalysisEvaluationResourceByBenchmark,
): ArtificialAnalysisEvaluationResourceRow | null {
	const rowsByModelName = rowsByBenchmark.get(benchmarkKey);
	if (rowsByModelName == null) {
		return null;
	}
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

async function getEvaluationResourceRows(
	page: ArtificialAnalysisEvaluationResourcePage,
	timeoutMs: number,
): Promise<ArtificialAnalysisEvaluationResourceRow[]> {
	const response = await fetchWithTimeout(page.url, {}, timeoutMs);
	if (!response.ok) {
		throw new Error(
			`Artificial Analysis evaluation resource scrape failed for ${page.benchmark_key}: ${response.status}`,
		);
	}
	return processArtificialAnalysisEvaluationResourcePageHtml(
		await response.text(),
		page,
	);
}

export async function getArtificialAnalysisEvaluationResourceStats(
	options: ArtificialAnalysisEvaluationResourceOptions = {},
): Promise<ArtificialAnalysisEvaluationResourcePayload> {
	const pages = options.pages ?? ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const results = await Promise.allSettled(
		pages.map((page) => getEvaluationResourceRows(page, timeoutMs)),
	);
	const data = results
		.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
		.sort((left, right) =>
			`${left.benchmark_key}/${left.model_id}`.localeCompare(
				`${right.benchmark_key}/${right.model_id}`,
			),
		);
	return {
		fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
		data,
	};
}
