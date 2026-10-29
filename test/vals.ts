/** Verify external Vals JSON loading, version-safe index persistence, and failed-fetch cache behavior. */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { reportedIndexBenchmarkCount } from "../src/model-atlas/benchmarks/index-policy";
import { loadSchemaSql } from "../src/model-atlas/database/schema";
import { schemaReconciliationPlan } from "../src/model-atlas/database/schema-reconciliation";
import type { SourceSnapshots } from "../src/model-atlas/sources/types";
import {
  getValsIndexStats,
  processValsIndexView,
  VALS_INDEX_LEADERBOARD_URL,
} from "../src/model-atlas/sources/vals/index-benchmark";
import { valsIndexRuntime } from "../src/model-atlas/sources/vals/index-runtime";
import { getValsBenchmarkStats } from "../src/model-atlas/sources/vals/results";

const components = [
  "finance_agent",
  "emb",
  "terminal_bench_4",
  "vibe_code_bench",
  "code_migration",
  "legal_research",
  "legal_agent_benchmark",
  "tax_agent_bench",
];
const indexView = {
  metadata: {
    benchmark: "Vals Index",
    slug: "vals_index",
    version: "2.2",
    updated: "2026-10-07",
    dataset_type: "private",
    runner: "external",
    mode: "agentic",
    tasks: Object.fromEntries(["overall", ...components].map((task) => [task, task])),
  },
  tasks: {
    overall: {
      "anthropic/claude-sonnet-5-5": {
        accuracy: 67.037,
        provider: "Anthropic",
        stderr: 0.9,
        harness: "Claude Code",
      },
    },
    ...Object.fromEntries(
      components.map((task) => [
        task,
        {
          "anthropic/claude-sonnet-5-5": { accuracy: 60, provider: "Anthropic" },
        },
      ]),
    ),
  },
};
const index = processValsIndexView(indexView);
assert.equal(index.task_rows.length, 9);
assert.equal(index.model_scores[0]?.score, 0.67037);
assert.equal(index.model_scores[0]?.observed_at, "2026-10-07");
assert.equal(
  reportedIndexBenchmarkCount(
    { scoring_sources: { vals_index: index.model_scores[0] } },
    "vals_index",
  ),
  8,
);
assert.equal(JSON.parse(String(index.model_scores[0]?.metadata.source_result_json)).stderr, 0.9);
assert.deepEqual(
  processValsIndexView({
    ...indexView,
    metadata: { ...indexView.metadata, version: "2.3" },
  }).model_scores.map((row) => row.metadata.benchmark_version),
  ["2.3"],
  "A new version with the same eight-component basket is adopted from the same page",
);
const { tax_agent_bench: _tax, ...oldTaskLabels } = indexView.metadata.tasks;
assert.deepEqual(
  processValsIndexView({ ...indexView, metadata: { ...indexView.metadata, tasks: oldTaskLabels } })
    .model_scores,
  [],
  "The current version requires its eight-component composition",
);

const db = new DatabaseSync(":memory:");
try {
  const schemaSql = await loadSchemaSql();
  db.exec(schemaSql);
  valsIndexRuntime.write(db, {
    valsIndexTaskScoreRows: index.task_rows,
    fetchedAt: { valsIndex: 1_791_324_553 },
  } as SourceSnapshots);
  const cached = valsIndexRuntime.readCache(db);
  assert.ok(cached);
  assert.deepEqual(cached.rows, index.task_rows);
  assert.equal(cached.fetchedAt, 1_791_324_553);
  db.exec("UPDATE vals_index_raw_rows SET metadata_json = '{}'");
  assert.equal(
    valsIndexRuntime.readCache(db),
    null,
    "Unversioned checkpoint rows cannot supply the current index",
  );
  db.exec(
    'UPDATE vals_index_raw_rows SET metadata_json = \'{"benchmark_version":"2","benchmark_count":7}\'',
  );
  assert.equal(
    valsIndexRuntime.readCache(db),
    null,
    "Baskets of another size cannot survive through cache fallback",
  );

  const currentDefinition = schemaSql.match(
    /CREATE TABLE IF NOT EXISTS vals_index_raw_rows \([\s\S]*?\n\);/,
  )?.[0];
  assert.ok(currentDefinition);
  const legacyDefinition = currentDefinition.replace(
    "\tobserved_at TEXT,\n\tmetadata_json TEXT NOT NULL DEFAULT '{}',\n",
    "",
  );
  assert.notEqual(legacyDefinition, currentDefinition);
  db.exec("DROP TABLE vals_index_raw_rows");
  db.exec(legacyDefinition);
  db.prepare(
    "INSERT INTO vals_index_raw_rows (row_index, url, task, task_label, row_kind, model_id, model, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    0,
    VALS_INDEX_LEADERBOARD_URL,
    "overall",
    "Overall",
    "overall",
    "test/legacy",
    "Legacy",
    0.64,
  );
  const catalog = db
    .prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index')")
    .all();
  const migration = schemaReconciliationPlan(schemaSql, catalog, []);
  for (const statement of migration.statements) db.exec(statement);
  const migrated = db.prepare("SELECT score, metadata_json FROM vals_index_raw_rows").get();
  assert.equal(migrated?.score, 0.64, "Schema migration preserves the historical raw fact");
  assert.equal(
    migrated?.metadata_json,
    "{}",
    "Migration cannot invent a version for unversioned evidence",
  );
  assert.equal(valsIndexRuntime.readCache(db), null);
} finally {
  db.close();
}

function loaderPage(path: string): string {
  const props = JSON.stringify({ benchmarkViewUrl: [0, path] }).replaceAll('"', "&quot;");
  return `<astro-island component-url="/_astro/BenchmarkViewLoader.fixture.js" props="${props}"></astro-island>`;
}

const genericUrl = "https://www.vals.ai/benchmarks/programbench";
const genericAsset = "https://www.vals.ai/_astro/benchmark_view_programbench.fixture.json";
const indexAsset = "https://www.vals.ai/_astro/benchmark_view_vals_index.fixture.json";
const bodies = new Map([
  [genericUrl, loaderPage("/_astro/benchmark_view_programbench.fixture.json")],
  [
    genericAsset,
    JSON.stringify({
      metadata: { version: "1", updated: "2026-10-08" },
      tasks: {
        almost: { "openai/gpt-6-astra": { accuracy: 42.3, reasoning_effort: "max", stderr: 2.1 } },
        strict: { "openai/gpt-6-astra": { accuracy: 3 } },
      },
    }),
  ],
  [VALS_INDEX_LEADERBOARD_URL, loaderPage("/_astro/benchmark_view_vals_index.fixture.json")],
  [indexAsset, JSON.stringify(indexView)],
]);
const requests: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  const body = bodies.get(url);
  return new Response(body ?? "missing", { status: body == null ? 404 : 200 });
};
try {
  const definition = {
    benchmarkKey: "programbench",
    canonicalTask: "almost",
    sourceUrl: genericUrl,
  };
  const generic = await getValsBenchmarkStats(definition);
  assert.notEqual(generic.fetched_at_epoch_seconds, null);
  assert.equal(generic.data.length, 1);
  assert.equal(generic.data[0]?.canonical_value, 0.423);
  assert.equal(generic.data[0]?.reasoning_effort, "max");
  assert.deepEqual(requests, [genericUrl, genericAsset]);
  const fetchedIndex = await getValsIndexStats();
  assert.notEqual(fetchedIndex.fetched_at_epoch_seconds, null);
  assert.deepEqual(fetchedIndex.model_scores, index.model_scores);
  bodies.set(genericAsset, JSON.stringify({ metadata: {}, tasks: {} }));
  assert.deepEqual(await getValsBenchmarkStats(definition), {
    fetched_at_epoch_seconds: null,
    data: [],
  });
  bodies.delete(indexAsset);
  const failedIndex = await getValsIndexStats();
  assert.equal(failedIndex.fetched_at_epoch_seconds, null);
  assert.deepEqual(failedIndex.model_scores, []);
} finally {
  globalThis.fetch = originalFetch;
}
