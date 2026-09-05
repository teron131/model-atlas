/** Verify request sharing, transient-only retries, alias identities, and freshness across OpenRouter scrapes. */

import assert from "node:assert/strict";

import {
  getOpenRouterRawScrapedStats,
  processOpenRouterModelStats,
} from "../src/model-atlas/sources/openrouter";

const directory = [{ slug: "x-ai/grok-test", permaslug: "x-ai/grok-test-20260905" }];
const modelIds = ["x-ai/grok-test", "xai/grok-test"];
const requests: string[] = [];
let nextEndpointStatus: number | null = null;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url.pathname);
  if (url.pathname.endsWith("/endpoint")) {
    if (nextEndpointStatus != null) {
      const status = nextEndpointStatus;
      nextEndpointStatus = null;
      return new Response("upstream failure", { status, headers: { "retry-after": "1" } });
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
  const firstScrape = getOpenRouterRawScrapedStats({
    modelIds,
    modelDirectory: directory,
    concurrency: 2,
    maxRetries: 1,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    requests.length,
    6,
    "One page must start its six endpoints without individual pacing",
  );
  const concurrent = await firstScrape;
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
  nextEndpointStatus = 503;
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
  assert.equal(
    requests.length,
    7,
    "A later alias must retain the failed page's five successful responses",
  );
  assert.deepEqual(recovered.models[1], concurrent.models[1]);

  for (const status of [403, 404]) {
    requests.length = 0;
    nextEndpointStatus = status;
    const rejected = await getOpenRouterRawScrapedStats({
      modelIds: [modelIds[0]!],
      modelDirectory: directory,
      maxRetries: 3,
      retryBaseDelayMs: 0,
    });
    assert.equal(rejected.models[0]!.selected_permaslug, null);
    assert.equal(
      requests.filter((path) => path.endsWith("/endpoint")).length,
      1,
      `Permanent HTTP ${status} must not be retried`,
    );
  }

  requests.length = 0;
  nextEndpointStatus = 429;
  const retried = await getOpenRouterRawScrapedStats({
    modelIds: [modelIds[0]!],
    modelDirectory: directory,
    maxRetries: 3,
    retryBaseDelayMs: 0,
  });
  assert.equal(retried.models[0]!.selected_permaslug, directory[0]!.permaslug);
  assert.equal(requests.filter((path) => path.endsWith("/endpoint")).length, 2);
  assert.equal(requests.length, 7, "An endpoint retry must not replay successful sibling requests");
} finally {
  globalThis.fetch = originalFetch;
}
