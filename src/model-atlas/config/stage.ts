/** Pipeline stage switches for matching, route data, public selection, and scoring. */

import type { BenchmarkDimension, BenchmarkPortfolio } from "../benchmarks/factory";
import {
  AGENTIC_BENCHMARK_DISPLAY_KEYS,
  BENCHMARK_PORTFOLIO,
  INDEX_BENCHMARK_KEYS,
  INDEX_REPRESENTED_BENCHMARK_MEDIAN,
  INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
  SELECTED_AGENTIC_BENCHMARKS,
  SELECTED_INTELLIGENCE_BENCHMARKS,
} from "../benchmarks/registry";
import type { MatcherConfig } from "../identity";

export type OpenRouterConfig = {
  speedConcurrency: number;
};

export type BenchmarkAdmissionConfig = {
  indexBenchmarkKeys: readonly string[];
  minimumObservedIndexes: number;
  minimumObservedBenchmarks: number;
  minimumObservedPerDimension: number;
};

export type QualityCoverageThresholds = Record<
  BenchmarkDimension,
  {
    floor: number;
    full: number;
  }
>;

const QUALITY_COVERAGE_FLOOR_SHARE = 0.1;
const QUALITY_COVERAGE_FULL_WEIGHT = INDEX_REPRESENTED_BENCHMARK_MEDIAN;
const QUALITY_COVERAGE_FLOOR_WEIGHT = QUALITY_COVERAGE_FULL_WEIGHT * QUALITY_COVERAGE_FLOOR_SHARE;
const MINIMUM_OBSERVED_BENCHMARKS = INDEX_REPRESENTED_BENCHMARK_MEDIAN;
export const MAX_NORMALIZED_IMPUTATION_ERROR = 25;
export const RESOURCE_SCORE_BUCKET_WEIGHTS = {
  benchmark: 0.7,
  nonBenchmark: 0.3,
} as const;

/** Keep regularization stable as the selected portfolio grows by using effective benchmark mass rather than portfolio share. */
export const QUALITY_COVERAGE = {
  intelligence: {
    floor: QUALITY_COVERAGE_FLOOR_WEIGHT,
    full: QUALITY_COVERAGE_FULL_WEIGHT,
  },
  agentic: {
    floor: QUALITY_COVERAGE_FLOOR_WEIGHT,
    full: QUALITY_COVERAGE_FULL_WEIGHT,
  },
} satisfies QualityCoverageThresholds;

export type FinalStageConfig = {
  nullFieldPruneThreshold: number;
  nullFieldPruneRecentLookbackDays: number;
  previewMaxAgeDays: number;
  benchmarkAdmission: BenchmarkAdmissionConfig;
};

export type SnapshotPreservationConfig = {
  minPreviousIntelligenceScore: number;
  minIntelligenceScoreDrop: number;
};

export type TaskCostPriceTransition = {
  modelId: string;
  effectiveDate: string;
  priceBefore: {
    input: number;
    output: number;
  };
  priceFrom: {
    input: number;
    output: number;
  };
};

export const BENCHMARK_VERSION_BASELINE_DATE = "2026-07-30";

/**
 * Rebase task costs whose own observed-cost date predates a model price transition.
 * Per-row change detection, rather than a benchmark allowlist, decides whether the ratio applies.
 */
export const TASK_COST_PRICE_TRANSITIONS = [
  {
    modelId: "openai/gpt-5.6-terra",
    effectiveDate: "2026-07-30",
    priceBefore: { input: 2.5, output: 15 },
    priceFrom: { input: 2, output: 12 },
  },
  {
    modelId: "openai/gpt-5.6-luna",
    effectiveDate: "2026-07-30",
    priceBefore: { input: 1, output: 6 },
    priceFrom: { input: 0.2, output: 1.2 },
  },
] as const satisfies readonly TaskCostPriceTransition[];

export type ScoringConfig = {
  intelligenceBenchmarkKeys: readonly string[];
  intelligenceBenchmarkDisplayKeys: readonly string[];
  agenticBenchmarkKeys: readonly string[];
  agenticBenchmarkDisplayKeys: readonly string[];
  agenticTokenModifierCap: number;
  previewAdditionalIntelligenceBenchmarkKeys: readonly string[];
  defaultSpeedOutputTokenAnchors: readonly number[];
  speedOutputTokenRangeMin: number;
  speedOutputTokenRangeMax: number;
  speedAnchorQuantiles: readonly number[];
  benchmarkPortfolio: BenchmarkPortfolio;
  qualityCoverage: QualityCoverageThresholds;
};

export type ModelAtlasStageConfig = {
  matcher: MatcherConfig;
  openrouter: OpenRouterConfig;
  final: FinalStageConfig;
  snapshotPreservation: SnapshotPreservationConfig;
  scoring: ScoringConfig;
};

/** Centralized stage config for matching, route data, pruning, and scoring. */
export const STAGE_CONFIG = {
  matcher: {
    variantTokens: [
      "flash-lite",
      "flash",
      "pro",
      "nano",
      "mini",
      "lite",
      "max",
      "image",
      "vl",
      "coder",
      "small",
      "micro",
      "codex",
      "omni",
      "multi-agent",
      "latest",
    ],
  },
  openrouter: {
    speedConcurrency: 8,
  },
  final: {
    nullFieldPruneThreshold: 0.5,
    nullFieldPruneRecentLookbackDays: 90,
    previewMaxAgeDays: 30,
    benchmarkAdmission: {
      indexBenchmarkKeys: INDEX_BENCHMARK_KEYS,
      minimumObservedIndexes: 2,
      minimumObservedBenchmarks: MINIMUM_OBSERVED_BENCHMARKS,
      minimumObservedPerDimension: 1,
    },
  },
  snapshotPreservation: {
    minPreviousIntelligenceScore: 90,
    minIntelligenceScoreDrop: 10,
  },
  scoring: {
    intelligenceBenchmarkKeys: SELECTED_INTELLIGENCE_BENCHMARKS,
    intelligenceBenchmarkDisplayKeys: INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
    agenticBenchmarkKeys: SELECTED_AGENTIC_BENCHMARKS,
    agenticBenchmarkDisplayKeys: AGENTIC_BENCHMARK_DISPLAY_KEYS,
    agenticTokenModifierCap: 0.15,
    previewAdditionalIntelligenceBenchmarkKeys: ["gpqa", "mmmu_pro"],
    defaultSpeedOutputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
    speedOutputTokenRangeMin: 200,
    speedOutputTokenRangeMax: 8_000,
    speedAnchorQuantiles: [0.25, 0.5, 0.75],
    benchmarkPortfolio: BENCHMARK_PORTFOLIO,
    qualityCoverage: QUALITY_COVERAGE,
  },
} satisfies ModelAtlasStageConfig;
