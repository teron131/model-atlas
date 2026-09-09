/** Health distinguishes source availability, matching, and spread without treating rank disagreement as staleness. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { finalizeBenchmarkRows } from "../src/model-atlas/pipeline/benchmark-rows/source-rows";
import {
  buildBenchmarkUpdateHealth,
  isCurrentBenchmarkHealth,
} from "../src/model-atlas/stats/payload/health";
import { buildCurrentModelAtlasMetadata } from "../src/model-atlas/stats/payload/metadata";
import type { ModelAtlasBenchmarkUpdateHealth } from "../src/model-atlas/stats/types";

const config = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["superchem"],
  agenticBenchmarkKeys: [],
};
const source = finalizeBenchmarkRows([
  {
    key: "superchem",
    id: "gpt-6-astra",
    identity: "gpt-6-astra",
    label: "Astra high",
    reasoningEffort: "high",
    value: 0.9,
  },
  {
    key: "superchem",
    id: "gpt-6-astra",
    identity: "gpt-6-astra",
    label: "Astra low",
    reasoningEffort: "low",
    value: 0.6,
  },
  { key: "superchem", id: "specialist", identity: "specialist", label: "Specialist", value: 0.7 },
  { key: "superchem", id: "other", identity: "other", label: "Other", value: 0.69 },
]);
assert.equal(source.superchem?.length, 4);
const unavailable = buildBenchmarkUpdateHealth([], config, source).superchem!;
assert.equal(unavailable.status, "unmatched");
assert.equal(unavailable.observed_count, 4);
assert.equal(unavailable.distinct_model_count, 3);
assert.equal(unavailable.source_leaders[0]?.variants.length, 2);
assert.ok(Math.abs(unavailable.spread.leader_gap! - 0.2) < 1e-9);
assert.ok(Math.abs(unavailable.spread.top_range_without_leader! - 0.01) < 1e-9);
assert.equal(
  buildBenchmarkUpdateHealth([], config, { superchem: [] }).superchem?.status,
  "missing",
);

const models = [
  {
    id: "openai/gpt-6-astra",
    name: "GPT-6 Astra",
    reasoning_effort: "high",
    benchmarks: { superchem: 0.9 },
    intelligence: {},
  },
];
const partial = buildBenchmarkUpdateHealth(models, config, source, STAGE_CONFIG.matcher).superchem!;
assert.equal(partial.status, "partially_matched");
assert.equal(partial.matched_model_count, 1);
assert.equal(partial.source_leaders.length, 3);
assert.equal(partial.matched_leaders.length, 1);
const fallback = buildBenchmarkUpdateHealth(models, config).superchem!;
assert.equal(fallback.evidence_origin, "model_observations");
assert.equal(fallback.status, "matched");
assert.deepEqual(fallback.source_leaders, []);
assert.equal(fallback.spread.leader_gap, null);

const legacy = {
  superchem: { status: "stale_possible", observed_count: 99 },
} as unknown as ModelAtlasBenchmarkUpdateHealth;
assert.equal(isCurrentBenchmarkHealth(legacy.superchem), false);
const metadata = buildCurrentModelAtlasMetadata({
  models: [],
  scoringConfig: config,
  sourceRowsByKey: source,
  benchmarkUpdateHealth: legacy,
});
assert.equal(metadata.benchmark_update_health?.superchem?.schema_version, 2);
assert.equal(metadata.benchmark_update_health?.superchem?.status, "unmatched");

// Broken stored summaries must not bypass recomputation merely by claiming the latest version.
const broken = { schema_version: 2, status: "matched" } as typeof partial;
assert.equal(isCurrentBenchmarkHealth(broken), false);
assert.equal(isCurrentBenchmarkHealth({ ...partial, matched_model_count: -1 }), false);
assert.equal(isCurrentBenchmarkHealth({ ...partial, observed_count: 0 }), false);
assert.equal(isCurrentBenchmarkHealth({ ...partial, source_leaders: [] }), false);
assert.equal(
  isCurrentBenchmarkHealth({ ...partial, spread: { ...partial.spread, leader_gap: NaN } }),
  false,
);
assert.equal(
  isCurrentBenchmarkHealth({
    ...partial,
    source_leaders: [{ ...partial.source_leaders[0]!, value: Infinity }],
  }),
  false,
);
const restored = buildCurrentModelAtlasMetadata({
  models: [],
  scoringConfig: config,
  benchmarkUpdateHealth: { superchem: broken },
});
assert.equal(restored.benchmark_update_health?.superchem?.status, "missing");
assert.equal(isCurrentBenchmarkHealth(restored.benchmark_update_health?.superchem), true);

const fixture = (identity: string, value: number, reasoningEffort: string | null = null) => ({
  id: identity,
  identity,
  label: identity,
  provider: null,
  reasoningEffort,
  value,
});
const summarize = (rows: ReturnType<typeof fixture>[]) =>
  buildBenchmarkUpdateHealth([], config, { superchem: rows }).superchem!;
assert.equal(summarize([fixture("nan", NaN), fixture("infinite", Infinity)]).status, "missing");
assert.equal(summarize([fixture("zero", 0)]).source_leaders[0]?.value, 0);
assert.equal(summarize([fixture("singleton", 0.7)]).spread.full_range, null);
assert.equal(summarize([fixture("a", 0.7), fixture("b", 0.7)]).spread.full_range, 0);
const extreme = summarize([
  fixture("standout", 100),
  ...Array.from({ length: 9 }, (_, i) => fixture(`peer-${i}`, 1)),
]);
assert.equal(extreme.distinct_model_count, 10);
assert.equal(extreme.spread.leader_gap, 99);
assert.equal(extreme.spread.top_range_without_leader, 0);
assert.equal(extreme.status, "unmatched");
const repeated = summarize(Array.from({ length: 100 }, () => fixture("one-model", 0.7, "high")));
assert.equal(repeated.distinct_model_count, 1);
assert.equal(repeated.source_leaders[0]?.variants.length, 1);
const variants = summarize([fixture("one-model", 0.9, "low"), fixture("one-model", 0.1, "high")]);
assert.equal(variants.source_leaders[0]?.reasoning_effort, "low");
assert.equal(variants.source_leaders[0]?.variants.length, 2);
assert.equal(variants.distinct_model_count, 1);
const input = [fixture("c", 0.1), fixture("a", 0.5), fixture("b", 0.5)];
assert.deepEqual(summarize(input), summarize([...input].reverse()));
assert.equal(input[0]?.identity, "c");
const onlyUnmatchedLeaders = [
  ...Array.from({ length: 5 }, (_, i) => fixture(`unknown-${i}`, 10 - i)),
  fixture("gpt-6-astra", 0.9),
];
const outside = buildBenchmarkUpdateHealth(
  models,
  config,
  { superchem: onlyUnmatchedLeaders },
  STAGE_CONFIG.matcher,
).superchem!;
assert.ok(outside.source_leaders.every((row) => row.model_id == null));
assert.equal(outside.matched_leaders[0]?.model_id, "openai/gpt-6-astra");
assert.equal(outside.status, "partially_matched");
