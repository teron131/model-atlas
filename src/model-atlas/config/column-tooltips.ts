/** Column tooltip metadata for Model Atlas. */

import type {
	LlmStatsColumnTooltip,
	LlmStatsColumnTooltipRow,
	LlmStatsColumnTooltips,
} from "../stats/types";
import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_KEYS,
	type BenchmarkDimension,
	type BenchmarkKey,
	benchmarkDimensionPortion,
	benchmarkPortfolioEntry,
	benchmarkResourcePolicy,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	QUALITY_SCORE_WEIGHTS,
} from "./benchmark-portfolio";
import {
	PRICE_PROFILE_ENTRIES,
	PRICE_PROFILE_TOTAL_WEIGHT,
	PRICE_PROFILE_WEIGHTS,
	PRICE_PROFILES,
	SIMULATION_PROFILE_WEIGHTS,
	type SIMULATION_PROFILES,
} from "./usage-profiles";

function percent(value: number, fractionDigits = 0): string {
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

function weightPercent<T extends Record<string, number>>(
	weights: T,
	key: keyof T,
): string {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
	const weight = weights[key];
	return total > 0 && weight != null ? percent(weight / total) : "-";
}

const qualityWeight = (key: keyof typeof QUALITY_SCORE_WEIGHTS) =>
	weightPercent(QUALITY_SCORE_WEIGHTS, key);

const priceProfileRow = (
	label: string,
	profile: keyof typeof PRICE_PROFILES,
) => {
	const profileConfig = PRICE_PROFILES[profile];
	return [
		`${label} input/output split ${percent(profileConfig.input)}/${percent(profileConfig.output)}`,
		weightPercent(PRICE_PROFILE_WEIGHTS, profile),
	] as const;
};

const priceProfileContributionRow = (
	label: string,
	profile: keyof typeof PRICE_PROFILES,
	side: "input" | "output",
) => {
	const profileConfig = PRICE_PROFILES[profile];
	const profileWeight =
		PRICE_PROFILE_TOTAL_WEIGHT > 0
			? profileConfig.weight / PRICE_PROFILE_TOTAL_WEIGHT
			: 0;
	return [
		`${label} ${percent(profileWeight)} x ${percent(profileConfig[side])}`,
		percent(profileWeight * profileConfig[side], 1),
	] as const;
};

const priceProfileRows = () =>
	PRICE_PROFILE_ENTRIES.map(([label, profile]) =>
		priceProfileRow(label, profile),
	);

const priceProfileContributionRows = (side: "input" | "output") =>
	PRICE_PROFILE_ENTRIES.map(([label, profile]) =>
		priceProfileContributionRow(label, profile, side),
	);

const simulationProfileRow = (
	label: string,
	description: string,
	profile: keyof typeof SIMULATION_PROFILES,
) =>
	[
		`${label} ${description}`,
		weightPercent(SIMULATION_PROFILE_WEIGHTS, profile),
	] as const;

const WORKFLOW_SIMULATION_TOOLTIP_ROWS = [
	simulationProfileRow("Micro", "1 call, input 500-3k, output 1-50", "micro"),
	simulationProfileRow(
		"Refine/translate",
		"1 call, input 500-20k, output 500-20k",
		"refine_translate",
	),
	simulationProfileRow(
		"Extract/structure",
		"1 call, input 3k-20k, output 100-1.2k",
		"extract_structure",
	),
	simulationProfileRow(
		"Chat",
		"4 calls, input 1k-12k, output 300-2k",
		"chat_reasoning",
	),
	simulationProfileRow(
		"Long synthesis",
		"1 call, input 20k-80k, output 1.5k-6k",
		"long_synthesis",
	),
	simulationProfileRow(
		"Agentic",
		"8 calls, input 8k-60k, output 500-4k",
		"agentic_loop",
	),
] as const;

const effectivePriceProfileRatio = (key: "input" | "output") => {
	const totalWeight = Object.values(PRICE_PROFILES).reduce(
		(sum, profile) => sum + profile.weight,
		0,
	);
	const weightedRatio = Object.values(PRICE_PROFILES).reduce(
		(sum, profile) => sum + profile.weight * profile[key],
		0,
	);
	return totalWeight > 0 ? percent(weightedRatio / totalWeight, 1) : "-";
};

const benchmarkContributionPercent = (
	keys: readonly string[],
	key: string,
	dimension: BenchmarkDimension,
) => {
	const entry = benchmarkPortfolioEntry(key);
	if (entry == null) {
		return "-";
	}
	const groupKeys = keys.filter(
		(benchmarkKey) =>
			benchmarkPortfolioEntry(benchmarkKey)?.group === entry.group,
	);
	const groupPortionTotal = groupKeys.reduce(
		(sum, benchmarkKey) =>
			sum + benchmarkDimensionPortion(benchmarkKey, dimension),
		0,
	);
	const groupWeight = QUALITY_SCORE_WEIGHTS[entry.group];
	const portion = benchmarkDimensionPortion(key, dimension);
	return groupPortionTotal > 0
		? percent((groupWeight * portion) / groupPortionTotal)
		: "-";
};

const SPEED_NON_BENCHMARK_COMPONENT_COUNT = 2;
const speedComponentCount = (components: ActiveResourceComponents) =>
	resourceBenchmarkKeys(components).length +
	SPEED_NON_BENCHMARK_COMPONENT_COUNT;
const speedBlendText = (components: ActiveResourceComponents) =>
	`equal slots: provider speed, workflow runtime, and each benchmark runtime (${perComponentWeight(
		1,
		speedComponentCount(components),
	)} each)`;

const VALUE_PRICE_COMPONENT_COUNT = 3;
const valueComponentCount = (components: ActiveResourceComponents) =>
	resourceBenchmarkKeys(components).length + VALUE_PRICE_COMPONENT_COUNT;
const valueBlendText = (components: ActiveResourceComponents) =>
	`equal slots: blended price, quality per price, workflow price value, and each benchmark cost (${perComponentWeight(
		1,
		valueComponentCount(components),
	)} each)`;

const MIN_MAX_SCORE_TEXT = "min-max score across models";
const LOWER_FIRST_TEXT = "lower values sort first";
const HIGHER_FIRST_TEXT = "higher values sort first";
const FULL_OVERALL_TEXT = "Full Overall";

const BENCHMARK_LABEL_BY_KEY = {
	omniscience_accuracy: "Omniscience accuracy",
	lcr: "LCR",
	scicode: "SciCode",
	tau_banking: "tau3 Banking",
	terminalbench_v21: "Terminal-Bench 2.1",
	browsecomp: "BrowseComp",
	toolathlon: "Toolathlon",
	cursorbench: "CursorBench",
	vals_index: "Vals Index",
	blueprint_bench_2: "Blueprint-Bench 2",
	gdp_pdf: "GDP.pdf",
	riemann_bench: "Riemann-bench",
	hle: "HLE",
	critpt: "CritPt",
	gdpval_normalized: "GDPval-AA v2",
	apex_agents: "APEX Agents",
	agents_last_exam: "Agents' Last Exam",
	automation_bench: "AutomationBench",
	deep_swe: "DeepSWE",
} as const satisfies Record<BenchmarkKey, string>;

type CoreColumnTooltipKey =
	| "intelligence"
	| "agentic"
	| "speed"
	| "value"
	| "blend"
	| "context"
	| "artificialAnalysisCost"
	| "artificialAnalysisSeconds"
	| "artificialAnalysisTokens"
	| "deepSWE"
	| "deepSWECost"
	| "deepSWESeconds"
	| "deepSWETokens"
	| "agentsLastExam"
	| "agentsLastExamCost";
type CoreColumnTooltips = LlmStatsColumnTooltips &
	Record<CoreColumnTooltipKey, LlmStatsColumnTooltip>;

export type ActiveResourceComponents = {
	artificialAnalysisBenchmarkKeys: readonly string[];
	directBenchmarkKeys: readonly string[];
};

const ALL_RESOURCE_COMPONENTS = {
	artificialAnalysisBenchmarkKeys: BENCHMARK_KEYS.filter(
		(key) => benchmarkResourcePolicy(key)?.source === "artificial_analysis",
	),
	directBenchmarkKeys: BENCHMARK_KEYS.filter(
		(key) => benchmarkResourcePolicy(key)?.source === "benchmark",
	),
} as const satisfies ActiveResourceComponents;

function perComponentWeight(totalWeight: number, count: number): string {
	return count > 0 ? percent(totalWeight / count, 1) : "-";
}

function resourceBenchmarkKeys(
	components: ActiveResourceComponents,
): readonly string[] {
	return [
		...components.artificialAnalysisBenchmarkKeys,
		...components.directBenchmarkKeys,
	].sort((left, right) =>
		benchmarkLabel(left).localeCompare(benchmarkLabel(right)),
	);
}

function benchmarkLabel(key: string): string {
	return BENCHMARK_LABEL_BY_KEY[key as BenchmarkKey] ?? key;
}

function benchmarkResourceRows(
	keys: readonly string[],
	labelPrefix: string,
	labelSuffix: string,
	weight: string,
): readonly LlmStatsColumnTooltipRow[] {
	return keys.map((key) => [
		`${labelPrefix}${benchmarkLabel(key)} ${labelSuffix}`,
		weight,
	]);
}

const qualityScoreRowsWithBenchmarkGroups = (
	indexLabel: string,
	benchmarkRows: Readonly<{
		baseline: readonly LlmStatsColumnTooltipRow[];
		frontier: readonly LlmStatsColumnTooltipRow[];
	}>,
) =>
	[
		[indexLabel, qualityWeight("index")],
		{
			title: "Baseline benchmarks",
			rows: benchmarkRows.baseline,
		},
		{
			title: "Frontier benchmarks",
			rows: benchmarkRows.frontier,
		},
	] as const;

const benchmarkTooltipRowsByGroup = (
	keys: readonly BenchmarkKey[],
	dimension: BenchmarkDimension,
) => ({
	baseline: keys
		.filter((key) => benchmarkPortfolioEntry(key)?.group === "baseline")
		.map(
			(key) =>
				[
					BENCHMARK_LABEL_BY_KEY[key],
					benchmarkContributionPercent(keys, key, dimension),
				] as const,
		),
	frontier: keys
		.filter((key) => benchmarkPortfolioEntry(key)?.group === "frontier")
		.map(
			(key) =>
				[
					BENCHMARK_LABEL_BY_KEY[key],
					benchmarkContributionPercent(keys, key, dimension),
				] as const,
		),
});

const INTELLIGENCE_BENCHMARK_TOOLTIP_ROWS = benchmarkTooltipRowsByGroup(
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	"intelligence",
);

const AGENTIC_BENCHMARK_TOOLTIP_ROWS = benchmarkTooltipRowsByGroup(
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	"agentic",
);

const speedInputRows = (components: ActiveResourceComponents) => {
	const componentCount = speedComponentCount(components);
	const componentWeight = perComponentWeight(1, componentCount);
	const rawStatWeight = percent(1 / componentCount / 3, 1);
	return [
		{
			title: "Benchmark runtimes (lower is faster)",
			rows: benchmarkTaskTimeRows(components, componentWeight),
		},
		{
			title: "Provider speed",
			weight: componentWeight,
			rows: [
				["Throughput, higher is faster", rawStatWeight],
				["Latency, lower is faster", rawStatWeight],
				["End-to-end latency, lower is faster", rawStatWeight],
			],
		},
		{
			title: "Workflow runtime simulation (lower is faster)",
			kind: "workflow_simulation",
			weight: componentWeight,
			rows: WORKFLOW_SIMULATION_TOOLTIP_ROWS,
		},
	] as const;
};

const benchmarkTaskTimeRows = (
	components: ActiveResourceComponents,
	weight?: string,
) => {
	const resourceKeys = resourceBenchmarkKeys(components);
	const componentWeight = weight ?? perComponentWeight(1, resourceKeys.length);
	return [
		...benchmarkResourceRows(
			resourceKeys,
			"",
			"runtime, lower is faster",
			componentWeight,
		),
	] as const;
};

const valueInputRows = (components: ActiveResourceComponents) => {
	const resourceKeys = resourceBenchmarkKeys(components);
	const componentWeight = perComponentWeight(
		1,
		valueComponentCount(components),
	);
	return [
		{
			title: "Price components",
			rows: [
				["Blended price, lower is cheaper", componentWeight],
				["Quality per blended price, higher is better", componentWeight],
				["Workflow price value, higher is better", componentWeight],
			],
		},
		{
			title: "Benchmark costs (lower is cheaper)",
			rows: benchmarkResourceRows(
				resourceKeys,
				"",
				"cost, lower is cheaper",
				componentWeight,
			),
		},
	] as const;
};

export function columnTooltipsForActiveComponents(
	components: ActiveResourceComponents = ALL_RESOURCE_COMPONENTS,
): CoreColumnTooltips {
	return {
		intelligence: {
			title: "Intelligence score",
			body: "Atlas capability score from the AA INTELLIGENCE index plus the selected INTELLIGENCE benchmarks.",
			rows: [
				["Scale", MIN_MAX_SCORE_TEXT],
				["Sort", HIGHER_FIRST_TEXT],
			],
			sections: [
				{
					title: "Score blend",
					hideTitle: true,
					rows: qualityScoreRowsWithBenchmarkGroups(
						"AA Intelligence Index",
						INTELLIGENCE_BENCHMARK_TOOLTIP_ROWS,
					),
				},
			],
		},
		agentic: {
			title: "Agentic score",
			body: "Atlas workflow and coding-task score from the AA AGENTIC index plus selected AGENTIC benchmarks.",
			rows: [
				["Scale", MIN_MAX_SCORE_TEXT],
				["Sort", HIGHER_FIRST_TEXT],
			],
			sections: [
				{
					title: "Score blend",
					hideTitle: true,
					rows: qualityScoreRowsWithBenchmarkGroups(
						"AA Agentic Index",
						AGENTIC_BENCHMARK_TOOLTIP_ROWS,
					),
				},
			],
		},
		speed: {
			title: "Speed score",
			body: "SPEED is higher when models are faster. Runtime inputs are inverted, so lower workflow seconds and lower benchmark runtimes raise the score. Each active input gets one equal slot.",
			rows: [
				["Scale", "0-100 percentile; higher means faster"],
				["Blend", speedBlendText(components)],
				["Sort", "higher scores rank first"],
			],
			sections: [
				{
					title: "Speed inputs",
					hideTitle: true,
					rows: speedInputRows(components),
				},
			],
		},
		value: {
			title: "Value score",
			body: "VALUE is higher when models deliver more quality per dollar. Lower blended price and lower benchmark costs raise the score; quality-adjusted price signals also raise it. Each active input gets one equal slot.",
			rows: [
				["Scale", "0-100 percentile; higher means better value"],
				["Blend", valueBlendText(components)],
				["Sort", "higher scores rank first"],
			],
			sections: [
				{
					title: "Value inputs",
					hideTitle: true,
					rows: valueInputRows(components),
				},
			],
		},
		blend: {
			title: "Blend price",
			body: "Estimated USD per million tokens for a task/chat/agentic usage mix.",
			rows: [
				["Definition", "weighted input/output price"],
				["Formula", "sum(profile weight x profile price)"],
				["Sort", LOWER_FIRST_TEXT],
			],
			sections: [
				{
					title: "Price methodology",
					rows: [
						{
							title: "Profile weights",
							kind: "price_profile",
							rows: priceProfileRows(),
						},
						{
							title: "Input share",
							kind: "price_share",
							weight: effectivePriceProfileRatio("input"),
							rows: priceProfileContributionRows("input"),
						},
						{
							title: "Output share",
							kind: "price_share",
							weight: effectivePriceProfileRatio("output"),
							rows: priceProfileContributionRows("output"),
						},
					],
				},
			],
		},
		context: {
			title: "Context",
			body: "Largest prompt context window available for the model.",
			rows: [
				["Definition", "maximum input tokens"],
				["Unit", "tokens"],
				["Source", "model context limit"],
				["Sort", HIGHER_FIRST_TEXT],
			],
		},
		artificialAnalysisCost: {
			title: "AA cost per task",
			body: "Artificial Analysis v4.1 reported cost for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported cost per Intelligence task"],
				["Method", "direct AA per-task field"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		artificialAnalysisSeconds: {
			title: "AA seconds per task",
			body: "Artificial Analysis v4.1 reported runtime for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported time per Intelligence task"],
				["Method", "direct AA per-task field"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		artificialAnalysisTokens: {
			title: "AA output tokens per task",
			body: "Artificial Analysis v4.1 reported output tokens for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported output tokens per Intelligence task"],
				["Method", "direct AA per-task field"],
				["Sort", HIGHER_FIRST_TEXT],
			],
		},
		deepSWE: {
			title: "DeepSWE",
			body: "Coding-agent benchmark. This score uses the xhigh row when available, otherwise the best reported pass@1 row.",
			rows: [
				["Source", "DeepSWE leaderboard"],
				["Sort", HIGHER_FIRST_TEXT],
			],
		},
		deepSWECost: {
			title: "DeepSWE cost per task",
			body: "Mean cost for one DeepSWE task.",
			rows: [
				["Source", "DeepSWE leaderboard"],
				["Metric", "mean cost per task"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		deepSWESeconds: {
			title: "DeepSWE seconds per task",
			body: "Mean runtime for one DeepSWE task.",
			rows: [
				["Source", "DeepSWE leaderboard"],
				["Metric", "mean runtime per task"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		deepSWETokens: {
			title: "DeepSWE output tokens per task",
			body: "Mean output tokens for one DeepSWE task.",
			rows: [
				["Source", "DeepSWE leaderboard"],
				["Metric", "mean output tokens per task"],
				["Sort", HIGHER_FIRST_TEXT],
			],
		},
		agentsLastExam: {
			title: "Agents' Last Exam",
			body: "Real-world software and professional-workflow benchmark. The displayed value is the higher of median and mean partial-credit score.",
			rows: [
				["Source", "Agents' Last Exam"],
				["Split", FULL_OVERALL_TEXT],
				["Sort", HIGHER_FIRST_TEXT],
			],
		},
		agentsLastExamCost: {
			title: "Agents' Last Exam cost",
			body: "Estimated cost per Full Overall run, using the lower of median and mean per-run token usage.",
			rows: [
				["Source", "Agents' Last Exam"],
				["Split", FULL_OVERALL_TEXT],
				["Metric", "cost per run"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		agentsLastExamSeconds: {
			title: "Agents' Last Exam runtime",
			body: "Runtime per Full Overall run, using the lower of median and mean per-run duration.",
			rows: [
				["Source", "Agents' Last Exam"],
				["Split", FULL_OVERALL_TEXT],
				["Metric", "runtime per run"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		agentsLastExamInputTokens: {
			title: "Agents' Last Exam input tokens",
			body: "Input tokens per Full Overall run, using the lower of median and mean per-run token usage.",
			rows: [
				["Source", "Agents' Last Exam"],
				["Split", FULL_OVERALL_TEXT],
				["Metric", "input tokens per run"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
		agentsLastExamOutputTokens: {
			title: "Agents' Last Exam output tokens",
			body: "Output tokens per Full Overall run, using the lower of median and mean per-run token usage.",
			rows: [
				["Source", "Agents' Last Exam"],
				["Split", FULL_OVERALL_TEXT],
				["Metric", "output tokens per run"],
				["Sort", LOWER_FIRST_TEXT],
			],
		},
	};
}

export const COLUMN_TOOLTIPS = columnTooltipsForActiveComponents();
