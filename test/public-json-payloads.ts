/** Verify the public model boundary and JSON projections. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import { selectPublicModels } from "../src/model-atlas/pipeline/selection/public-list";
import {
  benchmarksJsonPayload,
  coreJsonPayload,
  type FullJsonPayload,
  fullJsonPayload,
  publicJsonPayload,
  scoreJsonPayload,
} from "../src/model-atlas/stats/payload/public-json";
import type { ModelAtlasScoredCandidate } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

const internalCandidate = {
  ...minimalModelAtlasModel({
    id: "provider/internal-candidate",
    name: "Internal Candidate",
  }),
  scoring_sources: {
    regression_probe: { raw_score: 0.8 },
  },
  internal_probe: "must not be public",
  component_scores: {
    intelligence_score: 80,
    agentic_score: 70,
    speed_score: 60,
  },
  scores: {
    intelligence_score: 80,
    agentic_score: 70,
    speed_score: 60,
    value_score: 50,
  },
} satisfies ModelAtlasScoredCandidate & { internal_probe: string };
const [projectedPublicModel] = selectPublicModels(
  [internalCandidate],
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.deepEqual(
  Object.keys(projectedPublicModel ?? {}).sort(),
  Object.keys(
    minimalModelAtlasModel({
      id: "provider/internal-candidate",
      name: "Internal Candidate",
    }),
  ).sort(),
  "public selection should project candidates onto the exact public model surface",
);
assert.equal(
  "scoring_sources" in (projectedPublicModel ?? {}),
  false,
  "public selection should not expose scoring provenance",
);

const sparseResourceCandidate: ModelAtlasScoredCandidate = {
  ...internalCandidate,
  id: "provider/sparse-resource-candidate",
  name: "Sparse Resource Candidate",
  component_scores: {
    ...internalCandidate.component_scores,
    speed_score: null,
  },
  scores: {
    ...internalCandidate.scores,
    speed_score: null,
    value_score: null,
  },
};
const [sparseResourceModel] = selectPublicModels(
  [sparseResourceCandidate],
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.deepEqual(
  sparseResourceModel?.scores,
  {
    intelligence_score: 80,
    agentic_score: 70,
    speed_score: null,
    value_score: null,
  },
  "public selection should preserve models without optional resource scores",
);

const lowScoreCandidate: ModelAtlasScoredCandidate = {
  ...internalCandidate,
  id: "provider/low-score",
  name: "Low Score",
  component_scores: {
    ...internalCandidate.component_scores,
    intelligence_score: 5,
    agentic_score: 4,
  },
  scores: {
    ...internalCandidate.scores,
    intelligence_score: 5,
    agentic_score: 4,
  },
};
assert.equal(
  selectPublicModels([lowScoreCandidate], null, STAGE_CONFIG.final, STAGE_CONFIG.scoring).length,
  1,
  "low finite scores should remain public when evidence admission is handled separately",
);

const reasoningEffortModels = selectPublicModels(
  [
    {
      ...internalCandidate,
      reasoning_effort: "high",
      benchmarks: { arc_agi_3: 0.3016 },
      benchmark_dates: { arc_agi_3: "2026-07-24" },
    },
    {
      ...internalCandidate,
      reasoning_effort: "max",
      benchmarks: { arc_agi_2: 0.904 },
      scores: { ...internalCandidate.scores, intelligence_score: 90 },
    },
  ],
  null,
  STAGE_CONFIG.final,
  STAGE_CONFIG.scoring,
);
assert.deepEqual(
  reasoningEffortModels.map((model) => model.reasoning_effort),
  ["max", "high"],
  "the dashboard payload should retain separately scored reasoning-effort variants",
);
const reasoningVariantPayload = minimalModelAtlasPayload({
  fetchedAt: 123,
  models: reasoningEffortModels,
});
assert.deepEqual(
  [
    scoreJsonPayload(reasoningVariantPayload).scores.length,
    coreJsonPayload(reasoningVariantPayload).models.length,
    benchmarksJsonPayload(reasoningVariantPayload).benchmarks.length,
  ],
  [1, 1, 1],
  "compact public views should keep one representative variant per model",
);
assert.equal(
  scoreJsonPayload(reasoningVariantPayload).scores[0]?.score.intelligence,
  90,
  "collapsed public views should use the strongest variant for each model",
);
assert.deepEqual(benchmarksJsonPayload(reasoningVariantPayload).benchmarks[0]?.benchmarks, {
  arc_agi_2: 0.904,
  arc_agi_3: 0.3016,
});
const allVariantPayload = publicJsonPayload(reasoningVariantPayload, "all") as FullJsonPayload;
assert.deepEqual(
  allVariantPayload.models.map((model) => model.reasoning_effort),
  ["max", "high"],
  "the all view should expose every reasoning-effort variant",
);
const sourceOnlyEffortPayload = minimalModelAtlasPayload({
  fetchedAt: 124,
  models: [
    {
      ...minimalModelAtlasModel({
        id: "provider/source-only",
        name: "Source Only",
      }),
      reasoning_effort: "max",
    },
  ],
  benchmarkObservations: {
    arc_agi_3: [
      {
        model_id: "provider/source-only",
        model: "Source Only",
        base_model: "Source Only",
        canonical_value: 0.0152,
        reasoning_effort: "high",
        cost: 10_000,
        observed_at: "2026-08-07",
      },
    ],
  },
});
assert.equal(
  benchmarksJsonPayload(sourceOnlyEffortPayload).benchmarks[0]?.benchmarks.arc_agi_3,
  0.0152,
  "compact benchmark views should surface one source-only effort observation",
);
const sourceOnlyAllPayload = publicJsonPayload(sourceOnlyEffortPayload, "all") as FullJsonPayload;
assert.equal(
  "benchmark_observations" in sourceOnlyAllPayload,
  false,
  "the all view should omit internal canonical observations",
);
assert.equal(sourceOnlyAllPayload.models[0]?.benchmarks?.arc_agi_3, undefined);

const valsBenchmarkPayload = benchmarksJsonPayload(
  minimalModelAtlasPayload({
    fetchedAt: 124,
    models: [
      {
        ...minimalModelAtlasModel({
          id: "provider/vals-model",
          name: "Vals Model",
        }),
        benchmarks: { legal_research: 0.62 },
      },
    ],
  }),
);
assert.equal(
  valsBenchmarkPayload.benchmarks[0]?.benchmarks.legal_research,
  0.62,
  "the public benchmarks view should expose admitted Vals benchmark fields",
);

const fullPayload = minimalModelAtlasPayload({
  fetchedAt: 123,
  models: [
    {
      ...minimalModelAtlasModel({
        id: "provider/model",
        name: "Model",
      }),
      cost: {
        input: 1,
        output: 2,
        cache_read: 0.5,
        cache_write: 1.5,
        blended_price: 1.8,
        weighted_input: 0.4,
        weighted_output: 3.2,
      },
      intelligence: {
        intelligence_index: 80,
        agentic_index: 70,
        gpqa: 0.9,
      },
      task_metrics: {
        artificial_analysis: {
          cost: 1.25,
          seconds: 2,
          output_tokens: 3,
        },
        deep_swe: {
          cost: 3,
          seconds: 4,
          output_tokens: 5,
        },
      },
      benchmarks: {
        gpqa: 0.9,
        deep_swe: 0.6,
      },
      benchmark_dates: {
        gpqa: "2026-07-30",
        deep_swe: "2026-07-31",
      },
    },
  ],
});
fullPayload.metadata.scoring.selected_benchmark_keys = ["gpqa", "deep_swe"];
fullPayload.metadata.scoring.benchmark_portfolio = {
  gpqa: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  deep_swe: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
};
const scorePayload = scoreJsonPayload(fullPayload);
const scoreModel = scorePayload.scores[0];
const corePayload = coreJsonPayload(fullPayload);
const coreModel = corePayload.models[0];
const benchmarksPayload = benchmarksJsonPayload(fullPayload);
const benchmarksModel = benchmarksPayload.benchmarks[0];
const fullJson = fullJsonPayload(fullPayload);
const fullJsonModel = fullJson.models[0];
const methodology = scorePayload.methodology;

assert.equal(
  "deep_swe" in fullJson,
  false,
  "the full public view should not expose raw DeepSWE source rows",
);
assert.equal(scorePayload.schema, "model_atlas.score");
assert.equal(scorePayload.score_scale, "percentage");
assert.match(methodology, /validation-confidence weighted influence/);
assert.match(methodology, /literal weighted evidence support/);
assert.match(methodology, /source-default variant/);
assert.match(methodology, /show the highest available direct effort/);
assert.match(methodology, /assign 70% to benchmark task resources and 30%/);
assert.match(methodology, /compare resource use among nearby-quality models/);
assert.deepEqual(scoreModel, {
  rank: 1,
  id: "provider/model",
  name: "Model",
  provider: null,
  score: {
    intelligence: 0,
    agentic: 0,
    speed: 0,
    value: null,
  },
  confidence: {
    speed: 1,
    value: 1,
  },
});

assert.equal(corePayload.schema, "model_atlas.core");
assert.equal(corePayload.score_scale, "percentage");
assert.equal(corePayload.methodology, methodology);
assert.deepEqual(corePayload.columns, [
  "rank",
  "id",
  "name",
  "provider",
  "release_date",
  "input_modalities",
  "output_modalities",
  "open_weights",
  "intelligence_score",
  "agentic_score",
  "speed_score",
  "speed_confidence",
  "value_score",
  "value_confidence",
  "blended_price",
  "context_window_tokens",
  "effective_input_price_per_million_tokens",
  "effective_output_price_per_million_tokens",
  "throughput_tokens_per_second_median",
  "latency_seconds_median",
  "e2e_latency_seconds_median",
]);
assert.deepEqual(Object.keys(coreModel ?? {}), corePayload.columns);
assert.equal(coreModel?.rank, 1);
assert.equal(coreModel?.id, "provider/model");
assert.equal(coreModel?.effective_input_price_per_million_tokens, 0.4);
assert.equal(coreModel?.effective_output_price_per_million_tokens, 3.2);
assert.equal(coreModel?.blended_price, 1.8);
assert.equal("benchmarks" in (coreModel ?? {}), false);
assert.equal("task_metrics" in (coreModel ?? {}), false);
assert.equal("logo" in (coreModel ?? {}), false);
assert.equal("attachment" in (coreModel ?? {}), false);
assert.equal("reasoning" in (coreModel ?? {}), false);
assert.equal("logo" in (fullJsonModel ?? {}), false);
assert.equal("attachment" in (fullJsonModel ?? {}), false);
assert.equal("reasoning" in (fullJsonModel ?? {}), false);
assert.deepEqual(fullJsonModel?.confidence, {
  intelligence: 1,
  agentic: 1,
  speed: 1,
  value: 1,
});
assert.equal(fullJsonModel?.reasoning_effort, null);
assert.equal(fullJsonModel?.benchmarks?.deep_swe, 0.6);
assert.deepEqual(fullJsonModel?.task_metrics?.deep_swe, {
  cost: 3,
  seconds: 4,
  output_tokens: 5,
});
assert.deepEqual(Object.keys(fullJsonModel?.scores ?? {}), [
  "intelligence_score",
  "agentic_score",
  "speed_score",
  "value_score",
]);
assert.equal(benchmarksPayload.schema, "model_atlas.benchmarks");
assert.equal(benchmarksPayload.benchmark_scale, "decimal");
assert.equal(benchmarksPayload.methodology, methodology);
assert.deepEqual(benchmarksModel, {
  rank: 1,
  id: "provider/model",
  name: "Model",
  provider: null,
  benchmarks: {
    gpqa: 0.9,
    deep_swe: 0.6,
  },
  benchmark_dates: {
    gpqa: "2026-07-30",
    deep_swe: "2026-07-31",
  },
});

const tiedPayload = minimalModelAtlasPayload({
  fetchedAt: 123,
  models: [
    rankedModel("provider/first", "First", 100),
    rankedModel("provider/second-a", "Second A", 90),
    rankedModel("provider/second-b", "Second B", 90),
    rankedModel("provider/fourth", "Fourth", 80),
  ],
});
assert.deepEqual(
  scoreJsonPayload(tiedPayload).scores.map((model) => model.rank),
  [1, 2, 2, 4],
  "score JSON should use tied competition ranks",
);
assert.deepEqual(
  coreJsonPayload(tiedPayload).models.map((model) => model.rank),
  [1, 2, 2, 4],
  "core JSON should use tied competition ranks",
);
assert.deepEqual(
  benchmarksJsonPayload(tiedPayload).benchmarks.map((model) => model.rank),
  [1, 2, 2, 4],
  "benchmarks JSON should use tied competition ranks",
);

function rankedModel(id: string, name: string, intelligenceScore: number) {
  const model = minimalModelAtlasModel({ id, name });
  return {
    ...model,
    scores: {
      ...model.scores,
      intelligence_score: intelligenceScore,
    },
  };
}
