/** Source-published versions receive distinct timeline versions, while resource bookkeeping leaves a benchmark's timeline version unchanged. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { indexPolicy } from "../src/model-atlas/benchmarks/index-policy";
import { BENCHMARK_CATALOG } from "../src/model-atlas/benchmarks/registry";
import { stableJson } from "../src/model-atlas/runtime";
import { benchmarkVersionId } from "../src/model-atlas/timeline/capability";

for (const [key, definition] of Object.entries(BENCHMARK_CATALOG)) {
  const contract = {
    key,
    source: {
      ...definition.source,
      inputs: definition.source.inputs.map((input) => ({
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
  assert.equal(
    benchmarkVersionId(key),
    `atlas:benchmark:${key}:${createHash("sha256").update(stableJson(contract)).digest("hex").slice(0, 20)}`,
    `${key} keeps its timeline version`,
  );
}

assert.equal(benchmarkVersionId("vals_index", undefined), benchmarkVersionId("vals_index"));
assert.notEqual(benchmarkVersionId("vals_index", "2.2"), benchmarkVersionId("vals_index"));
assert.notEqual(benchmarkVersionId("vals_index", "2.3"), benchmarkVersionId("vals_index", "2.2"));

assert.equal(BENCHMARK_CATALOG.chess_puzzles.version, "2");
