/** Verify measured era-specific coverage without age, index-only, duplicated-edition, or imputation shortcuts. */
import assert from "node:assert/strict";

import { timelineCoverage } from "../src/model-atlas/timeline/coverage";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import { historicalSourceModel } from "../src/model-atlas/timeline/index-sources";
import type { HistoricalSourceRelease } from "../src/model-atlas/timeline/types";

const broad = historicalSourceModel("Broad old model", "Lab", null, "2020-01-01");
const sparse = historicalSourceModel("Sparse old model", "Lab", null, "2020-01-01");
const indexOnly = historicalSourceModel("Index only", "Lab", null, "2030-01-01");
const split = historicalSourceModel("Split editions", "Lab", null, "2020-01-01");
const models = [broad, sparse, indexOnly, split];
const benchmarks = ["old", "later"].flatMap((edition) =>
  [0, 1, 2, 3].map((i) => ({
    id: `${edition}:${i}`,
    key: `task:${i}`,
    label: `Task ${i}`,
    kind: "task" as const,
    scale: "probability" as const,
    weights: { intelligence: 0, agentic: i === 1 || i === 2 ? 0.5 : 1 },
  })),
);
const observe = (modelId: string, benchmarkId: string) => ({
  modelId,
  benchmarkId,
  value: 0.8,
  observedAt: "2021-01-01",
  source: "fixture",
});
const release: HistoricalSourceRelease = {
  id: "coverage",
  capturedAt: "2030-01-01",
  models,
  artifacts: [],
  portfolios: [],
  benchmarks: [
    ...benchmarks,
    ...["old", "later"].map((edition) => ({
      id: `index:${edition}`,
      key: "source-index",
      label: "Observed source index",
      kind: "index" as const,
      scale: "linear" as const,
      weights: { intelligence: 0.5, agentic: 0.5 },
      componentIds: benchmarks.filter((b) => b.id.startsWith(edition)).map((b) => b.id),
    })),
  ],
  observations: [
    ...models.map((m) => observe(m.id, "index:old")),
    ...[0, 1, 2].map((i) => observe(broad.id, `old:${i}`)),
    observe(sparse.id, "old:0"),
    ...[0, 1].map((i) => observe(split.id, `old:${i}`)),
    ...[2, 3].map((i) => observe(split.id, `later:${i}`)),
    observe(split.id, "index:later"),
  ],
};
const data = historicalDatasetFromReleases(
  [release],
  models.map((m) => ({
    model_id: m.id,
    name: m.name,
    provider_id: "Lab",
    release_date: m.releaseDate,
    intelligence_score: 50,
    agentic_score: 50,
    intelligence_confidence: 0.1,
    agentic_confidence: 0.1,
  })),
);
const coverage = timelineCoverage(data, "agentic", []);
assert.equal(
  coverage.get(broad.id)!.fraction,
  2 / 3,
  "Coverage uses fractional task weights in the measured edition",
);
assert.equal(coverage.get(broad.id)!.source, "index:old");
assert.equal(
  coverage.get(sparse.id)!.fraction,
  0.1,
  "One measured task cannot establish broad historical support",
);
assert.equal(
  coverage.get(indexOnly.id)!.fraction,
  0.1,
  "An observed index does not fill missing components",
);
assert.equal(
  coverage.get(split.id)!.fraction,
  0.1,
  "Partial results from different editions cannot invent one complete basket",
);
assert.equal(
  timelineCoverage(data, "intelligence", []).get(broad.id)!.fraction,
  0.1,
  "Coverage stays dimension-specific",
);
assert.deepEqual(
  timelineCoverage({ ...data, models: [broad] }, "agentic", []).get(broad.id),
  coverage.get(broad.id),
);
const added = {
  ...data,
  benchmarks: [...data.benchmarks, { ...benchmarks[0]!, id: "future-task", key: "future-task" }],
  observations: data.observations.map((o) =>
    o.benchmarkId === "index:old" ? { ...o, value: 1000 } : o,
  ),
};
assert.deepEqual(
  timelineCoverage(added, "agentic", []),
  coverage,
  "New unrelated benchmarks and higher scores cannot manufacture coverage",
);
console.log("Measured historical portfolio coverage checks passed.");

// Published index breadth supports the envelope without backfilling any task observations.
const indexes = structuredClone(data);
indexes.benchmarks.find((b) => b.id === "index:old")!.representedBenchmarks = 10;
const selected = [{ modelId: indexOnly.id, value: 50, paths: [["index:old"]] }];
assert.equal(timelineCoverage(indexes, "intelligence", selected).get(indexOnly.id)!.fraction, 1);
assert.equal(
  timelineCoverage(indexes, "intelligence", selected).get(indexOnly.id)!.source,
  "index:old",
);
assert.equal(
  timelineCoverage(indexes, "intelligence", []).get(indexOnly.id)!.fraction,
  0.1,
  "An unused index cannot qualify a model",
);
assert.equal(
  timelineCoverage(indexes, "intelligence", [{ ...selected[0]!, value: null }]).get(indexOnly.id)!
    .fraction,
  0.1,
  "An unplaced score cannot gain index support",
);
const counted = {
  ...indexes,
  observations: indexes.observations.map((o) =>
    o.modelId === indexOnly.id ? { ...o, benchmarkCount: 4 } : o,
  ),
};
assert.ok(
  timelineCoverage(counted, "intelligence", selected).get(indexOnly.id)!.fraction < 0.6,
  "Actual sparse support overrides a larger generic portfolio",
);
counted.benchmarks.find((b) => b.id === "index:later")!.representedBenchmarks = 4;
counted.observations.push({ ...observe(indexOnly.id, "index:later"), benchmarkCount: 4 });
assert.ok(
  timelineCoverage(counted, "intelligence", [
    { ...selected[0]!, paths: [["index:old"], ["index:later"]] },
  ]).get(indexOnly.id)!.fraction < 0.6,
  "Overlapping index counts cannot be summed to manufacture full support",
);
assert.equal(
  data.observations.filter((o) => o.modelId === indexOnly.id && o.benchmarkId.startsWith("old:"))
    .length,
  0,
);
console.log("Selected index breadth restores envelope support without changing direct evidence.");

const agenticCoverage = timelineCoverage(indexes, "agentic", selected).get(indexOnly.id)!;
assert.ok(
  agenticCoverage.fraction < 0.6 && agenticCoverage.fraction > 0.1,
  "Only the four identified Agentic constituents count toward Agentic support, rather than all ten general benchmarks",
);
const unnamedIndex = {
  ...indexes,
  benchmarks: indexes.benchmarks.map((b) =>
    b.kind === "index" ? { ...b, componentIds: undefined } : b,
  ),
};
assert.equal(
  timelineCoverage(unnamedIndex, "agentic", selected).get(indexOnly.id)!.fraction,
  0.1,
  "Unknown index membership cannot invent Agentic evidence",
);
