/** Benchmark portfolio policy owns scoring weights, imputation, and resource-scoring policy. */

import type {
	BenchmarkImputationPolicy,
	BenchmarkPortfolioEntry,
	BenchmarkResourcePolicy,
} from "../factory";

type BenchmarkScoringWeight = Omit<BenchmarkPortfolioEntry, "resourcePolicy">;
type BenchmarkResourceMeasurement = Omit<
	BenchmarkResourcePolicy,
	"qualityCoordinate"
>;

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

export const BENCHMARK_SCORING_WEIGHTS = {
	aa_intelligence_index: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	agent_arena: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	agents_last_exam: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	ale_bench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.4, agentic: 0.6 },
	},
	apex_agents: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
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
		dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
	},
	browsecomp: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
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
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	critpt: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	cursorbench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	cyberbench: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	ebr_bench: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	emb: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
	},
	enterprisebench_corecraft: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	epoch_capabilities_index: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	finance_agent_v2: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	frontier_code: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	frontiermath_tier_4: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	gdp_pdf: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.9, agentic: 0.1 },
	},
	gdpval_normalized: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
	},
	handbook_md: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	harvey_lab: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	hle: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	itbench_sre: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	lcr: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	legal_research: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	medcode: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	omniscience_accuracy: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	programbench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	proofbench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.7, agentic: 0.3 },
	},
	public_benefits_bench: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
	},
	riemann_bench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	scicode: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.8, agentic: 0.2 },
	},
	tau_banking: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	terminalbench_v21: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	toolathlon: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	vals_index: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
	},
	vending_bench_2: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	vibe_code: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	weirdml: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
	},
} as const satisfies Readonly<Record<string, BenchmarkScoringWeight>>;

export type BenchmarkKey = keyof typeof BENCHMARK_SCORING_WEIGHTS & string;

export const BENCHMARK_RESOURCE_POLICIES = {
	agents_last_exam: {
		...BENCHMARK_PER_TASK_RESOURCE,
		qualityCoordinate: "linear",
	},
	ale_bench: {
		...BENCHMARK_PER_TASK_RESOURCE,
		qualityCoordinate: "linear",
	},
	apex_agents: {
		...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
		qualityCoordinate: "logit",
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
	tau_banking: {
		...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
		qualityCoordinate: "logit",
	},
	terminalbench_v21: {
		...ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE,
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
