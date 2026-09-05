/**
 * Model performance, effective pricing, and weekly usage from OpenRouter.
 *
 * Catalog source: https://openrouter.ai/api/frontend/v1/catalog/models
 * Endpoint stats source: https://openrouter.ai/api/frontend/v1/stats/endpoint
 * Throughput source: https://openrouter.ai/api/frontend/v1/stats/throughput-comparison
 * Latency source: https://openrouter.ai/api/frontend/v1/stats/latency-comparison
 * End-to-end latency source: https://openrouter.ai/api/frontend/v1/stats/latency-e2e-comparison
 * Effective pricing source: https://openrouter.ai/api/frontend/v1/stats/effective-pricing
 * Usage page source: https://openrouter.ai/{provider}/{model}/performance
 */

import { setTimeout as sleep } from "node:timers/promises";

import { mapWithConcurrency, nowEpochSeconds } from "../../runtime";
import { fetchSource, scheduleSourcePage, SourceQueueTimeoutError } from "../request-scheduler";
import {
  buildOpenRouterSeriesTokenWeights,
  emptyRawScrapedModel,
  parseOpenRouterWeeklyTokens,
  resolvePermaslugCandidates,
  sanitizeModelId,
  selectOpenRouterRawModelStats,
  summarizeEndpointPerformance,
} from "./stats";
import type {
  OpenRouterCandidateStats,
  OpenRouterEffectivePricingResponse,
  OpenRouterEndpointStatsResponse,
  OpenRouterFrontendModel,
  OpenRouterSeriesResponse,
  OpenRouterSourceModel,
  OpenRouterSourcePayload,
} from "./types";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/frontend/v1/catalog/models";

const BASE_URL = "https://openrouter.ai";

const ENDPOINT_URL = "https://openrouter.ai/api/frontend/v1/stats/endpoint";

const THROUGHPUT_URL = "https://openrouter.ai/api/frontend/v1/stats/throughput-comparison";

const LATENCY_URL = "https://openrouter.ai/api/frontend/v1/stats/latency-comparison";

const E2E_LATENCY_URL = "https://openrouter.ai/api/frontend/v1/stats/latency-e2e-comparison";

const EFFECTIVE_PRICING_URL = "https://openrouter.ai/api/frontend/v1/stats/effective-pricing";

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_CONCURRENCY = 8;

const DEFAULT_MAX_RETRIES = 3;

const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;

type ScraperOptions = {
  modelIds: string[];
  modelDirectory?: readonly OpenRouterFrontendModel[];
  timeoutMs?: number;
  concurrency?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

type RequestContext = {
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  responses: Map<string, Promise<unknown>>;
};

/**
 * Scrape OpenRouter raw stat responses for a finalized set of model IDs.
 *
 * The raw responses are still scoped to selected model IDs; this avoids full catalog stat scraping while preserving daily points and permaslug resolution. Aliases share route groups and successful endpoint responses only within this call, so a failed candidate retries only its missing endpoints.
 */
export async function getOpenRouterRawScrapedStats(
  options: ScraperOptions,
): Promise<OpenRouterSourcePayload> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const context: RequestContext = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    responses: new Map(),
  };
  const uniqueModelIds = Array.from(
    new Set(options.modelIds.map((modelId) => modelId.trim()).filter(Boolean)),
  );

  const directory =
    options.modelDirectory == null
      ? ((
          await fetchJson<{
            data?: OpenRouterFrontendModel[];
          }>(OPENROUTER_MODELS_URL, context)
        ).data ?? [])
      : [...options.modelDirectory];
  const permaslugBySlug = buildPermaslugLookup(directory);
  const availableSlugs = [...permaslugBySlug.keys()];
  const candidateRequests = new Map<string, Promise<OpenRouterCandidateStats>>();

  // Aliases can resolve to the same route; share its six requests for this scrape and allow failed candidates to retry.
  const fetchCandidate = (permaslug: string): Promise<OpenRouterCandidateStats> => {
    const existing = candidateRequests.get(permaslug);
    if (existing) return existing;
    const request = fetchCandidateStats(permaslug, context).catch((error) => {
      candidateRequests.delete(permaslug);
      throw error;
    });
    candidateRequests.set(permaslug, request);
    return request;
  };

  const models = await mapWithConcurrency(uniqueModelIds, concurrency, async (modelId) =>
    fetchBestModelStats(modelId, availableSlugs, permaslugBySlug, fetchCandidate),
  );

  return {
    fetched_at_epoch_seconds: nowEpochSeconds(),
    directory,
    models,
  };
}

function fetchJson<T>(url: string, context: RequestContext): Promise<T> {
  return fetchResponse(url, context, async (response) => (await response.json()) as T);
}

function buildPermaslugLookup(models: OpenRouterFrontendModel[]): Map<string, string> {
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

/** Fetch a model page's independent endpoints together while each endpoint retains its own retry and timeout policy. */
async function fetchCandidateStats(
  permaslug: string,
  context: RequestContext,
): Promise<OpenRouterCandidateStats> {
  const query = new URLSearchParams({ permaslug });
  const standardQuery = new URLSearchParams({
    permaslug,
    variant: "standard",
  });
  const [endpointStats, throughput, latency, latencyE2e, effectivePricing, weeklyTokens] =
    await scheduleSourcePage(BASE_URL, [
      () =>
        fetchJson<OpenRouterEndpointStatsResponse>(
          `${ENDPOINT_URL}?${standardQuery.toString()}`,
          context,
        ),
      () => fetchJson<OpenRouterSeriesResponse>(`${THROUGHPUT_URL}?${query.toString()}`, context),
      () => fetchJson<OpenRouterSeriesResponse>(`${LATENCY_URL}?${query.toString()}`, context),
      () => fetchJson<OpenRouterSeriesResponse>(`${E2E_LATENCY_URL}?${query.toString()}`, context),
      () =>
        fetchJson<OpenRouterEffectivePricingResponse>(
          `${EFFECTIVE_PRICING_URL}?${standardQuery.toString()}`,
          context,
        ),
      () => fetchWeeklyTokens(permaslug, context),
    ]);

  return {
    permaslug,
    weekly_tokens: weeklyTokens,
    performance: {
      summary: summarizeEndpointPerformance(endpointStats),
      throughput,
      latency,
      latency_e2e: latencyE2e,
      series_token_weights: buildOpenRouterSeriesTokenWeights(effectivePricing),
    },
    pricing: effectivePricing,
  };
}

async function fetchBestModelStats(
  modelId: string,
  availableSlugs: string[],
  permaslugBySlug: Map<string, string>,
  fetchCandidate: (permaslug: string) => Promise<OpenRouterCandidateStats>,
): Promise<OpenRouterSourceModel> {
  const permaslugCandidates = resolvePermaslugCandidates(modelId, availableSlugs, permaslugBySlug);

  if (permaslugCandidates.length === 0) {
    return emptyRawScrapedModel(modelId);
  }

  const resolvedCandidates: OpenRouterCandidateStats[] = [];
  for (const permaslug of permaslugCandidates) {
    try {
      resolvedCandidates.push(await fetchCandidate(permaslug));
    } catch {
      // Try the next permaslug candidate when one stats request fails.
    }
  }

  return resolvedCandidates.length > 0
    ? selectOpenRouterRawModelStats(modelId, resolvedCandidates)
    : emptyRawScrapedModel(modelId, permaslugCandidates);
}

/** Cache decoded responses after the full retry lifecycle so aliases retain successful siblings but can retry failed endpoints. */
function fetchResponse<T>(
  url: string,
  context: RequestContext,
  readResponse: (response: Response) => Promise<T>,
): Promise<T> {
  // Each endpoint URL has one decoder in this workflow; the heterogeneous cache remains private to one scrape.
  const existing = context.responses.get(url) as Promise<T> | undefined;
  if (existing) return existing;
  const request = requestWithRetries(url, context, readResponse).catch((error) => {
    context.responses.delete(url);
    throw error;
  });
  context.responses.set(url, request);
  return request;
}

async function fetchWeeklyTokens(
  permaslug: string,
  context: RequestContext,
): Promise<number | null> {
  try {
    const path = permaslug.split("/").map(encodeURIComponent).join("/");
    return await fetchResponse(`${BASE_URL}/${path}/performance`, context, async (response) =>
      parseOpenRouterWeeklyTokens(await response.text()),
    );
  } catch {
    return null;
  }
}

/** Retry transient failures for one endpoint; the shared scheduler enforces host cooldowns before each attempt. */
async function requestWithRetries<T>(
  url: string,
  context: RequestContext,
  readResponse: (response: Response) => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < context.maxRetries; attempt += 1) {
    let retryable = true;
    try {
      return await fetchSource(url, {}, context.timeoutMs, async (response) => {
        if (!response.ok) {
          const status = response.status;
          retryable = status === 408 || status === 429 || status >= 500;
          throw new Error(`OpenRouter request failed: ${status} (${url})`);
        }
        return readResponse(response);
      });
    } catch (error) {
      lastError = error;
      if (!retryable || error instanceof SourceQueueTimeoutError) throw error;
      if (attempt < context.maxRetries - 1) {
        await sleep(retryBackoffMs(context, attempt));
      }
    }
  }

  throw lastError ?? new Error(`OpenRouter request failed: ${url}`);
}

function retryBackoffMs(context: RequestContext, attempt: number): number {
  return context.retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
}
