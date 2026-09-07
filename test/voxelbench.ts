/** Verifies VoxelBench eligibility, effort identity, rating normalization, and persisted confidence evidence. */

import assert from "node:assert/strict";

import {
  benchmarkDisplayValue,
  benchmarkMetricColumns,
  dedupeDisplayModels,
} from "../app/dashboard/table/models";
import {
  type BenchmarkObservationRow,
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
  transformBenchmarkSourceValue,
} from "../src/model-atlas/benchmarks/registry";
import { SnapshotRowCollector } from "../src/model-atlas/database/writers";
import {
  normalizedMetricValue,
  observedRangesByBenchmark,
} from "../src/model-atlas/pipeline/scores/quality-context";
import {
  insertBenchmarkObservationRows,
  readBenchmarkObservationRawCache,
} from "../src/model-atlas/sources/observations/cache";
import { benchmarkObservationSource } from "../src/model-atlas/sources/observations/load";
import {
  benchmarkObservationRowKey,
  snapshotSourceRows,
} from "../src/model-atlas/sources/snapshots/row-snapshot";
import type { SourceSnapshots } from "../src/model-atlas/sources/types";
import { processVoxelBenchLeaderboard } from "../src/model-atlas/sources/voxelbench";
import type { ModelAtlasPublishedModel } from "../src/model-atlas/stats/types";

const sourceRow = {
  modelName: "GPT-6 Astra (Max)",
  modelSlug: "gpt-6-astra",
  rating: 2687,
  deviation: 67,
  gamesPlayed: 4163,
  ratingType: "text",
  rank: 1,
  inputCost: 10,
  outputCost: 50,
};
const rows = processVoxelBenchLeaderboard({
  leaderboard: [
    sourceRow,
    { ...sourceRow, modelName: "GPT-6 Astra (High)", rating: 2500, gamesPlayed: 50 },
    { ...sourceRow, modelName: "GLM-5.3-Flash (Max)", modelSlug: "stealth/ox-alpha", rating: 1758 },
    { ...sourceRow, gamesPlayed: 49 },
    { ...sourceRow, ratingType: "image" },
    { ...sourceRow, rating: null },
    { ...sourceRow, rating: "NaN" },
    { ...sourceRow, deviation: -1 },
  ],
});
assert.equal(rows.length, 3);
assert.equal(rows[0]?.canonical_value, 2687, "Ratings above 2500 must not be clipped");
assert.deepEqual(rows[0]?.metadata, {
  track: "text",
  votes: 4163,
  rating_deviation: 67,
});
assert.equal(rows[0]?.cost, undefined, "Token list prices are not per-task cost evidence");
assert.equal(
  rows[2]?.base_model,
  "GLM-5.3-Flash",
  "A stealth slug must not replace the public model identity",
);
assert.deepEqual(processVoxelBenchLeaderboard({ leaderboard: null }), []);
const lookup = buildBenchmarkObservationLookup(rows);
assert.equal(rows[2]?.model_id, null);
assert.equal(rows[2]?.metadata.model_slug, "stealth/ox-alpha");
const datedAndBudgetRows = processVoxelBenchLeaderboard({
  leaderboard: [
    {
      ...sourceRow,
      modelName: "DeepSeek V4 Pro 08-13",
      modelSlug: "deepseek/deepseek-v4-pro-0813",
    },
    { ...sourceRow, modelName: "Claude Sonnet 4.5 (32K Thinking)", modelSlug: "claude-sonnet-4-5" },
  ],
});
assert.equal(
  findBenchmarkObservation(
    ["deepseek/deepseek-v4-pro-0813"],
    "max",
    buildBenchmarkObservationLookup(datedAndBudgetRows),
  )?.canonical_value,
  2687,
);
assert.equal(datedAndBudgetRows[1]?.base_model, "Claude Sonnet 4.5");
assert.equal(
  datedAndBudgetRows[1]?.reasoning_effort,
  "32k-thinking",
  "A token budget must not be guessed as high or max effort",
);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "max", lookup)?.canonical_value, 2687);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "high", lookup)?.canonical_value, 2500);
assert.equal(findBenchmarkObservation(["gpt-6-astra"], "low", lookup), null);

const definition = BENCHMARK_CATALOG.voxelbench;
assert.equal(definition.scoring.group, "baseline");
assert.deepEqual(definition.scoring.dimensionLoadings, { intelligence: 0.5, agentic: 0.5 });
assert.equal(definition.scoring.benchmarkImportance, 1);
assert.equal(transformBenchmarkSourceValue("voxelbench", 2687), 2687);
const models = [1000, 2000, 3000].map((rating, index) => ({
  id: `voxel-example-${index}`,
  name: `Voxel Example ${index}`,
  benchmarks: { voxelbench: rating },
}));
const ranges = observedRangesByBenchmark(models, ["voxelbench"]);
assert.deepEqual(
  models.map((model) => normalizedMetricValue(ranges, "voxelbench", model.benchmarks.voxelbench)),
  [0, 50, 100],
);
const column = benchmarkMetricColumns.find((entry) => entry.benchmark === "voxelbench");
assert.ok(column);
const displayRows = dedupeDisplayModels(models as unknown as ModelAtlasPublishedModel[]);
assert.deepEqual(
  displayRows.map((row) => benchmarkDisplayValue(row, column)),
  [0, 50, 100],
  "Table display must use the same rating conversion",
);

const binding = BENCHMARK_OBSERVATION_BINDINGS.find((entry) => entry.benchmark === "voxelbench");
assert.ok(binding);
const refreshed = {
  ...rows[0]!,
  canonical_value: 2600,
  metadata: { ...rows[0]!.metadata, votes: 5000, rating_deviation: 40 },
};
const refreshConfig = {
  source: "voxelbench" as const,
  cached: { rows: [rows[0]!], fetchedAt: 100 },
  status: {
    cache_hit: false,
    refreshed: false,
    last_fetch_epoch_seconds: 100,
    source_input_count: 1,
  },
  options: {},
  previousMissingSince: new Map<string, number>(),
  nowEpochSeconds: 200,
  rowKey: benchmarkObservationRowKey,
  rowLabel: (row: BenchmarkObservationRow) => row.model,
  mergeRow: benchmarkObservationSource(binding).mergeRow,
};
const updatedSnapshot = await snapshotSourceRows({
  ...refreshConfig,
  fetchRows: async () => ({ fetched_at_epoch_seconds: 200, data: [refreshed] }),
});
assert.deepEqual(
  updatedSnapshot.rows,
  [refreshed],
  "Live ratings and confidence must update together, including rating decreases",
);
assert.equal(updatedSnapshot.fetchedAt, 200);
const failedSnapshot = await snapshotSourceRows({
  ...refreshConfig,
  fetchRows: async () => ({ fetched_at_epoch_seconds: null, data: [] }),
});
assert.deepEqual(
  failedSnapshot.rows,
  [rows[0]],
  "An unavailable leaderboard must preserve the last complete rating and confidence record",
);
assert.equal(failedSnapshot.fetchedAt, 100);
const collector = new SnapshotRowCollector();
const snapshots = {
  ...Object.fromEntries(BENCHMARK_OBSERVATION_BINDINGS.map((entry) => [entry.sourceRowsKey, []])),
  voxelBenchRows: rows,
  fetchedAt: { voxelBench: 1_788_800_000 },
} as unknown as SourceSnapshots;
insertBenchmarkObservationRows(collector, snapshots);
assert.deepEqual(
  readBenchmarkObservationRawCache(collector.records(BENCHMARK_OBSERVATION_RAW_TABLE), binding),
  { rows, fetchedAt: 1_788_800_000 },
);
console.log("VoxelBench checks passed");
