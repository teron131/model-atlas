/**
 * Artificial Analysis evaluation-page resource scraping for benchmark-level per-task telemetry.
 *
 * The Artificial Analysis leaderboard is the score table. Individual evaluation pages carry benchmark-specific cost, time, and token resources, so this scraper centralizes the hydrated-page parser while keeping page-specific task-count assumptions explicit.
 */

import { normalizeModelToken, reasoningEffortRank } from "../../shared";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	mapWithConcurrency,
	nowEpochSeconds,
} from "../../utils";
import {
	cleanArtificialAnalysisModelName,
	extractArtificialAnalysisFlightCorpus,
	findArtificialAnalysisFlightObjectEnd,
	parseArtificialAnalysisFlightObject,
	parseArtificialAnalysisReasoningEffort,
} from "./common";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REQUEST_JITTER_MS = 250;
const ROW_DETECTION_KEY = "evalTimePerTask";
const MODEL_SEARCH_BACKTRACK_CHARS = 70_000;
const REASONING_EFFORT_SUFFIXES = [
	"non-reasoning",
	"extra-high",
	"xhigh",
	"high",
	"medium",
	"low",
	"max",
] as const;

type JsonPath = readonly string[];

type OutputSpeedAndToolMsFallback = {
	kind: "output_speed_plus_tool_ms";
	output_speed_path: JsonPath;
	tool_ms_path: JsonPath;
};

type SecondsPerTaskPolicy =
	| {
			kind: "value";
			path: JsonPath;
	  }
	| {
			kind: "total_ms";
			paths: readonly JsonPath[];
			fallback?: OutputSpeedAndToolMsFallback;
	  };

const DEFAULT_SECONDS_PER_TASK_POLICY = {
	kind: "value",
	path: ["evalTimePerTask"],
} as const satisfies SecondsPerTaskPolicy;

const BRIEFCASE_SECONDS_PER_TASK_POLICY = {
	kind: "total_ms",
	paths: [
		["briefcase_breakdown", "telemetry", "total_generation_ms"],
		["briefcaseBreakdown", "telemetry", "total_generation_ms"],
	],
	fallback: {
		kind: "output_speed_plus_tool_ms",
		output_speed_path: ["timescaleData", "median_output_speed"],
		tool_ms_path: ["briefcase", "totalToolMs"],
	},
} as const satisfies SecondsPerTaskPolicy;

export type ArtificialAnalysisEvaluationResourcePage = {
	benchmark_key: string;
	score_key?: string;
	score_path?: JsonPath;
	cost_path?: JsonPath;
	token_counts_path?: JsonPath;
	seconds_policy?: SecondsPerTaskPolicy;
	row_detection_key?: string;
	url: string;
	task_run_count: number;
};

export type ArtificialAnalysisEvaluationResourceOptions = {
	pages?: readonly ArtificialAnalysisEvaluationResourcePage[];
	timeoutMs?: number;
	concurrency?: number;
	requestJitterMs?: number;
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
		benchmark_key: "apex_agents",
		url: "https://artificialanalysis.ai/evaluations/apex-agents-aa",
		task_run_count: 452,
	},
	{
		benchmark_key: "automation_bench",
		score_path: ["automation_bench_breakdown", "summary", "completion"],
		url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
		task_run_count: 657,
	},
	{
		benchmark_key: "briefcase",
		score_path: ["briefcase", "elo"],
		cost_path: ["briefcaseCost"],
		token_counts_path: ["canonicalEvalTokenCounts", "briefcase"],
		seconds_policy: BRIEFCASE_SECONDS_PER_TASK_POLICY,
		row_detection_key: "briefcase",
		url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
		task_run_count: 91,
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
		benchmark_key: "harvey_lab",
		score_path: ["harvey_lab_breakdown", "all_pass"],
		url: "https://artificialanalysis.ai/evaluations/harvey-lab-aa",
		task_run_count: 120,
	},
	{
		benchmark_key: "hle",
		url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
		task_run_count: 2_158,
	},
	{
		benchmark_key: "itbench_sre",
		score_key: "it_bench_sre",
		url: "https://artificialanalysis.ai/evaluations/itbench-aa",
		task_run_count: 59 * 3,
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

function firstNestedNumber(
	row: Record<string, unknown>,
	paths: readonly JsonPath[],
): number | null {
	for (const path of paths) {
		const value = asFiniteNumber(nestedValue(row, path));
		if (value != null) {
			return value;
		}
	}
	return null;
}

function fallbackSecondsPerTask(
	row: Record<string, unknown>,
	outputTokensPerTask: number | null,
	taskRunCount: number,
	fallback: OutputSpeedAndToolMsFallback | undefined,
): number | null {
	if (fallback == null) {
		return null;
	}
	const outputSpeed = asFiniteNumber(
		nestedValue(row, fallback.output_speed_path),
	);
	const toolMs = asFiniteNumber(nestedValue(row, fallback.tool_ms_path));
	if (outputSpeed == null || outputTokensPerTask == null || toolMs == null) {
		return null;
	}
	return outputTokensPerTask / outputSpeed + toolMs / 1000 / taskRunCount;
}

function secondsPerTask(
	row: Record<string, unknown>,
	outputTokensPerTask: number | null,
	page: ArtificialAnalysisEvaluationResourcePage,
): number | null {
	const policy = page.seconds_policy ?? DEFAULT_SECONDS_PER_TASK_POLICY;
	if (policy.kind === "value") {
		return asFiniteNumber(nestedValue(row, policy.path));
	}
	const msPerTask = perTask(
		firstNestedNumber(row, policy.paths),
		page.task_run_count,
	);
	return msPerTask == null
		? fallbackSecondsPerTask(
				row,
				outputTokensPerTask,
				page.task_run_count,
				policy.fallback,
			)
		: msPerTask / 1000;
}

function extractArtificialAnalysisEvaluationRowsFromPageHtml(
	pageHtml: string,
	page: ArtificialAnalysisEvaluationResourcePage,
): Record<string, unknown>[] {
	const flightCorpus = extractArtificialAnalysisFlightCorpus(pageHtml);
	const resourceRowsById = new Map<string, Record<string, unknown>>();
	const rowDetectionKey = page.row_detection_key ?? ROW_DETECTION_KEY;
	let cursor = 0;
	while (true) {
		const hitIndex = flightCorpus.indexOf(`"${rowDetectionKey}":`, cursor);
		if (hitIndex === -1) {
			break;
		}
		cursor = hitIndex + 1;
		const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
		for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
			if (flightCorpus[backIndex] !== "{") {
				continue;
			}
			const endIndex = findArtificialAnalysisFlightObjectEnd(
				flightCorpus,
				backIndex,
			);
			if (endIndex === -1 || endIndex < hitIndex) {
				continue;
			}
			const candidateRow = parseArtificialAnalysisFlightObject(
				flightCorpus.slice(backIndex, endIndex + 1),
			);
			const rowId =
				stringValue(candidateRow?.id) ?? stringValue(candidateRow?.slug);
			if (
				candidateRow == null ||
				rowId == null ||
				!(rowDetectionKey in candidateRow)
			) {
				continue;
			}
			resourceRowsById.set(rowId, candidateRow);
			break;
		}
	}
	return [...resourceRowsById.values()];
}

function artificialAnalysisEvaluationResourceRow(
	sourceRow: unknown,
	page: ArtificialAnalysisEvaluationResourcePage,
): ArtificialAnalysisEvaluationResourceRow | null {
	const row = asRecord(sourceRow);
	const modelSlug = stringValue(row.slug);
	const providerRecord = asRecord(row.model_creators);
	const provider =
		stringValue(providerRecord.name) ?? stringValue(row.modelCreatorName);
	const providerId = stringValue(providerRecord.slug) ?? providerSlug(provider);
	const sourceModelName =
		stringValue(row.short_name) ?? stringValue(row.shortName) ?? row.name;
	const model = cleanArtificialAnalysisModelName(sourceModelName) ?? modelSlug;
	const reasoningEffort =
		parseArtificialAnalysisReasoningEffort(sourceModelName) ??
		reasoningEffortFromModelSlug(modelSlug);
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
	const effectiveOutputTokensPerTask =
		outputTokensPerTask ??
		(answerTokensPerTask == null && reasoningTokensPerTask == null
			? null
			: (answerTokensPerTask ?? 0) + (reasoningTokensPerTask ?? 0));
	const tokensPerTask =
		inputTokensPerTask == null || effectiveOutputTokensPerTask == null
			? null
			: inputTokensPerTask + effectiveOutputTokensPerTask;
	const resolvedSecondsPerTask = secondsPerTask(
		row,
		effectiveOutputTokensPerTask,
		page,
	);
	if (
		modelSlug == null ||
		provider == null ||
		providerId == null ||
		model == null ||
		score == null ||
		costPerTask == null ||
		resolvedSecondsPerTask == null ||
		inputTokensPerTask == null ||
		effectiveOutputTokensPerTask == null ||
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
		seconds_per_task: resolvedSecondsPerTask,
		tokens_per_task: tokensPerTask,
		input_tokens_per_task: inputTokensPerTask,
		output_tokens_per_task: effectiveOutputTokensPerTask,
		answer_tokens_per_task: answerTokensPerTask,
		reasoning_tokens_per_task: reasoningTokensPerTask,
	};
}

function reasoningEffortFromModelSlug(modelSlug: string | null): string | null {
	if (modelSlug == null) {
		return null;
	}
	for (const suffix of REASONING_EFFORT_SUFFIXES) {
		if (modelSlug.endsWith(`-${suffix}`)) {
			if (suffix === "non-reasoning") {
				return "none";
			}
			return suffix === "extra-high" ? "xhigh" : suffix;
		}
	}
	return null;
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

function reasoningModelKeyCandidates(
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

function higherEffortResourceRow(
	left: ArtificialAnalysisEvaluationResourceRow | undefined,
	right: ArtificialAnalysisEvaluationResourceRow,
): ArtificialAnalysisEvaluationResourceRow {
	if (left == null) {
		return right;
	}
	return reasoningEffortRank(right.reasoning_effort) >
		reasoningEffortRank(left.reasoning_effort)
		? right
		: left;
}

/** Builds exact benchmark-resource lookups without collapsing effort observations. */
export function buildArtificialAnalysisObservationResourceMap(
	rows: ArtificialAnalysisEvaluationResourceRow[],
): ArtificialAnalysisEvaluationResourceByBenchmark {
	const rowsByBenchmark = new Map<
		string,
		Map<string, ArtificialAnalysisEvaluationResourceRow>
	>();
	for (const row of rows) {
		let rowsByModelKey = rowsByBenchmark.get(row.benchmark_key);
		if (rowsByModelKey == null) {
			rowsByModelKey = new Map();
			rowsByBenchmark.set(row.benchmark_key, rowsByModelKey);
		}
		for (const key of modelKeyCandidates(row)) {
			rowsByModelKey.set(key, row);
		}
	}
	return rowsByBenchmark;
}

/** Builds aggregate lookups whose aliases resolve to the default highest-effort observation. */
export function buildArtificialAnalysisDefaultEffortResourceMap(
	rows: ArtificialAnalysisEvaluationResourceRow[],
): ArtificialAnalysisEvaluationResourceByBenchmark {
	const rowsByBenchmark = new Map(
		[...buildArtificialAnalysisObservationResourceMap(rows)].map(
			([benchmarkKey, rowsByModel]) => [benchmarkKey, new Map(rowsByModel)],
		),
	);
	const defaultRowsByBenchmarkAndModelKey = new Map<
		string,
		Map<string, ArtificialAnalysisEvaluationResourceRow>
	>();
	for (const row of rows) {
		let defaultRowsByModelKey = defaultRowsByBenchmarkAndModelKey.get(
			row.benchmark_key,
		);
		if (defaultRowsByModelKey == null) {
			defaultRowsByModelKey = new Map();
			defaultRowsByBenchmarkAndModelKey.set(
				row.benchmark_key,
				defaultRowsByModelKey,
			);
		}
		for (const key of reasoningModelKeyCandidates(row)) {
			defaultRowsByModelKey.set(
				key,
				higherEffortResourceRow(defaultRowsByModelKey.get(key), row),
			);
		}
	}
	for (const row of rows) {
		const rowsByModelKey = rowsByBenchmark.get(row.benchmark_key);
		if (rowsByModelKey == null) {
			continue;
		}
		const defaultRowsByModelKey = defaultRowsByBenchmarkAndModelKey.get(
			row.benchmark_key,
		);
		const defaultModelRow = reasoningModelKeyCandidates(row).reduce<
			ArtificialAnalysisEvaluationResourceRow | undefined
		>(
			(defaultRow, key) =>
				higherEffortResourceRow(
					defaultRow,
					defaultRowsByModelKey?.get(key) ?? row,
				),
			undefined,
		);
		if (defaultModelRow == null) {
			continue;
		}
		for (const key of modelKeyCandidates(row)) {
			rowsByModelKey.set(key, defaultModelRow);
		}
	}
	for (const [
		benchmarkKey,
		defaultRowsByModelKey,
	] of defaultRowsByBenchmarkAndModelKey) {
		const rowsByModelKey = rowsByBenchmark.get(benchmarkKey);
		if (rowsByModelKey == null) {
			continue;
		}
		for (const [key, row] of defaultRowsByModelKey) {
			rowsByModelKey.set(key, row);
		}
	}
	return rowsByBenchmark;
}

export function findArtificialAnalysisEvaluationResourceRow(
	benchmarkKey: string,
	candidateNames: unknown[],
	rowsByBenchmark: ArtificialAnalysisEvaluationResourceByBenchmark,
): ArtificialAnalysisEvaluationResourceRow | null {
	const rowsByModelKey = rowsByBenchmark.get(benchmarkKey);
	if (rowsByModelKey == null) {
		return null;
	}
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = rowsByModelKey.get(normalizeModelToken(candidateName));
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

/** Random start jitter spreads same-origin page requests without changing row parsing semantics. */
async function waitForRequestJitter(maxDelayMs: number): Promise<void> {
	const safeMaxDelayMs = Math.max(0, Math.floor(maxDelayMs));
	if (safeMaxDelayMs === 0) {
		return;
	}
	await new Promise<void>((resolve) => {
		setTimeout(resolve, Math.floor(Math.random() * safeMaxDelayMs));
	});
}

export async function getArtificialAnalysisEvaluationResourceStats(
	options: ArtificialAnalysisEvaluationResourceOptions = {},
): Promise<ArtificialAnalysisEvaluationResourcePayload> {
	const pages = options.pages ?? ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const requestJitterMs = options.requestJitterMs ?? DEFAULT_REQUEST_JITTER_MS;
	const pageResults = await mapWithConcurrency(
		pages,
		concurrency,
		async (page) => {
			try {
				await waitForRequestJitter(requestJitterMs);
				return await getEvaluationResourceRows(page, timeoutMs);
			} catch {
				return [];
			}
		},
	);
	const resourceRows = pageResults
		.flat()
		.sort((left, right) =>
			`${left.benchmark_key}/${left.model_id}`.localeCompare(
				`${right.benchmark_key}/${right.model_id}`,
			),
		);
	return {
		fetched_at_epoch_seconds:
			resourceRows.length > 0 ? nowEpochSeconds() : null,
		data: resourceRows,
	};
}
