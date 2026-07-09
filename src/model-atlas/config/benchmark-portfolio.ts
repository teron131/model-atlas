/** Benchmark portfolio configuration for Model Atlas. */

import type {
	BenchmarkGroup,
	BenchmarkPortfolioEntry,
	BenchmarkResourcePolicy,
} from "../stats/types";

const ARTIFICIAL_ANALYSIS_PER_TASK_RESOURCE_POLICY = {
	source: "artificial_analysis",
	unit: "per_task",
	tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

const ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY = {
	source: "artificial_analysis",
	unit: "per_task",
	tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_PER_TASK_RESOURCE_POLICY = {
	source: "benchmark",
	unit: "per_task",
	tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_OUTPUT_PER_TASK_RESOURCE_POLICY = {
	source: "benchmark",
	unit: "per_task",
	tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_TOTAL_RESOURCE_POLICY = {
	source: "benchmark",
	unit: "total",
	tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

export const BENCHMARK_PORTFOLIO = {
	agents_last_exam: {
		group: "frontier",
		intelligencePortion: 0.2,
		agenticPortion: 0.8,
		resourcePolicy: BENCHMARK_TOTAL_RESOURCE_POLICY,
	},
	apex_agents: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	automation_bench: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: ARTIFICIAL_ANALYSIS_PER_TASK_RESOURCE_POLICY,
	},
	blueprint_bench_2: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	briefcase: {
		group: "frontier",
		intelligencePortion: 0.25,
		agenticPortion: 0.75,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	browsecomp: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	critpt: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	cursorbench: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: BENCHMARK_PER_TASK_RESOURCE_POLICY,
	},
	deep_swe: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: BENCHMARK_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	gdp_pdf: {
		group: "frontier",
		intelligencePortion: 0.9,
		agenticPortion: 0.1,
	},
	gdpval_normalized: {
		group: "frontier",
		intelligencePortion: 0.6,
		agenticPortion: 0.4,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	harvey_lab: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	hle: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	lcr: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	omniscience_accuracy: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	riemann_bench: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	scicode: {
		group: "baseline",
		intelligencePortion: 0.8,
		agenticPortion: 0.2,
	},
	tau_banking: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	terminalbench_v21: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_RESOURCE_POLICY,
	},
	toolathlon: {
		group: "baseline",
		intelligencePortion: 0.2,
		agenticPortion: 0.8,
	},
	vals_index: {
		group: "baseline",
		intelligencePortion: 0.6,
		agenticPortion: 0.4,
	},
} as const satisfies Readonly<Record<string, BenchmarkPortfolioEntry>>;

export type BenchmarkKey = keyof typeof BENCHMARK_PORTFOLIO & string;
export type BenchmarkDimension = "intelligence" | "agentic";

export const BENCHMARK_KEYS = Object.keys(
	BENCHMARK_PORTFOLIO,
) as BenchmarkKey[];

export const OVERALL_SCORE_WEIGHTS = {
	intelligence: 0.35,
	agentic: 0.25,
	speed: 0.2,
	value: 0.2,
} as const;

/** Looks up the portfolio entry for a benchmark key. */
export const benchmarkPortfolioEntry = (key: string) =>
	BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;

export const benchmarkResourcePolicy = (
	key: string,
	portfolio: Readonly<
		Record<string, BenchmarkPortfolioEntry>
	> = BENCHMARK_PORTFOLIO,
) => portfolio[key]?.resourcePolicy ?? null;

export const benchmarkKeysInGroup = (group: BenchmarkGroup) =>
	BENCHMARK_KEYS.filter((key) => BENCHMARK_PORTFOLIO[key].group === group);

export const benchmarkDimensionPortion = (
	key: string,
	dimension: BenchmarkDimension,
) => {
	const entry = benchmarkPortfolioEntry(key);
	return entry == null
		? 0
		: dimension === "intelligence"
			? entry.intelligencePortion
			: entry.agenticPortion;
};

export const selectedBenchmarksForDimension = (dimension: BenchmarkDimension) =>
	BENCHMARK_KEYS.filter((key) => benchmarkDimensionPortion(key, dimension) > 0);

export const BASELINE_BENCHMARKS = benchmarkKeysInGroup("baseline");
export const FRONTIER_BENCHMARKS = benchmarkKeysInGroup("frontier");
export const SELECTED_INTELLIGENCE_BENCHMARKS =
	selectedBenchmarksForDimension("intelligence");
export const SELECTED_AGENTIC_BENCHMARKS =
	selectedBenchmarksForDimension("agentic");

export const INTELLIGENCE_BENCHMARK_DISPLAY_KEYS =
	SELECTED_INTELLIGENCE_BENCHMARKS;
export const AGENTIC_BENCHMARK_DISPLAY_KEYS = SELECTED_AGENTIC_BENCHMARKS;
