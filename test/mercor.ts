/** Mercor ingestion preserves provenance and effort while refusing alternate-harness substitution. */

import assert from "node:assert/strict";

import { BENCHMARK_CATALOG } from "../src/model-atlas/benchmarks/registry";
import { mercorCacheMatches, processMercorPageHtml } from "../src/model-atlas/sources/mercor";

const source = {
  sourceUrl: "https://www.mercor.com/apex/apex-swe-leaderboard/",
  harness: "terminus-2",
} as const;
const result = (effort: string, score: number) => ({
  model: {
    _id: "fixture",
    modelId: "claude-fable-5.1",
    modelName: "Fable 5.1",
    effort,
    provider: { name: "Anthropic" },
    releaseDate: "2026-09-01",
  },
  nSamples: 799,
  passScores: [
    { pass: "mean-score", score: 99 },
    {
      pass: "pass-1",
      score: 12,
      harnessScores: [
        { harness: "inspect", score: 12 },
        { harness: "terminus-2", score, error: 6.3 },
      ],
    },
  ],
});
const first = result("max", 63.6);
const rows = processMercorPageHtml(
  JSON.stringify([first, result("high", 60), first]),
  "apex_swe",
  source,
);
assert.equal(rows.length, 2);
assert.ok(rows[0] && rows[1]);
assert.equal(rows[0].canonical_value, 0.636);
assert.equal(rows[0].model, "Claude Fable 5.1 (max)");
assert.equal(rows[1].reasoning_effort, "high");
assert.equal(rows[0].observed_at, null);
assert.deepEqual(JSON.parse(String(rows[0].metadata.raw_result_json)), first);
assert.equal(mercorCacheMatches(rows, source), true);
assert.equal(mercorCacheMatches(rows, { ...source, harness: null }), false);
const absent = result("max", 63.6);
assert.ok(absent.passScores[1]);
absent.passScores[1].harnessScores = [{ harness: "inspect", score: 90 }];
assert.deepEqual(processMercorPageHtml(JSON.stringify(absent), "apex_swe", source), []);
const chemistry = {
  sourceUrl: "https://www.mercor.com/apex/oss-benchmarks/oss-super-chem-leaderboard/",
  harness: null,
};
const chemResult = {
  ...first,
  passScores: [
    { pass: "pass-1", score: 80.3, error: 3.2 },
    { pass: "mean-score", score: 99 },
  ],
};
assert.equal(
  processMercorPageHtml(JSON.stringify(chemResult), "superchem", chemistry)[0]?.canonical_value,
  0.803,
);
assert.deepEqual(processMercorPageHtml(JSON.stringify(first), "superchem", chemistry), []);
assert.deepEqual(
  processMercorPageHtml(
    JSON.stringify({ ...first, passScores: [{ pass: "pass-1", score: 101 }] }),
    "superchem",
    chemistry,
  ),
  [],
);
assert.equal(BENCHMARK_CATALOG.apex_swe.scoring.group, "baseline");
assert.equal(BENCHMARK_CATALOG.superchem.scoring.group, "frontier");
