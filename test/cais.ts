/** Protect CAIS component extraction, weighted aggregation, and overlap-aware index policy. */

import assert from "node:assert/strict";

import { residualIndexBreadth } from "../src/model-atlas/benchmarks/index-policy";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../src/model-atlas/benchmarks/registry";
import {
  getCaisDashboardStats,
  processCaisDashboardModels,
} from "../src/model-atlas/sources/cais/results";
import { benchmarkObservationSource } from "../src/model-atlas/sources/observations/load";

const sourceUrl = "https://dashboard.safe.ai/";
const models = [
  {
    name: "Fable 5.1",
    id: "claude-fable-5-1-high",
    provider: "anthropic",
    releaseDate: "2026-09-01",
    scores: {
      hle: 54.6,
      textquests: 56.6,
      enigmaeval: 44.2,
      erqa: 82.3,
      intphys2: 67.7,
      mindcube: 84.5,
      spatialviz: 77.9,
    },
  },
  {
    name: "Fable 5",
    id: "claude-fable-5-high",
    provider: "anthropic",
    releaseDate: "2026-06-09",
    scores: {
      hle: 52.72,
      textquests: 56.08,
      enigmaeval: 41.3,
      erqa: 70,
      intphys2: 67.06,
      mindcube: 80,
      spatialviz: 70,
    },
    scoreNotes: {
      hle: "Refused questions fall back to Opus-5.",
    },
  },
];

const textRows = processCaisDashboardModels(models, "textquests", sourceUrl, "fixture");
assert.equal(textRows.length, 2);
assert.equal(
  processCaisDashboardModels(
    [{ ...models[0], name: "Opus 4.7", id: "opus-4-7-adaptive-64k" }],
    "textquests",
    sourceUrl,
    "fixture",
  )[0]?.model,
  "Claude Opus 4.7 (high)",
);
assert.equal(textRows[0]?.observed_at, null);
assert.equal(textRows[0]?.metadata.model_release_date, "2026-09-01");
assert.deepEqual(
  textRows.map(({ model, base_model, reasoning_effort, canonical_value }) => ({
    model,
    base_model,
    reasoning_effort,
    canonical_value,
  })),
  [
    {
      model: "Claude Fable 5.1 (high)",
      base_model: "Claude Fable 5.1",
      reasoning_effort: "high",
      canonical_value: 0.566,
    },
    {
      model: "Claude Fable 5 (high)",
      base_model: "Claude Fable 5",
      reasoning_effort: "high",
      canonical_value: 0.5608,
    },
  ],
);

const indexRows = processCaisDashboardModels(
  models,
  "cais_capabilities_index",
  sourceUrl,
  "fixture",
);
assert.deepEqual(
  indexRows.map(({ model }) => model),
  ["Claude Fable 5.1 (high)", "Claude Fable 5 (high)"],
  "A disclosed fallback composite scores like any other row, since fallback is part of the served model",
);
assert.equal(indexRows[0]?.canonical_value, 0.668286);
assert.equal(indexRows[0]?.metadata.component_count, 7);
assert.equal(
  processCaisDashboardModels(
    [{ ...models[0], scoreNotes: { hle: "Refusals are graded incorrect." } }],
    "cais_capabilities_index",
    sourceUrl,
    "fixture",
  ).length,
  1,
);
assert.equal(residualIndexBreadth("cais_capabilities_index"), 7);
assert.equal(residualIndexBreadth("cais_capabilities_index", ["textquests"]), 6);
assert.equal(
  residualIndexBreadth("cais_capabilities_index", [
    "enigmaeval",
    "erqa",
    "hle",
    "intphys2",
    "mindcube",
    "spatialviz",
    "textquests",
  ]),
  0,
);

// Exercise the embedded JavaScript string, shared fetch, and unavailable-source boundary together.
const originalFetch = globalThis.fetch;
const requests: string[] = [];
const note = 'A model\'s answer contains "quotes" and a \\ separator.';
const embeddedModels = [{ ...models[0], scoreNotes: { textquests: note } }];
const encoded = JSON.stringify(embeddedModels).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  return new Response(
    url.endsWith("matrix.js")
      ? `JSON.parse('[]');JSON.parse('${encoded}')`
      : '<script src="/matrix.js"></script>',
  );
};
try {
  const [component, aggregate] = await Promise.all([
    getCaisDashboardStats("textquests", { sourceUrl }),
    getCaisDashboardStats("cais_capabilities_index", { sourceUrl }),
  ]);
  assert.deepEqual(requests, [sourceUrl, `${sourceUrl}matrix.js`]);
  assert.equal(component.data[0]?.metadata.score_note, note);
  assert.equal(aggregate.data[0]?.canonical_value, 0.668286);
  globalThis.fetch = async () => new Response("unavailable", { status: 500 });
  const textquests = BENCHMARK_OBSERVATION_BINDINGS.find(
    (binding) => binding.benchmark === "textquests",
  );
  assert.ok(textquests);
  assert.deepEqual(await benchmarkObservationSource(textquests).fetchRows(), {
    fetched_at_epoch_seconds: null,
    data: [],
  });
} finally {
  globalThis.fetch = originalFetch;
}
