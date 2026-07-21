/** Benchmark portfolio configuration for Model Atlas. */

import type {
	BenchmarkGroup,
	BenchmarkPortfolio,
	BenchmarkPortfolioEntry,
	BenchmarkResourcePolicy,
} from "../stats/types";

const DIMENSION_LOADING_SUM_TOLERANCE = 1e-9;

const ARTIFICIAL_ANALYSIS_PER_TASK_POLICY = {
	source: "artificial_analysis",
	unit: "per_task",
	tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

const ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY = {
	source: "artificial_analysis",
	unit: "per_task",
	tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_PER_TASK_POLICY = {
	source: "benchmark",
	unit: "per_task",
	tokenMeasure: "tokens",
} as const satisfies BenchmarkResourcePolicy;

const BENCHMARK_OUTPUT_PER_TASK_POLICY = {
	source: "benchmark",
	unit: "per_task",
	tokenMeasure: "output_tokens",
} as const satisfies BenchmarkResourcePolicy;

export const BENCHMARK_PORTFOLIO = {
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
		resourcePolicy: BENCHMARK_PER_TASK_POLICY,
	},
	ale_bench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.4, agentic: 0.6 },
		resourcePolicy: BENCHMARK_PER_TASK_POLICY,
	},
	apex_agents: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	automation_bench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_PER_TASK_POLICY,
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
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
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
	critpt: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	cursorbench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: BENCHMARK_PER_TASK_POLICY,
	},
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: BENCHMARK_OUTPUT_PER_TASK_POLICY,
	},
	ebr_bench: {
		group: "baseline",
		benchmarkImportance: 0.5,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
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
	frontier_code: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: BENCHMARK_PER_TASK_POLICY,
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
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
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
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	hle: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	itbench_sre: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	lcr: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	omniscience_accuracy: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	proofbench: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.7, agentic: 0.3 },
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
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
	},
	terminalbench_v21: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: ARTIFICIAL_ANALYSIS_OUTPUT_PER_TASK_POLICY,
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
	weirdml: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
	},
} as const satisfies Readonly<Record<string, BenchmarkPortfolioEntry>>;

export type BenchmarkKey = keyof typeof BENCHMARK_PORTFOLIO & string;
export type BenchmarkDimension = "intelligence" | "agentic";

export const BENCHMARK_KEYS = Object.keys(
	BENCHMARK_PORTFOLIO,
) as BenchmarkKey[];

export const INDEX_BENCHMARK_KEYS = [
	"aa_intelligence_index",
	"epoch_capabilities_index",
	"vals_index",
] as const satisfies readonly BenchmarkKey[];

/** Reject benchmark configuration whose importance, loadings, or missing-data group violate the scoring contract. */
export function validateBenchmarkPortfolio(
	portfolio: BenchmarkPortfolio,
): void {
	for (const [key, entry] of Object.entries(portfolio)) {
		if (entry.group !== "baseline" && entry.group !== "frontier") {
			throw new Error(`Invalid benchmark group for ${key}: ${entry.group}`);
		}
		if (
			!Number.isFinite(entry.benchmarkImportance) ||
			entry.benchmarkImportance <= 0
		) {
			throw new Error(
				`Benchmark importance must be finite and positive for ${key}`,
			);
		}
		const { intelligence, agentic } = entry.dimensionLoadings;
		if (
			!Number.isFinite(intelligence) ||
			!Number.isFinite(agentic) ||
			intelligence < 0 ||
			agentic < 0 ||
			Math.abs(intelligence + agentic - 1) > DIMENSION_LOADING_SUM_TOLERANCE
		) {
			throw new Error(
				`Dimension loadings must be finite, non-negative, and sum to one for ${key}`,
			);
		}
	}
}

validateBenchmarkPortfolio(BENCHMARK_PORTFOLIO);

/** Looks up the portfolio entry for a benchmark key. */
export const benchmarkPortfolioEntry = (key: string) =>
	BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;

export const benchmarkResourcePolicy = (
	key: string,
	portfolio: Readonly<
		Record<string, BenchmarkPortfolioEntry>
	> = BENCHMARK_PORTFOLIO,
) => portfolio[key]?.resourcePolicy ?? null;

const benchmarkKeysInGroup = (group: BenchmarkGroup) =>
	BENCHMARK_KEYS.filter((key) => BENCHMARK_PORTFOLIO[key].group === group);

/** Return a benchmark's effective dimension weight as importance multiplied by loading. */
export const benchmarkDimensionWeight = (
	key: string,
	dimension: BenchmarkDimension,
	portfolio: BenchmarkPortfolio = BENCHMARK_PORTFOLIO,
) => {
	const entry = portfolio[key];
	return entry == null
		? 0
		: entry.benchmarkImportance * entry.dimensionLoadings[dimension];
};

const selectedBenchmarksForDimension = (dimension: BenchmarkDimension) =>
	BENCHMARK_KEYS.filter((key) => benchmarkDimensionWeight(key, dimension) > 0);

export const BASELINE_BENCHMARKS = benchmarkKeysInGroup("baseline");
export const FRONTIER_BENCHMARKS = benchmarkKeysInGroup("frontier");
export const SELECTED_INTELLIGENCE_BENCHMARKS =
	selectedBenchmarksForDimension("intelligence");
export const SELECTED_AGENTIC_BENCHMARKS =
	selectedBenchmarksForDimension("agentic");

export const INTELLIGENCE_BENCHMARK_DISPLAY_KEYS =
	SELECTED_INTELLIGENCE_BENCHMARKS;
export const AGENTIC_BENCHMARK_DISPLAY_KEYS = SELECTED_AGENTIC_BENCHMARKS;
