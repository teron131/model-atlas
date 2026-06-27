/** Column tooltip metadata for Model Atlas. */

import type {
	LlmStatsColumnTooltipRow,
	LlmStatsColumnTooltips,
} from "../llm/stats/types";
import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	ARTIFICIAL_ANALYSIS_RESOURCE_SOURCE_COUNT,
	type BenchmarkDimension,
	type BenchmarkKey,
	benchmarkDimensionPortion,
	benchmarkPortfolioEntry,
	FRONTIER_BENCHMARKS,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	OVERALL_RELATIVE_SCORE_WEIGHTS,
	QUALITY_SCORE_WEIGHTS,
	RAW_RESOURCE_COMPONENT_WEIGHT,
	resourceComponentWeightsFor,
} from "./benchmark-portfolio";
import {
	PRICE_PROFILE_ENTRIES,
	PRICE_PROFILE_TOTAL_WEIGHT,
	PRICE_PROFILE_WEIGHTS,
	PRICE_PROFILES,
	SIMULATION_PROFILE_WEIGHTS,
	type SIMULATION_PROFILES,
} from "./usage-profiles";

/** Formats ratio values for tooltip percentages. */
function percent(value: number, fractionDigits = 0): string {
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** Formats ratio values for tooltip percentages. */
function weightPercent<T extends Record<string, number>>(
	weights: T,
	key: keyof T,
): string {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
	const weight = weights[key];
	return total > 0 && weight != null ? percent(weight / total) : "-";
}

/** Formats scoring weights for tooltip explanations. */
const overallWeight = (key: keyof typeof OVERALL_RELATIVE_SCORE_WEIGHTS) =>
	percent(OVERALL_RELATIVE_SCORE_WEIGHTS[key]);

/** Formats scoring weights for tooltip explanations. */
const qualityWeight = (key: keyof typeof QUALITY_SCORE_WEIGHTS) =>
	weightPercent(QUALITY_SCORE_WEIGHTS, key);

/** Builds tooltip rows for price-profile weighting. */
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

/** Builds tooltip rows for price-profile weighting. */
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

/** Builds tooltip rows for price-profile weighting. */
const priceProfileRows = () =>
	PRICE_PROFILE_ENTRIES.map(([label, profile]) =>
		priceProfileRow(label, profile),
	);

/** Builds tooltip rows for price-profile weighting. */
const priceProfileContributionRows = (side: "input" | "output") =>
	PRICE_PROFILE_ENTRIES.map(([label, profile]) =>
		priceProfileContributionRow(label, profile, side),
	);

/** Builds tooltip rows for workflow simulation weighting. */
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

/** Builds tooltip metadata for effective price profile ratio. */
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

/** Formats ratio values for tooltip percentages. */
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

/** Formats ratio values for tooltip percentages. */
const componentWeightPercent = (
	weights: Record<string, number>,
	key: string,
): string => {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
	const weight = weights[key];
	return total > 0 && weight != null ? percent(weight / total, 1) : "-";
};

/** Builds tooltip metadata for blend input text. */
const blendInputText = (weights: Record<string, number>) => {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
	return `${total.toFixed(1)} weighted component units`;
};

const RELATIVE_SCORE_TEXT = "relative to this model set";
const MIN_MAX_RELATIVE_SCORE_TEXT = "min-max relative score across models";
const PERCENTILE_SCORE_TEXT = "percentile; higher is better";
const LOWER_FIRST_TEXT = "lower values sort first";
const HIGHER_FIRST_TEXT = "higher values sort first";
const FULL_OVERALL_TEXT = "Full Overall";

const BENCHMARK_LABEL_BY_KEY = {
	omniscience_accuracy: "Omniscience accuracy",
	lcr: "LCR",
	scicode: "SciCode",
	tau_banking: "tau3 Banking",
	terminalbench_v21: "Terminal-Bench 2.1",
	terminal_bench_2: "Terminal-Bench 2.0",
	browsecomp: "BrowseComp",
	toolathlon: "Toolathlon",
	cursorbench: "CursorBench",
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

const FRONTIER_RESOURCE_SOURCE_COUNT = FRONTIER_BENCHMARKS.length;
const {
	artificialAnalysisResourceWeight: AA_RESOURCE_COMPONENT_WEIGHT,
	frontierResourceWeight: FRONTIER_RESOURCE_COMPONENT_WEIGHT,
} = resourceComponentWeightsFor({
	artificialAnalysisResourceSourceCount:
		ARTIFICIAL_ANALYSIS_RESOURCE_SOURCE_COUNT,
	frontierResourceSourceCount: FRONTIER_RESOURCE_SOURCE_COUNT,
});

const SPEED_COMPONENT_WEIGHTS = {
	aa_task_seconds: AA_RESOURCE_COMPONENT_WEIGHT,
	frontier_normalized_task_speed: FRONTIER_RESOURCE_COMPONENT_WEIGHT,
	workflow_simulated_seconds: RAW_RESOURCE_COMPONENT_WEIGHT,
} as const;

const VALUE_RAW_COMPONENT_WEIGHT = RAW_RESOURCE_COMPONENT_WEIGHT / 3;

const VALUE_COMPONENT_WEIGHTS = {
	aa_resource_task_cost: AA_RESOURCE_COMPONENT_WEIGHT / 2,
	aa_score_per_dollar: AA_RESOURCE_COMPONENT_WEIGHT / 2,
	frontier_resource_task_cost: FRONTIER_RESOURCE_COMPONENT_WEIGHT / 2,
	frontier_resource_score_per_dollar: FRONTIER_RESOURCE_COMPONENT_WEIGHT / 2,
	blend_price: VALUE_RAW_COMPONENT_WEIGHT,
	quality_adjusted_blend_value: VALUE_RAW_COMPONENT_WEIGHT,
	workflow_simulated_value: VALUE_RAW_COMPONENT_WEIGHT,
} as const;

/** Builds tooltip rows for quality score components. */
const qualityScoreRows = (indexLabel: string) =>
	[
		[indexLabel, qualityWeight("index")],
		["Baseline benchmarks", qualityWeight("baseline")],
		["Frontier benchmarks", qualityWeight("frontier")],
	] as const;

/** Builds tooltip rows for quality score components. */
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

/** Builds tooltip rows that explain benchmark contributions. */
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

/** Builds tooltip rows for speed score inputs. */
const speedInputRows = () =>
	[
		[
			"AA task seconds",
			componentWeightPercent(SPEED_COMPONENT_WEIGHTS, "aa_task_seconds"),
		],
		[
			"Frontier benchmark task speed",
			componentWeightPercent(
				SPEED_COMPONENT_WEIGHTS,
				"frontier_normalized_task_speed",
			),
		],
		{
			title: "Workflow simulation mix",
			kind: "workflow_simulation",
			weight: componentWeightPercent(
				SPEED_COMPONENT_WEIGHTS,
				"workflow_simulated_seconds",
			),
			rows: WORKFLOW_SIMULATION_TOOLTIP_ROWS,
		},
	] as const;

/** Builds tooltip rows for value score inputs. */
const valueInputRows = () =>
	[
		[
			"AA-sourced resource task cost",
			componentWeightPercent(VALUE_COMPONENT_WEIGHTS, "aa_resource_task_cost"),
		],
		[
			"AA-sourced score per dollar",
			componentWeightPercent(VALUE_COMPONENT_WEIGHTS, "aa_score_per_dollar"),
		],
		[
			"Frontier benchmark task cost",
			componentWeightPercent(
				VALUE_COMPONENT_WEIGHTS,
				"frontier_resource_task_cost",
			),
		],
		[
			"Frontier benchmark score per dollar",
			componentWeightPercent(
				VALUE_COMPONENT_WEIGHTS,
				"frontier_resource_score_per_dollar",
			),
		],
		{
			title: "Blend price profile",
			kind: "price_profile",
			weight: componentWeightPercent(VALUE_COMPONENT_WEIGHTS, "blend_price"),
			rows: priceProfileRows(),
		},
		[
			"Quality-adjusted blend value",
			componentWeightPercent(
				VALUE_COMPONENT_WEIGHTS,
				"quality_adjusted_blend_value",
			),
		],
		{
			title: "Workflow simulation mix",
			kind: "workflow_simulation",
			weight: componentWeightPercent(
				VALUE_COMPONENT_WEIGHTS,
				"workflow_simulated_value",
			),
			rows: WORKFLOW_SIMULATION_TOOLTIP_ROWS,
		},
	] as const;

export const COLUMN_TOOLTIPS = {
	overall: {
		title: "Overall score",
		body: "Practical utility score from fixed relative component weights. The table defaults to Intelligence sort; missing Speed or Value is estimated for Overall only.",
		rows: [["Scale", RELATIVE_SCORE_TEXT]],
		sections: [
			{
				title: "Component weights",
				rows: [
					["Intelligence", overallWeight("intelligence")],
					["Agentic", overallWeight("agentic")],
					["Speed", overallWeight("speed")],
					["Value", overallWeight("value")],
				],
			},
			{
				title: "Intelligence blend",
				rows: qualityScoreRows("AA index"),
			},
			{
				title: "Agentic blend",
				rows: qualityScoreRows("AA index"),
			},
			{
				title: "Speed inputs",
				hideTitle: true,
				rows: speedInputRows(),
			},
			{
				title: "Value inputs",
				hideTitle: true,
				rows: valueInputRows(),
			},
		],
	},
	intelligence: {
		title: "Intelligence score",
		body: "Relative capability score from the AA Intelligence index plus the selected intelligence benchmarks.",
		rows: [
			["Scale", MIN_MAX_RELATIVE_SCORE_TEXT],
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
		body: "Relative workflow and coding-task score from the AA Agentic index plus selected agentic benchmarks.",
		rows: [
			["Scale", MIN_MAX_RELATIVE_SCORE_TEXT],
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
		body: "Weighted percentile blend of served-speed simulation, task runtime, and frontier resource runtime. Displayed only when at least two speed components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(SPEED_COMPONENT_WEIGHTS)],
			["Sort", HIGHER_FIRST_TEXT],
		],
		sections: [
			{
				title: "Speed inputs",
				hideTitle: true,
				rows: speedInputRows(),
			},
		],
	},
	value: {
		title: "Value score",
		body: "Weighted percentile blend of raw price, task cost, quality per dollar, and frontier resource value. Displayed only when at least two value components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(VALUE_COMPONENT_WEIGHTS)],
			["Sort", HIGHER_FIRST_TEXT],
		],
		sections: [
			{
				title: "Value inputs",
				hideTitle: true,
				rows: valueInputRows(),
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
	aaCost: {
		title: "AA cost per task",
		body: "Artificial Analysis v4.1 reported cost for one Intelligence Index task.",
		rows: [
			["Source", "Artificial Analysis"],
			["Metric", "reported cost per Intelligence task"],
			["Method", "direct AA per-task field"],
			["Sort", LOWER_FIRST_TEXT],
		],
	},
	aaSeconds: {
		title: "AA seconds per task",
		body: "Artificial Analysis v4.1 reported runtime for one Intelligence Index task.",
		rows: [
			["Source", "Artificial Analysis"],
			["Metric", "reported time per Intelligence task"],
			["Method", "direct AA per-task field"],
			["Sort", LOWER_FIRST_TEXT],
		],
	},
	aaTokens: {
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
		body: "Coding-agent benchmark. This score uses each model's best pass@1 configuration.",
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
} as const satisfies LlmStatsColumnTooltips;
