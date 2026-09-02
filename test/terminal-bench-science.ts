/** Verifies narrow Terminal-Bench-Science parsing, identity, provenance, and catalog policy. */

import assert from "node:assert/strict";

import {
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
  BENCHMARK_PORTFOLIO,
} from "../src/model-atlas/benchmarks/registry";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/ingest/benchmark-runtimes/observation";
import { insertBenchmarkRawRows } from "../src/model-atlas/ingest/benchmark-runtimes/registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import { SnapshotRowCollector } from "../src/model-atlas/ingest/writers";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import { processTerminalBenchSciencePayload } from "../src/model-atlas/scrapers/benchmarks/terminal-bench-science";

function row({
  model,
  creator,
  agent,
  effort,
  rank,
  accuracy,
  standardError = 2.9,
  status = "display",
}: {
  model: string;
  creator: string;
  agent: string;
  effort: string;
  rank: number;
  accuracy: number;
  standardError?: number;
  status?: string;
}) {
  return {
    rank,
    status,
    updated_at: "2026-08-30T00:08:39.126225+00:00",
    metadata: {
      model_display: { label: model },
      model_org: { label: creator },
      agent_display: { label: agent },
      reasoning_effort: effort,
    },
    metrics: {
      tasks: 210,
      accuracy,
      accuracy_stderr: standardError,
      domain_metrics: { physical: { accuracy: 99 } },
      total_tokens: 123_456,
      total_cost_usd: 789,
    },
  };
}

function payload(rows: unknown[], name = "v0-1-eval") {
  return {
    leaderboard: {
      package: "terminal-bench-science/terminal-bench-science",
      name,
      title: "Terminal-Bench-Science 0.1 Evaluation Results",
      dataset_version_ids: ["version-id"],
    },
    rows,
    task_matrix: { tasks: [{ id: "omitted-task" }] },
  };
}

const rows = processTerminalBenchSciencePayload(
  payload([
    row({
      model: "GPT-5.6 Sol",
      creator: "OpenAI",
      agent: "Codex",
      effort: "max",
      rank: 2,
      accuracy: 22.380952,
    }),
    row({
      model: "Opus 5",
      creator: "Anthropic",
      agent: "Claude Code",
      effort: "max",
      rank: 1,
      accuracy: 30,
      standardError: 3.162278,
    }),
    row({
      model: "Hidden",
      creator: "Test",
      agent: "Test",
      effort: "max",
      rank: 3,
      accuracy: 99,
      status: "hidden",
    }),
    row({
      model: "Invalid",
      creator: "Test",
      agent: "Test",
      effort: "max",
      rank: 4,
      accuracy: 101,
    }),
  ]),
);

assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  benchmark_key: "terminal_bench_science",
  source_url:
    "https://www.terminal-bench-science.ai/api/leaderboard?package=terminal-bench-science%2Fterminal-bench-science&name=v0-1-eval",
  model_id: null,
  model: "GPT-5.6 Sol",
  base_model: "GPT-5.6 Sol",
  reasoning_effort: "max",
  model_creator: "OpenAI",
  rank: 2,
  canonical_value: 0.22381,
  task_run_count: 210,
  total_cost_usd: 789,
  total_tokens: 123_456,
  cost: 3.757143,
  tokens_per_task: 587.885714,
  observed_at: "2026-08-30T00:08:39.126225+00:00",
  metadata: {
    source_revision: "v0-1-eval",
    harness: "Codex",
    score_standard_error: 0.029,
  },
});
assert.equal(rows[1]?.base_model, "Claude Opus 5");
assert.deepEqual(Object.keys(rows[0]?.metadata ?? {}), [
  "source_revision",
  "harness",
  "score_standard_error",
]);

const lookup = buildBenchmarkObservationLookup(rows);
assert.equal(findBenchmarkObservation(["GPT-5.6 Sol"], "max", lookup)?.canonical_value, 0.22381);
assert.equal(findBenchmarkObservation(["Claude Opus 5"], "max", lookup)?.canonical_value, 0.3);
assert.equal(findBenchmarkObservation(["GPT-5.6 Sol"], "high", lookup), null);
assert.deepEqual(buildTaskMetrics(null, { terminal_bench_science: rows[0] }), {
  terminal_bench_science: { cost: 3.757143, tokens: 587.885714 },
});

assert.deepEqual(processTerminalBenchSciencePayload(payload([], "v0-2-eval")), []);

const binding = BENCHMARK_OBSERVATION_BINDINGS.find(
  (candidate) => candidate.benchmark === "terminal_bench_science",
);
assert.ok(binding);
assert.equal(binding?.loader.kind, "terminal_bench_science");
assert.deepEqual(BENCHMARK_PORTFOLIO.terminal_bench_science, {
  group: "frontier",
  benchmarkImportance: 1,
  dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  resourcePolicy: {
    source: "benchmark",
    unit: "per_task",
    tokenMeasure: "tokens",
    qualityCoordinate: "logit",
  },
});
assert.equal(
  BENCHMARK_CATALOG.terminal_bench_science.presentation.column.key,
  "terminalBenchScience",
);

const snapshots = {
  ...Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((candidate) => [
      candidate.sourceRowsKey,
      candidate === binding ? rows : [],
    ]),
  ),
  fetchedAt: Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((candidate) => [
      candidate.sourceDataKey,
      candidate === binding ? 1_788_000_000 : null,
    ]),
  ),
} as SourceSnapshots;
const collector = new SnapshotRowCollector();
insertBenchmarkRawRows(collector, snapshots, BENCHMARK_OBSERVATION_RAW_TABLE);
const persistedRows = collector.records(BENCHMARK_OBSERVATION_RAW_TABLE);
assert.deepEqual(readBenchmarkObservationRawCache(persistedRows, binding), {
  rows,
  fetchedAt: 1_788_000_000,
});
assert.deepEqual(JSON.parse(String(persistedRows[0]?.metadata_json)), {
  source_revision: "v0-1-eval",
  harness: "Codex",
  score_standard_error: 0.029,
});
assert.equal(persistedRows[0]?.task_run_count, 210);
assert.equal(persistedRows[0]?.total_cost_usd, 789);
assert.equal(persistedRows[0]?.total_tokens, 123_456);
assert.equal(
  readBenchmarkObservationRawCache(
    persistedRows.map((row) =>
      row.source_key === "terminal_bench_science"
        ? {
            ...row,
            tokens_per_task: null,
            metadata_json: JSON.stringify({
              source_revision: "v0-1-eval",
              harness: "Codex",
              score_standard_error: 0.029,
            }),
          }
        : row,
    ),
    binding,
  ),
  null,
  "Terminal-Bench-Science cache rows without resource evidence should refetch",
);
