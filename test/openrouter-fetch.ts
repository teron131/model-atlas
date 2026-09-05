/** Verify request sharing preserves alias identities, candidate retries, and freshness across OpenRouter scrapes. */

import assert from "node:assert/strict";

import {
  getOpenRouterRawScrapedStats,
  processOpenRouterModelStats,
} from "../src/model-atlas/sources/openrouter";

const directory = [{ slug: "x-ai/grok-test", permaslug: "x-ai/grok-test-20260905" }];
const modelIds = ["x-ai/grok-test", "xai/grok-test"];
const requests: string[] = [];
let failNextEndpointRequest = false;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url.pathname);
  if (url.pathname.endsWith("/endpoint")) {
    if (failNextEndpointRequest) {
      failNextEndpointRequest = false;
      return new Response("retryable upstream failure", { status: 503 });
    }
    return Response.json({ data: [{ stats: { p50_throughput: 70, p50_latency: 250 } }] });
  }
  if (url.pathname.endsWith("/effective-pricing")) {
    return Response.json({
      data: {
        providerSummaries: [
          {
            endpointId: "provider-a",
            totalTokens: 100,
            effectiveInputPrice: 2,
            effectiveOutputPrice: 8,
          },
        ],
      },
    });
  }
  if (url.pathname.endsWith("/performance")) {
    return new Response('weeklyTokensPromise "$@usage" usage:1000');
  }
  const metric = url.pathname.split("/").at(-1);
  const values: Record<string, number> = {
    "throughput-comparison": 90,
    "latency-comparison": 200,
    "latency-e2e-comparison": 1200,
  };
  assert.ok(metric != null && metric in values, `Unexpected OpenRouter request: ${url}`);
  return Response.json({ data: [{ x: "2026-09-05", y: { "provider-a": values[metric] } }] });
};

try {
  const concurrent = await getOpenRouterRawScrapedStats({
    modelIds,
    modelDirectory: directory,
    concurrency: 2,
    maxRetries: 1,
  });
  assert.equal(requests.length, 6, "Concurrent aliases should share all six route requests");
  assert.equal(new Set(requests).size, 6);
  assert.deepEqual(
    concurrent.models.map((model) => model.id),
    modelIds,
  );
  assert.deepEqual(
    concurrent.models.map((model) => model.selected_permaslug),
    [directory[0]!.permaslug, directory[0]!.permaslug],
  );
  assert.deepEqual(
    processOpenRouterModelStats(
      concurrent.models[1]!.id,
      concurrent.models[1]!.performance,
      concurrent.models[1]!.pricing,
    ),
    {
      id: modelIds[1],
      performance: {
        throughput_tokens_per_second_median: 90,
        latency_seconds_median: 0.2,
        e2e_latency_seconds_median: 1.2,
      },
      pricing: { weighted_input_price_per_1m: 2, weighted_output_price_per_1m: 8 },
    },
    "Sharing route evidence must preserve normalized metrics and each requested model identity",
  );

  requests.length = 0;
  const sequential = await getOpenRouterRawScrapedStats({
    modelIds,
    modelDirectory: directory,
    concurrency: 1,
    maxRetries: 1,
  });
  assert.equal(requests.length, 6, "A new scrape must fetch again and reuse its settled results");
  assert.deepEqual(sequential.models, concurrent.models);

  requests.length = 0;
  failNextEndpointRequest = true;
  const recovered = await getOpenRouterRawScrapedStats({
    modelIds,
    modelDirectory: directory,
    concurrency: 1,
    maxRetries: 1,
  });
  assert.equal(recovered.models[0]!.selected_permaslug, null);
  assert.deepEqual(recovered.models[0]!.performance, {});
  assert.equal(recovered.models[1]!.selected_permaslug, directory[0]!.permaslug);
  assert.equal(
    requests.filter((path) => path.endsWith("/endpoint")).length,
    2,
    "A failed shared candidate must remain retryable by the next alias",
  );
} finally {
  globalThis.fetch = originalFetch;
}
