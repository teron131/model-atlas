/** Pipeline stage switches for matching, route data, public selection, and scoring. */

import type { BenchmarkDimension, BenchmarkPortfolio } from "../benchmarks/factory";
import {
  AGENTIC_BENCHMARK_DISPLAY_KEYS,
  BENCHMARK_PORTFOLIO,
  benchmarkDimensionWeight,
  INDEX_BENCHMARK_KEYS,
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
  minimumObservedBenchmarks: number;
  minimumObservedPerDimension: number;
};

export type Confidence = Record<
  BenchmarkDimension,
  {
    floor: number;
    full: number;
  }
>;

const CONFIDENCE_FLOOR_SHARE = 0.1;
const CONFIDENCE_FULL_SHARE = 0.6;
export const MAX_NORMALIZED_IMPUTATION_ERROR = 25;

/** Derive the confidence ramp from the selected portfolio's effective dimension weight. */
function confidenceForDimension(keys: readonly string[], dimension: BenchmarkDimension) {
  const totalWeight = keys.reduce(
    (total, key) => total + benchmarkDimensionWeight(key, dimension, BENCHMARK_PORTFOLIO),
    0,
  );
  return {
    floor: Number((totalWeight * CONFIDENCE_FLOOR_SHARE).toFixed(10)),
    full: Number((totalWeight * CONFIDENCE_FULL_SHARE).toFixed(10)),
  };
}

export const CONFIDENCE = {
  intelligence: confidenceForDimension(SELECTED_INTELLIGENCE_BENCHMARKS, "intelligence"),
  agentic: confidenceForDimension(SELECTED_AGENTIC_BENCHMARKS, "agentic"),
} satisfies Confidence;

export type FinalStageConfig = {
  nullFieldPruneThreshold: number;
  nullFieldPruneRecentLookbackDays: number;
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
  defaultSpeedOutputTokenAnchors: readonly number[];
  speedOutputTokenRangeMin: number;
  speedOutputTokenRangeMax: number;
  speedAnchorQuantiles: readonly number[];
  benchmarkPortfolio: BenchmarkPortfolio;
  confidence: Confidence;
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
    benchmarkAdmission: {
      indexBenchmarkKeys: INDEX_BENCHMARK_KEYS,
      minimumObservedBenchmarks: 8,
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
    defaultSpeedOutputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
    speedOutputTokenRangeMin: 200,
    speedOutputTokenRangeMax: 8_000,
    speedAnchorQuantiles: [0.25, 0.5, 0.75],
    benchmarkPortfolio: BENCHMARK_PORTFOLIO,
    confidence: CONFIDENCE,
  },
} satisfies ModelAtlasStageConfig;
