/** Verifies Terminal-Bench 3.0 raw model-agent persistence and public benchmark payload wiring. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import { openDatabase, removeDatabaseFiles } from "../src/model-atlas/database/schema";
import { insertBenchmarkRawRows } from "../src/model-atlas/ingest/benchmark-runtimes/registry";
import { readTerminalBench3RawCache } from "../src/model-atlas/ingest/benchmark-runtimes/terminal-bench-3";
import { SNAPSHOT_TABLES } from "../src/model-atlas/ingest/source-registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import { insertModelBenchmarks, insertModels } from "../src/model-atlas/ingest/writers";
import { benchmarkRowsFromDb } from "../src/model-atlas/pipeline/benchmark-rows";
import type { TerminalBench3ModelAgentRow } from "../src/model-atlas/scrapers/benchmarks/terminal-bench-3";
import { benchmarkObservationRowGroups } from "./model-atlas-fixtures";

const rows: TerminalBench3ModelAgentRow[] = [
  {
    revision: "3_0_0",
    model: "Claude Fable 5 (xhigh)",
    base_model: "Claude Fable 5",
    reasoning_effort: "xhigh",
    harness: "mini-SWE-agent",
    score: 0.4118,
    score_standard_error: 0.0163,
  },
  {
    revision: "3_0_0",
    model: "Claude Fable 5 (max)",
    base_model: "Claude Fable 5",
    reasoning_effort: "max",
    harness: "mini-SWE-agent",
    score: 0.4353,
    score_standard_error: 0.0165,
  },
];
const snapshots = {
  terminalBench3Rows: rows,
  fetchedAt: { terminalBench3: 1_800_000_000 },
} satisfies Pick<SourceSnapshots, "terminalBench3Rows"> & {
  fetchedAt: Pick<SourceSnapshots["fetchedAt"], "terminalBench3">;
};
const databasePath = ".cache/test-database-terminal-bench-3.sqlite";

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
      SNAPSHOT_TABLES.terminal_bench_3,
    );
    const rawRows = db.prepare("SELECT * FROM terminal_bench_3_raw_rows ORDER BY row_index").all();
    assert.equal(rawRows.length, 2);
    assert.equal(rawRows[1]?.revision, "3_0_0");
    assert.equal(rawRows[1]?.base_model, "Claude Fable 5");
    assert.equal(rawRows[1]?.reasoning_effort, "max");
    assert.equal(rawRows[1]?.harness, "mini-SWE-agent");
    assert.equal(rawRows[1]?.score, 0.4353);
    assert.equal(rawRows[1]?.score_standard_error, 0.0165);
    assert.deepEqual(readTerminalBench3RawCache(db), {
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
      terminalBench3Rows: rawRows,
      valsIndexRows: [],
      vendingBench2Rows: [],
    });
    assert.deepEqual(benchmarkRows.terminal_bench_3, [
      {
        id: "Claude Fable 5",
        identity: "Claude Fable 5",
        label: "Claude Fable 5 (max)",
        provider: null,
        value: 0.4353,
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
        benchmarks: { terminal_bench_3: 0.4353 },
        benchmark_dates: { terminal_bench_3: "2026-07-30" },
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
  assert.equal(payload.models[0]?.benchmarks?.terminal_bench_3, 0.4353);
  assert.deepEqual(payload.metadata.scoring.benchmark_portfolio.terminal_bench_3, {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  });
  assert.equal(payload.metadata.scoring.selected_benchmark_keys.includes("terminal_bench_3"), true);
} finally {
  await removeDatabaseFiles(databasePath);
}
