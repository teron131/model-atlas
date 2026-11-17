/** Each scored benchmark's portfolio group and Intelligence/Agentic loadings, which also define `BenchmarkKey`, plus which benchmarks score Speed and Value from their resources and under what resource policy. */

import type { BenchmarkPortfolioEntry, BenchmarkResourcePolicy } from "../factory";
import { CAIS_INDEX_SCORING_WEIGHT, INDEX_SCORING_WEIGHT } from "../index-policy";

type BenchmarkScoringWeight = Omit<BenchmarkPortfolioEntry, "resourcePolicy">;

const ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE = {
  source: "artificial_analysis",
  unit: "per_task",
  tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_PER_TASK_RESOURCE = {
  source: "benchmark",
  unit: "per_task",
  tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

export const BENCHMARK_SCORING_WEIGHTS = {
  aa_3d: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  aa_intelligence_index: INDEX_SCORING_WEIGHT,
  agents_last_exam: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  ale_bench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  analyst_agent: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  apex_agents: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  apex_swe: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  arc_agi_2: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  arc_agi_3: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  arena_agent: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  arena_webdev: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  automation_bench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  biomysterybench: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  blueprint_bench_2: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  briefcase: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  cais_capabilities_index: CAIS_INDEX_SCORING_WEIGHT,
  chartography: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  chess_puzzles: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  code2video_aa: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  code_migration: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  complex_constraints: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  critpt: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  dayjob_finance: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  dayjob_healthcare: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  ebr_bench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  emb: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  enigmaeval: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  epoch_capabilities_index: INDEX_SCORING_WEIGHT,
  erqa: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  finance_agent: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  frontier_code: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  frontiermath_tier_4: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  gdp_pdf: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  gdp_xlsx: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  gdpval_normalized: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  handbook_md: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  hemingway_bench: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  hle: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  intphys2: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  mindcube: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  mirrorcode: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  mlcr_aa: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  mysterymechanism: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  omniscience_accuracy: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  programbench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  public_benefits_bench: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  riemann_bench: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  rsi_benchmark: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  simpleqa_verified: {
    group: "baseline",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  spatialviz: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  sre_bench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  sudo_l7: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  superchem: {
    group: "frontier",
    dimensionLoadings: { intelligence: 1, agentic: 0 },
  },
  surge_intelligence_index: INDEX_SCORING_WEIGHT,
  terminal_bench: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  terminal_bench_science: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
  textquests: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  vals_index: INDEX_SCORING_WEIGHT,
  vending_bench_2: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
  },
  vibe_code: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
  voxelbench: {
    group: "baseline",
    dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
  },
  weirdml: {
    group: "frontier",
    dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
  },
} as const satisfies Readonly<Record<string, BenchmarkScoringWeight>>;

export type BenchmarkKey = keyof typeof BENCHMARK_SCORING_WEIGHTS & string;

export type BenchmarkResourceProfile = {
  taskRunCount: number;
};

/** Task runs in one complete suite run: source readers accept resource totals only over exactly this many runs, and per-task resources divide by it. */
export const BENCHMARK_RESOURCE_PROFILES = {
  arc_agi_3: { taskRunCount: 55 },
  terminal_bench: { taskRunCount: 330 },
  terminal_bench_science: { taskRunCount: 210 },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkResourceProfile>>;

export const BENCHMARK_RESOURCE_POLICIES = {
  agents_last_exam: BENCHMARK_PER_TASK_RESOURCE,
  ale_bench: BENCHMARK_PER_TASK_RESOURCE,
  analyst_agent: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  arc_agi_2: BENCHMARK_PER_TASK_RESOURCE,
  arc_agi_3: BENCHMARK_PER_TASK_RESOURCE,
  automation_bench: BENCHMARK_PER_TASK_RESOURCE,
  briefcase: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  code2video_aa: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  critpt: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  frontier_code: BENCHMARK_PER_TASK_RESOURCE,
  gdp_pdf: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  gdpval_normalized: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  hle: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  mlcr_aa: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  omniscience_accuracy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
  terminal_bench: BENCHMARK_PER_TASK_RESOURCE,
  terminal_bench_science: BENCHMARK_PER_TASK_RESOURCE,
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkResourcePolicy>>;
