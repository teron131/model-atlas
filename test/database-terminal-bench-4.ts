/** Verifies Terminal-Bench 4.0 raw model-agent persistence and public benchmark payload wiring. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import { insertBenchmarkRawRows } from "../src/model-atlas/ingest/benchmark-runtimes/registry";
import { readTerminalBench4RawCache } from "../src/model-atlas/ingest/benchmark-runtimes/terminal-bench-4";
import { SNAPSHOT_TABLES } from "../src/model-atlas/ingest/source-registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import { insertModelBenchmarks, insertModels } from "../src/model-atlas/ingest/writers";
import { benchmarkRowsFromDb } from "../src/model-atlas/pipeline/benchmark-rows";
import type { TerminalBench4ModelAgentRow } from "../src/model-atlas/scrapers/benchmarks/terminal-bench-4";
import { benchmarkObservationRowGroups } from "./model-atlas-fixtures";

const rows: TerminalBench4ModelAgentRow[] = [
  {
    revision: "4_0_0",
    model: "Claude Fable 5 (xhigh)",
    base_model: "Claude Fable 5",
    reasoning_effort: "xhigh",
    harness: "Claude Code",
    score: 0.4118,
    score_ci95_half_width: 0.0385,
  },
  {
    revision: "4_0_0",
    model: "Claude Fable 5 (max)",
    base_model: "Claude Fable 5",
    reasoning_effort: "max",
    harness: "Claude Code",
    score: 0.4455,
    score_ci95_half_width: 0.0385,
  },
];
const snapshots = {
  terminalBench4Rows: rows,
  fetchedAt: { terminalBench4: 1_800_000_000 },
} satisfies Pick<SourceSnapshots, "terminalBench4Rows"> & {
  fetchedAt: Pick<SourceSnapshots["fetchedAt"], "terminalBench4">;
};
const databasePath = ".cache/test-database-terminal-bench-4.sqlite";

await removeDatabaseFiles(databasePath);
try {
  const db = await openDatabase(databasePath);
  try {
    db.prepare("INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)").run(
      1_800_000_001,
    );
    insertBenchmarkRawRows(
      db,
      snapshots as unknown as SourceSnapshots,
      SNAPSHOT_TABLES.terminal_bench_4,
    );
    const rawRows = db.prepare("SELECT * FROM terminal_bench_4_raw_rows ORDER BY row_index").all();
    assert.equal(rawRows.length, 2);
    assert.equal(rawRows[1]?.revision, "4_0_0");
    assert.equal(rawRows[1]?.base_model, "Claude Fable 5");
    assert.equal(rawRows[1]?.reasoning_effort, "max");
    assert.equal(rawRows[1]?.harness, "Claude Code");
    assert.equal(rawRows[1]?.score, 0.4455);
    assert.equal(rawRows[1]?.score_ci95_half_width, 0.0385);
    assert.deepEqual(readTerminalBench4RawCache(db), {
      rows,
      fetchedAt: 1_800_000_000,
    });

    const benchmarkRows = benchmarkRowsFromDb({
      artificialAnalysisRows: [],
      agentArenaRows: [],
      agentsLastExamRows: [],
      aleBenchRows: [],
      blueprintBenchRows: [],
      ...benchmarkObservationRowGroups(),
      cursorBenchRows: [],
      deepSWERows: [],
      frontierCodeRows: [],
      gdpPdfRows: [],
      harveyLabRows: [],
      riemannBenchRows: [],
      terminalBench4Rows: rawRows,
      valsIndexRows: [],
      vendingBench2Rows: [],
    });
    assert.deepEqual(benchmarkRows.terminal_bench_4, [
      {
        id: "Claude Fable 5",
        identity: "Claude Fable 5",
        label: "Claude Fable 5 (max)",
        provider: null,
        value: 0.4455,
      },
    ]);

    const finalRows = [
      {
        id: "anthropic/claude-fable-5",
        provider: "anthropic",
        name: "Claude Fable 5",
        reasoning_effort: "max",
        logo: "https://example.com/logo.svg",
        modalities: { input: ["text"] },
        benchmarks: { terminal_bench_4: 0.4455 },
        benchmark_dates: { terminal_bench_4: "2026-08-28" },
        component_scores: {
          intelligence_score: 70,
          agentic_score: 80,
          speed_score: 60,
        },
        scores: {
          intelligence_score: 70,
          agentic_score: 80,
          speed_score: 60,
          value_score: 65,
        },
      },
    ];
    insertModels(db, finalRows);
    insertModelBenchmarks(db, finalRows);
  } finally {
    db.close();
  }

  const payload = readDatabasePayload(databasePath);
  assert.equal(payload.models[0]?.benchmarks?.terminal_bench_4, 0.4455);
  assert.deepEqual(payload.metadata.scoring.benchmark_portfolio.terminal_bench_4, {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  });
  assert.equal(payload.metadata.scoring.selected_benchmark_keys.includes("terminal_bench_4"), true);
} finally {
  await removeDatabaseFiles(databasePath);
}
