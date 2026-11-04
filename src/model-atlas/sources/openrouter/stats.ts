/** Pure OpenRouter stat normalization, same-version permaslug resolution, and best-candidate selection policy. */

import { isSameOpenRouterModelRoute } from "../../identity/openrouter";
import { providerIdentityKey } from "../../identity/provider";
import { meanOfFinite } from "../../math-utils";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
  OpenRouterCandidateStats,
  OpenRouterEffectivePricingResponse,
  OpenRouterEndpointStatsResponse,
  OpenRouterModelMetrics,
  OpenRouterPerformance,
  OpenRouterPerformanceSummary,
  OpenRouterPricingSummary,
  OpenRouterRoutePrice,
  OpenRouterSeriesResponse,
  OpenRouterSourceModel,
} from "./types";

const OPENROUTER_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  xai: "x-ai",
};

/** Routes OpenRouter lists under a name no general matching rule can safely reach. */
const OPENROUTER_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  "alibaba/qwen3-8b-instruct": "qwen/qwen3-8b",
  "deepseek/deepseek-v3": "deepseek/deepseek-chat",
  "meta/muse-glimmer": "meta/muse-glimmer-30b",
  "reflection/reflection-beam": "reflection/beam-1.0-501b-a23b",
};

const RELEASE_MMDD_PATTERN = /^(?:0[1-9]|1[0-2])(?:[0-2]\d|3[01])$/;
const INSTRUCTION_TUNING_TOKENS = new Set(["instruct", "it"]);

const SECONDS_PER_MILLISECOND = 0.001;
const TOKENS_PER_MILLION = 1_000_000;

export function sanitizeOpenRouterModelId(modelId: string): string {
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
      lowestLatencyMs == null ? null : lowestLatencyMs * SECONDS_PER_MILLISECOND,
    e2e_latency_seconds_median: null,
  };
}

/**
 * OpenRouter lists its priority ("fast"), ultrafast, and flex service tiers as endpoints of a model's standard variant, at their own speed and price.
 * Atlas measures the default tier, so endpoints with any service tier leave both responses before speed, latency, or price is summarized.
 */
export function withDefaultServiceTier(
  endpointStats: OpenRouterEndpointStatsResponse,
  pricing: OpenRouterEffectivePricingResponse,
): { endpointStats: OpenRouterEndpointStatsResponse; pricing: OpenRouterEffectivePricingResponse } {
  const endpoints = endpointStats.data ?? [];
  const tieredIds = new Set(
    endpoints.flatMap((endpoint) =>
      endpoint.service_tier == null || endpoint.id == null ? [] : [endpoint.id],
    ),
  );
  return {
    endpointStats: {
      ...endpointStats,
      data: endpoints.filter((endpoint) => endpoint.service_tier == null),
    },
    pricing:
      pricing.data?.providerSummaries == null
        ? pricing
        : {
            ...pricing,
            data: {
              ...pricing.data,
              providerSummaries: pricing.data.providerSummaries.filter(
                (provider) => provider.endpointId == null || !tieredIds.has(provider.endpointId),
              ),
            },
          },
  };
}

/** Match reported endpoint token totals directly to history series IDs, independently of provider display names or current endpoint availability. */
export function buildOpenRouterSeriesTokenWeights(
  pricingResponse: OpenRouterEffectivePricingResponse | null,
): Record<string, number> {
  const providerSummaries = pricingResponse?.data?.providerSummaries ?? [];
  const weights: Record<string, number> = {};
  for (const provider of providerSummaries) {
    const endpointId = provider.endpointId;
    const totalTokens = asFiniteNumber(provider.totalTokens);
    if (endpointId && totalTokens != null && totalTokens > 0) {
      weights[endpointId] = totalTokens;
    }
  }
  return weights;
}

/** Each route's listed prices with the tokens it served as weight; a route without listed input and output prices or served tokens is left out. */
export function listedRoutePrices(
  endpointStats: OpenRouterEndpointStatsResponse,
  pricing: OpenRouterEffectivePricingResponse,
): OpenRouterRoutePrice[] {
  const tokensByEndpoint = buildOpenRouterSeriesTokenWeights(pricing);
  return (endpointStats.data ?? []).flatMap((endpoint) => {
    const tokens = endpoint.id == null ? undefined : tokensByEndpoint[endpoint.id];
    const input = pricePerMillion(endpoint.pricing?.prompt);
    const output = pricePerMillion(endpoint.pricing?.completion);
    if (endpoint.id == null || tokens == null || input == null || output == null) return [];
    return [
      {
        endpoint_id: endpoint.id,
        tokens,
        input,
        output,
        cache_read: pricePerMillion(endpoint.pricing?.input_cache_read),
        cache_write: pricePerMillion(endpoint.pricing?.input_cache_write),
      },
    ];
  });
}

function pricePerMillion(pricePerToken: string | null | undefined): number | null {
  const price = asFiniteNumber(pricePerToken);
  return price == null || price < 0 ? null : price * TOKENS_PER_MILLION;
}

export function emptyOpenRouterSourceModel(
  modelId: string,
  candidatePermaslugs: string[] = [],
): OpenRouterSourceModel {
  return {
    id: modelId,
    selected_permaslug: null,
    candidate_permaslugs: candidatePermaslugs,
    performance: {},
    route_prices: [],
  };
}

export function processOpenRouterModelStats(
  modelId: string,
  stats: OpenRouterPerformance,
  routePrices: readonly OpenRouterRoutePrice[],
): OpenRouterModelMetrics {
  return {
    id: modelId,
    performance: summarizePerformance(stats),
    pricing: summarizePricing(routePrices),
  };
}

export function buildOpenRouterSlugCandidates(modelId: string, availableSlugs: string[]): string[] {
  const normalized = sanitizeOpenRouterModelId(modelId);
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

export function resolveOpenRouterPermaslugCandidates(
  modelId: string,
  availableSlugs: string[],
  permaslugBySlug: Map<string, string>,
): string[] {
  const permaslugs = buildOpenRouterSlugCandidates(modelId, availableSlugs).flatMap(
    (slug) => permaslugBySlug.get(slug) || [],
  );
  if (permaslugs.length > 0) {
    return permaslugs;
  }
  const fallbackSlug =
    OPENROUTER_ROUTE_ALIASES[sanitizeOpenRouterModelId(modelId)] ??
    looseOpenRouterSlug(modelId, availableSlugs, permaslugBySlug);
  const permaslug = fallbackSlug && permaslugBySlug.get(fallbackSlug);
  return permaslug ? [permaslug] : [];
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

export function selectOpenRouterRawModelStats(
  modelId: string,
  candidates: OpenRouterCandidateStats[],
): OpenRouterSourceModel {
  const performanceCandidate =
    bestCandidateByUsage(candidates, (candidate) =>
      Object.values(summarizePerformance(candidate.performance)).some((value) => value != null),
    ) ??
    bestCandidateByUsage(candidates, hasRoutePrices) ??
    candidates[0] ??
    null;
  const pricingCandidate = performanceCandidate
    ? hasRoutePrices(performanceCandidate)
      ? performanceCandidate
      : bestCandidateByUsage(candidates, hasRoutePrices)
    : null;

  return {
    id: modelId,
    selected_permaslug: performanceCandidate?.permaslug ?? null,
    candidate_permaslugs: candidates.map((candidate) => candidate.permaslug),
    performance: performanceCandidate?.performance ?? {},
    route_prices: pricingCandidate?.route_prices ?? [],
  };
}

/** Prefer matched token-weighted history and otherwise use OpenRouter's provider aggregate. */
function summarizePerformance(stats: OpenRouterPerformance): OpenRouterPerformanceSummary {
  const weightedThroughput = tokenWeightedMeanValue(
    stats.throughput ?? null,
    stats.series_token_weights,
    1,
  );
  const weightedLatency = tokenWeightedMeanValue(
    stats.latency ?? null,
    stats.series_token_weights,
    SECONDS_PER_MILLISECOND,
  );
  const weightedE2eLatency = tokenWeightedMeanValue(
    stats.latency_e2e ?? null,
    stats.series_token_weights,
    SECONDS_PER_MILLISECOND,
  );
  return {
    throughput_tokens_per_second_median:
      weightedThroughput ?? stats.summary?.throughput_tokens_per_second_median ?? null,
    latency_seconds_median: weightedLatency ?? stats.summary?.latency_seconds_median ?? null,
    e2e_latency_seconds_median:
      weightedE2eLatency ?? stats.summary?.e2e_latency_seconds_median ?? null,
  };
}

/** Weight every available standard endpoint series that has matching positive token evidence. */
function tokenWeightedMeanValue(
  response: OpenRouterSeriesResponse | null,
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

/** Weight each route's listed input and output prices by the tokens it served. */
function summarizePricing(routes: readonly OpenRouterRoutePrice[]): OpenRouterPricingSummary {
  const tokens = routes.reduce((total, route) => total + route.tokens, 0);
  const weighted = (price: (route: OpenRouterRoutePrice) => number) =>
    tokens > 0
      ? routes.reduce((total, route) => total + price(route) * route.tokens, 0) / tokens
      : null;
  return {
    weighted_input_price_per_1m: weighted((route) => route.input),
    weighted_output_price_per_1m: weighted((route) => route.output),
  };
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

function hasRoutePrices(candidate: OpenRouterCandidateStats): boolean {
  return candidate.route_prices.length > 0;
}

/** Last resort for an id with no exact route: each rule must name exactly one route, and a trailing MMDD release only matches a dateless route whose permaslug carries that date, so one checkpoint never borrows another's stats. */
function looseOpenRouterSlug(
  modelId: string,
  availableSlugs: string[],
  permaslugBySlug: Map<string, string>,
): string | null {
  const target = openRouterRouteTokens(sanitizeOpenRouterModelId(modelId));
  if (target == null) {
    return null;
  }
  const routes = availableSlugs.flatMap((slug) => {
    const route = openRouterRouteTokens(slug);
    return route?.provider === target.provider
      ? [{ slug, key: route.tokens.join("-"), tuning: tuningKey(route.tokens) }]
      : [];
  });
  const targetKey = target.tokens.join("-");
  const release = target.tokens.at(-1) ?? "";
  const undatedKey = target.tokens.slice(0, -1).join("-");
  const targetTuning = tuningKey(target.tokens);
  const rules: ((route: (typeof routes)[number]) => boolean)[] = [
    ({ key }) => key === targetKey,
    ({ slug, key }) =>
      RELEASE_MMDD_PATTERN.test(release) &&
      key === undatedKey &&
      (permaslugBySlug.get(slug)?.endsWith(release) ?? false),
    // Gemma publishes instruction-tuned routes with an `-it` suffix.
    ({ key }) => key === `${targetKey}-it`,
    // Instruction tokens may sit anywhere, but base and instruct models must never match.
    ({ tuning }) => tuning === targetTuning,
  ];
  for (const rule of rules) {
    const [match, ...others] = routes.filter(rule);
    if (match != null && others.length === 0) {
      return match.slug;
    }
  }
  return null;
}

/** Tokenize a route so publisher aliases, a repeated publisher prefix, dot or dash versions, a family name fused to its version, and a zero minor version compare equal. */
function openRouterRouteTokens(route: string): { provider: string; tokens: string[] } | null {
  const [publisher, rawName] = route.toLowerCase().split("/", 2);
  if (!publisher || !rawName) {
    return null;
  }
  const provider = providerIdentityKey(publisher);
  let name = rawName.replaceAll(".", "-");
  for (const prefix of new Set([publisher, provider])) {
    if (name.startsWith(`${prefix}-`)) {
      name = name.slice(prefix.length + 1);
    }
  }
  const tokens = name
    .split("-")
    // Parameter counts such as 70b or a23b stay whole; other tokens split at letter-digit boundaries.
    .flatMap((token) =>
      /^a?\d+b$/.test(token) ? [token] : token.split(/(?<=\D)(?=\d)|(?<=\d)(?=\D)/),
    )
    .filter((token, index, all) => !(token === "0" && /^\d+$/.test(all[index - 1] ?? "")));
  return { provider, tokens };
}

function tuningKey(tokens: string[]): string {
  const tuning = tokens.filter((token) => INSTRUCTION_TUNING_TOKENS.has(token)).sort();
  const rest = tokens.filter((token) => !INSTRUCTION_TUNING_TOKENS.has(token));
  return `${rest.join("-")}|${tuning.join("-")}`;
}
