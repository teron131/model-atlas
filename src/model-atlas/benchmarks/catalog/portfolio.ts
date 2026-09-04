/** Benchmark portfolio policy owns scoring weights, imputation, and resource-scoring policy. */

import { medianOfFinite } from "../../math-utils";
import type {
  BenchmarkImputationPolicy,
  BenchmarkPortfolioEntry,
  BenchmarkResourcePolicy,
} from "../factory";

type BenchmarkScoringWeight = Omit<BenchmarkPortfolioEntry, "resourcePolicy">;
type BenchmarkResourceMeasurement = Omit<BenchmarkResourcePolicy, "qualityCoordinate">;

const ARTIFICIAL_ANALYSIS_PER_TASK_RESOURCE = {
  source: "artificial_analysis",
  unit: "per_task",
  tokenMeasure: "tokens",
} as const satisfies BenchmarkResourceMeasurement;

const ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE = {
  source: "artificial_analysis",
  unit: "per_task",
  tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourceMeasurement;

const BENCHMARK_PER_TASK_RESOURCE = {
  source: "benchmark",
  unit: "per_task",
  tokenMeasure: "tokens",
} as const satisfies BenchmarkResourceMeasurement;

const BENCHMARK_OUTPUT_PER_TASK_RESOURCE = {
  source: "benchmark",
  unit: "per_task",
  tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourceMeasurement;

function requiredBenchmarkCountMedian(values: readonly number[]): number {
  const median = medianOfFinite(values);
  if (median == null) {
    throw new Error("Index benchmark representation counts must contain a finite value");
  }
  return median;
}

const REPORTED_INDEX_BENCHMARK_COUNTS = {
  aa_intelligence_index: 9,
  surge_intelligence_index: 8,
  vals_index: 7,
} as const;

export const INDEX_REPRESENTED_BENCHMARK_COUNTS = {
  aa_intelligence_index: REPORTED_INDEX_BENCHMARK_COUNTS.aa_intelligence_index,
  epoch_capabilities_index: requiredBenchmarkCountMedian(
    Object.values(REPORTED_INDEX_BENCHMARK_COUNTS),
  ),
  surge_intelligence_index: REPORTED_INDEX_BENCHMARK_COUNTS.surge_intelligence_index,
  vals_index: REPORTED_INDEX_BENCHMARK_COUNTS.vals_index,
} as const;

export const INDEX_REPRESENTED_BENCHMARK_MEDIAN = requiredBenchmarkCountMedian(
  Object.values(INDEX_REPRESENTED_BENCHMARK_COUNTS),
);

const INDEX_SCORING_WEIGHT = {
  group: "baseline",
  benchmarkImportance: 0.5,
  dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
} as const satisfies BenchmarkScoringWeight;

export const BENCHMARK_SCORING_WEIGHTS = {
  aa_intelligence_index: INDEX_SCORING_WEIGHT,
  agent_arena: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  agents_last_exam: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  ale_bench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  analyst_agent: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  apex_agents: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  arc_agi_2: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  arc_agi_3: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  automation_bench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  blueprint_bench_2: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  briefcase: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  browsecomp: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  chartography: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  chess_puzzles: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  code_migration: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  complex_constraints: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  critpt: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  cursorbench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  cyberbench: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  deep_swe: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  ebr_bench: {
    group: "baseline",
    benchmarkImportance: 0.5,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  emb: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  enterprisebench_corecraft: {
    group: "baseline",
    benchmarkImportance: 0.5,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  epoch_capabilities_index: INDEX_SCORING_WEIGHT,
  finance_agent_v2: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  frontier_code: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  frontiermath_tier_4: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  gdp_pdf: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  gdpval_normalized: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  handbook_md: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  harvey_lab: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  hemingway_bench: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  hle: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  itbench_sre: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  legal_research: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  mls_bench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  omniscience_accuracy: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  perception_bench: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  programbench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  proofbench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  public_benefits_bench: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  riemann_bench: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  scicode: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  surge_intelligence_index: INDEX_SCORING_WEIGHT,
  tau_banking: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  terminal_bench_4: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  terminal_bench_science: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  toolathlon: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  vals_index: INDEX_SCORING_WEIGHT,
  vending_bench_2: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  vibe_code: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  weirdml: {
    group: "baseline",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
} as const satisfies Readonly<Record<string, BenchmarkScoringWeight>>;

export type BenchmarkKey = keyof typeof BENCHMARK_SCORING_WEIGHTS & string;

export type BenchmarkResourceProfile = {
  taskRunCount: number;
};

export const BENCHMARK_RESOURCE_PROFILES = {
  analyst_agent: { taskRunCount: 80 },
  apex_agents: { taskRunCount: 452 },
  arc_agi_3: { taskRunCount: 55 },
  automation_bench: { taskRunCount: 657 },
  briefcase: { taskRunCount: 91 },
  critpt: { taskRunCount: 70 },
  gdpval_normalized: { taskRunCount: 220 },
  hle: { taskRunCount: 2_158 },
  itbench_sre: { taskRunCount: 177 },
  scicode: { taskRunCount: 288 },
  tau_banking: { taskRunCount: 97 },
  terminal_bench_4: { taskRunCount: 330 },
  terminal_bench_science: { taskRunCount: 210 },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkResourceProfile>>;

export const BENCHMARK_RESOURCE_POLICIES = {
  agents_last_exam: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  ale_bench: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  analyst_agent: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  apex_agents: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  arc_agi_2: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  arc_agi_3: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  automation_bench: {
    ...ARTIFICIAL_ANALYSIS_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  briefcase: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  critpt: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  cursorbench: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  deep_swe: {
    ...BENCHMARK_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  frontier_code: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  gdpval_normalized: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  harvey_lab: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  hle: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  itbench_sre: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "linear",
  },
  scicode: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  tau_banking: {
    ...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  terminal_bench_4: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
  terminal_bench_science: {
    ...BENCHMARK_PER_TASK_RESOURCE,
    qualityCoordinate: "logit",
  },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkResourcePolicy>>;

export const BENCHMARK_IMPUTATION_OVERRIDES = {
  apex_agents: {
    kind: "additive_crosswalk",
    fallbackEvidenceKey: "apex_agents_mercor",
    minimumModels: 3,
    maximumMedianAbsoluteError: 0.02,
    clamp: [0, 1],
    fallback: "contextual",
  },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkImputationPolicy>>;
