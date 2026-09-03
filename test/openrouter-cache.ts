/** Verifies OpenRouter cache fidelity, route coverage, and targeted refresh policy. */

import assert from "node:assert/strict";

import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import {
  openRouterCacheHasCurrentShape,
  readOpenRouterRawCache,
} from "../src/model-atlas/ingest/cache/openrouter";
import {
  openRouterModelIdsToRefresh,
  refreshOpenRouterRawPayload,
} from "../src/model-atlas/ingest/source-snapshots/openrouter";
import { insertOpenRouterRawRows } from "../src/model-atlas/ingest/writers/openrouter";
import {
  buildOpenRouterSeriesTokenWeights,
  processOpenRouterModelStats,
} from "../src/model-atlas/scrapers/openrouter";

const databasePath = ".cache/test-openrouter-cache.sqlite";
const endpointId = "3ecee37f-b217-4093-87fb-aaf0afe307af";
const pricing = {
  data: {
    providerSummaries: [
      {
        endpointId,
        providerName: "Provider A (1)",
        effectiveInputPrice: 10,
        effectiveOutputPrice: 50,
        totalTokens: 123,
      },
    ],
  },
};

await removeDatabaseFiles(databasePath);

try {
  const db = await openDatabase(databasePath);
  try {
    insertOpenRouterRawRows(db, {
      fetched_at_epoch_seconds: 1_800_000_000,
      directory: [
        {
          slug: "anthropic/claude-fable-5",
          permaslug: "anthropic/claude-5-fable-20260609",
        },
        {
          slug: "qwen/qwen-plus-2025-07-28",
          permaslug: "qwen/qwen-plus-2025-07-28",
        },
        {
          slug: "x-ai/grok-4.1-fast",
          permaslug: "x-ai/grok-4.1-fast",
        },
      ],
      models: [
        {
          id: "anthropic/claude-fable-5",
          selected_permaslug: "anthropic/claude-5-fable-20260609",
          candidate_permaslugs: ["anthropic/claude-5-fable-20260609"],
          performance: {
            summary: {
              throughput_tokens_per_second_median: 53,
              latency_seconds_median: 3.73,
              e2e_latency_seconds_median: null,
            },
            throughput: {
              data: [
                {
                  x: "2026-06-17",
                  y: { [endpointId]: 100 },
                },
              ],
            },
            latency_e2e: {
              data: [
                {
                  x: "2026-06-17",
                  y: {
                    [endpointId]: 16_220,
                  },
                },
              ],
            },
            series_token_weights: buildOpenRouterSeriesTokenWeights(pricing),
          },
          pricing,
        },
        {
          id: "qwen/qwen-plus-2025-07-28:thinking",
          selected_permaslug: null,
          candidate_permaslugs: ["qwen/qwen-plus-2025-07-28"],
          performance: {},
          pricing: null,
        },
        {
          id: "xai/grok-4.1-fast",
          selected_permaslug: "x-ai/grok-4.1-fast",
          candidate_permaslugs: ["x-ai/grok-4.1-fast"],
          performance: {},
          pricing: null,
        },
      ],
    });

    const cached = readOpenRouterRawCache(db);
    assert.ok(cached != null);
    assert.equal(
      cached?.models[0]?.performance.series_token_weights?.[endpointId],
      123,
      "OpenRouter cache reads should preserve token-share weights",
    );
    const cachedModel = cached.models[0]!;
    assert.equal(
      processOpenRouterModelStats(cachedModel.id, cachedModel.performance, cachedModel.pricing)
        .performance.e2e_latency_seconds_median,
      16.22,
      "Endpoint-weighted E2E latency must survive ingestion and a SQLite cache round trip",
    );
    assert.deepEqual(
      cached?.models[0]?.performance.summary,
      {
        throughput_tokens_per_second_median: 53,
        latency_seconds_median: 3.73,
        e2e_latency_seconds_median: null,
      },
      "OpenRouter cache reads should preserve endpoint aggregate fallback values",
    );
    assert.equal(
      cached?.models[0]?.pricing?.data?.providerSummaries?.[0]?.effectiveInputPrice,
      10,
      "OpenRouter cache reads should preserve validated provider-weighted pricing",
    );
    assert.deepEqual(
      cached.models.map((model) => model.id),
      ["anthropic/claude-fable-5", "qwen/qwen-plus-2025-07-28:thinking", "xai/grok-4.1-fast"],
      "Models with no stats should persist so later refreshes can retry them",
    );
    assert.equal(
      openRouterCacheHasCurrentShape(db),
      true,
      "Candidate scope and attempted summaries should keep sparse route caches current",
    );
    const freshCacheStatus = {
      last_fetch_epoch_seconds: 1_800_000_000,
      source_input_count: 3,
      cache_hit: true,
      refreshed: false,
    };
    assert.deepEqual(
      openRouterModelIdsToRefresh(
        cached,
        freshCacheStatus,
        ["anthropic/claude-fable-5", "xai/grok-4.1-fast", "openai/new-model"],
        false,
      ),
      ["xai/grok-4.1-fast", "openai/new-model"],
      "Fresh OpenRouter caches should retry unusable routes and fetch uncovered model IDs",
    );
    const scopedRefresh = await refreshOpenRouterRawPayload(
      cached,
      freshCacheStatus,
      ["anthropic/claude-fable-5"],
      8,
    );
    assert.deepEqual(
      scopedRefresh.rawPayload?.models.map((model) => model.id),
      ["anthropic/claude-fable-5"],
      "Fresh cache reuse should drop model keys no longer requested",
    );

    const contentRows = () =>
      db
        .prepare("SELECT * FROM openrouter_raw_rows ORDER BY row_index")
        .all()
        .map(({ row_index, fetched_at_epoch_seconds, ...row }) => row);
    const beforeRewrite = contentRows();
    db.prepare("DELETE FROM openrouter_raw_rows").run();
    insertOpenRouterRawRows(db, cached);
    assert.deepEqual(
      contentRows(),
      beforeRewrite,
      "OpenRouter cache read/write round trips should be content-idempotent",
    );
  } finally {
    db.close();
  }
} finally {
  await removeDatabaseFiles(databasePath);
}
