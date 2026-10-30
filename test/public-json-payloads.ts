/** Verify the public model boundary, the JSON projections, and which of them each root route answers with. */

import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { leaderboardRows } from "../app/dashboard/table/models";
import { compactModelVariants } from "../app/leaderboard/model-variants";
import {
  benchmarksJsonPayload,
  coreJsonPayload,
  dashboardJsonPayload,
  type FullJsonPayload,
  fullJsonPayload,
  publicJsonPayload,
  scoreJsonPayload,
} from "../app/leaderboard/public-json";
import { proxy } from "../proxy";
import type { BenchmarkObservationEvidenceRow } from "../src/model-atlas/benchmarks/observation";
import {
  publicModelFromCandidate,
  selectReferenceModels,
} from "../src/model-atlas/pipeline/selection/public-list";
import type { ModelAtlasPayload, ModelAtlasScoredCandidate } from "../src/model-atlas/stats/types";
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
  },
  scores: {
    intelligence_score: 80,
    agentic_score: 70,
    speed_score: 60,
    value_score: 50,
  },
} satisfies ModelAtlasScoredCandidate & { internal_probe: string };
const [referenceModel] = selectReferenceModels([internalCandidate], null);
const projectedPublicModel = publicModelFromCandidate(referenceModel!);
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

// Route collapse must retain the winner's evidence even when a free route appears later.
const freeRoute = {
  ...internalCandidate,
  id: `${internalCandidate.id}:free`,
  scoring_sources: { regression_probe: { raw_score: 0.1 } },
};
for (const candidates of [
  [internalCandidate, freeRoute],
  [freeRoute, internalCandidate],
]) {
  const [selected] = selectReferenceModels(candidates, null);
  assert.equal(selected?.id, internalCandidate.id);
  assert.deepEqual(selected?.scoring_sources, internalCandidate.scoring_sources);
  assert.equal("scoring_sources" in publicModelFromCandidate(selected!)!, false);
}

const sparseResourceCandidate: ModelAtlasScoredCandidate = {
  ...internalCandidate,
  id: "provider/sparse-resource-candidate",
  name: "Sparse Resource Candidate",
  scores: {
    ...internalCandidate.scores,
    speed_score: null,
    value_score: null,
  },
};
const [sparseResourceModel] = selectReferenceModels([sparseResourceCandidate], null);
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
  selectReferenceModels([lowScoreCandidate], null).length,
  1,
  "low finite scores should remain public when evidence admission is handled separately",
);

const reasoningEffortModels = selectReferenceModels(
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
const fusedObservation = {
  model_id: internalCandidate.id,
  model: internalCandidate.name!,
  base_model: internalCandidate.name!,
  reasoning_effort: null,
  canonical_value: 0.92,
  observed_at: "2026-09-30",
  metadata: {
    fusion_collapsed: true,
    cost: 2,
    seconds_per_task: 30,
    tokens_per_task: 1000,
    output_tokens_per_task: 800,
    source_a_url: "https://example.com/ingestion-only",
    fusion_output_tokens_per_task_accounting_compatible: true,
  },
} satisfies BenchmarkObservationEvidenceRow;
// Fused rows reach the payload as whole crosswalk rows carrying bookkeeping outside the evidence row type.
const crosswalkObservation = {
  ...fusedObservation,
  benchmark_key: "arc_agi_2",
  source_url: "https://example.com/leaderboard",
  model_creator: "Provider",
  rank: 3,
  seconds_per_task: null,
  output_tokens_per_task: 800,
};
const observationPayload: ModelAtlasPayload = {
  ...reasoningVariantPayload,
  benchmark_observations: {
    arc_agi_2: [
      crosswalkObservation,
      {
        ...fusedObservation,
        reasoning_effort: "max",
        canonical_value: 1,
        observed_at: "2026-10-01",
        metadata: { observation_role: "component", source_b_url: "https://example.com/component" },
      },
    ],
  },
};
const dashboardProjection = dashboardJsonPayload(observationPayload);
assert.deepEqual(dashboardProjection.models, observationPayload.models);
assert.deepEqual(
  compactModelVariants(dashboardProjection.models, dashboardProjection.benchmark_observations),
  compactModelVariants(observationPayload.models, observationPayload.benchmark_observations),
  "Removing ingestion diagnostics must preserve collapsed fusion, resources, dates, and component exclusions",
);
assert.deepEqual(
  dashboardProjection.benchmark_observations!.arc_agi_2!.map((row) => row.metadata),
  [
    {
      fusion_collapsed: true,
      cost: 2,
      seconds_per_task: 30,
      tokens_per_task: 1000,
      output_tokens_per_task: 800,
    },
    { observation_role: "component" },
  ],
);
assert.deepEqual(
  Object.keys(
    JSON.parse(JSON.stringify(dashboardProjection.benchmark_observations!.arc_agi_2![0])),
  ),
  [
    "model_id",
    "model",
    "base_model",
    "reasoning_effort",
    "canonical_value",
    "observed_at",
    "metadata",
  ],
  "Dashboard rows publish only declared evidence fields",
);
assert.equal(
  fusedObservation.metadata.source_a_url,
  "https://example.com/ingestion-only",
  "Dashboard projection must not mutate the source observation",
);
const embeddedLogo = "data:image/png;base64,AAAA";
const logoPayload = minimalModelAtlasPayload({
  fetchedAt: 1,
  models: [
    {
      ...minimalModelAtlasModel({ id: "openai/icon-file-model", name: "Icon File Model" }),
      provider: "openai",
      logo: embeddedLogo,
    },
    {
      ...minimalModelAtlasModel({ id: "unlisted-lab/embedded-model", name: "Embedded Model" }),
      provider: "unlisted-lab",
      logo: embeddedLogo,
    },
    {
      ...minimalModelAtlasModel({ id: "unlisted-lab/no-logo-model", name: "No Logo Model" }),
      provider: "unlisted-lab",
    },
  ],
});
logoPayload.metadata = {
  ...logoPayload.metadata,
  source_health: { generated_at_epoch_seconds: 1, sources: {} },
  benchmark_update_health: {},
};
const publicDashboard = publicJsonPayload(logoPayload, "dashboard");
assert.deepEqual(
  publicDashboard.models.map((model) => model.logo),
  ["/provider-icons/openai.svg", embeddedLogo, ""],
  "The dashboard view names a provider's icon file by URL and keeps the embedded image only where the app serves no icon file",
);
assert.deepEqual(
  publicJsonPayload(logoPayload, "dashboard", "https://atlas.test").models.map(
    (model) => model.logo,
  ),
  ["https://atlas.test/provider-icons/openai.svg", embeddedLogo, ""],
  "Given the site's address, the dashboard view returns an icon URL a caller on another host can load",
);
assert.equal(
  logoPayload.models[0]!.logo,
  embeddedLogo,
  "Dashboard projection must not mutate the source model",
);
assert.deepEqual(
  Object.keys(publicDashboard.metadata),
  ["available_metrics", "scoring", "source_health", "benchmark_update_health"],
  "The public dashboard view keeps its health diagnostics; callers outside the app may read them",
);
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
const incompleteModel = publicModelFromCandidate({
  ...internalCandidate,
  id: "provider/recent-preview",
  name: "Recent Preview",
  cost: null,
  context_window: null,
  scores: { intelligence_score: 95, agentic_score: 85, speed_score: null, value_score: null },
  component_scores: {
    intelligence_score: 95,
    agentic_score: 85,
  },
});
const incompletePayload = minimalModelAtlasPayload({
  fetchedAt: 123,
  models: [reasoningEffortModels[0]!, incompleteModel!],
});
assert.deepEqual(
  [
    scoreJsonPayload(incompletePayload).scores.length,
    coreJsonPayload(incompletePayload).models.length,
    benchmarksJsonPayload(incompletePayload).benchmarks.length,
  ],
  [2, 2, 2],
  "compact public views include models with missing specifications",
);
assert.deepEqual(
  scoreJsonPayload(incompletePayload).scores.map((model) => [model.id, model.rank]),
  [
    ["provider/recent-preview", 1],
    ["provider/internal-candidate", 2],
  ],
  "models with missing specifications consume numeric ranks in score-relative order",
);
assert.deepEqual(
  coreJsonPayload(incompletePayload).models.map((model) => [model.id, model.rank]),
  [
    ["provider/recent-preview", 1],
    ["provider/internal-candidate", 2],
  ],
  "core rows should expose the same rank contract",
);
assert.deepEqual(
  benchmarksJsonPayload(incompletePayload).benchmarks.map((model) => [model.id, model.rank]),
  [
    ["provider/recent-preview", 1],
    ["provider/internal-candidate", 2],
  ],
  "benchmark rows should expose the same rank contract",
);
assert.equal(
  "preview" in (publicJsonPayload(incompletePayload, "all") as FullJsonPayload).models[1]!,
  false,
  "the all view does not expose a preview marker",
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
        benchmarks: { public_benefits_bench: 0.62 },
      },
    ],
  }),
);
assert.equal(
  valsBenchmarkPayload.benchmarks[0]?.benchmarks.public_benefits_bench,
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
assert.ok(typeof methodology === "string" && methodology.length > 0);

assert.equal(
  "deep_swe" in fullJson,
  false,
  "the full public view should not expose raw DeepSWE source rows",
);
assert.equal(scorePayload.schema, "model_atlas.score");
assert.equal(scorePayload.score_scale, "relative_0_100");

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
assert.deepEqual(corePayload.score_scale, scorePayload.score_scale);
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
  "task_cost_ratio",
  "task_time_ratio",
  "total_token_ratio",
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

// The API reports the leaderboard's own resource ratios: each amount over its benchmark's median.
const ratioPayload = minimalModelAtlasPayload({
  fetchedAt: 123,
  models: [
    resourceModel("provider/frugal", "Frugal", 90, 2),
    resourceModel("provider/typical", "Typical", 80, 4),
    resourceModel("provider/costly", "Costly", 70, 8),
  ],
});
ratioPayload.metadata.scoring.benchmark_portfolio = {
  hle: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
    resourcePolicy: { source: "benchmark", unit: "per_task", tokenMeasure: "tokens" },
  },
};
const coreRatios = coreJsonPayload(ratioPayload).models.map(
  ({ task_cost_ratio, task_time_ratio, total_token_ratio }) => [
    task_cost_ratio,
    task_time_ratio,
    total_token_ratio,
  ],
);
assert.deepEqual(coreRatios, [
  [0.5, 0.5, 0.5],
  [1, 1, 1],
  [2, 2, 2],
]);
assert.deepEqual(
  leaderboardRows(ratioPayload, false).map(({ resourceRatios: { cost, time, tokens } }) => [
    cost.ratio,
    time.ratio,
    tokens.ratio,
  ]),
  coreRatios,
  "core ratios should match the leaderboard's",
);
assert.deepEqual(fullJsonPayload(ratioPayload).models[0]?.resource_ratios, {
  cost: { ratio: 0.5, benchmark_count: 1, source_count: 1 },
  time: { ratio: 0.5, benchmark_count: 1, source_count: 1 },
  tokens: { ratio: 0.5, benchmark_count: 1, source_count: 1 },
});

assert.equal(destination("/", { accept: "*/*" }), "/api/llm-stats");
assert.equal(destination("/", {}), "/api/llm-stats");
assert.equal(destination("/core", { accept: "application/json" }), "/api/llm-stats?view=core");
assert.equal(destination("/", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" }), "app");
assert.equal(destination("/score", { accept: "text/html" }), "redirect /");
assert.equal(
  destination("/", { accept: "*/*", rsc: "1", "next-url": "/methodology" }),
  "app",
  "The app router's own route fetch must receive the route payload, or returning to the leaderboard reloads the page",
);
assert.equal(destination("/score", { accept: "*/*", "next-url": "/methodology" }), "redirect /");
assert.equal(
  destination("/core", { accept: "*/*", "sec-fetch-site": "same-origin" }),
  "/api/llm-stats?view=core",
  "A script on the site's own origin keeps its JSON view, like any other client",
);
assert.equal(destination("/", { accept: "*/*", "sec-fetch-site": "cross-site" }), "/api/llm-stats");
assert.equal(destination("/methodology", { accept: "*/*" }), "app");

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

function resourceModel(id: string, name: string, intelligenceScore: number, amount: number) {
  return {
    ...rankedModel(id, name, intelligenceScore),
    benchmarks: { hle: intelligenceScore / 100 },
    task_metrics: { hle: { cost: amount, seconds: amount, tokens: amount } },
  };
}

/** Name where the proxy sends a request: the rewritten API path, a redirect target, or `app` for the unchanged route. */
function destination(path: string, headers: Record<string, string>): string {
  const response = proxy(new NextRequest(`https://model-atlas.test${path}`, { headers }));
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite != null) {
    const url = new URL(rewrite);
    return `${url.pathname}${url.search}`;
  }
  const redirect = response.headers.get("location");
  if (redirect != null) return `redirect ${new URL(redirect).pathname}`;
  return response.headers.get("x-middleware-next") === "1" ? "app" : "unknown";
}
