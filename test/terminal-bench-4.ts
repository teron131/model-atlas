/** Verifies Terminal-Bench 4.0 parsing and strongest-agent scoring projection. */

import assert from "node:assert/strict";

import { BENCHMARK_CATALOG, BENCHMARK_PORTFOLIO } from "../src/model-atlas/benchmarks/registry";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import {
  buildTerminalBench4Map,
  processTerminalBench4Payload,
} from "../src/model-atlas/scrapers/benchmarks/terminal-bench-4";

function row({
  model,
  agent,
  effort,
  accuracy,
  ci95HalfWidth = 3.4,
  taskRunCount = 330,
  totalCostUsd = 2_541.7,
  totalTokens = 4_409_948_969,
  status = "display",
}: {
  model: string;
  agent: string;
  effort: string;
  accuracy: number;
  ci95HalfWidth?: number;
  taskRunCount?: number;
  totalCostUsd?: number;
  totalTokens?: number;
  status?: string;
}) {
  return {
    status,
    metadata: {
      model_display: { label: model },
      agent_display: { label: agent },
      reasoning_effort: effort,
    },
    metrics: {
      accuracy,
      accuracy_ci95_half_width: ci95HalfWidth,
      n_trials: taskRunCount,
      total_cost_usd: totalCostUsd,
      total_tokens: totalTokens,
    },
  };
}

function payload(rows: unknown[], title = "Terminal-Bench 4.0") {
  return {
    leaderboard: {
      package: "terminal-bench/terminal-bench",
      name: "4-0-0",
      title,
      dataset_version_ids: ["version-id"],
    },
    rows,
  };
}

const rows = processTerminalBench4Payload(
  payload([
    row({
      model: "GPT-5.6 Sol",
      agent: "Codex",
      effort: "max",
      accuracy: 37.27,
    }),
    row({
      model: "Grok 4.6",
      agent: "Grok Build",
      effort: "high",
      accuracy: 20.3,
      ci95HalfWidth: 3.09,
    }),
    row({
      model: "Hidden",
      agent: "Test",
      effort: "max",
      accuracy: 99,
      status: "hidden",
    }),
    row({
      model: "Invalid",
      agent: "Test",
      effort: "max",
      accuracy: 101,
    }),
    row({
      model: "Incomplete",
      agent: "Test",
      effort: "max",
      accuracy: 50,
      taskRunCount: 329,
    }),
  ]),
);

assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  revision: "4_0_0",
  model: "GPT-5.6 Sol (max)",
  base_model: "GPT-5.6 Sol",
  reasoning_effort: "max",
  harness: "Codex",
  score: 0.3727,
  score_ci95_half_width: 0.034,
  task_run_count: 330,
  total_cost_usd: 2_541.7,
  total_tokens: 4_409_948_969,
  cost_per_task_usd: 7.702121,
  tokens_per_task: 13_363_481.724242,
});
assert.equal(rows[1]?.score, 0.203);
assert.equal(rows[1]?.score_ci95_half_width, 0.0309);

const rowsByModelName = buildTerminalBench4Map(rows);
assert.equal(rowsByModelName.get("gpt-5-6-sol")?.harness, "Codex");
assert.equal(rowsByModelName.get("grok-4-6-high")?.harness, "Grok Build");
assert.deepEqual(buildTaskMetrics(null, { terminal_bench_4: rows[0] }), {
  terminal_bench_4: { cost: 7.702121, tokens: 13_363_481.724242 },
});
assert.deepEqual(BENCHMARK_PORTFOLIO.terminal_bench_4.resourcePolicy, {
  source: "benchmark",
  unit: "per_task",
  tokenMeasure: "tokens",
  qualityCoordinate: "logit",
});
assert.deepEqual(BENCHMARK_CATALOG.terminal_bench_4.source.inputs[0]?.roles, [
  "observation",
  "resource",
]);
assert.deepEqual(
  BENCHMARK_CATALOG.terminal_bench_4.presentation.taskMetricColumns.map((column) => column.key),
  ["terminalBench4Cost", "terminalBench4Tokens"],
);

const strongestAgentRows = buildTerminalBench4Map([
  {
    ...rows[0]!,
    harness: "Weaker",
    score: 0.3,
  },
  {
    ...rows[0]!,
    harness: "Stronger",
    score: 0.4,
    score_ci95_half_width: 0.04,
  },
  {
    ...rows[0]!,
    harness: "Stronger with lower uncertainty",
    score: 0.4,
    score_ci95_half_width: 0.02,
  },
]);
assert.equal(strongestAgentRows.get("gpt-5-6-sol-max")?.harness, "Stronger with lower uncertainty");

const claudeAliasRows = buildTerminalBench4Map([
  {
    revision: "4_0_0",
    model: "Opus 5 (max)",
    base_model: "Opus 5",
    reasoning_effort: "max",
    harness: "Claude Code",
    score: 0.5182,
    score_ci95_half_width: 0.0339,
    task_run_count: 330,
    total_cost_usd: 5_969.11,
    total_tokens: 6_527_147_637,
    cost_per_task_usd: 18.088212,
    tokens_per_task: 19_779_235.263636,
  },
]);
assert.equal(claudeAliasRows.get("claude-opus-5-max")?.model, "Opus 5 (max)");
assert.equal(claudeAliasRows.get("claude-opus-5")?.score, 0.5182);

assert.deepEqual(processTerminalBench4Payload(payload([], "Terminal-Bench 4.1")), []);
