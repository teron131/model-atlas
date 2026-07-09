/**
 * Agents' Last Exam scraper owns the API/browser fallback and harness-row summary policy.
 *
 * Page source: https://agents-last-exam.org/leaderboard
 * JSON source: https://agents-last-exam.org/api/demo/leaderboard
 */
import { meanOfFinite, medianOfFinite } from "../math-utils";
import { asFiniteNumber, asRecord, normalizeModelToken } from "../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../utils";

const DEFAULT_LEADERBOARD_URL = "https://agents-last-exam.org/leaderboard";
const DEFAULT_API_URL = "https://agents-last-exam.org/api/demo/leaderboard";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SCORE_SPLIT = "full/overall";

export type AgentsLastExamScraperOptions = {
	url?: string;
	apiUrl?: string;
	timeoutMs?: number;
	usePlaywrightFallback?: boolean;
	scoreSplit?: string;
};

export type AgentsLastExamHarnessRow = {
	split: string;
	harness: string;
	model: string;
	harness_variant: string | null;
	runs: number;
	tasks: number;
	split_tasks: number;
	passes: number;
	accuracy: number;
	score: number;
	total_duration_seconds: number;
	total_input_tokens: number;
	total_output_tokens: number;
};

export type AgentsLastExamModelScoreRow = {
	model: string;
	split: string;
	median_score: number;
	mean_score: number;
	median_accuracy: number;
	mean_accuracy: number;
	median_total_duration_seconds: number;
	mean_total_duration_seconds: number;
	median_total_input_tokens: number;
	mean_total_input_tokens: number;
	median_total_output_tokens: number;
	mean_total_output_tokens: number;
	median_duration_seconds_per_run: number;
	mean_duration_seconds_per_run: number;
	median_input_tokens_per_run: number;
	mean_input_tokens_per_run: number;
	median_output_tokens_per_run: number;
	mean_output_tokens_per_run: number;
	frequency: number;
};

export type AgentsLastExamScoreByModelName = Map<
	string,
	AgentsLastExamModelScoreRow
>;

export type AgentsLastExamHarnessPayload = {
	fetched_at_epoch_seconds: number | null;
	data: AgentsLastExamHarnessRow[];
};

export type AgentsLastExamModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: AgentsLastExamModelScoreRow[];
};

/** API rows are narrowed to the stable source shape before summary and harness joins run. */
function asAgentsLastExamHarnessRow(
	value: unknown,
): AgentsLastExamHarnessRow | null {
	const row = asRecord(value);
	const split = typeof row.split === "string" ? row.split : null;
	const harness = typeof row.harness === "string" ? row.harness : null;
	const model = typeof row.model === "string" ? row.model : null;
	const runs = asFiniteNumber(row.runs);
	const tasks = asFiniteNumber(row.tasks);
	const splitTasks = asFiniteNumber(row.splitTasks);
	const passes = asFiniteNumber(row.passes);
	const accuracy = asFiniteNumber(row.passRate);
	const score = asFiniteNumber(row.avgScore);
	const totalDurationSeconds = asFiniteNumber(row.totalDurationS);
	const totalInputTokens = asFiniteNumber(row.totalInputTokens);
	const totalOutputTokens = asFiniteNumber(row.totalOutputTokens);
	if (
		split == null ||
		harness == null ||
		model == null ||
		runs == null ||
		tasks == null ||
		splitTasks == null ||
		passes == null ||
		accuracy == null ||
		score == null ||
		totalDurationSeconds == null ||
		totalInputTokens == null ||
		totalOutputTokens == null
	) {
		return null;
	}
	return {
		split,
		harness,
		model,
		harness_variant:
			typeof row.harnessVariant === "string" && row.harnessVariant.length > 0
				? row.harnessVariant
				: null,
		runs,
		tasks,
		split_tasks: splitTasks,
		passes,
		accuracy,
		score,
		total_duration_seconds: totalDurationSeconds,
		total_input_tokens: totalInputTokens,
		total_output_tokens: totalOutputTokens,
	};
}

export function processAgentsLastExamLeaderboardRows(
	rows: unknown[],
): AgentsLastExamHarnessRow[] {
	return rows
		.map((row) => asAgentsLastExamHarnessRow(row))
		.filter((row): row is AgentsLastExamHarnessRow => row != null);
}

export function agentsLastExamBenchmarkScore(
	row: AgentsLastExamModelScoreRow,
): number {
	return Math.max(row.median_score, row.mean_score);
}

function perRun(value: number, row: AgentsLastExamHarnessRow): number | null {
	return row.runs > 0 ? value / row.runs : null;
}

/** Group harness/model rows into model-level score rows for one leaderboard split. */
export function summarizeAgentsLastExamModelScores(
	rows: AgentsLastExamHarnessRow[],
	scoreSplit = DEFAULT_SCORE_SPLIT,
): AgentsLastExamModelScoreRow[] {
	const rowsByModel = new Map<string, AgentsLastExamHarnessRow[]>();
	for (const row of rows) {
		if (row.split !== scoreSplit) {
			continue;
		}
		const modelRows = rowsByModel.get(row.model) ?? [];
		modelRows.push(row);
		rowsByModel.set(row.model, modelRows);
	}
	return [...rowsByModel.entries()]
		.map(([model, modelRows]) => {
			const scores = modelRows.map((row) => row.score);
			const accuracies = modelRows.map((row) => row.accuracy);
			const durationSeconds = modelRows.map(
				(row) => row.total_duration_seconds,
			);
			const inputTokens = modelRows.map((row) => row.total_input_tokens);
			const outputTokens = modelRows.map((row) => row.total_output_tokens);
			const durationSecondsPerRun = modelRows.map((row) =>
				perRun(row.total_duration_seconds, row),
			);
			const inputTokensPerRun = modelRows.map((row) =>
				perRun(row.total_input_tokens, row),
			);
			const outputTokensPerRun = modelRows.map((row) =>
				perRun(row.total_output_tokens, row),
			);
			return {
				model,
				split: scoreSplit,
				median_score: medianOfFinite(scores),
				mean_score: meanOfFinite(scores),
				median_accuracy: medianOfFinite(accuracies),
				mean_accuracy: meanOfFinite(accuracies),
				median_total_duration_seconds: medianOfFinite(durationSeconds),
				mean_total_duration_seconds: meanOfFinite(durationSeconds),
				median_total_input_tokens: medianOfFinite(inputTokens),
				mean_total_input_tokens: meanOfFinite(inputTokens),
				median_total_output_tokens: medianOfFinite(outputTokens),
				mean_total_output_tokens: meanOfFinite(outputTokens),
				median_duration_seconds_per_run: medianOfFinite(durationSecondsPerRun),
				mean_duration_seconds_per_run: meanOfFinite(durationSecondsPerRun),
				median_input_tokens_per_run: medianOfFinite(inputTokensPerRun),
				mean_input_tokens_per_run: meanOfFinite(inputTokensPerRun),
				median_output_tokens_per_run: medianOfFinite(outputTokensPerRun),
				mean_output_tokens_per_run: meanOfFinite(outputTokensPerRun),
				frequency: modelRows.length,
			};
		})
		.filter(
			(row): row is AgentsLastExamModelScoreRow =>
				row.median_score != null &&
				row.mean_score != null &&
				row.median_accuracy != null &&
				row.mean_accuracy != null &&
				row.median_total_duration_seconds != null &&
				row.mean_total_duration_seconds != null &&
				row.median_total_input_tokens != null &&
				row.mean_total_input_tokens != null &&
				row.median_total_output_tokens != null &&
				row.mean_total_output_tokens != null &&
				row.median_duration_seconds_per_run != null &&
				row.mean_duration_seconds_per_run != null &&
				row.median_input_tokens_per_run != null &&
				row.mean_input_tokens_per_run != null &&
				row.median_output_tokens_per_run != null &&
				row.mean_output_tokens_per_run != null,
		)
		.sort(
			(left, right) =>
				agentsLastExamBenchmarkScore(right) -
				agentsLastExamBenchmarkScore(left),
		);
}

export function buildAgentsLastExamMap(
	rows: AgentsLastExamModelScoreRow[],
): AgentsLastExamScoreByModelName {
	const scoreByModelName: AgentsLastExamScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length === 0) {
			continue;
		}
		const existing = scoreByModelName.get(key);
		if (
			!existing ||
			row.frequency > existing.frequency ||
			(row.frequency === existing.frequency &&
				agentsLastExamBenchmarkScore(row) >
					agentsLastExamBenchmarkScore(existing))
		) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

export function findAgentsLastExamModelScore(
	candidateNames: unknown[],
	scoreByModelName: AgentsLastExamScoreByModelName,
): AgentsLastExamModelScoreRow | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const normalizedCandidate = normalizeModelToken(candidateName);
		const row =
			scoreByModelName.get(normalizedCandidate) ??
			scoreByModelName.get(normalizedCandidate.replace(/\//g, "-"));
		if (row) {
			return row;
		}
	}
	return null;
}

async function fetchApiRows(
	apiUrl: string,
	timeoutMs: number,
): Promise<AgentsLastExamHarnessRow[]> {
	const response = await fetchWithTimeout(apiUrl, {}, timeoutMs);
	if (!response.ok) {
		throw new Error(`Agents' Last Exam scrape failed: ${response.status}`);
	}
	const payload = asRecord(await response.json());
	return Array.isArray(payload.rows)
		? processAgentsLastExamLeaderboardRows(payload.rows)
		: [];
}

/** Browser fallback keeps the source usable when the direct JSON endpoint blocks plain fetches. */
async function fetchPlaywrightRows(
	url: string,
	apiUrl: string,
	timeoutMs: number,
): Promise<AgentsLastExamHarnessRow[]> {
	const { chromium } = await import("playwright");
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const responsePromise = page.waitForResponse(
			(response) => response.url() === apiUrl && response.ok(),
			{ timeout: timeoutMs },
		);
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
		const response = await responsePromise;
		const payload = asRecord(await response.json());
		return Array.isArray(payload.rows)
			? processAgentsLastExamLeaderboardRows(payload.rows)
			: [];
	} finally {
		await browser.close();
	}
}

export async function getAgentsLastExamHarnessStats(
	options: AgentsLastExamScraperOptions = {},
): Promise<AgentsLastExamHarnessPayload> {
	const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
	const url = options.url ?? DEFAULT_LEADERBOARD_URL;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	try {
		const rows = await fetchApiRows(apiUrl, timeoutMs);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: rows,
		};
	} catch {
		if (options.usePlaywrightFallback === false) {
			return {
				fetched_at_epoch_seconds: null,
				data: [],
			};
		}
		try {
			return {
				fetched_at_epoch_seconds: nowEpochSeconds(),
				data: await fetchPlaywrightRows(url, apiUrl, timeoutMs),
			};
		} catch {
			return {
				fetched_at_epoch_seconds: null,
				data: [],
			};
		}
	}
}

export async function getAgentsLastExamStats(
	options: AgentsLastExamScraperOptions = {},
): Promise<AgentsLastExamModelScorePayload> {
	const payload = await getAgentsLastExamHarnessStats(options);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: summarizeAgentsLastExamModelScores(
			payload.data,
			options.scoreSplit ?? DEFAULT_SCORE_SPLIT,
		),
	};
}
