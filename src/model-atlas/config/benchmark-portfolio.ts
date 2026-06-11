import type {
	BenchmarkGroup,
	BenchmarkPortfolioEntry,
} from "../llm/stats/types";

export const BENCHMARK_PORTFOLIO = {
	omniscience_accuracy: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	lcr: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	scicode: {
		group: "baseline",
		intelligencePortion: 0.6,
		agenticPortion: 0.4,
	},
	terminalbench_hard: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	terminal_bench_2: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	browsecomp: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	toolathlon: {
		group: "baseline",
		intelligencePortion: 0.2,
		agenticPortion: 0.8,
	},
	cursorbench: {
		group: "baseline",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	hle: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	critpt: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	gdpval_normalized: {
		group: "frontier",
		intelligencePortion: 0.8,
		agenticPortion: 0.2,
	},
	apex_agents: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	agents_last_exam: {
		group: "frontier",
		intelligencePortion: 0.2,
		agenticPortion: 0.8,
	},
	automation_bench: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
	blueprint_bench_2: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
	},
	deep_swe: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
} as const satisfies Readonly<Record<string, BenchmarkPortfolioEntry>>;

export type BenchmarkKey = keyof typeof BENCHMARK_PORTFOLIO & string;
export type BenchmarkDimension = "intelligence" | "agentic";

export const BENCHMARK_KEYS = Object.keys(
	BENCHMARK_PORTFOLIO,
) as BenchmarkKey[];

export const QUALITY_SCORE_WEIGHTS = {
	index: 0.3,
	baseline: 0.3,
	frontier: 0.4,
} as const;

export const OVERALL_RELATIVE_SCORE_WEIGHTS = {
	intelligence: 0.35,
	agentic: 0.25,
	speed: 0.2,
	value: 0.2,
} as const;

export const benchmarkPortfolioEntry = (key: string) =>
	BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;

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
