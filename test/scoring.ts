/** Exercises component scoring, benchmark imputation, anchors, and scoring configuration invariants. */

import assert from "node:assert/strict";

import { validateBenchmarkPortfolio } from "../src/model-atlas/benchmarks/factory";
import {
  INDEX_BENCHMARK_KEYS,
  MINIMUM_REPORTED_INDEX_BREADTH,
} from "../src/model-atlas/benchmarks/index-policy";
import {
  INDEX_REPRESENTED_BENCHMARK_COUNTS,
  INDEX_REPRESENTED_BENCHMARK_MEDIAN,
} from "../src/model-atlas/benchmarks/registry";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import type { ScoringConfig } from "../src/model-atlas/config/stage";
import {
  effectiveSampleSize,
  medianOfFinite,
  quantileFromSorted,
  weightedPercentileRank,
  weightedQuantile,
  weightedQuantileRank,
} from "../src/model-atlas/math-utils";
import {
  attachFinalScores,
  blendedPriceValue,
  buildBenchmarkImputationByModel,
  buildBenchmarkImputationDiagnosticsByKey,
  buildComponentScoreResult,
  imputedTaskResource,
  prepareEffortResourceImputation,
} from "../src/model-atlas/pipeline/scores";
import {
  benchmarkImputationValues,
  prepareBenchmarkScoring,
  withoutBenchmarkImputationForModels,
} from "../src/model-atlas/pipeline/scores/imputation";
import { prepareEffortQualityScoringContext } from "../src/model-atlas/pipeline/scores/imputation/effort-quality";
import {
  evidenceRetentionFactor,
  logInputMinMaxScores,
  logitUnitScore,
  minMaxRange,
  minMaxScale,
  minMaxScores,
  winsorizedMinMaxScores,
} from "../src/model-atlas/pipeline/scores/normalization";
import {
  buildAgenticTokenScoringContext,
  buildQualityScoringContext,
  normalizedMetricValue,
} from "../src/model-atlas/pipeline/scores/quality-context";
import {
  benchmarkResourceEfficiencyScores,
  modelBalancedMinMaxScores,
  qualityAdjustedResourceMultipliers,
  qualityLocalResourceScores,
} from "../src/model-atlas/pipeline/scores/resource-efficiency";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
} from "../src/model-atlas/pipeline/scores/resource-metrics";
import { buildCurrentModelAtlasMetadata } from "../src/model-atlas/stats/payload/metadata";
import type { BenchmarkPortfolio, ModelAtlasCandidate } from "../src/model-atlas/stats/types";

const nullSpeed = {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
};

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual: unknown, expected: number, epsilon = 0.0001): void {
  if (
    typeof actual !== "number" ||
    !Number.isFinite(actual) ||
    Math.abs(actual - expected) > epsilon
  ) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertThrowsWithMessage(action: () => void, expectedMessage: string): void {
  try {
    action();
  } catch (error) {
    assertEqual((error as Error).message, expectedMessage);
    return;
  }
  throw new Error(`Expected error: ${expectedMessage}`);
}

const rawAgentBenchmarkRanges = new Map([
  ["agent_arena", minMaxRange([-0.15305257102824063, 0, 0.1394124051275084])],
  ["vending_bench_2", minMaxRange([-31.18399999999995, 9_000, 10_936.763333333334])],
]);
assertClose(normalizedMetricValue(rawAgentBenchmarkRanges, "agent_arena", 0), 52.3319);
assertClose(normalizedMetricValue(rawAgentBenchmarkRanges, "vending_bench_2", 9_000), 82.3416);
assertClose(evidenceRetentionFactor(1, 1, 3), 0);
assertClose(evidenceRetentionFactor(2, 1, 3), 0.5);
assertClose(evidenceRetentionFactor(3, 1, 3), 1);
assertThrowsWithMessage(
  () => evidenceRetentionFactor(1, 3, 1),
  "Evidence confidence requires finite mass and 0 <= floor < full, received 1, 3, 1",
);

assertEqual(
  blendedPriceValue({
    input: 5,
    output: 25,
    cache_read: 0.5,
    cache_write: 6.25,
    weighted_input: 1.5,
    weighted_output: 25,
  }),
  13.25,
);

assertEqual(
  blendedPriceValue({
    input: 2.5,
    output: 7.5,
    cache_read: 0.5,
    cache_write: 3.125,
    weighted_input: 0,
    weighted_output: 0,
  }),
  0,
);

assert.equal(
  blendedPriceValue({ input: 0, output: 0 }),
  null,
  "published list pricing should not replace missing provider-weighted pricing",
);

const sparseQuantileValues = [0, 50, 100];
assertEqual(quantileFromSorted(sparseQuantileValues, 0), 0);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.05), 5);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.5), 50);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.95), 95);
assertEqual(quantileFromSorted(sparseQuantileValues, 1), 100);
const weightedCalibrationValues = [
  { value: 0, weight: 1 },
  { value: 50, weight: 1 },
  { value: 100, weight: 1 },
];
const splitWeightedCalibrationValues = [
  { value: 0, weight: 1 },
  { value: 50, weight: 0.5 },
  { value: 50, weight: 0.5 },
  { value: 100, weight: 1 },
];
assertClose(
  weightedQuantile(splitWeightedCalibrationValues, 0.75),
  weightedQuantile(weightedCalibrationValues, 0.75) ?? 0,
);
assertClose(
  weightedPercentileRank(splitWeightedCalibrationValues, 50),
  weightedPercentileRank(weightedCalibrationValues, 50) ?? 0,
);
assertClose(weightedQuantileRank(weightedCalibrationValues, 50), 50);
assertClose(
  weightedQuantile(
    weightedCalibrationValues,
    (weightedQuantileRank(weightedCalibrationValues, 50) ?? 0) / 100,
  ),
  50,
);
assertClose(effectiveSampleSize([1, 1, 1]), 3);
assertClose(effectiveSampleSize([0.5, 0.5]), 2);
assertEqual(
  logitUnitScore(0.96) - logitUnitScore(0.95) > logitUnitScore(0.51) - logitUnitScore(0.5),
  true,
);
assertThrowsWithMessage(
  () => logitUnitScore(90),
  "Logit quality coordinates require a finite 0-1 score, received 90",
);
const linearCoordinateModels = [
  { id: "test/linear-coordinate-a" },
  { id: "test/linear-coordinate-b" },
  { id: "test/linear-coordinate-c" },
  { id: "test/linear-coordinate-d" },
];
const linearCoordinates = [172.975, 400, 1_600, 2_176.875];
const linearResourceSignals = [1, 2, 3, 4];
assert.deepEqual(
  benchmarkResourceEfficiencyScores(
    linearCoordinateModels,
    linearCoordinates,
    linearResourceSignals,
    "linear",
  ),
  qualityLocalResourceScores(
    linearCoordinateModels,
    linearCoordinates,
    linearResourceSignals,
    "linear",
  ),
);
const winsorizedScores = winsorizedMinMaxScores(
  [1, 2, 3, 10],
  [1, 2, 3, 10].map((value) => ({ value, weight: 1 })),
  "lower",
  0.25,
);
assertClose(winsorizedScores[0], 100);
assertClose(winsorizedScores[3], 0);
assertEqual((winsorizedScores[1] ?? 0) > (winsorizedScores[2] ?? 0), true);
assertEqual(medianOfFinite([100, null, 0, 50]), 50);

validateBenchmarkPortfolio(STAGE_CONFIG.scoring.benchmarkPortfolio);
for (const key of INDEX_BENCHMARK_KEYS) {
  assert.equal(STAGE_CONFIG.scoring.benchmarkPortfolio[key]?.benchmarkImportance, 1);
}
assert.equal(INDEX_REPRESENTED_BENCHMARK_COUNTS.aa_intelligence_index, 10);
assert.equal(INDEX_REPRESENTED_BENCHMARK_COUNTS.cais_capabilities_index, 7);
assert.equal(INDEX_REPRESENTED_BENCHMARK_COUNTS.surge_intelligence_index, 8);
assert.equal(INDEX_REPRESENTED_BENCHMARK_COUNTS.vals_index, 7);
assert.equal(INDEX_REPRESENTED_BENCHMARK_COUNTS.epoch_capabilities_index, 7.5);
assert.equal(
  INDEX_REPRESENTED_BENCHMARK_MEDIAN,
  medianOfFinite(
    Object.entries(INDEX_REPRESENTED_BENCHMARK_COUNTS)
      .filter(([key]) => key !== "epoch_capabilities_index")
      .map(([, count]) => count),
  ),
);
assertClose(
  STAGE_CONFIG.scoring.qualityCoverage.intelligence.floor,
  INDEX_REPRESENTED_BENCHMARK_MEDIAN * 0.1,
);
assertClose(
  STAGE_CONFIG.scoring.qualityCoverage.intelligence.full,
  INDEX_REPRESENTED_BENCHMARK_MEDIAN,
);
assertClose(
  STAGE_CONFIG.scoring.qualityCoverage.agentic.floor,
  INDEX_REPRESENTED_BENCHMARK_MEDIAN * 0.1,
);
assertClose(STAGE_CONFIG.scoring.qualityCoverage.agentic.full, INDEX_REPRESENTED_BENCHMARK_MEDIAN);
assertClose(STAGE_CONFIG.scoring.qualityRetention.floor, 1.2);
assertClose(STAGE_CONFIG.scoring.qualityRetention.full, 12);
assert.equal(
  STAGE_CONFIG.final.benchmarkAdmission.minimumObservedWeight,
  MINIMUM_REPORTED_INDEX_BREADTH,
);
assert.equal(MINIMUM_REPORTED_INDEX_BREADTH, 7);
const resourceQualityCoordinates = Object.fromEntries(
  Object.entries(STAGE_CONFIG.scoring.benchmarkPortfolio as BenchmarkPortfolio).flatMap(
    ([key, policy]) =>
      policy?.resourcePolicy == null ? [] : [[key, policy.resourcePolicy.qualityCoordinate]],
  ),
);
assert.deepEqual(resourceQualityCoordinates, {
  agents_last_exam: "linear",
  ale_bench: "linear",
  analyst_agent: "logit",
  arc_agi_2: "logit",
  arc_agi_3: "linear",
  automation_bench: "logit",
  briefcase: "linear",
  critpt: "logit",
  deep_swe: "logit",
  frontier_code: "linear",
  gdp_pdf: "logit",
  gdpval_normalized: "linear",
  hle: "logit",
  mlcr_aa: "logit",
  scicode: "logit",
  terminal_bench_4: "logit",
  terminal_bench_science: "logit",
});
assert.deepEqual(
  Object.fromEntries(
    (
      [
        "biomysterybench",
        "code_migration",
        "emb",
        "finance_agent_v2",
        "mysterymechanism",
        "programbench",
        "public_benefits_bench",
        "rsi_benchmark",
        "vibe_code",
      ] as const
    ).map((key) => [key, STAGE_CONFIG.scoring.benchmarkPortfolio[key]]),
  ),
  {
    biomysterybench: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
    code_migration: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
    },
    emb: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
    },
    finance_agent_v2: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
    mysterymechanism: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
    },
    programbench: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
    },
    public_benefits_bench: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
    rsi_benchmark: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
    vibe_code: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
    },
  },
);
assertEqual(
  JSON.stringify(INDEX_BENCHMARK_KEYS),
  JSON.stringify([
    "aa_intelligence_index",
    "cais_capabilities_index",
    "epoch_capabilities_index",
    "surge_intelligence_index",
    "vals_index",
  ]),
);
for (const key of [
  "aa_intelligence_index",
  "cais_capabilities_index",
  "epoch_capabilities_index",
  "surge_intelligence_index",
  "vals_index",
] as const) {
  const expectedIntelligence = key === "cais_capabilities_index" ? 0.75 : 0.5;
  const expectedAgentic = key === "cais_capabilities_index" ? 0.25 : 0.5;
  assertEqual(
    STAGE_CONFIG.scoring.benchmarkPortfolio[key].dimensionLoadings.intelligence,
    expectedIntelligence,
  );
  assertEqual(
    STAGE_CONFIG.scoring.benchmarkPortfolio[key].dimensionLoadings.agentic,
    expectedAgentic,
  );
}
assertEqual(
  benchmarkMetricValue({ intelligence: { intelligence_index: 73.5 } }, "aa_intelligence_index"),
  73.5,
);
assertEqual(
  benchmarkMetricValue({ benchmarks: { aa_intelligence_index: 71.25 } }, "aa_intelligence_index"),
  71.25,
);
assertEqual(
  benchmarkMetricValue({ benchmarks: { custom_benchmark: 0.625 } }, "custom_benchmark"),
  0.625,
);
assertEqual(
  benchmarkMetricValue({ intelligence: { custom_benchmark: 0.75 } }, "custom_benchmark"),
  0.75,
);
assertEqual(
  benchmarkMetricValue({ intelligence: { omniscience_accuracy: 0.82 } }, "omniscience_accuracy"),
  0.82,
);
assertThrowsWithMessage(
  () =>
    validateBenchmarkPortfolio({
      test: {
        group: "frontier",
        benchmarkImportance: 0,
        dimensionLoadings: { intelligence: 1, agentic: 0 },
      },
    }),
  "Benchmark importance must be finite and positive for test",
);
assertThrowsWithMessage(
  () =>
    validateBenchmarkPortfolio({
      test: {
        group: "invalid",
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 1, agentic: 0 },
      },
    } as unknown as BenchmarkPortfolio),
  "Invalid benchmark group for test: invalid",
);
assertThrowsWithMessage(
  () =>
    validateBenchmarkPortfolio({
      test: {
        group: "frontier",
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 1, agentic: 0 },
        resourcePolicy: {
          source: "benchmark",
          unit: "per_task",
          tokenMeasure: "tokens",
          qualityCoordinate: "invalid",
        },
      },
    } as unknown as BenchmarkPortfolio),
  "Invalid resource quality coordinate for test: invalid",
);

const aaOnlyResourceMetadata = buildCurrentModelAtlasMetadata({
  models: [
    {
      benchmarks: { hle: 0.9 },
    },
  ],
  resourceModels: [
    {
      benchmarks: { hle: 0.9 },
      task_metrics: {
        hle: { cost: 0.1, seconds: 10 },
      },
    },
  ],
  benchmarkUpdateHealth: {},
  scoringConfig: STAGE_CONFIG.scoring,
});
const aaOnlyTimeTooltip = JSON.stringify(aaOnlyResourceMetadata.scoring.column_tooltips.speed);
const aaOnlyValueTooltip = JSON.stringify(aaOnlyResourceMetadata.scoring.column_tooltips.value);
assert.deepEqual(
  aaOnlyResourceMetadata.scoring.quality_coverage,
  STAGE_CONFIG.scoring.qualityCoverage,
);
assertEqual(aaOnlyTimeTooltip.includes("33.3% each"), false);
assertEqual(aaOnlyTimeTooltip.includes("Frontier benchmark runtime"), false);
assertEqual(aaOnlyValueTooltip.includes("25.0% each"), false);
assertEqual(aaOnlyValueTooltip.includes("Frontier benchmark cost"), false);
assertEqual(aaOnlyTimeTooltip.includes("70.0%"), true);
assertEqual(aaOnlyTimeTooltip.includes("10.0%"), true);
assertEqual(aaOnlyValueTooltip.includes("70.0%"), true);
assertEqual(aaOnlyValueTooltip.includes("15.0%"), true);

const mixedResourceMetadata = buildCurrentModelAtlasMetadata({
  models: [
    {
      benchmarks: { hle: 0.9, deep_swe: 0.8 },
    },
  ],
  resourceModels: [
    {
      benchmarks: { hle: 0.9, deep_swe: 0.8 },
      task_metrics: {
        hle: { cost: 0.1, seconds: 10 },
        deep_swe: { cost: 0.2, seconds: 20 },
      },
    },
  ],
  benchmarkUpdateHealth: {},
  scoringConfig: STAGE_CONFIG.scoring,
});
const mixedTimeTooltip = JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.speed);
const mixedValueTooltip = JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.value);
assertEqual(mixedTimeTooltip.includes("25.0% each"), false);
assertEqual(mixedValueTooltip.includes("20.0% each"), false);
assertEqual(mixedTimeTooltip.includes("35.0%"), true);
assertEqual(mixedValueTooltip.includes("35.0%"), true);

const tokenProxyResourceMetadata = buildCurrentModelAtlasMetadata({
  models: [
    {
      benchmarks: { deep_swe: 0.8 },
    },
  ],
  resourceModels: [
    {
      benchmarks: { deep_swe: 0.8 },
      speed: { throughput_tokens_per_second_median: 50 },
      task_metrics: {
        deep_swe: { cost: 0.2, output_tokens: 1_000 },
      },
    },
  ],
  benchmarkUpdateHealth: {},
  scoringConfig: STAGE_CONFIG.scoring,
});
assertEqual(
  JSON.stringify(tokenProxyResourceMetadata.scoring.column_tooltips.speed).includes(
    "DeepSWE runtime",
  ),
  true,
);
assert.deepEqual(
  benchmarkTaskMetrics(
    {
      task_metrics: {
        artificial_analysis: { cost: 0.1, seconds: 10 },
        hle: { seconds: 5 },
      },
    },
    "hle",
  ),
  { seconds: 5 },
  "Missing benchmark cost must not borrow an unrelated source-wide average",
);
assert.deepEqual(
  benchmarkTaskMetrics(
    {
      task_metrics: {
        arc_agi_3: {
          cost: 99,
        },
      },
    },
    "arc_agi_3",
  ),
  { cost: 99 },
  "Per-task benchmarks should consume the normalized cost field",
);

const broadAAResourceOnlyModels = attachFinalScores(
  [
    {
      ...modelCandidate({
        id: "test/broad-aa-a",
        gdpvalScore: 0.9,
        artificialAnalysisCost: 0.1,
        artificialAnalysisSeconds: 1,
        throughputTokensPerSecond: 100,
        latencySeconds: 1,
        disableBaseCost: true,
      }),
      benchmarks: { gdpval_normalized: 0.9, hle: 0.9 },
    },
    {
      ...modelCandidate({
        id: "test/broad-aa-b",
        gdpvalScore: 0.1,
        artificialAnalysisCost: 10,
        artificialAnalysisSeconds: 100,
        throughputTokensPerSecond: 50,
        latencySeconds: 2,
        disableBaseCost: true,
      }),
      benchmarks: { gdpval_normalized: 0.1, hle: 0.1 },
    },
  ],
  STAGE_CONFIG.scoring,
);
assertEqual(broadAAResourceOnlyModels[0]?.scores.value_score, null);
assertEqual(broadAAResourceOnlyModels[1]?.scores.value_score, null);

const tokenProxySpeedModels = attachFinalScores(
  [
    modelCandidate({
      id: "test/token-proxy-fast",
      deepSWEScore: 0.9,
      deepSWECost: 1,
      deepSWEOutputTokens: 1_000,
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/token-proxy-slow",
      deepSWEScore: 0.8,
      deepSWECost: 1,
      deepSWEOutputTokens: 1_000,
      throughputTokensPerSecond: 10,
      latencySeconds: 1,
      disableBaseCost: true,
    }),
  ],
  STAGE_CONFIG.scoring,
);
assertClose(tokenProxySpeedModels[0]?.scores.speed_score, 61.1111);
assertClose(tokenProxySpeedModels[1]?.scores.speed_score, 50);

const latencySpeedModels = attachFinalScores(
  [
    modelCandidate({
      id: "test/low-latency",
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
    }),
    modelCandidate({
      id: "test/high-latency",
      throughputTokensPerSecond: 100,
      latencySeconds: 10,
    }),
  ],
  STAGE_CONFIG.scoring,
);
assertClose(latencySpeedModels[0]?.scores.speed_score, 100);
assertClose(latencySpeedModels[1]?.scores.speed_score, 50);

const gapExampleValues = [1, 2, 3, 50, 60, 70, 95, 99];
assert.equal(minMaxScale(minMaxRange([null, NaN, Infinity]), 5), null);
assert.equal(minMaxScale(minMaxRange([null, 5, 5]), null), null);
assert.equal(minMaxScale(minMaxRange([null, 5, 5]), 5), 100);
assert.equal(minMaxScale(minMaxRange([null, NaN, 10, 20, Infinity]), 15), 50);
assert.equal(minMaxScale(minMaxRange([10, 20]), 30), 200);
assert.deepEqual(minMaxScores([null, NaN, Infinity, 10, 15, 20], "lower"), [
  null,
  null,
  null,
  100,
  50,
  0,
]);
const minMaxGapScores = minMaxScores(gapExampleValues, "higher");
assertClose(minMaxGapScores[3], 50);
assertClose(minMaxGapScores[4], 60.2040816327);
assertClose(
  ((minMaxGapScores[3] ?? 0) - (minMaxGapScores[2] ?? 0)) /
    ((minMaxGapScores[4] ?? 0) - (minMaxGapScores[3] ?? 0)),
  4.7,
);
assertClose(logInputMinMaxScores([1, 10, 100], "higher")[1], 50);
assertClose(logInputMinMaxScores([1, 10, 100], "lower")[1], 50);

// Provider speed inputs are logged before outer min-max normalization.
const absoluteGapSpeedModels = attachFinalScores(
  [10, 20, 100].map((throughputTokensPerSecond) =>
    modelCandidate({
      id: `test/absolute-gap-speed-${throughputTokensPerSecond}`,
      throughputTokensPerSecond,
      latencySeconds: 1,
      disableBaseCost: true,
    }),
  ),
  STAGE_CONFIG.scoring,
);
assertClose(absoluteGapSpeedModels[1]?.scores.speed_score, 65.0515);

// Price inputs are logged once before absolute and quality-adjusted scoring.
const absoluteGapValueModels = attachFinalScores(
  [1, 10, 100].map((blendedPrice) =>
    modelCandidate({
      id: `test/absolute-gap-value-${blendedPrice}`,
      intelligenceScore: 50,
      agenticScore: 50,
      blendedPrice,
    }),
  ),
  STAGE_CONFIG.scoring,
);
assertClose(absoluteGapValueModels[1]?.scores.value_score, 56.166718);

const zeroPriceValueModels = attachFinalScores(
  [0, 1, 10].map((blendedPrice) =>
    modelCandidate({
      id: `test/zero-price-value-${blendedPrice}`,
      intelligenceScore: 50,
      agenticScore: 50,
      blendedPrice,
    }),
  ),
  STAGE_CONFIG.scoring,
);
assert.equal(
  typeof zeroPriceValueModels[0]?.scores.value_score,
  "number",
  "published zero pricing should produce a Value score",
);
assert.equal(
  (zeroPriceValueModels[0]?.scores.value_score ?? 0) >
    (zeroPriceValueModels[1]?.scores.value_score ?? 0),
  true,
  "a free model should outrank an otherwise identical paid peer on Value",
);

const aggregateQualityPrices = [30, 10, 20, 15, 5, 12, 8, 100];
const aggregateQualityModels = gapExampleValues.map((quality, index) => ({
  ...modelCandidate({
    id: `test/aggregate-quality-${quality}`,
    intelligenceScore: quality,
    agenticScore: quality,
    disableBaseCost: true,
  }),
  cost: { blended_price: aggregateQualityPrices[index] ?? null },
}));
const aggregateQualityPriceSignals = aggregateQualityModels.map((model) =>
  Math.log10(1 + (model.cost.blended_price ?? 0)),
);
const aggregateQualityRawPriceScores = modelBalancedMinMaxScores(
  aggregateQualityModels,
  aggregateQualityPriceSignals,
  "lower",
);
const aggregateQualityLinearScores = qualityLocalResourceScores(
  aggregateQualityModels,
  aggregateQualityModels.map((model) => model.component_scores?.intelligence_score ?? null),
  aggregateQualityPriceSignals,
  "linear",
);
const aggregateQualityLogitScores = qualityLocalResourceScores(
  aggregateQualityModels,
  aggregateQualityModels.map((model) => {
    const score = model.component_scores?.intelligence_score;
    return score == null ? null : logitUnitScore(score / 100);
  }),
  aggregateQualityPriceSignals,
  "logit",
);
const aggregateQualityScoredModels = attachFinalScores(
  aggregateQualityModels,
  STAGE_CONFIG.scoring,
);
const aggregateQualityTestIndex = 3;
const aggregateQualityValueScore =
  aggregateQualityScoredModels[aggregateQualityTestIndex]?.scores.value_score;
const aggregateQualityRawPriceScore =
  aggregateQualityRawPriceScores[aggregateQualityTestIndex] ?? 0;
assertClose(
  aggregateQualityValueScore,
  (aggregateQualityRawPriceScore + (aggregateQualityLinearScores[aggregateQualityTestIndex] ?? 0)) /
    2,
);
assertEqual(
  Math.abs(
    (aggregateQualityValueScore ?? 0) -
      (aggregateQualityRawPriceScore +
        (aggregateQualityLogitScores[aggregateQualityTestIndex] ?? 0)) /
        2,
  ) > 0.01,
  true,
);

const fractionalBenchmarkConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["baseline_metric", "frontier_metric"],
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  agenticBenchmarkKeys: [],
  qualityCoverage: {
    intelligence: { floor: 0, full: 1 },
    agentic: { floor: 0, full: 1 },
  },
  qualityRetention: { floor: 0.15, full: 0.9 },
  benchmarkPortfolio: {
    baseline_metric: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.8, agentic: 0.2 },
    },
    frontier_metric: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
    },
  },
} as const;
const fractionalBenchmarkModels = [
  {
    id: "fractional-min",
    benchmarks: { baseline_metric: 0, frontier_metric: 0 },
  },
  {
    id: "fractional-max",
    benchmarks: { baseline_metric: 100, frontier_metric: 100 },
  },
  {
    id: "fractional-target",
    benchmarks: { baseline_metric: 0, frontier_metric: 100 },
  },
];
const fractionalBenchmarkComponentScores = buildComponentScoreResult(
  fractionalBenchmarkModels[2] ?? {},
  nullSpeed,
  [],
  fractionalBenchmarkConfig,
  buildQualityScoringContext(fractionalBenchmarkModels, fractionalBenchmarkConfig),
).componentScores;
assertClose(fractionalBenchmarkComponentScores?.intelligence_score, 80);
const priorityWeightedComponentScores = buildComponentScoreResult(
  fractionalBenchmarkModels[2] ?? {},
  nullSpeed,
  [],
  fractionalBenchmarkConfig,
  buildQualityScoringContext(fractionalBenchmarkModels, fractionalBenchmarkConfig),
  new Map(),
  new Map(),
  new Map([["frontier_metric", 2]]),
).componentScores;
assertClose(priorityWeightedComponentScores?.intelligence_score, 80);

const importanceWeightedConfig = {
  ...fractionalBenchmarkConfig,
  benchmarkPortfolio: {
    baseline_metric: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
    frontier_metric: {
      group: "frontier",
      benchmarkImportance: 3,
      dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
    },
  },
} as const;
const importanceWeightedContext = buildQualityScoringContext(
  fractionalBenchmarkModels,
  importanceWeightedConfig,
);
const importanceWeightedScores = buildComponentScoreResult(
  fractionalBenchmarkModels[2] ?? {},
  nullSpeed,
  [],
  importanceWeightedConfig,
  importanceWeightedContext,
).componentScores;
assertClose(importanceWeightedScores?.intelligence_score, 80);

const groupFlippedScores = buildComponentScoreResult(
  fractionalBenchmarkModels[2] ?? {},
  nullSpeed,
  [],
  {
    ...importanceWeightedConfig,
    benchmarkPortfolio: {
      baseline_metric: {
        ...importanceWeightedConfig.benchmarkPortfolio.baseline_metric,
        group: "frontier",
      },
      frontier_metric: {
        ...importanceWeightedConfig.benchmarkPortfolio.frontier_metric,
        group: "baseline",
      },
    },
  },
  importanceWeightedContext,
).componentScores;
assertClose(groupFlippedScores?.intelligence_score, 20);

const fractionalEvidenceComponentScores = buildComponentScoreResult(
  { id: "fractional-sparse", benchmarks: { frontier_metric: 100 } },
  nullSpeed,
  [],
  fractionalBenchmarkConfig,
  buildQualityScoringContext(fractionalBenchmarkModels, fractionalBenchmarkConfig),
).componentScores;
assertEqual(fractionalEvidenceComponentScores?.intelligence_score ?? null, null);

const frontierOnlyScoringConfig = {
  ...fractionalBenchmarkConfig,
  intelligenceGroupWeights: { frontier: 1, baseline: 0 },
  qualityCoverageMinimumRetention: 1,
} as const;
const frontierOnlyContext = buildQualityScoringContext(
  fractionalBenchmarkModels,
  frontierOnlyScoringConfig,
);
const frontierOnlyObserved = buildComponentScoreResult(
  fractionalBenchmarkModels[2]!,
  nullSpeed,
  [],
  frontierOnlyScoringConfig,
  frontierOnlyContext,
);
const frontierOnlyBaselineChanged = buildComponentScoreResult(
  { id: "fractional-target", benchmarks: { baseline_metric: 100, frontier_metric: 100 } },
  nullSpeed,
  [],
  frontierOnlyScoringConfig,
  frontierOnlyContext,
);
const frontierOnlyMissingBaseline = buildComponentScoreResult(
  { id: "fractional-target", benchmarks: { frontier_metric: 100 } },
  nullSpeed,
  [],
  frontierOnlyScoringConfig,
  frontierOnlyContext,
);
assertClose(frontierOnlyObserved.componentScores?.intelligence_score, 100);
assertClose(frontierOnlyBaselineChanged.componentScores?.intelligence_score, 100);
assertClose(frontierOnlyMissingBaseline.componentScores?.intelligence_score, 100);
assertEqual(
  frontierOnlyMissingBaseline.confidence.intelligence,
  frontierOnlyObserved.confidence.intelligence,
);

const imputationConfidenceConfig = {
  ...importanceWeightedConfig,
  qualityCoverageMinimumRetention: 1,
  qualityCoverage: {
    intelligence: { floor: 0, full: 0.1 },
    agentic: { floor: 0, full: 0.1 },
  },
} as const;
const imputationConfidenceResult = buildComponentScoreResult(
  { id: "imputation-confidence", benchmarks: { baseline_metric: 100 } },
  nullSpeed,
  [],
  imputationConfidenceConfig,
  importanceWeightedContext,
  new Map([["frontier_metric", 0]]),
  new Map([["frontier_metric", 0.2]]),
);
assertEqual(imputationConfidenceResult.componentScores?.intelligence_score ?? null, null);
assertClose(imputationConfidenceResult.confidence.intelligence, 0.4);

const sparseBenchmarkKeys = Array.from({ length: 12 }, (_, index) => `quality_${index}`);
const sparseEvidenceBenchmarkPortfolio = Object.fromEntries(
  sparseBenchmarkKeys.map((key, index) => [
    key,
    {
      group: index === 1 ? "baseline" : "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
  ]),
) as Record<
  string,
  {
    group: "frontier" | "baseline";
    benchmarkImportance: 1;
    dimensionLoadings: { intelligence: 1; agentic: 0 };
  }
>;
const sparseEvidenceConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  intelligenceBenchmarkKeys: sparseBenchmarkKeys,
  agenticBenchmarkKeys: [],
  qualityCoverage: {
    intelligence: { floor: 0, full: 2 },
    agentic: { floor: 0, full: 1 },
  },
  qualityRetention: { floor: 1.5, full: 12 },
  benchmarkPortfolio: sparseEvidenceBenchmarkPortfolio,
} as const;
const sparseEvidenceModels = [
  {
    id: "sparse-min",
    benchmarks: Object.fromEntries(sparseBenchmarkKeys.map((key) => [key, 0])),
  },
  {
    id: "sparse-max",
    benchmarks: Object.fromEntries(sparseBenchmarkKeys.map((key) => [key, 100])),
  },
  {
    id: "sparse-target",
    benchmarks: { quality_0: 100, quality_1: 100 },
  },
];
const sparseEvidenceResult = buildComponentScoreResult(
  sparseEvidenceModels[2] ?? {},
  nullSpeed,
  [],
  sparseEvidenceConfig,
  buildQualityScoringContext(sparseEvidenceModels, sparseEvidenceConfig),
);
const sparseEvidenceComponentScores = sparseEvidenceResult.componentScores;
assertClose(
  sparseEvidenceComponentScores?.intelligence_score,
  100 * (0.85 + 0.15 * evidenceRetentionFactor(3, 1.5, 12)),
);
assertClose(sparseEvidenceResult.confidence.intelligence, 2 / 12);
const sparseLowEvidenceResult = buildComponentScoreResult(
  { id: "sparse-low", benchmarks: { quality_0: 0, quality_1: 0 } },
  nullSpeed,
  [],
  sparseEvidenceConfig,
  buildQualityScoringContext(sparseEvidenceModels, sparseEvidenceConfig),
);
assertClose(sparseLowEvidenceResult.componentScores?.intelligence_score, 0);

const directResourceScoredModels = attachFinalScores(
  [
    modelCandidate({
      id: "test/frontier-efficient",
      deepSWEScore: 0.9,
      deepSWECost: 0.1,
      deepSWESeconds: 90,
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
    }),
    modelCandidate({
      id: "test/frontier-middle",
      deepSWEScore: 0.5,
      deepSWECost: 0.5,
      deepSWESeconds: 50,
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
    }),
    modelCandidate({
      id: "test/frontier-fast",
      deepSWEScore: 0.1,
      deepSWECost: 0.9,
      deepSWESeconds: 10,
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
    }),
  ],
  STAGE_CONFIG.scoring,
);
assertClose(directResourceScoredModels[0]?.scores.value_score, 58.8235);
assertClose(directResourceScoredModels[1]?.scores.value_score, 58.8235);
assertClose(directResourceScoredModels[2]?.scores.value_score, 58.8235);
assertClose(directResourceScoredModels[0]?.scores.speed_score, 61.1111);
assertClose(directResourceScoredModels[1]?.scores.speed_score, 61.1111);
assertClose(directResourceScoredModels[2]?.scores.speed_score, 61.1111);

const separatedResourceConfig = {
  ...STAGE_CONFIG.scoring,
  benchmarkPortfolio: {
    source_split: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
      resourcePolicy: {
        source: "benchmark",
        unit: "per_task",
        tokenMeasure: "tokens",
        qualityCoordinate: "linear",
      },
    },
  },
} as const;
const sourceAQualities = [0.2, 0.4, 0.6, 0.8];
const sourceBQualities = [0.25, 0.45, 0.65, 0.85];
const sourceACosts = [1, 2, 3, 4];
const sourceBCosts = [8, 6, 4, 2];
const separatedResourceCandidates = sourceAQualities.map((sourceAQuality, index) => ({
  ...modelCandidate({ id: `test/source-split-${index}`, disableBaseCost: true }),
  benchmarks: { source_split: (sourceAQuality + sourceBQualities[index]!) / 2 },
  scoring_sources: {
    source_split: {
      canonical_value: (sourceAQuality + sourceBQualities[index]!) / 2,
      metadata: {
        source_a_label: "Official",
        source_b_label: "Publisher",
        source_a_score: sourceAQuality,
        source_b_score: sourceBQualities[index],
        source_a_cost: sourceACosts[index],
        source_b_cost: sourceBCosts[index],
        fusion_cost_comparable: false,
      },
    },
  },
}));
const separatedResourceScores = attachFinalScores(
  separatedResourceCandidates,
  separatedResourceConfig,
);
const expectedSourceAScores = benchmarkResourceEfficiencyScores(
  separatedResourceCandidates,
  sourceAQualities,
  sourceACosts.map(Math.log),
  "linear",
);
const expectedSourceBScores = benchmarkResourceEfficiencyScores(
  separatedResourceCandidates,
  sourceBQualities,
  sourceBCosts.map(Math.log),
  "linear",
);
for (const [index, scored] of separatedResourceScores.entries()) {
  assertClose(
    scored.scores.value_score,
    ((expectedSourceAScores[index] ?? 0) + (expectedSourceBScores[index] ?? 0)) / 2,
  );
  assertClose(scored.confidence.value, 0.7);
}

const sourceCQualities = [0.3, 0.5, 0.7, 0.9];
const sourceCCosts = [4, 3, 2, 1];
const threeSourceResourceCandidates = separatedResourceCandidates.map((model, index) => ({
  ...model,
  benchmarks: {
    source_split:
      (sourceAQualities[index]! + sourceBQualities[index]! + sourceCQualities[index]!) / 3,
  },
  scoring_sources: {
    source_split: {
      canonical_value:
        (sourceAQualities[index]! + sourceBQualities[index]! + sourceCQualities[index]!) / 3,
      metadata: {
        ...model.scoring_sources.source_split.metadata,
        source_c_label: "Artificial Analysis",
        source_c_score: sourceCQualities[index],
        source_c_cost: sourceCCosts[index],
      },
    },
  },
}));
const threeSourceResourceScores = attachFinalScores(
  threeSourceResourceCandidates,
  separatedResourceConfig,
);
const expectedSourceCScores = benchmarkResourceEfficiencyScores(
  threeSourceResourceCandidates,
  sourceCQualities,
  sourceCCosts.map(Math.log),
  "linear",
);
for (const [index, scored] of threeSourceResourceScores.entries()) {
  assertClose(
    scored.scores.value_score,
    ((expectedSourceAScores[index] ?? 0) +
      (expectedSourceBScores[index] ?? 0) +
      (expectedSourceCScores[index] ?? 0)) /
      3,
  );
}

const isolatedQualityResourceModels = attachFinalScores(
  [
    modelCandidate({
      id: "test/ordinary-quality-a",
      deepSWEScore: 0.1,
      deepSWECost: 1,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/ordinary-quality-b",
      deepSWEScore: 0.2,
      deepSWECost: 1,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/ordinary-quality-c",
      deepSWEScore: 0.3,
      deepSWECost: 1,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/isolated-expensive-frontier",
      deepSWEScore: 0.99,
      deepSWECost: 1_000,
      disableBaseCost: true,
    }),
  ],
  STAGE_CONFIG.scoring,
);
assertClose(isolatedQualityResourceModels.at(-1)?.scores.value_score, 50);

const flatResidualScores = benchmarkResourceEfficiencyScores(
  [
    { id: "test/flat-resource-a" },
    { id: "test/flat-resource-b" },
    { id: "test/flat-resource-c" },
    { id: "test/flat-resource-d" },
  ],
  [0.5, 0.5, 0.5, 0.5],
  [1, 1, 1, 1],
  "logit",
);
for (const score of flatResidualScores) {
  assertClose(score, 50);
}
const orderedHybridResourceScores = benchmarkResourceEfficiencyScores(
  [
    { id: "test/ordered-resource-a" },
    { id: "test/ordered-resource-b" },
    { id: "test/ordered-resource-c" },
    { id: "test/ordered-resource-d" },
  ],
  [0.5, 0.5, 0.5, 0.5],
  [1, 2, 3, 4],
  "logit",
);
assertClose(orderedHybridResourceScores[0], 100);
assertClose(orderedHybridResourceScores[3], 12.5);

const valueScoredModels = attachFinalScores(
  [
    modelCandidate({
      id: "test/cost-efficiency-cheap",
      deepSWEScore: 0.5,
      deepSWECost: 0.1,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/cost-efficiency-middle",
      deepSWEScore: 0.5,
      deepSWECost: 0.5,
      disableBaseCost: true,
    }),
    modelCandidate({
      id: "test/cost-efficiency-expensive",
      deepSWEScore: 0.5,
      deepSWECost: 0.9,
      disableBaseCost: true,
    }),
  ],
  STAGE_CONFIG.scoring,
);
assertClose(valueScoredModels[0]?.scores.value_score, 75);
assertClose(valueScoredModels[1]?.scores.value_score, 48.354506);
assertClose(valueScoredModels[2]?.scores.value_score, 33.3333);

const scaleNormalizedResourceConfig = {
  ...STAGE_CONFIG.scoring,
  benchmarkPortfolio: {
    cheap_frontier: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
      resourcePolicy: {
        source: "benchmark",
        unit: "per_task",
        tokenMeasure: "tokens",
        qualityCoordinate: "logit",
      },
    },
    expensive_frontier: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
      resourcePolicy: {
        source: "benchmark",
        unit: "per_task",
        tokenMeasure: "tokens",
        qualityCoordinate: "logit",
      },
    },
  },
} as const;
const scaleNormalizedResourceModels = attachFinalScores(
  [
    {
      ...modelCandidate({
        id: "test/cheap-scale-winner",
        disableBaseCost: true,
      }),
      benchmarks: { cheap_frontier: 1, expensive_frontier: 0.5 },
      task_metrics: {
        cheap_frontier: { cost: 1 },
        expensive_frontier: { cost: 2000 },
      },
    },
    {
      ...modelCandidate({
        id: "test/expensive-scale-winner",
        disableBaseCost: true,
      }),
      benchmarks: { cheap_frontier: 0.5, expensive_frontier: 1 },
      task_metrics: {
        cheap_frontier: { cost: 2 },
        expensive_frontier: { cost: 1000 },
      },
    },
  ],
  scaleNormalizedResourceConfig,
);
assertClose(scaleNormalizedResourceModels[0]?.scores.value_score, 50);
assertClose(scaleNormalizedResourceModels[1]?.scores.value_score, 50);

const sparseResourceCoverageModels = attachFinalScores(
  [
    {
      ...modelCandidate({
        id: "test/full-resource-coverage",
        throughputTokensPerSecond: 100,
        latencySeconds: 1,
        disableBaseCost: true,
      }),
      benchmarks: {
        gdpval_normalized: 0.5,
        hle: 0.5,
        deep_swe: 0.5,
      },
      task_metrics: {
        gdpval_normalized: { seconds: 10, cost: 1 },
        hle: { seconds: 10, cost: 1 },
        deep_swe: { seconds: 10, cost: 1 },
      },
    },
    {
      ...modelCandidate({
        id: "test/sparse-resource-sprinter",
        throughputTokensPerSecond: 100,
        latencySeconds: 1,
        disableBaseCost: true,
      }),
      benchmarks: {
        gdpval_normalized: 1,
      },
      task_metrics: {
        gdpval_normalized: { seconds: 1, cost: 0.01 },
      },
    },
  ],
  STAGE_CONFIG.scoring,
);
assertClose(sparseResourceCoverageModels[0]?.scores.value_score, 50);
assertClose(sparseResourceCoverageModels[1]?.scores.value_score, 8.7704);
assertClose(sparseResourceCoverageModels[0]?.confidence.value, 0.7);
assertClose(sparseResourceCoverageModels[1]?.confidence.value, 7 / 30);

const siblingCostKeys = Array.from({ length: 5 }, (_, index) => `sibling_task_${index + 1}`);
const siblingCostConfig: ScoringConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: siblingCostKeys,
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: Object.fromEntries(
    siblingCostKeys.map((key) => [
      key,
      {
        group: "frontier",
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 1, agentic: 0 },
        resourcePolicy: {
          source: "benchmark",
          unit: "per_task",
          tokenMeasure: "tokens",
          qualityCoordinate: "linear",
        },
      },
    ]),
  ),
};
function siblingCostModel(
  id: string,
  name: string,
  reasoningEffort: string | null,
  costs: readonly (number | null)[],
  quality: number,
): ModelAtlasCandidate {
  return {
    ...modelCandidate({ id, disableBaseCost: true }),
    name,
    reasoning_effort: reasoningEffort,
    benchmarks: Object.fromEntries(siblingCostKeys.map((key) => [key, quality])),
    task_metrics: Object.fromEntries(
      siblingCostKeys.flatMap((key, index) => {
        const cost = costs[index] ?? null;
        return cost == null ? [] : [[key, { cost, seconds: cost * 10 }]];
      }),
    ),
  };
}
const siblingCostModels = [
  siblingCostModel("test/sibling", "Sibling", "max", [1, 2, 3, 4, 5], 0.6),
  {
    ...siblingCostModel("test/sibling", "Sibling", "xhigh", [2, 4, 6, 8, null], 0.6),
    benchmarks: Object.fromEntries(siblingCostKeys.slice(0, 4).map((key) => [key, 0.6])),
  },
  siblingCostModel("test/peer-a", "Peer A", null, [1, 2, 3, 4, 5], 0.2),
  siblingCostModel("test/peer-b", "Peer B", null, [2, 3, 4, 5, 6], 0.4),
  siblingCostModel("test/peer-c", "Peer C", null, [3, 4, 5, 6, 7], 0.7),
  siblingCostModel("test/peer-d", "Peer D", null, [4, 5, 6, 7, 8], 0.9),
];
const siblingBenchmarkPreparation = prepareBenchmarkScoring(siblingCostModels, siblingCostConfig);
const siblingResourcePreparation = prepareEffortResourceImputation(
  siblingCostModels,
  siblingCostConfig,
  siblingBenchmarkPreparation,
);
const siblingTarget = siblingCostModels[1];
assertClose(
  siblingTarget == null
    ? null
    : imputedTaskResource(
        siblingResourcePreparation,
        siblingTarget,
        siblingCostKeys[4] ?? "",
        "cost",
      )?.amount,
  10,
);
assertClose(
  siblingTarget == null
    ? null
    : imputedTaskResource(
        siblingResourcePreparation,
        siblingTarget,
        siblingCostKeys[4] ?? "",
        "cost",
      )?.evidenceFactor,
  1,
);
assertClose(
  siblingTarget == null
    ? null
    : imputedTaskResource(
        siblingResourcePreparation,
        siblingTarget,
        siblingCostKeys[4] ?? "",
        "time",
      )?.amount,
  100,
);
assertClose(
  siblingTarget == null
    ? null
    : imputedTaskResource(
        siblingResourcePreparation,
        siblingTarget,
        siblingCostKeys[4] ?? "",
        "time",
      )?.evidenceFactor,
  1,
);
const directOnlySiblingScores = attachFinalScores(siblingCostModels, siblingCostConfig);
const imputedSiblingScores = attachFinalScores(
  siblingCostModels,
  siblingCostConfig,
  siblingBenchmarkPreparation,
  siblingResourcePreparation,
);
assertClose(directOnlySiblingScores[1]?.confidence.value, 0.56);
assertClose(imputedSiblingScores[1]?.confidence.value, 0.66);
assertClose(directOnlySiblingScores[1]?.confidence.speed, 0.56);
assertClose(imputedSiblingScores[1]?.confidence.speed, 0.66);
for (const index of [0, 2, 3, 4, 5]) {
  assertClose(
    imputedSiblingScores[index]?.scores.value_score,
    directOnlySiblingScores[index]?.scores.value_score ?? 0,
  );
  assertClose(
    imputedSiblingScores[index]?.scores.speed_score,
    directOnlySiblingScores[index]?.scores.speed_score ?? 0,
  );
}

const defaultCoverageModels = [
  siblingCostModel("test/pooled", "Pooled", "max", [1, 1, 1, 1, 1], 0.5),
  siblingCostModel("test/pooled", "Pooled", "low", [1, null, null, null, null], 0.5),
  siblingCostModel("test/coverage-peer-a", "Coverage Peer A", null, [1, 1, 1, 1, 1], 0.5),
  siblingCostModel("test/coverage-peer-b", "Coverage Peer B", null, [1, 1, 1, 1, 1], 0.5),
  siblingCostModel("test/coverage-peer-c", "Coverage Peer C", null, [1, 1, 1, 1, 1], 0.5),
];
const defaultCoverageScores = attachFinalScores(defaultCoverageModels, siblingCostConfig);
assertClose(defaultCoverageScores[1]?.scores.speed_score, 50);
assertClose(defaultCoverageScores[1]?.scores.value_score, 50);
assertClose(defaultCoverageScores[1]?.confidence.speed, 0.14);
assertClose(defaultCoverageScores[1]?.confidence.value, 0.14);
const detachedCoverageScores = attachFinalScores(
  defaultCoverageModels.map((model, index) =>
    index === 1 ? { ...model, id: "test/detached", name: "Detached" } : model,
  ),
  siblingCostConfig,
);
assertEqual((detachedCoverageScores[1]?.scores.speed_score ?? 100) < 5, true);
assertEqual((detachedCoverageScores[1]?.scores.value_score ?? 100) < 5, true);

const sparseDefaultCoverageModels = [
  siblingCostModel(
    "test/default-sparse",
    "Default Sparse",
    "max",
    [1, null, null, null, null],
    0.5,
  ),
  siblingCostModel("test/default-sparse", "Default Sparse", "low", [null, 1, 1, 1, 1], 0.5),
  ...defaultCoverageModels.slice(2),
];
const sparseDefaultCoverageScores = attachFinalScores(
  sparseDefaultCoverageModels,
  siblingCostConfig,
);
assertEqual((sparseDefaultCoverageScores[0]?.scores.speed_score ?? 100) < 5, true);
assertEqual((sparseDefaultCoverageScores[1]?.scores.speed_score ?? 100) < 5, true);
assertEqual((sparseDefaultCoverageScores[0]?.scores.value_score ?? 100) < 5, true);
assertEqual((sparseDefaultCoverageScores[1]?.scores.value_score ?? 100) < 5, true);

const resourceModelVariants = [resourceModel("b", 2, "low"), resourceModel("b", 4, "high")];
const resourceComparisonModel = resourceModel("c", 3);
const resourceModels = [
  resourceModel("a", 1),
  ...resourceModelVariants,
  resourceComparisonModel,
  resourceModel("d", 8),
];
const modelBalancedResourceScore = attachFinalScores(resourceModels, STAGE_CONFIG.scoring).find(
  (model) => model.id === resourceComparisonModel.id,
)?.scores;
const duplicatedModelResourceScore = attachFinalScores(
  [
    ...resourceModels,
    ...resourceModelVariants.map((model) => ({
      ...model,
      task_metrics: { ...model.task_metrics },
    })),
  ],
  STAGE_CONFIG.scoring,
).find((model) => model.id === resourceComparisonModel.id)?.scores;
assertClose(
  duplicatedModelResourceScore?.speed_score,
  modelBalancedResourceScore?.speed_score ?? 0,
);
assertClose(
  duplicatedModelResourceScore?.value_score,
  modelBalancedResourceScore?.value_score ?? 0,
);

const normalizedContextModels = [
  imputationModel("observed-a", 0, 0, 0, 0),
  imputationModel("observed-b", 10, 20, 200, 0.2),
  imputationModel("observed-c", 20, 40, 400, 0.4),
  imputationModel("observed-d", 30, 60, 600, 0.6),
  imputationModel("observed-e", 40, 80, 800, 0.8),
  imputationModel("observed-f", 50, 100, 1_000, 1),
  imputationModel("missing", null, 0, 1_000, 0),
];
const normalizedContextBenchmarkKeys = ["target", "wide", "narrow", "steady"] as const;
const normalizedContextBenchmarkPortfolio = Object.fromEntries(
  normalizedContextBenchmarkKeys.map((key) => {
    const intelligenceLoading = key === "wide" ? 0.8 : key === "target" ? 1 : 0.1;
    return [
      key,
      {
        group: "baseline",
        benchmarkImportance: 1,
        dimensionLoadings: {
          intelligence: intelligenceLoading,
          agentic: 1 - intelligenceLoading,
        },
      },
    ] as const;
  }),
);
const normalizedContextConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: normalizedContextBenchmarkKeys,
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: normalizedContextBenchmarkPortfolio,
};
const normalizedContextImputations = buildBenchmarkImputationByModel(
  normalizedContextModels,
  normalizedContextConfig,
);
assertClose(
  normalizedContextImputations.get(normalizedContextModels.at(-1) ?? {})?.get("target"),
  40,
);

// Default Agentic selection follows the same frontier-only rule, including its direct evidence support.
const agenticFrontierRows = [
  { benchmarks: { automation_bench: 0.2, browsecomp: 0.1 } },
  { benchmarks: { automation_bench: 0.8, browsecomp: 0.9 } },
];
const agenticFrontierContext = buildQualityScoringContext(
  agenticFrontierRows,
  STAGE_CONFIG.scoring,
);
const agenticFrontierResult = (baseline: number | null) =>
  buildComponentScoreResult(
    { benchmarks: { automation_bench: 0.8, browsecomp: baseline } },
    nullSpeed,
    [],
    STAGE_CONFIG.scoring,
    agenticFrontierContext,
  );
const agenticWithoutBaseline = agenticFrontierResult(null);
assert.ok(agenticWithoutBaseline.componentScores?.agentic_score != null);
for (const baseline of [0, 1]) {
  const withBaseline = agenticFrontierResult(baseline);
  assert.equal(
    withBaseline.componentScores?.agentic_score,
    agenticWithoutBaseline.componentScores?.agentic_score,
  );
  assert.equal(withBaseline.confidence.agentic, agenticWithoutBaseline.confidence.agentic);
}

const repeatedModelVariants = [
  {
    ...imputationModel("model-b", 10, 20, 200, 0.2),
    reasoning_effort: "low",
  },
  {
    ...imputationModel("model-b", 20, 40, 400, 0.4),
    reasoning_effort: "high",
  },
];
const modelBalancedMissingModel = imputationModel("model-missing", null, 100, 1_000, 1);
const modelBalancedModels = [
  imputationModel("model-a", 0, 0, 0, 0),
  ...repeatedModelVariants,
  imputationModel("model-c", 30, 60, 600, 0.6),
  imputationModel("model-d", 40, 80, 800, 0.8),
  imputationModel("model-e", 50, 100, 1_000, 1),
  imputationModel("model-f", 60, 120, 1_200, 1.2),
  modelBalancedMissingModel,
];
const modelsWithDuplicatedVariants = [
  ...modelBalancedModels.slice(0, -1),
  ...repeatedModelVariants.map((model) => ({
    ...model,
    intelligence: { ...model.intelligence },
  })),
  modelBalancedMissingModel,
];
const modelBalancedImputation = buildBenchmarkImputationByModel(
  modelBalancedModels,
  normalizedContextConfig,
)
  .get(modelBalancedMissingModel)
  ?.get("target");
const duplicatedModelImputation = buildBenchmarkImputationByModel(
  modelsWithDuplicatedVariants,
  normalizedContextConfig,
)
  .get(modelBalancedMissingModel)
  ?.get("target");
assertEqual(modelBalancedImputation != null, true);
assertClose(duplicatedModelImputation, modelBalancedImputation ?? 0);
const modelBalancedDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  modelBalancedModels,
  normalizedContextConfig,
).get("target");
const duplicatedModelDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  modelsWithDuplicatedVariants,
  normalizedContextConfig,
).get("target");
assertEqual(modelBalancedDiagnostic?.validationSampleCount, 7);
assertEqual(duplicatedModelDiagnostic?.validationSampleCount, 9);
assertEqual(modelBalancedDiagnostic?.distinctModelCount, 6);
assertEqual(duplicatedModelDiagnostic?.distinctModelCount, 6);
assertClose(
  duplicatedModelDiagnostic?.normalizedMedianAbsoluteError,
  modelBalancedDiagnostic?.normalizedMedianAbsoluteError ?? 0,
);

const frontierPercentileConfig = {
  ...normalizedContextConfig,
  intelligenceBenchmarkKeys: ["agents_last_exam", "gdpval_normalized", "hle"],
  benchmarkPortfolio: STAGE_CONFIG.scoring.benchmarkPortfolio,
};
const frontierPercentileModels = [
  {
    id: "observed-frontier-a",
    benchmarks: { agents_last_exam: 0.2, gdpval_normalized: 0, hle: 0 },
  },
  {
    id: "observed-frontier-b",
    benchmarks: { agents_last_exam: 0.5, gdpval_normalized: 50, hle: 50 },
  },
  {
    id: "observed-frontier-c",
    benchmarks: { agents_last_exam: 0.8, gdpval_normalized: 100, hle: 100 },
  },
  {
    id: "missing-frontier",
    benchmarks: { gdpval_normalized: 100, hle: 100 },
  },
];
const frontierPercentileImputations = buildBenchmarkImputationByModel(
  frontierPercentileModels,
  frontierPercentileConfig,
);
assertEqual(
  frontierPercentileImputations
    .get(frontierPercentileModels.at(-1) ?? {})
    ?.has("agents_last_exam") ?? false,
  false,
);
const sparseFrontierDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  frontierPercentileModels,
  frontierPercentileConfig,
).get("agents_last_exam");
assertEqual(sparseFrontierDiagnostic?.validationSampleCount, 0);
assertEqual(sparseFrontierDiagnostic?.distinctModelCount, 0);
assertEqual(sparseFrontierDiagnostic?.normalizedMedianAbsoluteError, null);
assertEqual(sparseFrontierDiagnostic?.imputationAllowed, false);

const unreliableReferenceModels = [0, 1, 2, 3, 4].map((value) => ({
  id: `unreliable-observed-${value}`,
  benchmarks: {
    target: value % 2 === 0 ? 0 : 100,
    c1: value,
    c2: value,
    c3: value,
  },
}));
const unreliableMissingModel = {
  id: "unreliable-missing",
  benchmarks: { c1: 4, c2: 4, c3: 4 },
};
const unreliableConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["target", "c1", "c2", "c3"],
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: {
    target: intelligenceBenchmarkEntry(),
    c1: intelligenceBenchmarkEntry(),
    c2: intelligenceBenchmarkEntry(),
    c3: intelligenceBenchmarkEntry(),
  },
} as const;
const unreliableModels = [...unreliableReferenceModels, unreliableMissingModel];
const unreliableDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  unreliableModels,
  unreliableConfig,
).get("target");
assertEqual(unreliableDiagnostic?.validationSampleCount, 5);
assertEqual(unreliableDiagnostic?.distinctModelCount, 5);
assertClose(unreliableDiagnostic?.normalizedMedianAbsoluteError, 50);
assertEqual(unreliableDiagnostic?.imputationAllowed, false);
assertEqual(
  buildBenchmarkImputationByModel(unreliableModels, unreliableConfig)
    .get(unreliableMissingModel)
    ?.has("target") ?? false,
  false,
);

const sharedTargetModels = [
  dualContextImputationModel("shared-observed-a", 0, 0, 0),
  dualContextImputationModel("shared-observed-b", 10, 1, 1),
  dualContextImputationModel("shared-observed-c", 20, 2, 2),
  dualContextImputationModel("shared-observed-d", 30, 3, 3),
  dualContextImputationModel("shared-observed-e", 40, 4, 4),
  dualContextImputationModel("shared-observed-f", 50, 5, 5),
  dualContextImputationModel("shared-missing", null, 5, 0),
];
const sharedTargetConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["shared_target", "i1", "i2", "i3"],
  agenticBenchmarkKeys: ["shared_target", "a1", "a2", "a3"],
  benchmarkPortfolio: {
    shared_target: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
    },
    i1: intelligenceBenchmarkEntry(),
    i2: intelligenceBenchmarkEntry(),
    i3: intelligenceBenchmarkEntry(),
    a1: agenticBenchmarkEntry(),
    a2: agenticBenchmarkEntry(),
    a3: agenticBenchmarkEntry(),
  },
} as const;
const sharedTargetModel = sharedTargetModels.at(-1);
if (sharedTargetModel == null) {
  throw new Error("Expected a shared-target missing model");
}
const sharedTargetImputation = buildBenchmarkImputationByModel(
  sharedTargetModels,
  sharedTargetConfig,
)
  .get(sharedTargetModel)
  ?.get("shared_target");
assertClose(sharedTargetImputation, 12.5);
// A headline selection change must not remove displayed baseline observations from shared imputation predictors.
const frontierOnlySharedPreparation = prepareBenchmarkScoring(sharedTargetModels, {
  ...sharedTargetConfig,
  intelligenceBenchmarkKeys: [],
  intelligenceBenchmarkDisplayKeys: sharedTargetConfig.intelligenceBenchmarkKeys,
  intelligenceGroupWeights: { frontier: 1, baseline: 0 },
});
assertClose(
  frontierOnlySharedPreparation.imputationByModel.get(sharedTargetModel)?.get("shared_target"),
  sharedTargetImputation!,
);
assertClose(
  frontierOnlySharedPreparation.imputationFactorsByModel
    .get(sharedTargetModel)
    ?.get("shared_target"),
  1,
);

assertClose(
  prepareBenchmarkScoring(sharedTargetModels, sharedTargetConfig)
    .imputationFactorsByModel.get(sharedTargetModel)
    ?.get("shared_target"),
  1,
);
const directOnlySharedTargetPreparation = withoutBenchmarkImputationForModels(
  prepareBenchmarkScoring(sharedTargetModels, sharedTargetConfig),
  [sharedTargetModel],
);
assert.equal(
  benchmarkImputationValues(directOnlySharedTargetPreparation, sharedTargetModel),
  undefined,
);
assert.equal(
  benchmarkImputationValues(directOnlySharedTargetPreparation, { ...sharedTargetModel }),
  undefined,
  "direct-only policy should also suppress variant-key fallback during rescoring",
);
const reorderedSharedTargetImputation = buildBenchmarkImputationByModel(sharedTargetModels, {
  ...sharedTargetConfig,
  intelligenceBenchmarkKeys: ["i3", "i2", "i1", "shared_target"],
  agenticBenchmarkKeys: ["a3", "a2", "a1", "shared_target"],
})
  .get(sharedTargetModel)
  ?.get("shared_target");
assertClose(reorderedSharedTargetImputation, 12.5);
assertEqual("shared_target" in sharedTargetModel.benchmarks, false);

const missingGroupPortfolio = {
  ...sharedTargetConfig.benchmarkPortfolio,
  i1: { ...intelligenceBenchmarkEntry(), group: "frontier" },
  i2: { ...intelligenceBenchmarkEntry(), group: "frontier" },
  i3: { ...intelligenceBenchmarkEntry(), group: "frontier" },
  a1: { ...agenticBenchmarkEntry(), group: "frontier" },
  a2: { ...agenticBenchmarkEntry(), group: "frontier" },
  a3: { ...agenticBenchmarkEntry(), group: "frontier" },
} as const;
const baselineMissingConfig = {
  ...sharedTargetConfig,
  benchmarkPortfolio: missingGroupPortfolio,
};
const frontierMissingConfig = {
  ...baselineMissingConfig,
  benchmarkPortfolio: {
    ...missingGroupPortfolio,
    shared_target: {
      ...missingGroupPortfolio.shared_target,
      group: "frontier",
    },
  },
} as const;
const baselineMissingDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  sharedTargetModels,
  baselineMissingConfig,
).get("shared_target");
const frontierMissingDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
  sharedTargetModels,
  frontierMissingConfig,
).get("shared_target");
assertEqual(baselineMissingDiagnostic?.imputationAllowed, true);
assertClose(
  frontierMissingDiagnostic?.normalizedMedianAbsoluteError,
  baselineMissingDiagnostic?.normalizedMedianAbsoluteError ?? 0,
);
const baselineMissingValue = buildBenchmarkImputationByModel(
  sharedTargetModels,
  baselineMissingConfig,
)
  .get(sharedTargetModel)
  ?.get("shared_target");
const frontierMissingValue = buildBenchmarkImputationByModel(
  sharedTargetModels,
  frontierMissingConfig,
)
  .get(sharedTargetModel)
  ?.get("shared_target");
assertClose(baselineMissingValue, 12.5);
assertClose(frontierMissingValue, baselineMissingValue ?? 0);

const nonRecursiveReferenceModels = [0, 1, 2, 3, 4, 5].map((value) => ({
  id: `non-recursive-observed-${value}`,
  benchmarks: {
    target: value * 10,
    bridge: value * 10,
    bridge2: value * 10,
    i1: value,
    i2: value,
    a1: value,
    a2: value,
    a3: value,
  },
}));
const nonRecursiveMissingModel = {
  id: "non-recursive-missing",
  benchmarks: { i1: 5, i2: 5, a1: 5, a2: 5, a3: 5 },
};
const nonRecursiveImputations = buildBenchmarkImputationByModel(
  [...nonRecursiveReferenceModels, nonRecursiveMissingModel],
  {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: ["target", "bridge", "bridge2", "i1", "i2"],
    agenticBenchmarkKeys: ["bridge", "bridge2", "a1", "a2", "a3"],
    benchmarkPortfolio: {
      target: intelligenceBenchmarkEntry(),
      bridge: {
        group: "baseline",
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
      },
      bridge2: {
        group: "baseline",
        benchmarkImportance: 1,
        dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
      },
      i1: intelligenceBenchmarkEntry(),
      i2: intelligenceBenchmarkEntry(),
      a1: agenticBenchmarkEntry(),
      a2: agenticBenchmarkEntry(),
      a3: agenticBenchmarkEntry(),
    },
  },
).get(nonRecursiveMissingModel);
assertClose(nonRecursiveImputations?.get("bridge"), 50);
assertClose(nonRecursiveImputations?.get("bridge2"), 50);
assertEqual(nonRecursiveImputations?.has("target"), false);

const contextualImputationConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  intelligenceBenchmarkKeys: ["target", "c1", "c2", "c3"],
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: {
    target: intelligenceBenchmarkEntry(),
    c1: { ...intelligenceBenchmarkEntry(), group: "frontier" },
    c2: intelligenceBenchmarkEntry(),
    c3: { ...intelligenceBenchmarkEntry(), group: "baseline" },
  },
} as const;
const singleEffortModel = [
  {
    id: "test/single-effort",
    name: "Single Effort",
    reasoning_effort: "low",
    benchmarks: {},
  },
  {
    id: "test/single-effort",
    name: "Single Effort",
    reasoning_effort: "high",
    benchmarks: { target: 30 },
  },
  {
    id: "test/single-effort",
    name: "Single Effort",
    reasoning_effort: "xhigh",
    benchmarks: {},
  },
  {
    id: "test/single-effort",
    name: "Single Effort",
    reasoning_effort: "max",
    benchmarks: {},
  },
];
const singleEffortPreparation = prepareBenchmarkScoring(
  singleEffortModel,
  contextualImputationConfig,
);
assertEqual(
  singleEffortPreparation.imputationByModel.get(singleEffortModel[0] ?? {})?.has("target") ?? false,
  false,
);
assertEqual(
  singleEffortPreparation.imputationByModel.get(singleEffortModel[3] ?? {})?.has("target") ?? false,
  false,
);
assertEqual("target" in (singleEffortModel[3]?.benchmarks ?? {}), false);
const multipleEffortModel = singleEffortModel.map((model, index) =>
  index === 2 ? { ...model, benchmarks: { target: 29 } } : model,
);
assertEqual(
  prepareBenchmarkScoring(multipleEffortModel, contextualImputationConfig)
    .imputationByModel.get(multipleEffortModel[3] ?? {})
    ?.has("target") ?? false,
  false,
);
const contextualMultipleEffortTarget = {
  id: "test/contextual-effort",
  name: "Contextual Effort",
  reasoning_effort: "xhigh",
  benchmarks: { c1: 120, c2: 120, c3: 120 },
};
const contextualMultipleEffortModels = [
  ...contextualImputationModels(7),
  {
    id: "test/contextual-effort",
    name: "Contextual Effort",
    reasoning_effort: "low",
    benchmarks: { target: 10, c1: 10, c2: 10, c3: 10 },
  },
  contextualMultipleEffortTarget,
  {
    id: "test/contextual-effort",
    name: "Contextual Effort",
    reasoning_effort: "max",
    benchmarks: { target: 30, c1: 30, c2: 30, c3: 30 },
  },
];
assertClose(
  buildBenchmarkImputationByModel(contextualMultipleEffortModels, contextualImputationConfig)
    .get(contextualMultipleEffortTarget)
    ?.get("target"),
  120,
);
const contextualModelPopulation = contextualImputationModels(7);
const sparseBenchmarkContextModels = contextualModelPopulation.map((model, index) =>
  index === contextualModelPopulation.length - 1 ? { ...model, benchmarks: { c1: 0 } } : model,
);
assertEqual(
  buildBenchmarkImputationByModel(sparseBenchmarkContextModels, contextualImputationConfig)
    .get(sparseBenchmarkContextModels.at(-1) ?? {})
    ?.has("target") ?? false,
  false,
);
assertEqual(
  prepareBenchmarkScoring(sparseBenchmarkContextModels, contextualImputationConfig)
    .imputationFactorsByModel.get(sparseBenchmarkContextModels.at(-1) ?? {})
    ?.has("target") ?? false,
  false,
);

const imputationEvidenceModels = [
  {
    id: "imputation-evidence-min",
    benchmarks: { target: 0, c1: 0, c2: 0, c3: 0 },
  },
  {
    id: "imputation-evidence-max",
    benchmarks: { target: 100, c1: 100, c2: 100, c3: 100 },
  },
];
const imputationEvidenceContext = buildQualityScoringContext(
  imputationEvidenceModels,
  contextualImputationConfig,
);
const imputationEvidenceTarget = {
  id: "imputation-evidence-target",
  benchmarks: { c1: 100, c3: 100 },
};
const imputedHighValues = new Map([
  ["target", 100],
  ["c2", 100],
]);
const imputationEvidenceConfig = {
  ...contextualImputationConfig,
  qualityRetention: { floor: 0, full: 3.75 },
} as const;
const untrustedImputationScores = buildComponentScoreResult(
  imputationEvidenceTarget,
  nullSpeed,
  [],
  imputationEvidenceConfig,
  imputationEvidenceContext,
  imputedHighValues,
).componentScores;
const validatedImputationScores = buildComponentScoreResult(
  imputationEvidenceTarget,
  nullSpeed,
  [],
  imputationEvidenceConfig,
  imputationEvidenceContext,
  imputedHighValues,
  new Map([
    ["target", 0.5],
    ["c2", 0.5],
  ]),
).componentScores;
const untrustedCoverageRetention =
  STAGE_CONFIG.scoring.qualityCoverageMinimumRetention +
  (1 - STAGE_CONFIG.scoring.qualityCoverageMinimumRetention) * evidenceRetentionFactor(3, 0, 3.75);
assertClose(untrustedImputationScores?.intelligence_score, 100 * untrustedCoverageRetention);
assertClose(validatedImputationScores?.intelligence_score, 100);

function modelCandidate(options: {
  id: string;
  intelligenceScore?: number | null;
  agenticScore?: number | null;
  blendedPrice?: number | null;
  artificialAnalysisCost?: number | null;
  artificialAnalysisSeconds?: number | null;
  deepSWEScore?: number | null;
  deepSWECost?: number | null;
  deepSWESeconds?: number | null;
  deepSWEOutputTokens?: number | null;
  throughputTokensPerSecond?: number | null;
  latencySeconds?: number | null;
  gdpvalScore?: number | null;
  gdpvalCost?: number | null;
  gdpvalSeconds?: number | null;
  disableBaseCost?: boolean;
}): ModelAtlasCandidate {
  const gdpvalTask =
    options.gdpvalCost == null && options.gdpvalSeconds == null
      ? null
      : {
          cost: options.gdpvalCost ?? null,
          seconds: options.gdpvalSeconds ?? null,
        };
  const benchmarks = {
    ...(options.gdpvalScore == null ? {} : { gdpval_normalized: options.gdpvalScore }),
    ...(options.deepSWEScore == null ? {} : { deep_swe: options.deepSWEScore }),
  };
  return {
    id: options.id,
    name: options.id,
    provider: "test",
    logo: "",
    reasoning: null,
    reasoning_effort: null,
    release_date: null,
    modalities: null,
    open_weights: null,
    cost: options.disableBaseCost
      ? null
      : {
          input: 1,
          output: 1,
          weighted_input: 1,
          weighted_output: 1,
          blended_price: options.blendedPrice ?? null,
        },
    context_window: null,
    speed: {
      throughput_tokens_per_second_median: options.throughputTokensPerSecond ?? null,
      latency_seconds_median: options.latencySeconds ?? null,
      e2e_latency_seconds_median: null,
    },
    intelligence: null,
    task_metrics: {
      artificial_analysis: {
        cost: options.artificialAnalysisCost,
        seconds: options.artificialAnalysisSeconds,
      },
      deep_swe: {
        cost: options.deepSWECost,
        seconds: options.deepSWESeconds,
        output_tokens: options.deepSWEOutputTokens,
      },
      ...(gdpvalTask == null ? {} : { gdpval_normalized: gdpvalTask }),
    },
    benchmarks: Object.keys(benchmarks).length === 0 ? null : benchmarks,
    benchmark_dates: null,
    confidence: {
      intelligence: 1,
      agentic: 1,
      speed: null,
      value: null,
    },
    component_scores: {
      intelligence_score: options.intelligenceScore ?? null,
      agentic_score: options.agenticScore ?? null,
      speed_score: null,
    },
    scores: null,
  };
}

const siblingCalibrationConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  intelligenceBenchmarkKeys: ["b1", "b2", "b3", "b4"],
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: {
    b1: { ...intelligenceBenchmarkEntry(), group: "frontier" },
    b2: intelligenceBenchmarkEntry(),
    b3: intelligenceBenchmarkEntry(),
    b4: intelligenceBenchmarkEntry(),
  },
  qualityCoverage: {
    intelligence: { floor: 0.5, full: 3.5 },
    agentic: { floor: 0, full: 1 },
  },
} as const;
const siblingCalibrationModels = [
  {
    ...modelCandidate({ id: "test/sibling-calibration", intelligenceScore: 80 }),
    reasoning_effort: "max",
    benchmarks: { b1: 50, b2: 50, b3: 50, b4: 50 },
  },
  {
    ...modelCandidate({ id: "test/sibling-calibration", intelligenceScore: 99 }),
    reasoning_effort: "xhigh",
    benchmarks: { b1: 40, b2: 40, b3: 40 },
    confidence: { intelligence: 0.75, agentic: 1, speed: null, value: null },
  },
  {
    ...modelCandidate({ id: "test/sibling-calibration", intelligenceScore: 1 }),
    reasoning_effort: "high",
    benchmarks: { b1: 60, b2: 60, b3: 60 },
    confidence: { intelligence: 0.5, agentic: 1, speed: null, value: null },
  },
  {
    ...modelCandidate({ id: "test/sibling-calibration-min", intelligenceScore: 0 }),
    benchmarks: { b1: 0, b2: 0, b3: 0, b4: 0 },
  },
  {
    ...modelCandidate({ id: "test/sibling-calibration-max", intelligenceScore: 100 }),
    benchmarks: { b1: 100, b2: 100, b3: 100, b4: 100 },
  },
];
const siblingContext = prepareEffortQualityScoringContext(
  siblingCalibrationModels,
  siblingCalibrationConfig,
  buildQualityScoringContext(siblingCalibrationModels, siblingCalibrationConfig),
);
const siblingSpeed = {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
};
const siblingScore = (model: (typeof siblingCalibrationModels)[number], context = siblingContext) =>
  buildComponentScoreResult(
    model,
    siblingSpeed,
    [],
    {
      ...siblingCalibrationConfig,
      qualityCoverage: { intelligence: { floor: 0, full: 1 }, agentic: { floor: 0, full: 1 } },
      qualityRetention: { floor: 0, full: 1 },
    },
    context,
  );
assertClose(siblingScore(siblingCalibrationModels[0]!).componentScores?.intelligence_score, 50);
assertClose(siblingScore(siblingCalibrationModels[1]!).componentScores?.intelligence_score, 40);
assertClose(siblingScore(siblingCalibrationModels[2]!).componentScores?.intelligence_score, 60);
assertClose(siblingScore(siblingCalibrationModels[1]!).confidence.intelligence, 0.75);
assertClose(siblingScore(siblingCalibrationModels[2]!).confidence.intelligence, 0.75);
assert.equal("b4" in siblingCalibrationModels[1]!.benchmarks, false);
const sparseSiblings = siblingCalibrationModels.map((model, index) =>
  index === 1 ? { ...model, benchmarks: { b1: 40, b2: 40 } } : model,
);
const insufficientSiblingContext = prepareEffortQualityScoringContext(
  sparseSiblings,
  siblingCalibrationConfig,
  buildQualityScoringContext(siblingCalibrationModels, siblingCalibrationConfig),
);
assert.ok(
  !insufficientSiblingContext.effortQualityEstimates?.has(
    JSON.stringify(["sibling-calibration", "xhigh", "intelligence"]),
  ),
);
assertClose(
  siblingScore(
    sparseSiblings[1] as (typeof siblingCalibrationModels)[number],
    insufficientSiblingContext,
  ).confidence.intelligence,
  0.5,
);

const undercoveredBenchmarkKeys = Array.from({ length: 8 }, (_, index) => `b${index + 1}`);

function undercoveredBenchmarks(value: number, count = undercoveredBenchmarkKeys.length) {
  return Object.fromEntries(undercoveredBenchmarkKeys.slice(0, count).map((key) => [key, value]));
}

const undercoveredConfig: ScoringConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
  qualityCoverageMinimumRetention: 1,
  directBenchmarkWeightMultiplier: 1,
  intelligenceBenchmarkKeys: ["aa_intelligence_index", "vals_index", ...undercoveredBenchmarkKeys],
  agenticBenchmarkKeys: [],
  benchmarkPortfolio: {
    aa_intelligence_index: {
      group: "baseline",
      benchmarkImportance: 0.5,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
    vals_index: {
      group: "baseline",
      benchmarkImportance: 0.5,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
    ...Object.fromEntries(
      undercoveredBenchmarkKeys.map((key, index) => [
        key,
        { ...intelligenceBenchmarkEntry(), group: index === 0 ? "frontier" : "baseline" },
      ]),
    ),
  },
  qualityCoverage: {
    intelligence: {
      floor: INDEX_REPRESENTED_BENCHMARK_MEDIAN * 0.1,
      full: 2,
    },
    agentic: { floor: 0, full: 1 },
  },
};
const undercoveredReferences = [0, 20, 40, 60, 80, 100].map((value, index) => ({
  id: `test/undercovered-reference-${index}`,
  intelligence: { intelligence_index: value },
  benchmarks: { vals_index: value, ...undercoveredBenchmarks(value) },
}));
const undercoveredModel = {
  id: "test/undercovered-target",
  intelligence: { intelligence_index: 70 },
  benchmarks: { vals_index: 30, b1: 80, b2: 80 },
};
const coveredModel = {
  id: "test/covered-target",
  intelligence: { intelligence_index: 100 },
  benchmarks: { vals_index: 100, ...undercoveredBenchmarks(60) },
};
const undercoveredModels = [...undercoveredReferences, undercoveredModel, coveredModel];
const undercoveredContext = buildQualityScoringContext(undercoveredModels, undercoveredConfig);
const qualityTestSpeed = {
  throughput_tokens_per_second_median: null,
  latency_seconds_median: null,
  e2e_latency_seconds_median: null,
};
const undercoveredScore = buildComponentScoreResult(
  undercoveredModel,
  qualityTestSpeed,
  [],
  undercoveredConfig,
  undercoveredContext,
).componentScores?.intelligence_score;
// The task groups keep their 80/20 budget before the direct and index union weights are combined.
const expectedUndercoveredScore = (80 * 2 + 70 * 5 + 30 * 3.5) / 10.5;
assertClose(undercoveredScore, expectedUndercoveredScore);
assertClose(
  buildComponentScoreResult(
    undercoveredModel,
    nullSpeed,
    [],
    undercoveredConfig,
    undercoveredContext,
  ).componentScores?.intelligence_score,
  expectedUndercoveredScore,
);
const lowImportanceIndexConfig = {
  ...undercoveredConfig,
  benchmarkPortfolio: {
    ...undercoveredConfig.benchmarkPortfolio,
    aa_intelligence_index: {
      group: "baseline",
      benchmarkImportance: 0.05,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
    vals_index: {
      group: "baseline",
      benchmarkImportance: 0.05,
      dimensionLoadings: { intelligence: 1, agentic: 0 },
    },
  },
} as const;
assertClose(
  buildComponentScoreResult(
    undercoveredModel,
    qualityTestSpeed,
    [],
    lowImportanceIndexConfig,
    buildQualityScoringContext(undercoveredModels, lowImportanceIndexConfig),
  ).componentScores?.intelligence_score,
  (80 * 2 + 70 * 0.5 + 30 * 0.35) / 2.85,
);
const coveredScore = buildComponentScoreResult(
  coveredModel,
  qualityTestSpeed,
  [],
  undercoveredConfig,
  undercoveredContext,
).componentScores?.intelligence_score;
assertClose(coveredScore, (60 * 8 + 100 * 8.5) / 16.5);

const nearlyCoveredModel = {
  ...coveredModel,
  benchmarks: { ...coveredModel.benchmarks, b8: null },
};
const nearlyCoveredScore = buildComponentScoreResult(
  nearlyCoveredModel,
  qualityTestSpeed,
  [],
  undercoveredConfig,
  undercoveredContext,
).componentScores?.intelligence_score;
assertClose(nearlyCoveredScore, (60 * 7 + 100 * 8.5) / 15.5);
assert.ok(
  Math.abs(nearlyCoveredScore! - coveredScore!) < 10,
  "one additional direct benchmark must change only its own evidence weight",
);
const weightedCoverageConfig: ScoringConfig = {
  ...undercoveredConfig,
  benchmarkPortfolio: {
    ...undercoveredConfig.benchmarkPortfolio,
    b8: { ...intelligenceBenchmarkEntry(), benchmarkImportance: 1e-6 },
  },
};
const beforeLastTask = buildComponentScoreResult(
  nearlyCoveredModel,
  qualityTestSpeed,
  [],
  weightedCoverageConfig,
  undercoveredContext,
).componentScores?.intelligence_score;
const afterLastTask = buildComponentScoreResult(
  coveredModel,
  qualityTestSpeed,
  [],
  weightedCoverageConfig,
  undercoveredContext,
).componentScores?.intelligence_score;
assert.ok(
  Math.abs(beforeLastTask! - afterLastTask!) < 2,
  "a nearly weightless direct benchmark must remain nearly weightless",
);

const fourTaskModel = {
  ...coveredModel,
  benchmarks: { vals_index: 100, b1: 60, b2: 60, b3: 60, b4: 60 },
};
assertClose(
  buildComponentScoreResult(
    fourTaskModel,
    qualityTestSpeed,
    [],
    undercoveredConfig,
    undercoveredContext,
  ).componentScores?.intelligence_score,
  (100 * 8.5 + 60 * 4) / 12.5,
);
assertClose(
  buildComponentScoreResult(fourTaskModel, nullSpeed, [], undercoveredConfig, undercoveredContext)
    .componentScores?.intelligence_score,
  (100 * 8.5 + 60 * 4) / 12.5,
);
const noTaskModel = { ...coveredModel, benchmarks: { vals_index: 100 } };
assertEqual(
  buildComponentScoreResult(
    noTaskModel,
    qualityTestSpeed,
    [],
    undercoveredConfig,
    undercoveredContext,
  ).componentScores?.intelligence_score ?? null,
  null,
);
const fakeTaskEstimates = new Map(
  undercoveredBenchmarkKeys.filter((k) => k !== "b1" && k !== "b2").map((k) => [k, 100]),
);
assertClose(
  buildComponentScoreResult(
    undercoveredModel,
    qualityTestSpeed,
    [],
    undercoveredConfig,
    undercoveredContext,
    fakeTaskEstimates,
    new Map([...fakeTaskEstimates.keys()].map((k) => [k, 1])),
  ).componentScores?.intelligence_score,
  undercoveredScore!,
);
const extendedConfig = {
  ...undercoveredConfig,
  intelligenceBenchmarkKeys: [...undercoveredConfig.intelligenceBenchmarkKeys, "missing-task"],
  benchmarkPortfolio: {
    ...undercoveredConfig.benchmarkPortfolio,
    "missing-task": intelligenceBenchmarkEntry(),
  },
};
assertClose(
  buildComponentScoreResult(coveredModel, qualityTestSpeed, [], extendedConfig, undercoveredContext)
    .componentScores?.intelligence_score,
  coveredScore!,
);

function resourceModel(
  modelKey: string,
  resourceScale: number,
  reasoningEffort: string | null = null,
): ModelAtlasCandidate {
  return {
    ...modelCandidate({
      id: `test/resource-model-${modelKey}`,
      intelligenceScore: 50,
      agenticScore: 50,
      deepSWEScore: 0.5,
      deepSWECost: resourceScale,
      deepSWESeconds: resourceScale * 10,
      throughputTokensPerSecond: 100,
      latencySeconds: 1,
      disableBaseCost: true,
    }),
    reasoning_effort: reasoningEffort,
  };
}

function imputationModel(
  id: string,
  target: number | null,
  steady: number,
  wide: number,
  narrow: number,
) {
  return {
    id,
    intelligence: {
      steady,
      wide,
      narrow,
      ...(target == null ? {} : { target }),
    },
    benchmarks: null,
  };
}

function dualContextImputationModel(
  id: string,
  target: number | null,
  intelligenceContext: number,
  agenticContext: number,
) {
  return {
    id,
    benchmarks: {
      i1: intelligenceContext,
      i2: intelligenceContext,
      i3: intelligenceContext,
      a1: agenticContext,
      a2: agenticContext,
      a3: agenticContext,
      ...(target == null ? {} : { shared_target: target }),
    },
  };
}

function contextualImputationModels(modelCount: number) {
  return Array.from({ length: modelCount }, (_, index) => {
    const name = `Contextual Model ${index}`;
    return [
      {
        id: `test/contextual-${index}`,
        name,
        reasoning_effort: "max",
        benchmarks: {
          target: index * 20,
          c1: index * 20,
          c2: index * 20,
          c3: index * 20,
        },
      },
      {
        id: `test/contextual-${index}`,
        name,
        reasoning_effort: "low",
        benchmarks: {
          ...(index === modelCount - 1 ? {} : { target: index * 10 }),
          c1: 0,
          c2: 0,
          c3: 0,
        },
      },
    ];
  }).flat();
}

function intelligenceBenchmarkEntry() {
  return {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  } as const;
}

function agenticBenchmarkEntry() {
  return {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  } as const;
}

// Token modulation shares peer comparison with task resources but has a neutral-one bounded output.
const tokenAmounts = [1, 10, 100, 1000, 10000];
const tokenModels = tokenAmounts.map((tokens, index) =>
  modelCandidate({
    id: `test/token-${index}`,
    deepSWEScore: index === 0 ? 0.7 : index === 4 ? 0.704 : 0.702,
    deepSWEOutputTokens: tokens,
  }),
);
const tokenCoordinates = tokenModels.map(() => 0.7);
const tokenLogs = tokenAmounts.map(Math.log);
const tokenMultipliers = qualityAdjustedResourceMultipliers(
  tokenModels,
  tokenCoordinates,
  tokenLogs,
  0.15,
  "linear",
);
assert(tokenMultipliers[0]! > 1);
assert(tokenMultipliers[4]! < 1);
assertClose(tokenMultipliers[2], 1);
assert(tokenMultipliers.every((value) => value >= 0.85 && value <= 1.15));
assert.deepEqual(
  qualityAdjustedResourceMultipliers(tokenModels, tokenCoordinates, tokenLogs, 0, "linear"),
  [1, 1, 1, 1, 1],
);
assert.deepEqual(
  qualityAdjustedResourceMultipliers(
    tokenModels,
    tokenCoordinates,
    [1, 1, 1, 1, 1],
    0.15,
    "linear",
  ),
  [1, 1, 1, 1, 1],
);
assert.deepEqual(
  qualityAdjustedResourceMultipliers(
    tokenModels.map((model) => ({ ...model, id: "test/same-model", name: "test/same-model" })),
    tokenCoordinates,
    tokenLogs,
    0.15,
    "linear",
  ),
  [1, 1, 1, 1, 1],
);

const tokenConfig: ScoringConfig = {
  ...STAGE_CONFIG.scoring,
  intelligenceBenchmarkKeys: ["deep_swe"],
  agenticBenchmarkKeys: ["deep_swe"],
  // Isolate token modulation from sparse-evidence regularization in this one-task fixture.
  qualityCoverage: {
    intelligence: { floor: 0, full: 0.1 },
    agentic: { floor: 0, full: 0.1 },
  },
  qualityRetention: { floor: 0, full: 0.1 },
};
const tokenRawContext = buildQualityScoringContext(tokenModels, tokenConfig);
const tokenEvidenceBefore = JSON.stringify(tokenModels);
const tokenContext = buildAgenticTokenScoringContext(tokenModels, tokenConfig, tokenRawContext);
for (const model of tokenModels) {
  const original = buildComponentScoreResult(
    { ...model },
    nullSpeed,
    [],
    tokenConfig,
    tokenRawContext,
  );
  const adjusted = buildComponentScoreResult(
    { ...model },
    nullSpeed,
    [],
    tokenConfig,
    tokenContext,
  );
  assert.equal(
    adjusted.componentScores?.intelligence_score,
    original.componentScores?.intelligence_score,
  );
  assert.deepEqual(adjusted.confidence, original.confidence);
  assert(
    adjusted.componentScores!.agentic_score! >= 0 &&
      adjusted.componentScores!.agentic_score! <= 100,
  );
}
assert.equal(JSON.stringify(tokenModels), tokenEvidenceBefore);

function tokenAgenticScores(models: ModelAtlasCandidate[], config = tokenConfig) {
  const rawContext = buildQualityScoringContext(models, config);
  const context = buildAgenticTokenScoringContext(models, config, rawContext);
  return models.map(
    (model) =>
      buildComponentScoreResult({ ...model }, nullSpeed, [], config, context).componentScores
        ?.agentic_score,
  );
}

const adjustedTokenScores = tokenAgenticScores(tokenModels);
assert(adjustedTokenScores[1]! > adjustedTokenScores[2]!);
assert(adjustedTokenScores[2]! > adjustedTokenScores[3]!);
assertClose(adjustedTokenScores[0], 0);
assert(adjustedTokenScores[4]! > 85 && adjustedTokenScores[4]! < 100);
const neutralTokenScores = tokenAgenticScores(tokenModels, {
  ...tokenConfig,
  agenticTokenModifierCap: 0,
});
const midpointScore = 50;
for (const [index, expected] of [0, midpointScore, midpointScore, midpointScore, 100].entries())
  assertClose(neutralTokenScores[index], expected);

function separatedTokenModels(sourceBScale: number): ModelAtlasCandidate[] {
  return tokenModels.map((model, index) => ({
    ...model,
    benchmarks: { source_split: model.benchmarks?.deep_swe ?? null },
    scoring_sources: {
      source_split: {
        canonical_value: model.benchmarks?.deep_swe ?? null,
        metadata: {
          source_a_label: "Official",
          source_b_label: "Publisher",
          source_a_score: model.benchmarks?.deep_swe ?? null,
          source_b_score: model.benchmarks?.deep_swe ?? null,
          source_a_tokens_per_task: tokenAmounts[index]!,
          source_b_tokens_per_task: tokenAmounts[index]! * sourceBScale,
          fusion_tokens_per_task_comparable: false,
        },
      },
    },
  }));
}

const separatedTokenConfig: ScoringConfig = {
  ...tokenConfig,
  intelligenceBenchmarkKeys: ["source_split"],
  agenticBenchmarkKeys: ["source_split"],
  benchmarkPortfolio: {
    source_split: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
      resourcePolicy: {
        source: "benchmark",
        unit: "per_task",
        tokenMeasure: "tokens",
        qualityCoordinate: "linear",
      },
    },
  },
};
const separatedTokenScores = tokenAgenticScores(separatedTokenModels(100), separatedTokenConfig);
assert.deepEqual(
  separatedTokenScores,
  tokenAgenticScores(separatedTokenModels(10_000), separatedTokenConfig),
  "source-local token comparisons must ignore differences in absolute source scale",
);
assert.notDeepEqual(separatedTokenScores, neutralTokenScores);

const indexOnlyTokens = tokenModels.map((model, index) => ({
  ...model,
  task_metrics: { artificial_analysis: { tokens: Math.exp(tokenLogs[index]!) } },
}));
assert.deepEqual(tokenAgenticScores(indexOnlyTokens), neutralTokenScores);
const sparseTokens = tokenModels.map((model, index) =>
  index < 2 ? model : { ...model, task_metrics: null },
);
assert.deepEqual(tokenAgenticScores(sparseTokens), neutralTokenScores);

// Input plus output takes precedence over reported totals; a flat selected measure never falls through to output-only tokens.
const flatInputOutputTokens = tokenModels.map((model, index) => ({
  ...model,
  task_metrics: {
    deep_swe: {
      input_tokens: 10000 - tokenAmounts[index]!,
      output_tokens: tokenAmounts[index]!,
      tokens: tokenAmounts[index]!,
    },
  },
}));
assert.deepEqual(tokenAgenticScores(flatInputOutputTokens), neutralTokenScores);
const flatTotalTokens = tokenModels.map((model, index) => ({
  ...model,
  task_metrics: { deep_swe: { output_tokens: tokenAmounts[index]!, tokens: 10000 } },
}));
assert.deepEqual(tokenAgenticScores(flatTotalTokens), neutralTokenScores);

// Same-ID historical observations must retain separate modifiers, and a missing-telemetry row cannot overwrite a measured row.
const missingTokenDuplicate = { ...tokenModels[1]!, task_metrics: null };
assert.deepEqual(
  tokenAgenticScores([...tokenModels, missingTokenDuplicate]).slice(0, tokenModels.length),
  adjustedTokenScores,
);
const duplicateTokenRows = [
  ...tokenModels,
  missingTokenDuplicate,
  { ...tokenModels[1]!, task_metrics: { deep_swe: { output_tokens: 1000 } } },
];
const duplicateTokenScores = tokenAgenticScores(duplicateTokenRows);
assert(duplicateTokenScores[1]! > duplicateTokenScores.at(-1)!);
const reversedTokenScores = tokenAgenticScores([...duplicateTokenRows].reverse()).reverse();
duplicateTokenScores.forEach((score, index) => assertClose(reversedTokenScores[index], score!));

// Estimated token use affects only its target and is discounted toward neutral; it cannot become peer evidence.
const tokenEstimateTarget = {
  ...tokenModels[2]!,
  id: "test/estimated-token",
  name: "Estimated Token",
  reasoning_effort: "low",
  task_metrics: null,
};
const tokenEstimatePopulation = [...tokenModels, tokenEstimateTarget];
const tokenEstimateBase = buildQualityScoringContext(tokenEstimatePopulation, tokenConfig);
const tokenEstimateKey = "name:estimated-token\u0000low";
const estimatedTokenContext = (evidenceFactor: number) =>
  buildAgenticTokenScoringContext(tokenEstimatePopulation, tokenConfig, tokenEstimateBase, {
    byVariant: new Map([
      [
        tokenEstimateKey,
        new Map([["deep_swe", { output_tokens: { amount: 10, evidenceFactor } }]]),
      ],
    ]),
  });
const tokenEstimateScore = (context: ReturnType<typeof estimatedTokenContext>) =>
  buildComponentScoreResult(tokenEstimateTarget, nullSpeed, [], tokenConfig, context)
    .componentScores!.agentic_score!;
const noTokenEstimate = buildAgenticTokenScoringContext(
  tokenEstimatePopulation,
  tokenConfig,
  tokenEstimateBase,
);
const fullTokenEstimate = estimatedTokenContext(1),
  halfTokenEstimate = estimatedTokenContext(0.5);
assert.ok(tokenEstimateScore(fullTokenEstimate) > tokenEstimateScore(noTokenEstimate));
assertClose(
  tokenEstimateScore(halfTokenEstimate),
  (tokenEstimateScore(fullTokenEstimate) + tokenEstimateScore(noTokenEstimate)) / 2,
);
for (const m of tokenModels)
  assert.equal(
    buildComponentScoreResult(m, nullSpeed, [], tokenConfig, fullTokenEstimate).componentScores!
      .agentic_score,
    buildComponentScoreResult(m, nullSpeed, [], tokenConfig, noTokenEstimate).componentScores!
      .agentic_score,
  );
assert.deepEqual(
  buildComponentScoreResult(tokenEstimateTarget, nullSpeed, [], tokenConfig, fullTokenEstimate)
    .confidence,
  buildComponentScoreResult(tokenEstimateTarget, nullSpeed, [], tokenConfig, noTokenEstimate)
    .confidence,
);
assert.equal(tokenEstimateTarget.task_metrics, null);
