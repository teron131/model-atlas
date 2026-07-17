/**
 * OpenRouter scraper workflow for scoped model performance and pricing stats.
 *
 * Catalog source: https://openrouter.ai/api/frontend/v1/catalog/models
 * Endpoint stats source: https://openrouter.ai/api/frontend/v1/stats/endpoint
 * Throughput source: https://openrouter.ai/api/frontend/v1/stats/throughput-comparison
 * Latency source: https://openrouter.ai/api/frontend/v1/stats/latency-comparison
 * End-to-end latency source: https://openrouter.ai/api/frontend/v1/stats/latency-e2e-comparison
 * Effective pricing source: https://openrouter.ai/api/frontend/v1/stats/effective-pricing
 */

import {
	fetchWithTimeout,
	mapWithConcurrency,
	nowEpochSeconds,
} from "../../utils";
import {
	buildOpenRouterSeriesTokenWeights,
	emptyRawScrapedModel,
	emptyScrapedModel,
	type OpenRouterCandidateStats,
	type OpenRouterEffectivePricingResponse,
	type OpenRouterEndpointStatsResponse,
	type OpenRouterFrontendModel,
	type OpenRouterModelStats,
	type OpenRouterRawScrapedModel,
	type OpenRouterRawScrapedPayload,
	type OpenRouterScrapedModel,
	type OpenRouterScrapedPayload,
	type OpenRouterStatsResponse,
	parseOpenRouterWeeklyTokens,
	processOpenRouterModelStats,
	resolvePermaslugCandidates,
	sanitizeModelId,
	selectOpenRouterRawModelStats,
	summarizeEndpointPerformance,
} from "./stats";

export const OPENROUTER_MODELS_URL =
	"https://openrouter.ai/api/frontend/v1/catalog/models";
const OPENROUTER_BASE_URL = "https://openrouter.ai";
const OPENROUTER_ENDPOINT_URL =
	"https://openrouter.ai/api/frontend/v1/stats/endpoint";
const OPENROUTER_THROUGHPUT_URL =
	"https://openrouter.ai/api/frontend/v1/stats/throughput-comparison";
const OPENROUTER_LATENCY_URL =
	"https://openrouter.ai/api/frontend/v1/stats/latency-comparison";
const OPENROUTER_E2E_LATENCY_URL =
	"https://openrouter.ai/api/frontend/v1/stats/latency-e2e-comparison";
const OPENROUTER_EFFECTIVE_PRICING_URL =
	"https://openrouter.ai/api/frontend/v1/stats/effective-pricing";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;

export type OpenRouterScraperOptions = {
	modelIds: string[];
	modelDirectory?: readonly OpenRouterFrontendModel[];
	timeoutMs?: number;
	concurrency?: number;
	maxRetries?: number;
	retryBaseDelayMs?: number;
};

export type OpenRouterSingleModelOptions = Omit<
	OpenRouterScraperOptions,
	"modelIds"
>;

type OpenRouterRequestOptions = {
	timeoutMs: number;
	maxRetries: number;
	retryBaseDelayMs: number;
};

/** Sleep for the requested number of milliseconds between OpenRouter retries. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function retryBackoffMs(
	requestOptions: OpenRouterRequestOptions,
	attempt: number,
): number {
	return (
		requestOptions.retryBaseDelayMs * 2 ** attempt +
		Math.floor(Math.random() * 100)
	);
}

async function fetchOpenRouterWithRetry<T>(
	url: string,
	requestOptions: OpenRouterRequestOptions,
	readResponse: (response: Response) => Promise<T>,
): Promise<T> {
	let lastError: unknown = null;

	for (let attempt = 0; attempt < requestOptions.maxRetries; attempt += 1) {
		try {
			const response = await fetchWithTimeout(
				url,
				{},
				requestOptions.timeoutMs,
			);
			if (!response.ok) {
				const status = response.status;
				if (
					(status === 429 || status >= 500) &&
					attempt < requestOptions.maxRetries - 1
				) {
					await sleep(retryBackoffMs(requestOptions, attempt));
					continue;
				}
				throw new Error(`OpenRouter request failed: ${status} (${url})`);
			}
			return await readResponse(response);
		} catch (error) {
			lastError = error;
			if (attempt < requestOptions.maxRetries - 1) {
				await sleep(retryBackoffMs(requestOptions, attempt));
			}
		}
	}

	throw lastError ?? new Error(`OpenRouter request failed: ${url}`);
}

async function fetchJsonWithRetry<T>(
	url: string,
	requestOptions: OpenRouterRequestOptions,
): Promise<T> {
	return fetchOpenRouterWithRetry(
		url,
		requestOptions,
		async (response) => (await response.json()) as T,
	);
}

async function fetchTextWithRetry(
	url: string,
	requestOptions: OpenRouterRequestOptions,
): Promise<string> {
	return fetchOpenRouterWithRetry(url, requestOptions, (response) =>
		response.text(),
	);
}

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

async function fetchPerformanceForPermaslug(
	permaslug: string,
	requestOptions: OpenRouterRequestOptions,
): Promise<{
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse;
}> {
	const query = new URLSearchParams({ permaslug });
	const endpointQuery = new URLSearchParams({
		permaslug,
		variant: "standard",
	});
	const pricingQuery = new URLSearchParams({
		permaslug,
		variant: "standard",
	});
	const [endpointStats, throughput, latency, latencyE2e, effectivePricing] =
		await Promise.all([
			fetchJsonWithRetry<OpenRouterEndpointStatsResponse>(
				`${OPENROUTER_ENDPOINT_URL}?${endpointQuery.toString()}`,
				requestOptions,
			),
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_THROUGHPUT_URL}?${query.toString()}`,
				requestOptions,
			),
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_LATENCY_URL}?${query.toString()}`,
				requestOptions,
			),
			fetchJsonWithRetry<OpenRouterStatsResponse>(
				`${OPENROUTER_E2E_LATENCY_URL}?${query.toString()}`,
				requestOptions,
			),
			fetchJsonWithRetry<OpenRouterEffectivePricingResponse>(
				`${OPENROUTER_EFFECTIVE_PRICING_URL}?${pricingQuery.toString()}`,
				requestOptions,
			),
		]);

	return {
		performance: {
			summary: summarizeEndpointPerformance(endpointStats),
			throughput,
			latency,
			latency_e2e: latencyE2e,
			series_token_weights: buildOpenRouterSeriesTokenWeights(
				endpointStats,
				effectivePricing,
			),
		},
		pricing: effectivePricing,
	};
}

function performancePageUrl(permaslug: string): string {
	const path = permaslug.split("/").map(encodeURIComponent).join("/");
	return `${OPENROUTER_BASE_URL}/${path}/performance`;
}

async function fetchWeeklyTokensForPermaslug(
	permaslug: string,
	requestOptions: OpenRouterRequestOptions,
): Promise<number | null> {
	try {
		return parseOpenRouterWeeklyTokens(
			await fetchTextWithRetry(performancePageUrl(permaslug), requestOptions),
		);
	} catch {
		return null;
	}
}

async function fetchBestAvailableRawModelStats(
	modelId: string,
	availableSlugs: string[],
	permaslugBySlug: Map<string, string>,
	requestOptions: OpenRouterRequestOptions,
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
				fetchPerformanceForPermaslug(permaslug, requestOptions),
				fetchWeeklyTokensForPermaslug(permaslug, requestOptions),
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
	const requestOptions = {
		timeoutMs,
		maxRetries,
		retryBaseDelayMs,
	};
	const uniqueModelIds = Array.from(
		new Set(options.modelIds.map((modelId) => modelId.trim()).filter(Boolean)),
	);

	const directory =
		options.modelDirectory == null
			? ((
					await fetchJsonWithRetry<{
						data?: OpenRouterFrontendModel[];
					}>(OPENROUTER_MODELS_URL, requestOptions)
				).data ?? [])
			: [...options.modelDirectory];
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
				requestOptions,
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
