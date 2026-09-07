/** Verify the preview taper endpoint, partial coverage, and independent directly observed runtime support. */
import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config/stage";
import { smoothstep } from "../src/model-atlas/math-utils";
import { buildPreviewResourceScoreResults } from "../src/model-atlas/pipeline/scores/final-scoring";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const models = [1, 2, 3, 4].map((n) => ({
  ...minimalModelAtlasModel({ id: `test/taper-${n}`, name: `Taper ${n}` }),
  benchmarks: { hle: 0.4 + n * 0.01 },
  task_metrics: { hle: { cost: n * n, seconds: n * 100, output_tokens: n * 1000 } },
  cost: { input: n, output: n, blended_price: n },
  speed: {
    throughput_tokens_per_second_median: n * 10,
    latency_seconds_median: n,
    e2e_latency_seconds_median: n,
  },
}));
const qualities = models.map((m) => m.component_scores);
const config = STAGE_CONFIG.scoring;
const one = { ...config, benchmarkPortfolio: { hle: config.benchmarkPortfolio.hle! } };
const four = {
  ...config,
  benchmarkPortfolio: Object.fromEntries(
    (["hle", "scicode", "critpt", "arc_agi_2"] as const).map((k) => [
      k,
      config.benchmarkPortfolio[k]!,
    ]),
  ),
};
const none = buildPreviewResourceScoreResults(
  models.map((m) => ({ ...m, task_metrics: null })),
  qualities,
  one,
);
const full = buildPreviewResourceScoreResults(models, qualities, one);
const partial = buildPreviewResourceScoreResults(models, qualities, four);
for (let i = 0; i < models.length; i++) {
  for (const key of ["value_score", "speed_score"] as const) {
    const base = none[i]!.scores[key]!;
    const endpoint = full[i]!.scores[key]!;
    assert.ok(
      Math.abs(partial[i]!.scores[key]! - (base + smoothstep(0.25) * (endpoint - base))) < 1e-9,
    );
  }
}
const proxy = models.map((m) => ({
  ...m,
  task_metrics: {
    hle: { cost: m.task_metrics.hle.cost, output_tokens: m.task_metrics.hle.output_tokens },
  },
}));
const proxyScores = buildPreviewResourceScoreResults(proxy, qualities, one);
for (let i = 0; i < models.length; i++) {
  assert.equal(
    proxyScores[i]!.scores.speed_score,
    none[i]!.scores.speed_score,
    "Runtime proxies cannot advance the observed-time ramp",
  );
  assert.equal(
    proxyScores[i]!.scores.value_score,
    full[i]!.scores.value_score,
    "Cost coverage is independent from runtime coverage",
  );
}
