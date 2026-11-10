/** Verifies OpenRouter cache fidelity, route coverage, and targeted refresh policy. */

import assert from "node:assert/strict";

import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import {
  buildOpenRouterSeriesTokenWeights,
  processOpenRouterModelStats,
} from "../src/model-atlas/sources/openrouter";
import {
  openRouterCacheHasCurrentShape,
  readOpenRouterRawCache,
} from "../src/model-atlas/sources/openrouter/cache";
import {
  openRouterModelIdsToRefresh,
  refreshOpenRouterRawPayload,
} from "../src/model-atlas/sources/openrouter/snapshot";
import { insertOpenRouterRawRows } from "../src/model-atlas/sources/openrouter/write";

const databasePath = ".cache/test-openrouter-cache.sqlite";
const endpointId = "3ecee37f-b217-4093-87fb-aaf0afe307af";
const pricing = {
  data: {
    providerSummaries: [
      {
        endpointId,
        providerName: "Provider A (1)",
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
          route_prices: [
            {
              endpoint_id: endpointId,
              tokens: 123,
              input: 10,
              output: 50,
              cache_read: 1,
              cache_write: null,
            },
          ],
        },
        {
          id: "qwen/qwen-plus-2025-07-28:thinking",
          selected_permaslug: null,
          candidate_permaslugs: ["qwen/qwen-plus-2025-07-28"],
          performance: {},
          route_prices: [],
        },
        {
          id: "xai/grok-4.1-fast",
          selected_permaslug: "x-ai/grok-4.1-fast",
          candidate_permaslugs: ["x-ai/grok-4.1-fast"],
          performance: {},
          route_prices: [],
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
      processOpenRouterModelStats(cachedModel.id, cachedModel.performance, cachedModel.route_prices)
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
    assert.deepEqual(
      cachedModel.route_prices,
      [
        {
          endpoint_id: endpointId,
          tokens: 123,
          input: 10,
          output: 50,
          cache_read: 1,
          cache_write: null,
        },
      ],
      "OpenRouter cache reads should preserve listed route prices, including an unlisted cache write",
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
    const cacheRows = db.prepare("SELECT * FROM openrouter_raw_rows ORDER BY row_index").all();
    assert.deepEqual(
      readOpenRouterRawCache(cacheRows),
      cached,
      "Indexed cache reconstruction must preserve the SQLite and collected-row contracts",
    );
    const withoutSummary = cacheRows.filter(
      (row) => row.row_kind !== "endpoint_summary" || row.model_id !== cachedModel.id,
    );
    assert.equal(openRouterCacheHasCurrentShape(withoutSummary), false);
    assert.equal(
      openRouterCacheHasCurrentShape(cacheRows.filter((row) => row.row_kind !== "route_price")),
      false,
      "Caches holding effective prices without listed route prices predate the blend and must refetch",
    );
    assert.equal(
      openRouterCacheHasCurrentShape(
        cacheRows
          .filter((row) => row.row_kind !== "series_weight")
          .map((row) =>
            row.row_kind === "stat_point" ? { ...row, series_token_weight: 123 } : row,
          ),
      ),
      false,
      "Caches that repeat series weights on every stat point predate weight rows and must refetch",
    );
    db.prepare(
      "DELETE FROM openrouter_raw_rows WHERE row_kind = 'endpoint_summary' AND model_id = ?",
    ).run(cachedModel.id);
    assert.equal(
      openRouterCacheHasCurrentShape(db),
      false,
      "Projected shape checks must still reject a selected model with no endpoint summary",
    );
    db.prepare("DELETE FROM openrouter_raw_rows").run();
    insertOpenRouterRawRows(db, cached);
    db.prepare(
      "UPDATE openrouter_raw_rows SET permaslug = 'openai/unrelated-model' WHERE row_kind = 'permaslug_candidate' AND model_id = ?",
    ).run(cachedModel.id);
    assert.equal(
      openRouterCacheHasCurrentShape(db),
      false,
      "Projected shape checks must still reject candidates outside the requested model route",
    );
    db.prepare("DELETE FROM openrouter_raw_rows").run();
    insertOpenRouterRawRows(db, {
      ...cached,
      directory: [
        ...cached.directory,
        { slug: "deepseek/deepseek-chat", permaslug: "deepseek/deepseek-chat-v3-0324" },
      ],
      models: [
        ...cached.models,
        {
          id: "deepseek/deepseek-v3",
          selected_permaslug: null,
          candidate_permaslugs: ["deepseek/deepseek-chat-v3-0324"],
          performance: {},
          route_prices: [],
        },
      ],
    });
    assert.equal(
      openRouterCacheHasCurrentShape(db),
      true,
      "A candidate the fetch resolved through a declared alias keeps the cache current",
    );
    db.prepare("DELETE FROM openrouter_raw_rows").run();
    insertOpenRouterRawRows(db, cached);
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
