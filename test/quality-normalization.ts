/** Quality normalization preserves relative benchmark positions while resources keep their independent linear coordinates. */
import assert from "node:assert/strict";

import { BENCHMARK_CATALOG } from "../src/model-atlas/benchmarks/registry";
import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import { minMaxRange, minMaxScale } from "../src/model-atlas/pipeline/scores/normalization";
import {
  buildQualityScoringContext,
  normalizedQualityBenchmarkValue,
  observedRangesByBenchmark,
} from "../src/model-atlas/pipeline/scores/quality-context";

const close = (a: number | null, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const rows = [
  {
    benchmarks: { hle: 0.01, scicode: 0.41, critpt: 0.45, proofbench: 0.1, gdpval_normalized: 40 },
  },
  { benchmarks: { hle: 0.2, scicode: 0.6, critpt: 0.55, proofbench: 0.9, gdpval_normalized: 60 } },
];
const keys = Object.keys(rows[0]!.benchmarks);
const ranges = observedRangesByBenchmark(rows, keys);
for (const key of keys) {
  const range = ranges.get(key)!;
  close(minMaxScale(range, range.min), 0);
  close(minMaxScale(range, range.max), 100);
  close(minMaxScale(range, (range.min + range.max) / 2), 50);
  for (const position of [0, 0.2, 0.5, 0.9, 0.95, 0.99, 1])
    close(minMaxScale(range, range.min + position * (range.max - range.min)), 100 * position);
}
const score = (position: number) => minMaxScale(ranges.get("hle")!, 0.01 + position * 0.19)!;
close(score(0.95) - score(0.9), score(0.25) - score(0.2));
close(score(1) - score(0.99), 1);
const context = buildQualityScoringContext(rows, STAGE_CONFIG.scoring);
for (const key of keys) {
  const value = rows[0]!.benchmarks[key as keyof (typeof rows)[0]["benchmarks"]];
  assert.equal(
    normalizedQualityBenchmarkValue(rows[0]!, key, value, "intelligence", context),
    normalizedQualityBenchmarkValue(rows[0]!, key, value, "agentic", context),
  );
}
// Resource ranges remain linear, and flat quality populations retain the established all-equal score.
close(minMaxScale(minMaxRange([40, 60]), 50), 50);
close(
  minMaxScale(observedRangesByBenchmark([{ benchmarks: { hle: 0.5 } }], ["hle"]).get("hle")!, 0.5),
  100,
);
assert.equal(observedRangesByBenchmark([], ["hle"]).get("hle"), null);

// Catalog metadata must describe the same linear policy that scoring executes.
for (const benchmark of Object.values(BENCHMARK_CATALOG)) {
  assert.deepEqual(benchmark.scoring.normalization, { kind: "min_max", output: [0, 100] });
}
