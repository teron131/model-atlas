/** Verify mutable catalog and route prices refresh without discarding omitted cached rows. */

import assert from "node:assert/strict";

import { mergeModelsDevPayload } from "../src/model-atlas/ingest/source-snapshots/models-dev";
import { mergeOpenRouterModel } from "../src/model-atlas/ingest/source-snapshots/openrouter";

const mergedModelsDev = mergeModelsDevPayload(
  {
    openai: {
      name: "OpenAI",
      models: {
        "gpt-5.6-luna": {
          name: "GPT-5.6 Luna",
          cost: { input: 1, output: 6 },
          reasoning: true,
        },
        retired: { name: "Retained missing model" },
      },
    },
  },
  {
    openai: {
      name: "OpenAI",
      models: {
        "gpt-5.6-luna": {
          name: "GPT-5.6 Luna",
          cost: { input: 0.2, output: 1.2 },
        },
      },
    },
  },
  {},
);

assert.deepEqual(mergedModelsDev.openai?.models?.["gpt-5.6-luna"]?.cost, {
  input: 0.2,
  output: 1.2,
});
assert.equal(mergedModelsDev.openai?.models?.["gpt-5.6-luna"]?.reasoning, true);
assert.equal(mergedModelsDev.openai?.models?.retired?.name, "Retained missing model");

const mergedOpenRouter = mergeOpenRouterModel(
  {
    id: "openai/gpt-5.6-luna",
    selected_permaslug: "openai/gpt-5.6-luna",
    candidate_permaslugs: ["openai/gpt-5.6-luna"],
    performance: {
      summary: {
        throughput_tokens_per_second_median: 100,
        latency_seconds_median: 1,
        e2e_latency_seconds_median: 2,
      },
    },
    pricing: { data: { weightedInputPrice: 0.4, weightedOutputPrice: 6 } },
  },
  {
    id: "openai/gpt-5.6-luna",
    selected_permaslug: null,
    candidate_permaslugs: [],
    performance: {},
    pricing: { data: { weightedInputPrice: 0.08, weightedOutputPrice: 1.2 } },
  },
);

assert.deepEqual(mergedOpenRouter.pricing, {
  data: { weightedInputPrice: 0.08, weightedOutputPrice: 1.2 },
});
assert.deepEqual(mergedOpenRouter.performance, {
  summary: {
    throughput_tokens_per_second_median: 100,
    latency_seconds_median: 1,
    e2e_latency_seconds_median: 2,
  },
});
assert.equal(mergedOpenRouter.selected_permaslug, "openai/gpt-5.6-luna");
