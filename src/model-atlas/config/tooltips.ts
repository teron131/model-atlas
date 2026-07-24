/** Column tooltip copy stays aligned with active scoring weights and benchmark resource policy. */

import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_CATALOG,
	BENCHMARK_KEYS,
	type BenchmarkKey,
	benchmarkDimensionWeight,
	benchmarkPortfolioEntry,
	benchmarkResourcePolicy,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
} from "../benchmarks/registry";
import {
	PRICE_PROFILE_ENTRIES,
	PRICE_PROFILE_TOTAL_WEIGHT,
	PRICE_PROFILE_WEIGHTS,
	PRICE_PROFILES,
	SIMULATION_PROFILE_WEIGHTS,
	type SIMULATION_PROFILES,
} from "./usage-profiles";

export type ModelAtlasColumnTooltipRow = readonly [string, string];

export type ModelAtlasColumnTooltipSectionKind =
	| "price_profile"
	| "price_share"
	| "workflow_simulation";

export type ModelAtlasColumnTooltipNestedSection = {
	title: string;
	kind?: ModelAtlasColumnTooltipSectionKind;
	weight?: string;
	rows: readonly ModelAtlasColumnTooltipRow[];
};

export type ModelAtlasColumnTooltipSectionItem =
	| ModelAtlasColumnTooltipRow
	| ModelAtlasColumnTooltipNestedSection;

type ModelAtlasColumnTooltipSection = {
	title: string;
	hideTitle?: boolean;
	kind?: ModelAtlasColumnTooltipSectionKind;
	weight?: string;
	rows: readonly ModelAtlasColumnTooltipSectionItem[];
};

export type ModelAtlasColumnTooltip = {
	title: string;
	body: string;
	rows?: readonly ModelAtlasColumnTooltipRow[];
	sections?: readonly ModelAtlasColumnTooltipSection[];
};

export type ModelAtlasColumnTooltips = Record<string, ModelAtlasColumnTooltip>;

const CONFIDENCE_SCALE = "zero through 10% weighted evidence; full from 60%";

export const CONFIDENCE_TOOLTIP = {
	title: "Confidence",
	body: "How much validation-weighted evidence supports each dimension's estimated benchmark mean.",
	rows: [
		["I", "Intelligence confidence"],
		["A", "Agentic confidence"],
		["Scale", CONFIDENCE_SCALE],
	],
} as const satisfies ModelAtlasColumnTooltip;

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

const WORKFLOW_SIMULATION_ROWS = [
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
	keys: readonly BenchmarkKey[],
	key: BenchmarkKey,
	dimension: "intelligence" | "agentic",
) => {
	const totalWeight = keys.reduce(
		(sum, benchmarkKey) =>
			sum + benchmarkDimensionWeight(benchmarkKey, dimension),
		0,
	);
	return totalWeight > 0
		? percent(benchmarkDimensionWeight(key, dimension) / totalWeight, 1)
		: "-";
};

const SPEED_BASE_COMPONENT_COUNT = 2;
const VALUE_PRICE_COMPONENT_COUNT = 3;

type CoreColumnTooltipKey =
	| "intelligence"
	| "agentic"
	| "speed"
	| "value"
	| "blend"
	| "context"
	| "artificialAnalysisCost"
	| "artificialAnalysisSeconds"
	| "artificialAnalysisTokens";
type CoreColumnTooltips = ModelAtlasColumnTooltips &
	Record<CoreColumnTooltipKey, ModelAtlasColumnTooltip>;

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

function benchmarkLabel(key: string): string {
	return (
		BENCHMARK_CATALOG[key as BenchmarkKey]?.presentation.scoringLabel ?? key
	);
}

function resourceBenchmarkKeys(
	components: ActiveResourceComponents,
): readonly string[] {
	const componentKeys = new Set([
		...components.artificialAnalysisBenchmarkKeys,
		...components.directBenchmarkKeys,
	]);
	return BENCHMARK_KEYS.filter((key) => componentKeys.has(key));
}

function benchmarkResourceRows(
	keys: readonly string[],
	labelPrefix: string,
	labelSuffix: string,
	weight: string,
): readonly ModelAtlasColumnTooltipRow[] {
	return keys.map((key) => [
		`${labelPrefix}${benchmarkLabel(key)} ${labelSuffix}`,
		weight,
	]);
}

const qualityBenchmarkRows = (
	benchmarkRows: Readonly<{
		baseline: readonly ModelAtlasColumnTooltipRow[];
		frontier: readonly ModelAtlasColumnTooltipRow[];
	}>,
) =>
	[
		["Effective weight", "importance x dimension loading"],
		["Aggregation", "weights normalized within dimension"],
		[
			"Imputed-value penalty",
			"frontier subtracts 1.0x error; baseline subtracts 0.5x error",
		],
		["Confidence", CONFIDENCE_SCALE],
		{
			title: "Frontier benchmarks",
			rows: benchmarkRows.frontier,
		},
		{
			title: "Baseline benchmarks",
			rows: benchmarkRows.baseline,
		},
	] as const;

const benchmarkRowsByGroup = (
	keys: readonly BenchmarkKey[],
	dimension: "intelligence" | "agentic",
) => ({
	baseline: keys
		.filter((key) => benchmarkPortfolioEntry(key)?.group === "baseline")
		.map(
			(key) =>
				[
					BENCHMARK_CATALOG[key].presentation.scoringLabel,
					benchmarkContributionPercent(keys, key, dimension),
				] as const,
		),
	frontier: keys
		.filter((key) => benchmarkPortfolioEntry(key)?.group === "frontier")
		.map(
			(key) =>
				[
					BENCHMARK_CATALOG[key].presentation.scoringLabel,
					benchmarkContributionPercent(keys, key, dimension),
				] as const,
		),
});

const INTELLIGENCE_BENCHMARK_ROWS = benchmarkRowsByGroup(
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	"intelligence",
);

const AGENTIC_BENCHMARK_ROWS = benchmarkRowsByGroup(
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	"agentic",
);

const speedInputRows = (components: ActiveResourceComponents) => {
	const resourceKeys = resourceBenchmarkKeys(components);
	const componentCount = resourceKeys.length + SPEED_BASE_COMPONENT_COUNT;
	const componentWeight = perComponentWeight(1, componentCount);
	const rawStatWeight = percent(1 / componentCount / 3, 1);
	return [
		{
			title: "Benchmark runtimes ↓",
			rows: benchmarkResourceRows(
				resourceKeys,
				"",
				"runtime ↓",
				componentWeight,
			),
		},
		{
			title: "Provider speed",
			weight: componentWeight,
			rows: [
				["Throughput", rawStatWeight],
				["Latency ↓", rawStatWeight],
				["End-to-end latency ↓", rawStatWeight],
			],
		},
		{
			title: "Workflow runtime simulation ↓",
			kind: "workflow_simulation",
			weight: componentWeight,
			rows: WORKFLOW_SIMULATION_ROWS,
		},
	] as const;
};

const valueInputRows = (components: ActiveResourceComponents) => {
	const resourceKeys = resourceBenchmarkKeys(components);
	const componentWeight = perComponentWeight(
		1,
		resourceKeys.length + VALUE_PRICE_COMPONENT_COUNT,
	);
	return [
		{
			title: "Price components",
			rows: [
				["Log blended price ↓", componentWeight],
				["Quality-adjusted log blended price ↓", componentWeight],
				["Quality-adjusted workflow price efficiency", componentWeight],
			],
		},
		{
			title: "Benchmark costs ↓",
			rows: benchmarkResourceRows(resourceKeys, "", "cost ↓", componentWeight),
		},
	] as const;
};

export function columnTooltipsForActiveComponents(
	components: ActiveResourceComponents = ALL_RESOURCE_COMPONENTS,
): CoreColumnTooltips {
	return {
		intelligence: {
			title: "Intelligence score",
			body: "Atlas capability score from selected INTELLIGENCE benchmarks. Each benchmark's weight is its importance multiplied by its Intelligence loading; frontier or baseline group affects only missing-data handling.",
			rows: [
				["Benchmark normalization", "observed min-max range to 0-100"],
				["Final score", "weighted mean x evidence confidence"],
			],
			sections: [
				{
					title: "Score blend",
					hideTitle: true,
					rows: qualityBenchmarkRows(INTELLIGENCE_BENCHMARK_ROWS),
				},
			],
		},
		agentic: {
			title: "Agentic score",
			body: "Atlas workflow and coding-task score from selected AGENTIC benchmarks. Each benchmark's weight is its importance multiplied by its Agentic loading; frontier or baseline group affects only missing-data handling.",
			rows: [
				["Benchmark normalization", "observed min-max range to 0-100"],
				["Final score", "weighted mean x evidence confidence"],
			],
			sections: [
				{
					title: "Score blend",
					hideTitle: true,
					rows: qualityBenchmarkRows(AGENTIC_BENCHMARK_ROWS),
				},
			],
		},
		speed: {
			title: "Speed score",
			body: "Provider and workflow inputs are logged before min-max normalization. Benchmark runtime scores average model-balanced percentile and winsorized min-max mappings of logged residuals from the model-excluded expectation at comparable quality, then shrink toward 50 when peer support is weak. Each active input gets one equal slot.",
			rows: [
				["Provider and workflow", "log input, then min-max"],
				["Benchmark runtimes", "quality-adjusted residual hybrid"],
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
			body: "Blended price uses logged one-sided winsorized min-max normalization. Other price and benchmark-cost inputs average model-balanced percentile and winsorized min-max mappings of residuals from the model-excluded expectation at comparable quality; the workflow output is not logged again. Each active input gets one equal slot.",
			rows: [
				["Blended price", "log input, then winsorized min-max"],
				["Quality-adjusted price signals", "residual percentile/min-max mean"],
				["Benchmark costs", "logged residual percentile/min-max mean"],
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
			title: "Blended price ↓",
			body: "Estimated USD per million tokens for a task/chat/agentic usage mix.",
			rows: [
				["Definition", "weighted input/output price"],
				["Formula", "sum(profile weight x profile price)"],
			],
			sections: [
				{
					title: "Price methodology",
					rows: [
						{
							title: "Profile weights",
							kind: "price_profile",
							rows: PRICE_PROFILE_ENTRIES.map(([label, profile]) => {
								const profileConfig = PRICE_PROFILES[profile];
								return [
									`${label} input/output split ${percent(profileConfig.input)}/${percent(profileConfig.output)}`,
									weightPercent(PRICE_PROFILE_WEIGHTS, profile),
								] as const;
							}),
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
			],
		},
		artificialAnalysisCost: {
			title: "AA cost per task ↓",
			body: "Artificial Analysis v4.1 reported cost for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported cost per Intelligence task"],
				["Method", "direct AA per-task field"],
			],
		},
		artificialAnalysisSeconds: {
			title: "AA seconds per task ↓",
			body: "Artificial Analysis v4.1 reported runtime for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported time per Intelligence task"],
				["Method", "direct AA per-task field"],
			],
		},
		artificialAnalysisTokens: {
			title: "AA output tokens per task",
			body: "Artificial Analysis v4.1 reported output tokens for one Intelligence Index task.",
			rows: [
				["Source", "Artificial Analysis"],
				["Metric", "reported output tokens per Intelligence task"],
				["Method", "direct AA per-task field"],
			],
		},
	};
}

export const COLUMN_TOOLTIPS = columnTooltipsForActiveComponents();
