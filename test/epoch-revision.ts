/** Epoch's newest task edition replaces older editions in fresh observations and source caches, while pooling its patch revisions. */

import assert from "node:assert/strict";

import { BENCHMARK_STANDARD_SOURCES } from "../src/model-atlas/benchmarks/catalog";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../src/model-atlas/benchmarks/registry";
import { epochBenchmarkObservationRows } from "../src/model-atlas/sources/epoch/results";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/sources/observations/cache";

const loader = BENCHMARK_STANDARD_SOURCES.frontiermath_tier_4.loader;
const binding = BENCHMARK_OBSERVATION_BINDINGS.find(
  (candidate) => candidate.benchmark === "frontiermath_tier_4",
);
assert.ok(binding);

const rows = ["2.0.0", "2.1.0"].map((version) => ({
  id_runs: `tier4-${version}`,
  task: loader.task,
  "task version": version,
  Status: "Success",
  id_model_version: "gpt-6-1-sol",
  "Unique display name": "GPT-6.1 Sol (max)",
  Organization: "OpenAI",
  mean_score: version === "2.1.0" ? "1" : "0.9",
}));

const observations = epochBenchmarkObservationRows(
  rows,
  "frontiermath_tier_4",
  loader.task,
  loader.eligibility,
);
assert.deepEqual(
  observations.map((row) => row.metadata.task_version),
  ["2.1.0"],
);
assert.equal(observations[0]?.canonical_value, 1);

const rawRows = rows.map((run, index) => {
  const row = epochBenchmarkObservationRows(
    [run],
    "frontiermath_tier_4",
    loader.task,
    loader.eligibility,
  )[0]!;
  return {
    source_key: row.benchmark_key,
    row_index: index,
    fetched_at_epoch_seconds: 1791322553,
    benchmark_key: row.benchmark_key,
    url: row.source_url,
    model_id: row.model_id,
    model: row.model,
    base_model: row.base_model,
    reasoning_effort: row.reasoning_effort,
    canonical_value: row.canonical_value,
    metadata_json: JSON.stringify(row.metadata),
  };
});
assert.equal(
  readBenchmarkObservationRawCache(rawRows.slice(0, 1), binding)?.rows[0]?.metadata
    .benchmark_version,
  "2.0",
  "A cache holding one earlier edition remains the fallback until a refresh replaces it",
);
assert.equal(
  readBenchmarkObservationRawCache(rawRows, binding),
  null,
  "A cache cannot mix editions",
);
assert.equal(
  readBenchmarkObservationRawCache(rawRows.slice(1), binding)?.rows[0]?.metadata.task_version,
  "2.1.0",
);

const chessLoader = BENCHMARK_STANDARD_SOURCES.chess_puzzles.loader;
const chessBinding = BENCHMARK_OBSERVATION_BINDINGS.find(
  (candidate) => candidate.benchmark === "chess_puzzles",
);
assert.ok(chessBinding);
const chessRuns = ["1.1.6", "2.0.0", "2.0.1"].map((version) => ({
  ...rows[0]!,
  id_runs: `chess-${version}`,
  task: chessLoader.task,
  "task version": version,
}));
const chess = epochBenchmarkObservationRows(
  chessRuns,
  "chess_puzzles",
  chessLoader.task,
  chessLoader.eligibility,
);
assert.deepEqual(
  chess.map((row) => [row.metadata.task_version, row.metadata.benchmark_version]),
  [
    ["2.0.0", "2.0"],
    ["2.0.1", "2.0"],
  ],
);
assert.deepEqual(
  epochBenchmarkObservationRows(
    [...chessRuns, { ...chessRuns[0]!, id_runs: "chess-2.1.0", "task version": "2.1.0" }],
    "chess_puzzles",
    chessLoader.task,
    chessLoader.eligibility,
  ).map((row) => row.metadata.task_version),
  ["2.1.0"],
  "A newer task edition replaces the pooled patch revisions of the previous one",
);
const chessRaw = rawRows.map((row, index) => ({
  ...row,
  source_key: "chess_puzzles",
  benchmark_key: "chess_puzzles",
  metadata_json: JSON.stringify(chess[index]!.metadata),
}));
assert.equal(readBenchmarkObservationRawCache(chessRaw, chessBinding)?.rows.length, 2);
for (const task_version of ["1.1.6", "2.1.0", null]) {
  const incompatible = {
    ...chessRaw[0]!,
    metadata_json: JSON.stringify({ ...chess[0]!.metadata, task_version }),
  };
  assert.equal(readBenchmarkObservationRawCache([incompatible], chessBinding), null);
  assert.equal(readBenchmarkObservationRawCache([...chessRaw, incompatible], chessBinding), null);
}
