/** OpenRouter scraper helpers for model stats. */
import { finiteNumbers } from "../../math-utils";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { isSameOpenRouterModelRoute } from "../llm-stats/model-aliases";
import { asRecord } from "../shared";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/frontend/models";
const OPENROUTER_BASE_URL = "https://openrouter.ai";
const OPENROUTER_THROUGHPUT_URL =
	"https://openrouter.ai/api/frontend/stats/throughput-comparison";
const OPENROUTER_LATENCY_URL =
	"https://openrouter.ai/api/frontend/stats/latency-comparison";
const OPENROUTER_E2E_LATENCY_URL =
	"https://openrouter.ai/api/frontend/stats/latency-e2e-comparison";
const OPENROUTER_EFFECTIVE_PRICING_URL =
	"https://openrouter.ai/api/frontend/stats/effective-pricing";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;

export type OpenRouterFrontendModel = {
	slug?: string | null;
	permaslug?: string | null;
};

export type OpenRouterStatsPoint = {
	x?: string;
	y?: Record<string, number | null>;
};

export type OpenRouterStatsResponse = {
	data?: OpenRouterStatsPoint[];
};

export type OpenRouterModelStats = {
	throughput?: OpenRouterStatsResponse | null;
	latency?: OpenRouterStatsResponse | null;
	latency_e2e?: OpenRouterStatsResponse | null;
};

export type OpenRouterEffectivePricingResponse = {
	data?: {
		weightedInputPrice?: number | null;
		weightedOutputPrice?: number | null;
	};
};

/**
 * Options for scraping OpenRouter performance stats for a selected model list.
 */
export type OpenRouterScraperOptions = {
	modelIds: string[];
	timeoutMs?: number;
	concurrency?: number;
	maxRetries?: number;
	retryBaseDelayMs?: number;
};

export type OpenRouterPerformanceSummary = {
	throughput_tokens_per_second_median: number | null;
	latency_seconds_median: number | null;
	e2e_latency_seconds_median: number | null;
};

export type OpenRouterPricingSummary = {
	weighted_input_price_per_1m: number | null;
	weighted_output_price_per_1m: number | null;
};

export type OpenRouterScrapedModel = {
	id: string;
	performance: OpenRouterPerformanceSummary;
	pricing: OpenRouterPricingSummary;
};

export type OpenRouterScrapedPayload = {
	fetched_at_epoch_seconds: number;
	models: OpenRouterScrapedModel[];
};

export type OpenRouterRawScrapedModel = {
	id: string;
	selected_permaslug: string | null;
	candidate_permaslugs: string[];
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse | null;
};

export type OpenRouterCandidateStats = {
	permaslug: string;
	weekly_tokens: number | null;
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse | null;
};

export type OpenRouterRawScrapedPayload = {
	fetched_at_epoch_seconds: number;
	directory: OpenRouterFrontendModel[];
	models: OpenRouterRawScrapedModel[];
};

export type OpenRouterSingleModelOptions = Omit<
	OpenRouterScraperOptions,
	"modelIds"
>;
/** Sleep for the requested number of milliseconds during OpenRouter scraper model stats. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/** Sanitize a model id for OpenRouter scraper model stats. */
function sanitizeModelId(modelId: string): string {
	return (
		modelId
			.trim()
			.toLowerCase()
			// Normalize OpenRouter route suffixes (e.g. :free, :exacto) to base model id.
			.replace(/:[a-z0-9._-]+$/i, "")
	);
}

/** Convert the input into a finite number for OpenRouter scraper model stats. */
function asFiniteNumber(value: unknown): number | null {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

/** Helper for median. */
function median(values: number[]): number | null {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[mid] ?? null;
	}
	const left = sorted[mid - 1];
	const right = sorted[mid];
	if (left == null || right == null) {
		return null;
	}
	return (left + right) / 2;
}

/** Helper for average. */
function average(values: number[]): number | null {
	if (values.length === 0) {
		return null;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Aggregate values into daily averages for OpenRouter scraper model stats. */
function toDailyAveragedValues(
	response: OpenRouterStatsResponse | null,
	scaleToSeconds: boolean,
): number[] {
	if (!response || !Array.isArray(response.data)) {
		return [];
	}
	return response.data
		.map((point) => {
			const y = asRecord(point.y);
			const values = finiteNumbers(Object.values(y));
			const dailyAverage = average(values);
			if (dailyAverage == null) {
				return null;
			}
			return scaleToSeconds ? dailyAverage / 1000 : dailyAverage;
		})
		.filter(
			(value): value is number => value != null && Number.isFinite(value),
		);
}

/** Summarize performance and pricing data for OpenRouter scraper model stats. */
function summarizePerformance(
	stats: OpenRouterModelStats,
): OpenRouterPerformanceSummary {
	const throughputValues = toDailyAveragedValues(
		stats.throughput ?? null,
		false,
	);
	const latencyValues = toDailyAveragedValues(stats.latency ?? null, true);
	const e2eLatencyValues = toDailyAveragedValues(
		stats.latency_e2e ?? null,
		true,
	);

	return {
		throughput_tokens_per_second_median: median(throughputValues),
		latency_seconds_median: median(latencyValues),
		e2e_latency_seconds_median: median(e2eLatencyValues),
	};
}

/** Summarize performance and pricing data for OpenRouter scraper model stats. */
function summarizePricing(
	response: OpenRouterEffectivePricingResponse | null,
): OpenRouterPricingSummary {
	const data = asRecord(response?.data);
	return {
		weighted_input_price_per_1m: asFiniteNumber(data.weightedInputPrice),
		weighted_output_price_per_1m: asFiniteNumber(data.weightedOutputPrice),
	};
}

function hasMeaningfulRawPerformance(stats: OpenRouterModelStats): boolean {
	return hasMeaningfulPerformance(summarizePerformance(stats));
}

function hasMeaningfulRawPricing(
	pricing: OpenRouterEffectivePricingResponse | null,
): boolean {
	return hasMeaningfulPricing(summarizePricing(pricing));
}

/** Create an empty scraped model record for OpenRouter scraper model stats. */
function emptyScrapedModel(modelId: string): OpenRouterScrapedModel {
	return {
		id: modelId,
		performance: summarizePerformance({}),
		pricing: summarizePricing(null),
	};
}

/** Create an empty raw scraped model record for OpenRouter scraper model stats. */
function emptyRawScrapedModel(
	modelId: string,
	candidatePermaslugs: string[] = [],
): OpenRouterRawScrapedModel {
	return {
		id: modelId,
		selected_permaslug: null,
		candidate_permaslugs: candidatePermaslugs,
		performance: {},
		pricing: null,
	};
}

/** Normalize raw OpenRouter performance and pricing responses for one model. */
export function processOpenRouterModelStats(
	modelId: string,
	stats: OpenRouterModelStats,
	pricing: OpenRouterEffectivePricingResponse | null,
): OpenRouterScrapedModel {
	return {
		id: modelId,
		performance: summarizePerformance(stats),
		pricing: summarizePricing(pricing),
	};
}

/** Fetch and cache OpenRouter scraper model stats data. */
async function fetchJsonWithRetry<T>(
	url: string,
	timeoutMs: number,
	maxRetries: number,
	retryBaseDelayMs: number,
): Promise<T> {
	let lastError: unknown = null;

	for (let attempt = 0; attempt < maxRetries; attempt += 1) {
		try {
			const response = await fetchWithTimeout(url, {}, timeoutMs);
			if (!response.ok) {
				const status = response.status;
				if ((status === 429 || status >= 500) && attempt < maxRetries - 1) {
					const backoffMs =
						retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
					await sleep(backoffMs);
					continue;
				}
				throw new Error(`OpenRouter request failed: ${status} (${url})`);
			}
			return (await response.json()) as T;
		} catch (error) {
			lastError = error;
			if (attempt < maxRetries - 1) {
				const backoffMs =
					retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
				await sleep(backoffMs);
			}
		}
	}

	throw lastError ?? new Error(`OpenRouter request failed: ${url}`);
}

/** Fetch text with retry for OpenRouter public pages. */
async function fetchTextWithRetry(
	url: string,
	timeoutMs: number,
	maxRetries: number,
	retryBaseDelayMs: number,
): Promise<string> {
	let lastError: unknown = null;

	for (let attempt = 0; attempt < maxRetries; attempt += 1) {
		try {
			const response = await fetchWithTimeout(url, {}, timeoutMs);
			if (!response.ok) {
				const status = response.status;
				if ((status === 429 || status >= 500) && attempt < maxRetries - 1) {
					const backoffMs =
						retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
					await sleep(backoffMs);
					continue;
				}
				throw new Error(`OpenRouter request failed: ${status} (${url})`);
			}
			return response.text();
		} catch (error) {
			lastError = error;
			if (attempt < maxRetries - 1) {
				const backoffMs =
					retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
				await sleep(backoffMs);
			}
		}
	}

	throw lastError ?? new Error(`OpenRouter request failed: ${url}`);
}

/** Map items with bounded concurrency. */
async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const safeConcurrency = Math.max(1, Math.floor(concurrency));
	const results = new Array<R>(items.length);
	let cursor = 0;

	/** Consume queued items until the shared cursor is exhausted. */
	async function worker(): Promise<void> {
		for (;;) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) {
				return;
			}
			results[index] = await mapper(items[index] as T, index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(safeConcurrency, items.length) }, () =>
			worker(),
		),
	);
	return results;
}

/** Build a permaslug lookup table for OpenRouter scraper model stats. */
function buildPermaslugLookup(
	models: OpenRouterFrontendModel[],
): Map<string, string> {
	const permaslugBySlug = new Map<string, string>();
	for (const model of models) {
		if (typeof model.slug !== "string" || typeof model.permaslug !== "string") {
			continue;
		}
		const slug = sanitizeModelId(model.slug);
		const permaslug = model.permaslug.trim();
		if (!slug || !permaslug) {
			continue;
		}
		permaslugBySlug.set(slug, permaslug);
	}
	return permaslugBySlug;
}

/** Return whether the current value is valid for OpenRouter scraper model stats. */
function hasMeaningfulPerformance(
	performance: OpenRouterPerformanceSummary,
): boolean {
	return (
		performance.throughput_tokens_per_second_median != null ||
		performance.latency_seconds_median != null ||
		performance.e2e_latency_seconds_median != null
	);
}

/** Return whether the current value is valid for OpenRouter scraper model stats. */
function hasMeaningfulPricing(pricing: OpenRouterPricingSummary): boolean {
	const weightedInput = pricing.weighted_input_price_per_1m;
	const weightedOutput = pricing.weighted_output_price_per_1m;
	const hasInput = weightedInput != null && weightedInput > 0;
	const hasOutput = weightedOutput != null && weightedOutput > 0;
	return hasInput || hasOutput;
}

/** Build same-version candidates for OpenRouter scraper model stats. */
export function buildOpenRouterSlugCandidates(
	modelId: string,
	availableSlugs: string[],
): string[] {
	const normalized = sanitizeModelId(modelId);
	const [provider, modelName = ""] = normalized.split("/", 2);
	if (!provider || !modelName) {
		return [normalized];
	}

	const versionCandidates = availableSlugs
		.filter(
			(slug) =>
				slug !== normalized && isSameOpenRouterModelRoute(normalized, slug),
		)
		.sort((left, right) => left.localeCompare(right))
		.slice(0, 8);

	return [normalized, ...versionCandidates];
}

/** Resolve permaslug candidates for OpenRouter scraper model stats. */
function resolvePermaslugCandidates(
	modelId: string,
	availableSlugs: string[],
	permaslugBySlug: Map<string, string>,
): string[] {
	const slugCandidates = buildOpenRouterSlugCandidates(modelId, availableSlugs);
	return slugCandidates
		.map((slugCandidate) => permaslugBySlug.get(slugCandidate) ?? null)
		.filter(
			(permaslug): permaslug is string =>
				typeof permaslug === "string" && permaslug.length > 0,
		);
}

/** Fetch performance stats for a permaslug in OpenRouter scraper model stats. */
async function fetchPerformanceForPermaslug(
	permaslug: string,
	timeoutMs: number,
	maxRetries: number,
	retryBaseDelayMs: number,
): Promise<{
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse;
}> {
	const query = new URLSearchParams({ permaslug });
	const [throughput, latency, latencyE2e, effectivePricing] = await Promise.all(
		[
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_THROUGHPUT_URL}?${query.toString()}`,
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_LATENCY_URL}?${query.toString()}`,
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_E2E_LATENCY_URL}?${query.toString()}`,
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
			fetchJsonWithRetry<OpenRouterEffectivePricingResponse>(
				`${OPENROUTER_EFFECTIVE_PRICING_URL}?${query.toString()}`,
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
		],
	);

	return {
		performance: {
			throughput,
			latency,
			latency_e2e: latencyE2e,
		},
		pricing: effectivePricing,
	};
}

export function parseOpenRouterWeeklyTokens(html: string): number | null {
	const marker = "weeklyTokensPromise";
	const markerStart = html.indexOf(marker);
	if (markerStart < 0) {
		return null;
	}
	const markerSlice = html.slice(
		markerStart + marker.length,
		markerStart + 100,
	);
	const promiseMatch = markerSlice.match(/\$@([^\\"]+)/);
	const promiseId = promiseMatch?.[1];
	const valueStart = html.indexOf(`${promiseId}:`);
	const valueMatch =
		promiseId && valueStart >= 0
			? html.slice(valueStart + promiseId.length + 1).match(/(\d+)/)
			: null;
	return asFiniteNumber(valueMatch?.[1]);
}

function performancePageUrl(permaslug: string): string {
	const path = permaslug.split("/").map(encodeURIComponent).join("/");
	return `${OPENROUTER_BASE_URL}/${path}/performance`;
}

async function fetchWeeklyTokensForPermaslug(
	permaslug: string,
	timeoutMs: number,
	maxRetries: number,
	retryBaseDelayMs: number,
): Promise<number | null> {
	try {
		return parseOpenRouterWeeklyTokens(
			await fetchTextWithRetry(
				performancePageUrl(permaslug),
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
		);
	} catch {
		return null;
	}
}

function compareCandidateUsage(
	left: OpenRouterCandidateStats,
	right: OpenRouterCandidateStats,
): number {
	return (right.weekly_tokens ?? -1) - (left.weekly_tokens ?? -1);
}

function bestCandidateByUsage(
	candidates: OpenRouterCandidateStats[],
	predicate: (candidate: OpenRouterCandidateStats) => boolean,
): OpenRouterCandidateStats | null {
	return candidates.filter(predicate).sort(compareCandidateUsage)[0] ?? null;
}

export function selectOpenRouterRawModelStats(
	modelId: string,
	candidates: OpenRouterCandidateStats[],
): OpenRouterRawScrapedModel {
	const performanceCandidate =
		bestCandidateByUsage(candidates, (candidate) =>
			hasMeaningfulRawPerformance(candidate.performance),
		) ??
		bestCandidateByUsage(candidates, (candidate) =>
			hasMeaningfulRawPricing(candidate.pricing),
		) ??
		candidates[0] ??
		null;
	const pricingCandidate = performanceCandidate
		? hasMeaningfulRawPricing(performanceCandidate.pricing)
			? performanceCandidate
			: bestCandidateByUsage(candidates, (candidate) =>
					hasMeaningfulRawPricing(candidate.pricing),
				)
		: null;

	return {
		id: modelId,
		selected_permaslug: performanceCandidate?.permaslug ?? null,
		candidate_permaslugs: candidates.map((candidate) => candidate.permaslug),
		performance: performanceCandidate?.performance ?? {},
		pricing: pricingCandidate?.pricing ?? null,
	};
}

/** Fetch raw performance and pricing responses for the best available OpenRouter permaslug. */
async function fetchBestAvailableRawModelStats(
	modelId: string,
	availableSlugs: string[],
	permaslugBySlug: Map<string, string>,
	timeoutMs: number,
	maxRetries: number,
	retryBaseDelayMs: number,
): Promise<OpenRouterRawScrapedModel> {
	const permaslugCandidates = resolvePermaslugCandidates(
		modelId,
		availableSlugs,
		permaslugBySlug,
	);

	if (permaslugCandidates.length === 0) {
		return emptyRawScrapedModel(modelId);
	}

	const resolvedCandidates: OpenRouterCandidateStats[] = [];
	for (const permaslug of permaslugCandidates) {
		try {
			const [stats, weeklyTokens] = await Promise.all([
				fetchPerformanceForPermaslug(
					permaslug,
					timeoutMs,
					maxRetries,
					retryBaseDelayMs,
				),
				fetchWeeklyTokensForPermaslug(
					permaslug,
					timeoutMs,
					maxRetries,
					retryBaseDelayMs,
				),
			]);
			resolvedCandidates.push({
				permaslug,
				weekly_tokens: weeklyTokens,
				performance: stats.performance,
				pricing: stats.pricing,
			});
		} catch {
			// Try the next permaslug candidate when one stats request fails.
		}
	}

	return resolvedCandidates.length > 0
		? selectOpenRouterRawModelStats(modelId, resolvedCandidates)
		: emptyRawScrapedModel(modelId, permaslugCandidates);
}

/**
 * Scrape OpenRouter raw stat responses for a finalized set of model IDs.
 *
 * The raw responses are still scoped to selected model IDs; this avoids full catalog stat scraping while preserving daily points and permaslug resolution.
 */
export async function getOpenRouterRawScrapedStats(
	options: OpenRouterScraperOptions,
): Promise<OpenRouterRawScrapedPayload> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const retryBaseDelayMs =
		options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
	const uniqueModelIds = Array.from(
		new Set(options.modelIds.map((modelId) => modelId.trim()).filter(Boolean)),
	);

	const modelDirectory = await fetchJsonWithRetry<{
		data?: OpenRouterFrontendModel[];
	}>(OPENROUTER_MODELS_URL, timeoutMs, maxRetries, retryBaseDelayMs);
	const directory = modelDirectory.data ?? [];
	const permaslugBySlug = buildPermaslugLookup(directory);
	const availableSlugs = [...permaslugBySlug.keys()];

	const models = await mapWithConcurrency(
		uniqueModelIds,
		concurrency,
		async (modelId) =>
			fetchBestAvailableRawModelStats(
				modelId,
				availableSlugs,
				permaslugBySlug,
				timeoutMs,
				maxRetries,
				retryBaseDelayMs,
			),
	);

	return {
		fetched_at_epoch_seconds: nowEpochSeconds(),
		directory,
		models,
	};
}

/**
 * Scrape OpenRouter performance stats for a finalized set of model IDs.
 *
 * This intentionally avoids full-catalog scraping and only fetches stats for `options.modelIds`.
 */
export async function getOpenRouterScrapedStats(
	options: OpenRouterScraperOptions,
): Promise<OpenRouterScrapedPayload> {
	const rawPayload = await getOpenRouterRawScrapedStats(options);
	const models = rawPayload.models.map((model) =>
		processOpenRouterModelStats(model.id, model.performance, model.pricing),
	);

	return {
		fetched_at_epoch_seconds: rawPayload.fetched_at_epoch_seconds,
		models,
	};
}

/**
 * Fetch OpenRouter performance stats for exactly one OpenRouter model ID.
 *
 * Example input:
 * - `openai/gpt-5.3-codex`
 * - `google/gemini-3.1-pro-preview`
 * - `meta-llama/llama-4-maverick:free` (free suffix is normalized)
 */
export async function getOpenRouterModelStats(
	modelId: string,
	options: OpenRouterSingleModelOptions = {},
): Promise<OpenRouterScrapedModel> {
	const scraperOptions: OpenRouterScraperOptions = {
		modelIds: [modelId],
		...(options.timeoutMs != null ? { timeoutMs: options.timeoutMs } : {}),
		...(options.concurrency != null
			? { concurrency: options.concurrency }
			: {}),
		...(options.maxRetries != null ? { maxRetries: options.maxRetries } : {}),
		...(options.retryBaseDelayMs != null
			? { retryBaseDelayMs: options.retryBaseDelayMs }
			: {}),
	};
	const payload = await getOpenRouterScrapedStats(scraperOptions);

	const firstModel = payload.models[0];
	if (!firstModel) {
		return emptyScrapedModel(modelId);
	}
	return firstModel;
}
