/** OpenRouter source responses and normalized metric contracts shared by fetching, cache reconstruction, and scoring preserve upstream field names and units. */

export type OpenRouterFrontendModel = {
  slug?: string | null;
  permaslug?: string | null;
};

type OpenRouterSeriesPoint = {
  x?: string;
  y?: Record<string, number | null>;
};

export type OpenRouterSeriesResponse = {
  data?: OpenRouterSeriesPoint[];
};

/** History retains upstream units: tokens per second for throughput and milliseconds for latency; summary latency is already in seconds. */
export type OpenRouterPerformance = {
  summary?: OpenRouterPerformanceSummary | null;
  throughput?: OpenRouterSeriesResponse | null;
  latency?: OpenRouterSeriesResponse | null;
  latency_e2e?: OpenRouterSeriesResponse | null;
  series_token_weights?: Record<string, number | null> | null;
};

export type OpenRouterEndpointStatsResponse = {
  data?: Array<{
    id?: string | null;
    service_tier?: string | null;
    stats?: {
      p50_throughput?: number | null;
      p50_latency?: number | null;
    } | null;
    /** Listed USD per token, as decimal strings. */
    pricing?: {
      prompt?: string | null;
      completion?: string | null;
      input_cache_read?: string | null;
      input_cache_write?: string | null;
    } | null;
  }>;
};

/** One default-tier route's listed prices in USD per million tokens, with the tokens it served as its weight; a null cache price is unlisted. */
export type OpenRouterRoutePrice = {
  endpoint_id: string;
  tokens: number;
  input: number;
  output: number;
  cache_read: number | null;
  cache_write: number | null;
};

/** Atlas reads only each endpoint's served tokens from this response; its effective prices mix a model's pricing with how its users cache, so they never become prices. */
export type OpenRouterEffectivePricingResponse = {
  data?: {
    providerSummaries?: Array<{
      endpointId?: string | null;
      providerName?: string | null;
      totalTokens?: number | null;
    }>;
  };
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

export type OpenRouterModelMetrics = {
  id: string;
  performance: OpenRouterPerformanceSummary;
  pricing: OpenRouterPricingSummary;
};

/** Preserve the requested model identity separately from the route selected for its performance and pricing evidence. */
export type OpenRouterSourceModel = {
  id: string;
  selected_permaslug: string | null;
  candidate_permaslugs: string[];
  performance: OpenRouterPerformance;
  route_prices: OpenRouterRoutePrice[];
};

export type OpenRouterCandidateStats = {
  permaslug: string;
  weekly_tokens: number | null;
  performance: OpenRouterPerformance;
  route_prices: OpenRouterRoutePrice[];
};

export type OpenRouterSourcePayload = {
  fetched_at_epoch_seconds: number;
  directory: OpenRouterFrontendModel[];
  models: OpenRouterSourceModel[];
};
