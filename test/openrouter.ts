/** Verifies OpenRouter parsing, route candidates, provenance, and statistics. */

import assert from "node:assert/strict";

import { SOURCE_URLS } from "../src/model-atlas/ingest/source-registry";
import {
  buildOpenRouterSeriesTokenWeights,
  buildOpenRouterSlugCandidates,
  parseOpenRouterWeeklyTokens,
  processOpenRouterModelStats,
  selectOpenRouterRawModelStats,
  summarizeEndpointPerformance,
} from "../src/model-atlas/scrapers/openrouter";

assert.deepEqual(
  SOURCE_URLS.openrouter_models,
  "https://openrouter.ai/api/frontend/v1/catalog/models",
);
assert.deepEqual(SOURCE_URLS.openrouter_stats, "https://openrouter.ai/api/frontend/v1/stats/*");

const performanceStats = {
  throughput: {
    data: [
      { x: "2026-01-01", y: { p50: 100, p90: 300 } },
      { x: "2026-01-02", y: { p50: 500, p90: 700 } },
    ],
  },
  latency: {
    data: [
      { x: "2026-01-01", y: { p50: 1000, p90: 1000 } },
      { x: "2026-01-02", y: { p50: 3000, p90: 3000 } },
    ],
  },
  latency_e2e: {
    data: [{ x: "2026-01-01", y: { p50: 1500, p90: 1500 } }],
  },
  series_token_weights: {
    p50: 9,
    p90: 1,
  },
};

const aggregateOnlyPricingModel = processOpenRouterModelStats("openai/example", performanceStats, {
  data: {
    weightedInputPrice: 1.2,
    weightedOutputPrice: 3.4,
  },
});

const providerWeightedPriceModel = processOpenRouterModelStats(
  "openai/provider-weighted-price-example",
  {},
  {
    data: {
      weightedInputPrice: 100,
      weightedOutputPrice: 200,
      providerSummaries: [
        {
          endpointId: "provider-a",
          effectiveInputPrice: 1,
          effectiveOutputPrice: 10,
          totalTokens: 90,
        },
        {
          endpointId: "provider-b",
          effectiveInputPrice: 3,
          effectiveOutputPrice: 30,
          totalTokens: 10,
        },
      ],
    },
  },
);

assert.deepEqual(providerWeightedPriceModel.pricing, {
  weighted_input_price_per_1m: 1.2,
  weighted_output_price_per_1m: 12,
});

const endpointWeights = buildOpenRouterSeriesTokenWeights({
  data: {
    providerSummaries: [
      { endpointId: "endpoint-a-fast", providerName: "Provider A (1)", totalTokens: 60 },
      { endpointId: "endpoint-a-slow", providerName: "Provider A (2)", totalTokens: 20 },
      { endpointId: "endpoint-b", totalTokens: 20 },
      { providerName: "Missing endpoint", totalTokens: 100 },
      { endpointId: "", totalTokens: 100 },
      { endpointId: "zero-tokens", totalTokens: 0 },
      { endpointId: "negative-tokens", totalTokens: -1 },
      { endpointId: "missing-tokens", totalTokens: null },
      { endpointId: "invalid-tokens", totalTokens: Number.NaN },
    ],
  },
});
assert.deepEqual(endpointWeights, {
  "endpoint-a-fast": 60,
  "endpoint-a-slow": 20,
  "endpoint-b": 20,
});
assert.deepEqual(buildOpenRouterSeriesTokenWeights(null), {});
assert.equal(
  processOpenRouterModelStats(
    "openai/endpoint-weighted-example",
    {
      latency_e2e: {
        data: [
          {
            y: {
              "endpoint-a-fast": 1_000,
              "endpoint-a-slow": 5_000,
              "endpoint-b": null,
              "unmatched-endpoint": 100_000,
            },
          },
        ],
      },
      series_token_weights: endpointWeights,
    },
    null,
  ).performance.e2e_latency_seconds_median,
  2,
  "Endpoint IDs must match history directly and only matched positive evidence contributes",
);

assert.deepEqual(
  summarizeEndpointPerformance({
    data: [
      { stats: { p50_throughput: 40, p50_latency: 5_360 } },
      { stats: { p50_throughput: 53, p50_latency: 3_730 } },
      { stats: { p50_throughput: null, p50_latency: null } },
    ],
  }),
  {
    throughput_tokens_per_second_median: 53,
    latency_seconds_median: 3.73,
    e2e_latency_seconds_median: null,
  },
);

assert.deepEqual(aggregateOnlyPricingModel, {
  id: "openai/example",
  performance: {
    throughput_tokens_per_second_median: 320,
    latency_seconds_median: 2,
    e2e_latency_seconds_median: 1.5,
  },
  pricing: {
    weighted_input_price_per_1m: null,
    weighted_output_price_per_1m: null,
  },
});

const sparseModel = processOpenRouterModelStats(
  "openai/sparse-example",
  {
    throughput: {
      data: [
        { x: "2026-01-01", y: { providerA: null, providerB: 100 } },
        { x: "2026-01-02", y: { providerA: 200 } },
      ],
    },
    latency: {
      data: [
        { x: "2026-01-01", y: { providerA: null, providerB: 1000 } },
        { x: "2026-01-02", y: { providerA: 3000 } },
      ],
    },
    latency_e2e: {
      data: [{ x: "2026-01-01", y: { providerA: null, providerB: 1500 } }],
    },
  },
  null,
);

assert.deepEqual(sparseModel.performance, {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
});

const aggregateFallbackModel = processOpenRouterModelStats(
  "anthropic/aggregate-fallback-example",
  {
    summary: {
      throughput_tokens_per_second_median: 53,
      latency_seconds_median: 3.73,
      e2e_latency_seconds_median: null,
    },
    throughput: { data: [{ x: "2026-01-01", y: { providerA: 40 } }] },
    latency: { data: [{ x: "2026-01-01", y: { providerA: 5_360 } }] },
    latency_e2e: { data: [{ x: "2026-01-01", y: { providerA: 11_250 } }] },
    series_token_weights: { providerB: 1 },
  },
  null,
);

assert.deepEqual(aggregateFallbackModel.performance, {
  throughput_tokens_per_second_median: 53,
  latency_seconds_median: 3.73,
  e2e_latency_seconds_median: null,
});

const partialWeightedPerformanceModel = processOpenRouterModelStats(
  "openai/partial-weighted-performance-example",
  {
    throughput: {
      data: [{ x: "2026-01-01", y: { matched: 50, unweighted: 100 } }],
    },
    latency: {
      data: [{ x: "2026-01-01", y: { matched: 2_000, unweighted: 1_000 } }],
    },
    latency_e2e: {
      data: [{ x: "2026-01-01", y: { matched: 8_000, unweighted: 4_000 } }],
    },
    series_token_weights: { matched: 10 },
  },
  null,
);

assert.deepEqual(partialWeightedPerformanceModel.performance, {
  throughput_tokens_per_second_median: 50,
  latency_seconds_median: 2,
  e2e_latency_seconds_median: 8,
});

assert.deepEqual(
  parseOpenRouterWeeklyTokens(
    String.raw`weeklyTokensPromise\":\"$@44\" somewhere 44:\"3550178782\"`,
  ),
  3_550_178_782,
);

assert.deepEqual(
  buildOpenRouterSlugCandidates("provider/model-pro", [
    "provider/model-pro",
    "provider/model-pro-20260602",
    "provider/model-pro-preview-06-2026",
    "provider/model-max",
    "provider/model-legacy-pro-04-02",
    "provider/model-coder-pro",
  ]),
  ["provider/model-pro", "provider/model-pro-20260602", "provider/model-pro-preview-06-2026"],
);

assert.deepEqual(buildOpenRouterSlugCandidates("xai/grok-4.1-fast", ["x-ai/grok-4.1-fast"]), [
  "x-ai/grok-4.1-fast",
]);

const selected = selectOpenRouterRawModelStats("provider/model", [
  {
    permaslug: "provider/model-low-volume",
    weekly_tokens: 10_000,
    performance: {
      throughput: { data: [{ x: "2026-01-01", y: { p50: 25 } }] },
      series_token_weights: { p50: 1 },
    },
    pricing: {
      data: {
        weightedInputPrice: 1,
        weightedOutputPrice: 2,
      },
    },
  },
  {
    permaslug: "provider/model-high-volume-free-price",
    weekly_tokens: 1_000_000,
    performance: {
      throughput: { data: [{ x: "2026-01-01", y: { p50: 100 } }] },
      series_token_weights: { p50: 1 },
    },
    pricing: {
      data: {
        weightedInputPrice: 0,
        weightedOutputPrice: 0,
      },
    },
  },
]);

assert.deepEqual(selected, {
  id: "provider/model",
  selected_permaslug: "provider/model-high-volume-free-price",
  candidate_permaslugs: ["provider/model-low-volume", "provider/model-high-volume-free-price"],
  performance: {
    throughput: { data: [{ x: "2026-01-01", y: { p50: 100 } }] },
    series_token_weights: { p50: 1 },
  },
  pricing: null,
});
