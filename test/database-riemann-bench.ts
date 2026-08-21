/** Verifies Riemann-bench model payloads and raw-source URL cache round-trips. */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readDatabasePayload } from "../src/model-atlas/database";
import { openDatabase } from "../src/model-atlas/database/schema";
import { insertBenchmarkRawRows } from "../src/model-atlas/ingest/benchmark-runtimes/registry";
import {
  readRiemannBenchRawCache,
  riemannBenchRuntime,
} from "../src/model-atlas/ingest/benchmark-runtimes/riemann-bench";
import { SNAPSHOT_TABLES } from "../src/model-atlas/ingest/source-registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import { insertModelBenchmarks, insertModels } from "../src/model-atlas/ingest/writers";

const tempDir = await mkdtemp(join(tmpdir(), "model-atlas-riemann-bench-"));
const databasePath = join(tempDir, "database.sqlite");
const customSourceUrl = "https://example.test/custom-riemann-bench";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(`
	<div class="txt fs-12">Last updated 07/02/2026</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<img alt="Anthropic logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">Claude Fable 5 (Adaptive/Max)</div>
		<div data-score="" fs-list-field="foundational-score">61</div><div>%</div>
	</div>
	<div role="listitem" class="renamed-ranking-row">
		<img alt="Kimi logo" />
		<div class="head-rank-table-brand">Kimi</div>
		<div class="head-rank-table-name">K3</div>
		<div data-score="" fs-list-field="foundational-score">38</div><div>%</div>
	</div>
`);
try {
  const reconciledSnapshot = await riemannBenchRuntime.snapshot(
    {
      rows: [
        {
          provider: "Anthropic",
          model: "Claude Fable 5 (Max reasoning)",
          score: 0.6,
          last_updated: "07/01/2026",
        },
        {
          provider: "Kimi",
          model: "K3",
          score: 0.37,
          last_updated: "07/01/2026",
        },
      ],
      fetchedAt: 1_800_000_000,
      sourceUrl: "https://surgehq.ai/leaderboards/riemann-bench",
    },
    {
      last_fetch_epoch_seconds: 1_800_000_000,
      source_input_count: 2,
      cache_hit: false,
      refreshed: true,
    },
    {},
    new Map(),
    1_800_000_100,
  );
  assert.deepEqual(reconciledSnapshot.riemannBenchModelScoreRows, [
    {
      provider: "Anthropic",
      model: "Claude Fable 5 (Adaptive/Max)",
      score: 0.6,
      last_updated: "07/01/2026",
    },
    {
      provider: "Kimi",
      model: "Kimi K3",
      score: 0.37,
      last_updated: "07/01/2026",
    },
  ]);
  assert.deepEqual(
    reconciledSnapshot.sourceStatus.sourceRowStates.map((state) => state.status),
    ["active", "active"],
  );
} finally {
  globalThis.fetch = originalFetch;
}

try {
  const db = await openDatabase(databasePath);
  try {
    db.prepare("INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)").run(
      1_800_000_001,
    );
    const finalRows = [
      {
        id: "example/math-model",
        provider: "example",
        name: "Math Model",
        logo: "https://example.com/logo.svg",
        modalities: { input: ["text"] },
        benchmarks: { riemann_bench: 0.42 },
        benchmark_dates: { riemann_bench: "2026-07-30" },
        component_scores: {
          intelligence_score: 70,
          agentic_score: 10,
          speed_score: 50,
        },
        scores: {
          intelligence_score: 90,
          agentic_score: 20,
          speed_score: 50,
          value_score: 65,
        },
      },
    ];
    insertModels(db, finalRows);
    insertModelBenchmarks(db, finalRows);
    db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(0, 1_800_000_000, customSourceUrl, "Example", "Custom Math Model", 0.62, "05/27/2026");
    const cachedRows = readRiemannBenchRawCache(db);
    assert.equal(
      cachedRows?.sourceUrl,
      customSourceUrl,
      "cache reconstruction should accept a consistent custom source URL",
    );
    const cachedSnapshot = await riemannBenchRuntime.snapshot(
      cachedRows,
      {
        last_fetch_epoch_seconds: 1_800_000_000,
        source_input_count: 1,
        cache_hit: true,
        refreshed: false,
      },
      {},
      new Map(),
      1_800_000_100,
    );
    assert.equal(cachedSnapshot.riemannBenchSourceUrl, customSourceUrl);

    db.prepare("DELETE FROM riemann_bench_raw_rows").run();
    insertBenchmarkRawRows(
      db,
      {
        riemannBenchModelScoreRows: cachedSnapshot.riemannBenchModelScoreRows,
        riemannBenchSourceUrl: cachedSnapshot.riemannBenchSourceUrl,
        fetchedAt: {
          riemannBench: cachedSnapshot.sourceStatus.fetchedAt,
        },
      } as unknown as SourceSnapshots,
      SNAPSHOT_TABLES.riemann_bench,
    );
    assert.equal(
      db.prepare("SELECT url FROM riemann_bench_raw_rows WHERE row_index = 0").get()?.url,
      customSourceUrl,
      "the writer should persist snapshot provenance instead of recreating a default URL",
    );
    assert.equal(readRiemannBenchRawCache(db)?.sourceUrl, customSourceUrl);

    db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
      1,
      1_800_000_000,
      "https://example.test/different-riemann-bench",
      "Example",
      "Conflicting Math Model",
      0.41,
      null,
    );
    assert.equal(
      readRiemannBenchRawCache(db),
      null,
      "cache reconstruction should reject a run with mixed source URLs",
    );
  } finally {
    db.close();
  }

  const payload = readDatabasePayload(databasePath);
  assert.equal(payload.models.length, 1);
  assert.equal(
    payload.models[0]?.benchmarks?.riemann_bench,
    0.42,
    "Riemann-bench should survive the normalized final-model DB payload path",
  );
  assert.equal(
    payload.metadata.available_metrics.benchmark_keys.includes("riemann_bench"),
    true,
    "Riemann-bench should be listed as a DB-backed available benchmark key",
  );
  assert.equal(
    "deep_swe" in payload,
    false,
    "Database payloads should not expose raw DeepSWE source rows",
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
