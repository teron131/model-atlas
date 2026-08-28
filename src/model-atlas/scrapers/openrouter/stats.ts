/** Pure OpenRouter stat normalization, same-version permaslug resolution, and best-candidate selection policy. */

import { isSameOpenRouterModelRoute } from "../../identity/openrouter";
import { meanOfFinite } from "../../numeric";
import { asFiniteNumber, asRecord } from "../../runtime";

export type OpenRouterFrontendModel = {
  slug?: string | null;
  permaslug?: string | null;
};

type OpenRouterStatsPoint = {
  x?: string;
  y?: Record<string, number | null>;
};

export type OpenRouterStatsResponse = {
  data?: OpenRouterStatsPoint[];
};

export type OpenRouterModelStats = {
  summary?: OpenRouterPerformanceSummary | null;
  throughput?: OpenRouterStatsResponse | null;
  latency?: OpenRouterStatsResponse | null;
  latency_e2e?: OpenRouterStatsResponse | null;
  series_token_weights?: Record<string, number | null> | null;
};

export type OpenRouterEndpointStatsResponse = {
  data?: Array<{
    id?: string | null;
    provider_display_name?: string | null;
    provider_name?: string | null;
    provider_info?: {
      displayName?: string | null;
    } | null;
    stats?: {
      p50_throughput?: number | null;
      p50_latency?: number | null;
      request_count?: number | null;
    } | null;
  }>;
};

export type OpenRouterEffectivePricingResponse = {
  data?: {
    // OpenRouter's opaque aggregates are retained in the source response but never become final prices.
    weightedInputPrice?: number | null;
    weightedOutputPrice?: number | null;
    providerSummaries?: Array<{
      endpointId?: string | null;
      providerName?: string | null;
      effectiveInputPrice?: number | null;
      effectiveOutputPrice?: number | null;
      totalTokens?: number | null;
    }>;
  };
};

type OpenRouterPerformanceSummary = {
  throughput_tokens_per_second_median: number | null;
  latency_seconds_median: number | null;
  e2e_latency_seconds_median: number | null;
};

type OpenRouterPricingSummary = {
  weighted_input_price_per_1m: number | null;
  weighted_output_price_per_1m: number | null;
};

type OpenRouterScrapedModel = {
  id: string;
  performance: OpenRouterPerformanceSummary;
  pricing: OpenRouterPricingSummary;
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

const OPENROUTER_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  xai: "x-ai",
};
const MILLISECONDS_TO_SECONDS = 0.001;

export function sanitizeModelId(modelId: string): string {
  const normalized = modelId
    .trim()
    .toLowerCase()
    // Normalize OpenRouter route suffixes (e.g. :free, :exacto) to base model id.
    .replace(/:[a-z0-9._-]+$/i, "");
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return normalized;
  }
  const provider = normalized.slice(0, slashIndex);
  return `${OPENROUTER_PROVIDER_ALIASES[provider] ?? provider}${normalized.slice(slashIndex)}`;
}

/** Weight every available standard endpoint series that has matching positive token evidence. */
function tokenWeightedMeanValue(
  response: OpenRouterStatsResponse | null,
  seriesTokenWeights: Record<string, number | null> | null | undefined,
  valueScale: number,
): number | null {
  if (!response || !Array.isArray(response.data) || seriesTokenWeights == null) {
    return null;
  }
  const valuesBySeries = new Map<string, number[]>();
  for (const point of response.data) {
    for (const [series, value] of Object.entries(asRecord(point.y))) {
      const numericValue = asFiniteNumber(value);
      if (numericValue == null) {
        continue;
      }
      const values = valuesBySeries.get(series) ?? [];
      values.push(numericValue * valueScale);
      valuesBySeries.set(series, values);
    }
  }
  if (valuesBySeries.size === 0) {
    return null;
  }
  const weightedSeries = Object.entries(seriesTokenWeights)
    .map(([series, value]) => [series, asFiniteNumber(value)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] != null && entry[1] > 0);
  if (weightedSeries.length === 0) {
    return null;
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [series, weight] of weightedSeries) {
    const seriesMean = meanOfFinite(valuesBySeries.get(series) ?? []);
    if (seriesMean == null) {
      continue;
    }
    weightedSum += seriesMean * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/** Prefer matched token-weighted history and otherwise use OpenRouter's provider aggregate. */
function summarizePerformance(stats: OpenRouterModelStats): OpenRouterPerformanceSummary {
  const weightedThroughput = tokenWeightedMeanValue(
    stats.throughput ?? null,
    stats.series_token_weights,
    1,
  );
  const weightedLatency = tokenWeightedMeanValue(
    stats.latency ?? null,
    stats.series_token_weights,
    MILLISECONDS_TO_SECONDS,
  );
  const weightedE2eLatency = tokenWeightedMeanValue(
    stats.latency_e2e ?? null,
    stats.series_token_weights,
    MILLISECONDS_TO_SECONDS,
  );
  return {
    throughput_tokens_per_second_median:
      weightedThroughput ?? stats.summary?.throughput_tokens_per_second_median ?? null,
    latency_seconds_median: weightedLatency ?? stats.summary?.latency_seconds_median ?? null,
    e2e_latency_seconds_median:
      weightedE2eLatency ?? stats.summary?.e2e_latency_seconds_median ?? null,
  };
}

/** Match OpenRouter's cards: fastest endpoint P50 throughput and lowest endpoint P50 latency. */
export function summarizeEndpointPerformance(
  response: OpenRouterEndpointStatsResponse | null,
): OpenRouterPerformanceSummary {
  let highestThroughput: number | null = null;
  let lowestLatencyMs: number | null = null;
  for (const endpoint of response?.data ?? []) {
    const throughput = asFiniteNumber(endpoint.stats?.p50_throughput);
    const latencyMs = asFiniteNumber(endpoint.stats?.p50_latency);
    if (throughput != null && (highestThroughput == null || throughput > highestThroughput)) {
      highestThroughput = throughput;
    }
    if (latencyMs != null && (lowestLatencyMs == null || latencyMs < lowestLatencyMs)) {
      lowestLatencyMs = latencyMs;
    }
  }
  return {
    throughput_tokens_per_second_median: highestThroughput,
    latency_seconds_median:
      lowestLatencyMs == null ? null : lowestLatencyMs * MILLISECONDS_TO_SECONDS,
    e2e_latency_seconds_median: null,
  };
}

/** Allocate provider token totals to endpoint series by request share, omitting ambiguous multi-endpoint providers instead of inventing weights. */
export function buildOpenRouterSeriesTokenWeights(
  endpointResponse: OpenRouterEndpointStatsResponse | null,
  pricingResponse: OpenRouterEffectivePricingResponse | null,
): Record<string, number> {
  const endpoints = Array.isArray(endpointResponse?.data) ? endpointResponse.data : [];
  const providerSummaries = pricingResponse?.data?.providerSummaries ?? [];
  const totalTokensByProviderName = new Map(
    providerSummaries.flatMap((provider) => {
      const name = provider.providerName;
      const totalTokens = asFiniteNumber(provider.totalTokens);
      return name != null && totalTokens != null && totalTokens > 0
        ? [[name, totalTokens] as const]
        : [];
    }),
  );
  const endpointsByProviderName = new Map<
    string,
    Array<{
      id: string;
      requestCount: number | null;
    }>
  >();
  for (const endpoint of endpoints) {
    const id = endpoint.id;
    const providerName =
      endpoint.provider_display_name ??
      endpoint.provider_info?.displayName ??
      endpoint.provider_name ??
      null;
    if (id == null || providerName == null) {
      continue;
    }
    const providerEndpoints = endpointsByProviderName.get(providerName) ?? [];
    providerEndpoints.push({
      id,
      requestCount: asFiniteNumber(endpoint.stats?.request_count),
    });
    endpointsByProviderName.set(providerName, providerEndpoints);
  }
  const weights: Record<string, number> = {};
  for (const [providerName, providerEndpoints] of endpointsByProviderName) {
    const totalTokens = totalTokensByProviderName.get(providerName);
    if (totalTokens == null) {
      continue;
    }
    if (providerEndpoints.length === 1) {
      weights[`${providerEndpoints[0]!.id}::default`] = totalTokens;
      continue;
    }
    if (providerEndpoints.some((endpoint) => endpoint.requestCount == null)) {
      continue;
    }
    const requestCountSum = providerEndpoints.reduce(
      (sum, endpoint) => sum + (endpoint.requestCount ?? 0),
      0,
    );
    if (requestCountSum <= 0) {
      continue;
    }
    for (const endpoint of providerEndpoints) {
      if (endpoint.requestCount == null || endpoint.requestCount <= 0) {
        continue;
      }
      weights[`${endpoint.id}::default`] = (totalTokens * endpoint.requestCount) / requestCountSum;
    }
  }
  return weights;
}

/** Calculate one current effective price directly from the reported provider token mix. */
function providerWeightedPrice(
  response: OpenRouterEffectivePricingResponse | null,
  priceField: "effectiveInputPrice" | "effectiveOutputPrice",
): number | null {
  const providerSummaries = response?.data?.providerSummaries ?? [];
  if (providerSummaries.length === 0) {
    return null;
  }
  let weightedSum = 0;
  let totalTokens = 0;
  for (const provider of providerSummaries) {
    const price = asFiniteNumber(provider[priceField]);
    const tokens = asFiniteNumber(provider.totalTokens);
    if (tokens == null || tokens < 0) {
      return null;
    }
    if (tokens === 0) {
      continue;
    }
    if (price == null || price < 0) {
      return null;
    }
    weightedSum += price * tokens;
    totalTokens += tokens;
  }
  return totalTokens > 0 ? weightedSum / totalTokens : null;
}

/** Summarize OpenRouter effective pricing into per-million token prices. */
function summarizePricing(
  response: OpenRouterEffectivePricingResponse | null,
): OpenRouterPricingSummary {
  return {
    weighted_input_price_per_1m: providerWeightedPrice(response, "effectiveInputPrice"),
    weighted_output_price_per_1m: providerWeightedPrice(response, "effectiveOutputPrice"),
  };
}

function hasWeightedPricing(pricing: OpenRouterEffectivePricingResponse | null): boolean {
  const summary = summarizePricing(pricing);
  return (
    summary.weighted_input_price_per_1m != null || summary.weighted_output_price_per_1m != null
  );
}

export function emptyRawScrapedModel(
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

export function buildOpenRouterSlugCandidates(modelId: string, availableSlugs: string[]): string[] {
  const normalized = sanitizeModelId(modelId);
  const [provider, modelName = ""] = normalized.split("/", 2);
  if (!provider || !modelName) {
    return [normalized];
  }

  const versionCandidates = availableSlugs
    .filter((slug) => slug !== normalized && isSameOpenRouterModelRoute(normalized, slug))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);

  return [normalized, ...versionCandidates];
}

export function resolvePermaslugCandidates(
  modelId: string,
  availableSlugs: string[],
  permaslugBySlug: Map<string, string>,
): string[] {
  const slugCandidates = buildOpenRouterSlugCandidates(modelId, availableSlugs);
  return slugCandidates
    .map((slugCandidate) => permaslugBySlug.get(slugCandidate) ?? null)
    .filter(
      (permaslug): permaslug is string => typeof permaslug === "string" && permaslug.length > 0,
    );
}

export function parseOpenRouterWeeklyTokens(html: string): number | null {
  const marker = "weeklyTokensPromise";
  const markerStart = html.indexOf(marker);
  if (markerStart < 0) {
    return null;
  }
  const markerSlice = html.slice(markerStart + marker.length, markerStart + 100);
  const promiseMatch = markerSlice.match(/\$@([^\\"]+)/);
  const promiseId = promiseMatch?.[1];
  const valueStart = html.indexOf(`${promiseId}:`);
  const valueMatch =
    promiseId && valueStart >= 0
      ? html.slice(valueStart + promiseId.length + 1).match(/(\d+)/)
      : null;
  return asFiniteNumber(valueMatch?.[1]);
}

function bestCandidateByUsage(
  candidates: OpenRouterCandidateStats[],
  predicate: (candidate: OpenRouterCandidateStats) => boolean,
): OpenRouterCandidateStats | null {
  let bestCandidate: OpenRouterCandidateStats | null = null;
  for (const candidate of candidates) {
    if (!predicate(candidate)) {
      continue;
    }
    if (
      bestCandidate == null ||
      (candidate.weekly_tokens ?? -1) > (bestCandidate.weekly_tokens ?? -1)
    ) {
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

export function selectOpenRouterRawModelStats(
  modelId: string,
  candidates: OpenRouterCandidateStats[],
): OpenRouterRawScrapedModel {
  const performanceCandidate =
    bestCandidateByUsage(candidates, (candidate) =>
      Object.values(summarizePerformance(candidate.performance)).some((value) => value != null),
    ) ??
    bestCandidateByUsage(candidates, (candidate) => hasWeightedPricing(candidate.pricing)) ??
    candidates[0] ??
    null;
  const pricingCandidate = performanceCandidate
    ? hasWeightedPricing(performanceCandidate.pricing)
      ? performanceCandidate
      : bestCandidateByUsage(candidates, (candidate) => hasWeightedPricing(candidate.pricing))
    : null;

  return {
    id: modelId,
    selected_permaslug: performanceCandidate?.permaslug ?? null,
    candidate_permaslugs: candidates.map((candidate) => candidate.permaslug),
    performance: performanceCandidate?.performance ?? {},
    pricing: pricingCandidate?.pricing ?? null,
  };
}
