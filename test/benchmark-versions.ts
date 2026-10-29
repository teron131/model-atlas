/** Changed measurement contracts and source-published versions receive distinct timeline versions, while resource bookkeeping and unrelated benchmarks keep theirs. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { indexPolicy } from "../src/model-atlas/benchmarks/index-policy";
import { BENCHMARK_CATALOG } from "../src/model-atlas/benchmarks/registry";
import { stableJson } from "../src/model-atlas/runtime";
import { benchmarkVersionId } from "../src/model-atlas/timeline/capability";

const changedKeys = [
  "aa_intelligence_index",
  "chess_puzzles",
  "code_migration",
  "critpt",
  "emb",
  "finance_agent_v2",
  "frontier_code",
  "frontiermath_tier_4",
  "handbook_md",
  "hle",
  "rsi_benchmark",
  "vals_index",
];
assert.deepEqual(
  Object.entries(BENCHMARK_CATALOG)
    .filter(([, definition]) => definition.source.revision != null)
    .map(([key]) => key)
    .sort(),
  [...changedKeys].sort(),
);

for (const [key, definition] of Object.entries(BENCHMARK_CATALOG)) {
  const { revision: _revision, ...unversionedSource } = definition.source;
  const previousContract = {
    key,
    source: {
      ...unversionedSource,
      inputs: unversionedSource.inputs.map((input) => ({
        ...input,
        adapters: input.adapters?.map((adapter) => {
          if (adapter.kind !== "artificial_analysis_resource_page") return adapter;
          const {
            methodologyName: _methodologyName,
            resourceKey: _resourceKey,
            ...scored
          } = adapter;
          return scored;
        }),
      })),
    },
    processing: definition.processing,
    location: definition.persistence.location,
    format: definition.presentation.column.format,
    indexBreadth:
      key === "aa_intelligence_index" ? indexPolicy(key)?.representedBenchmarks : undefined,
  };
  const previousId = `atlas:benchmark:${key}:${createHash("sha256").update(stableJson(previousContract)).digest("hex").slice(0, 20)}`;
  if (changedKeys.includes(key)) {
    assert.notEqual(benchmarkVersionId(key), previousId, `${key} needs a new measurement version`);
  } else {
    assert.equal(benchmarkVersionId(key), previousId, `${key} retains its existing version`);
  }
}

assert.equal(benchmarkVersionId("vals_index", undefined), benchmarkVersionId("vals_index"));
assert.notEqual(benchmarkVersionId("vals_index", "2.2"), benchmarkVersionId("vals_index"));
assert.notEqual(benchmarkVersionId("vals_index", "2.3"), benchmarkVersionId("vals_index", "2.2"));

assert.equal(BENCHMARK_CATALOG.frontiermath_tier_4.source.revision, "2.1.0");
assert.equal(BENCHMARK_CATALOG.chess_puzzles.source.revision, "2");
assert.equal(BENCHMARK_CATALOG.chess_puzzles.version, "2");
assert.equal(BENCHMARK_CATALOG.rsi_benchmark.source.revision, "four_task_reference_mean");
assert.equal(BENCHMARK_CATALOG.vals_index.source.revision, indexPolicy("vals_index")?.version);
assert.equal(BENCHMARK_CATALOG.aa_intelligence_index.source.revision, "5.0");
