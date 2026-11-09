/** Health distinguishes source availability, matching, and spread without treating rank disagreement as staleness. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { finalizeBenchmarkRows } from "../src/model-atlas/pipeline/benchmark-rows/source-rows";
import {
  buildBenchmarkUpdateHealth,
  isValidBenchmarkUpdateHealth,
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
assert.equal(isValidBenchmarkUpdateHealth(legacy.superchem), false);
const metadata = buildCurrentModelAtlasMetadata({
  models: [],
  scoringConfig: config,
  sourceRowsByKey: source,
  benchmarkUpdateHealth: legacy,
});
assert.equal(metadata.benchmark_update_health?.superchem?.schema_version, 3);
assert.equal(metadata.benchmark_update_health?.superchem?.status, "unmatched");

// Broken stored summaries must not bypass recomputation merely by claiming the latest version.
const broken = { schema_version: 3, status: "matched" } as typeof partial;
assert.equal(isValidBenchmarkUpdateHealth(broken), false);
assert.equal(isValidBenchmarkUpdateHealth({ ...partial, matched_model_count: -1 }), false);
assert.equal(isValidBenchmarkUpdateHealth({ ...partial, observed_count: 0 }), false);
assert.equal(isValidBenchmarkUpdateHealth({ ...partial, source_leaders: [] }), false);
assert.equal(
  isValidBenchmarkUpdateHealth({ ...partial, spread: { ...partial.spread, leader_gap: NaN } }),
  false,
);
assert.equal(
  isValidBenchmarkUpdateHealth({
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
assert.equal(isValidBenchmarkUpdateHealth(restored.benchmark_update_health?.superchem), true);

const fixture = (
  identity: string,
  value: number,
  reasoningEffort: string | null = null,
  standardError: number | null = null,
) => ({
  id: identity,
  identity,
  label: identity,
  provider: null,
  reasoningEffort,
  value,
  standardError,
  version: null,
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
assert.ok(
  Math.abs(
    summarize([fixture("a", 0.8, null, 0.02), fixture("b", 0.7, null, 0.04)]).spread
      .top_standard_error! - 0.03,
  ) < 1e-9,
);
assert.equal(
  summarize([fixture("a", 0.8, null, 0.02), fixture("b", 0.7)]).spread.top_standard_error,
  null,
  "A leader without a published standard error leaves the top five's mean unknown",
);
assert.equal(
  summarize([fixture("one-model", 0.9, "low", 0.01), fixture("one-model", 0.5, "high", 0.05)])
    .spread.top_standard_error,
  0.01,
  "A leader's standard error comes from the row that supplies its value",
);
const efforts = summarize([
  fixture("one-model", 0.8, "low"),
  fixture("one-model", 0.7, "medium"),
  fixture("one-model", 0.6, "high"),
  fixture("unlabelled", 0.9),
  fixture("unlabelled", 0.5, "low"),
]).efforts;
assert.equal(efforts.pair_count, 3, "An unlabelled row has no effort to compare");
assert.equal(efforts.inverted_pair_count, 3);
assert.ok(Math.abs(efforts.largest_inversion! - 0.2) < 1e-9);
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

const sourceHealthEntry = (status: "fresh" | "using_cached_rows", lastFetch: number) => ({
  status,
  last_fetch_epoch_seconds: lastFetch,
  source_input_count: 1,
  active_row_count: 1,
  quarantined_row_count: 0,
  quarantined_rows: [],
});
const currentSources = { generated_at_epoch_seconds: null, sources: {} };
const refreshed = (
  atEpochSeconds: number,
  previous: ModelAtlasBenchmarkUpdateHealth | undefined,
  rows: ReturnType<typeof fixture>[],
) =>
  buildBenchmarkUpdateHealth([], config, { superchem: rows }, undefined, {
    atEpochSeconds,
    previous,
    sourceHealth: currentSources,
  });
const first = refreshed(100, undefined, [fixture("a", 0.7), fixture("b", 0.6)]);
assert.equal(
  first.superchem?.rows_updated_at_epoch_seconds,
  null,
  "A first refresh has nothing to compare",
);
const unchanged = refreshed(200, first, [fixture("b", 0.6), fixture("a", 0.7)]);
assert.equal(
  unchanged.superchem?.rows_updated_at_epoch_seconds,
  null,
  "Reordered rows are not an update",
);
const changed = refreshed(300, unchanged, [fixture("a", 0.71), fixture("b", 0.6)]);
assert.equal(changed.superchem?.rows_updated_at_epoch_seconds, 300);
assert.equal(
  refreshed(400, changed, [fixture("a", 0.71), fixture("b", 0.6)]).superchem
    ?.rows_updated_at_epoch_seconds,
  300,
);
assert.equal(
  refreshed(500, { superchem: summarize([fixture("a", 0.71)]) }, [fixture("a", 0.9)]).superchem
    ?.rows_updated_at_epoch_seconds,
  null,
  "An entry built outside a refresh cannot be compared, so no update is claimed",
);
const fetches = buildBenchmarkUpdateHealth([], config, {}, undefined, {
  atEpochSeconds: 100,
  previous: undefined,
  sourceHealth: {
    generated_at_epoch_seconds: 100,
    sources: {
      superchem: sourceHealthEntry("fresh", 100),
      artificial_analysis_benchmark_resources: sourceHealthEntry("using_cached_rows", 40),
    },
  },
});
assert.equal(fetches.superchem?.cached_rows_fetched_at_epoch_seconds, null);
assert.equal(
  fetches.hle?.cached_rows_fetched_at_epoch_seconds,
  40,
  "A benchmark read from Artificial Analysis resource pages follows that source's fetch",
);
assert.equal(
  buildCurrentModelAtlasMetadata({
    models: [],
    scoringConfig: config,
    benchmarkUpdateHealth: { ...changed, hle: broken },
  }).benchmark_update_health?.superchem?.rows_fingerprint,
  changed.superchem?.rows_fingerprint,
  "Restoring keeps valid stored entries when another entry is invalid",
);
