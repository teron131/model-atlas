/** Verifies MLS-Bench and PerceptionBench parsing, provenance, and catalog registration. */

import assert from "node:assert/strict";

import {
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_PORTFOLIO,
} from "../src/model-atlas/benchmarks/registry";
import { processMlsBenchLeaderboardHtml } from "../src/model-atlas/scrapers/benchmarks/mls-bench";
import { processPerceptionBenchReadme } from "../src/model-atlas/scrapers/benchmarks/perception-bench";

const mlsRows = processMlsBenchLeaderboardHtml(`
  <table><tbody>
    <tr><td>1</td><td><img alt="Anthropic"><span class="font-medium text-foreground">Claude Fable 5</span><span>Closed</span></td><td><span class="text-muted-foreground">Claude Code<span class="text-[10px]">max</span><span>(with fallback)</span></span></td><td>49.9</td></tr>
    <tr><td>2</td><td><img alt="Qwen"><span class="font-medium text-foreground">Qwen3.8-Max</span><span>Closed</span></td><td><span class="text-muted-foreground">Claude Code</span></td><td>41.0</td></tr>
    <tr><td>bad</td><td>Incomplete</td></tr>
  </tbody></table>
  <script>self.__next_f.push([1,"{\\"humanSota\\":44.66}"])</script>
`);
assert.equal(mlsRows.length, 2);
assert.deepEqual(
  mlsRows.map((row) => ({
    rank: row.rank,
    model: row.model,
    effort: row.reasoning_effort,
    harness: row.metadata.harness,
    score: row.canonical_value,
  })),
  [
    { rank: 1, model: "Claude Fable 5", effort: "max", harness: "Claude Code", score: 0.499 },
    { rank: 2, model: "Qwen3.8-Max", effort: null, harness: "Claude Code", score: 0.41 },
  ],
);
assert.equal(mlsRows[0]?.metadata.fallback, true);
assert.equal(mlsRows[0]?.canonical_value, 0.499);
assert.deepEqual(mlsRows[1]?.metadata, { harness: "Claude Code" });

const perceptionRows = processPerceptionBenchReadme(`
# PerceptionBench

| # | Model | Overall | VRel | Count | Attr | Depth | Loc | Comp | FGR | Ctx | OCR | Hallu |
|--:|-------|--------:|-----:|------:|-----:|------:|----:|-----:|----:|----:|----:|------:|
| 1 | GPT-5.6-Sol | 59.7 | 69.7 | 62.4 | 62.1 | 55.5 | 76.7 | 67.0 | 55.9 | 60.0 | 54.9 | 26.9 |
| 2 | Claude-Fable-5 | 57.2 | 58.5 | 52.9 | 60.9 | 51.5 | 70.4 | 56.1 | 51.6 | 59.8 | 64.3 | 45.0 |
| 3 | Gemma-4-31B | 41.5 | 42.7 | 33.9 | 40.3 | 39.1 | 44.9 | 43.7 | 39.0 | 45.9 | 46.7 | 32.1 |
| 4 | malformed | missing |

Footer
`);
assert.equal(perceptionRows.length, 3);
assert.equal(perceptionRows[0]?.canonical_value, 0.597);
assert.equal(perceptionRows[0]?.reasoning_effort, "max");
assert.deepEqual(perceptionRows[0]?.metadata, {});
assert.equal(perceptionRows[1]?.metadata.fallback_model, "Claude-Opus-4.8");
assert.equal(perceptionRows[1]?.metadata.fallback_share_percent, 1.1);
assert.deepEqual(perceptionRows[2]?.metadata, { thinking_enabled: true });
const perceptionLookup = buildBenchmarkObservationLookup(perceptionRows);
assert.equal(
  findBenchmarkObservation(["GPT-5.6 Sol"], "max", perceptionLookup)?.canonical_value,
  0.597,
);
assert.equal(findBenchmarkObservation(["GPT-5.6 Sol"], "high", perceptionLookup), null);
assert.equal(
  findBenchmarkObservation(["Claude Fable 5"], null, perceptionLookup)?.canonical_value,
  0.572,
);

const bindings = Object.fromEntries(
  BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.benchmark, binding]),
);
assert.equal(bindings.mls_bench?.loader.kind, "mls_bench");
assert.equal(bindings.perception_bench?.loader.kind, "perception_bench");
assert.deepEqual(BENCHMARK_PORTFOLIO.mls_bench.dimensionLoadings, {
  intelligence: 0.4,
  agentic: 0.6,
});
assert.deepEqual(BENCHMARK_PORTFOLIO.perception_bench.dimensionLoadings, {
  intelligence: 1,
  agentic: 0,
});
assert.equal(BENCHMARK_CATALOG.mls_bench.presentation.column.key, "mlsBench");
assert.equal(BENCHMARK_CATALOG.perception_bench.presentation.column.key, "perceptionBench");
