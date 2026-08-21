/** Verifies Frontier-Bench v0.1 parsing and strongest-agent scoring projection. */

import assert from "node:assert/strict";

import {
  buildFrontierBenchMap,
  processFrontierBenchPayload,
} from "../src/model-atlas/scrapers/benchmarks/frontier-bench";

function row({
  model,
  agent,
  effort,
  accuracy,
  standardError = 1.6,
  status = "display",
}: {
  model: string;
  agent: string;
  effort: string;
  accuracy: number;
  standardError?: number;
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
      accuracy_stderr: standardError,
    },
  };
}

function payload(rows: unknown[], title = "FRONTIER-BENCH V0.1") {
  return {
    leaderboard: {
      package: "frontier-bench/frontier-bench",
      name: "frontier-bench",
      title,
      dataset_version_ids: ["version-id"],
    },
    rows,
  };
}

const rows = processFrontierBenchPayload(
  payload([
    row({
      model: "GPT-5.6 Sol",
      agent: "Codex",
      effort: "max",
      accuracy: 34.42,
    }),
    row({
      model: "Grok 4.5",
      agent: "Cursor CLI",
      effort: "xhigh",
      accuracy: 17.84,
      standardError: 1.44,
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
  ]),
);

assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  revision: "v0_1",
  model: "GPT-5.6 Sol (max)",
  base_model: "GPT-5.6 Sol",
  reasoning_effort: "max",
  harness: "Codex",
  score: 0.3442,
  score_standard_error: 0.016,
});
assert.equal(rows[1]?.score, 0.1784);
assert.equal(rows[1]?.score_standard_error, 0.0144);

const rowsByModelName = buildFrontierBenchMap(rows);
assert.equal(rowsByModelName.get("gpt-5-6-sol")?.harness, "Codex");
assert.equal(rowsByModelName.get("grok-4-5-xhigh")?.harness, "Cursor CLI");

const strongestAgentRows = buildFrontierBenchMap([
  {
    ...rows[0]!,
    harness: "Weaker",
    score: 0.3,
  },
  {
    ...rows[0]!,
    harness: "Stronger",
    score: 0.4,
    score_standard_error: 0.02,
  },
  {
    ...rows[0]!,
    harness: "Stronger with lower uncertainty",
    score: 0.4,
    score_standard_error: 0.01,
  },
]);
assert.equal(strongestAgentRows.get("gpt-5-6-sol-max")?.harness, "Stronger with lower uncertainty");

const claudeAliasRows = buildFrontierBenchMap([
  {
    revision: "v0_1",
    model: "Opus 5 (max)",
    base_model: "Opus 5",
    reasoning_effort: "max",
    harness: "mini-SWE-agent",
    score: 0.4353,
    score_standard_error: 0.0165,
  },
]);
assert.equal(claudeAliasRows.get("claude-opus-5-max")?.model, "Opus 5 (max)");
assert.equal(claudeAliasRows.get("claude-opus-5")?.score, 0.4353);

assert.deepEqual(processFrontierBenchPayload(payload([], "FRONTIER-BENCH V0.2")), []);
