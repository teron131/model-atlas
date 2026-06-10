/** Public tuning inputs for the selected Model Atlas pipeline. */

import type {
	BenchmarkGroup,
	BenchmarkPortfolioEntry,
	ModelAtlasStageConfig,
	ModelStatsColumnTooltipRow,
	ModelStatsColumnTooltips,
	SimulationProfile,
} from "./llm/llm-stats/types";

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
	deep_swe: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
	},
} as const satisfies Readonly<Record<string, BenchmarkPortfolioEntry>>;

type BenchmarkKey = keyof typeof BENCHMARK_PORTFOLIO & string;
type BenchmarkDimension = "intelligence" | "agentic";

const BENCHMARK_KEYS = Object.keys(BENCHMARK_PORTFOLIO) as BenchmarkKey[];

const benchmarkPortfolioEntry = (key: string) =>
	BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;

const benchmarkKeysInGroup = (group: BenchmarkGroup) =>
	BENCHMARK_KEYS.filter((key) => BENCHMARK_PORTFOLIO[key].group === group);

const benchmarkDimensionPortion = (
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

const selectedBenchmarksForDimension = (dimension: BenchmarkDimension) =>
	BENCHMARK_KEYS.filter((key) => benchmarkDimensionPortion(key, dimension) > 0);

export const BASELINE_BENCHMARKS = benchmarkKeysInGroup("baseline");
export const FRONTIER_BENCHMARKS = benchmarkKeysInGroup("frontier");
export const SELECTED_INTELLIGENCE_BENCHMARKS =
	selectedBenchmarksForDimension("intelligence");
export const SELECTED_AGENTIC_BENCHMARKS =
	selectedBenchmarksForDimension("agentic");

export const PRICE_PROFILES = {
	task: {
		weight: 0.25,
		input: 0.8,
		output: 0.2,
	},
	chat: {
		weight: 0.4,
		input: 0.5,
		output: 0.5,
	},
	agentic: {
		weight: 0.35,
		input: 0.3,
		output: 0.7,
	},
} as const;

const PRICE_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(PRICE_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof PRICE_PROFILES, number>;
const PRICE_PROFILE_TOTAL_WEIGHT = Object.values(PRICE_PROFILES).reduce(
	(sum, config) => sum + config.weight,
	0,
);
const PRICE_PROFILE_ENTRIES = [
	["Task", "task"],
	["Chat", "chat"],
	["Agentic", "agentic"],
] as const satisfies readonly [string, keyof typeof PRICE_PROFILES][];

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

export const SIMULATION_PROFILES = {
	micro: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 500,
			upper: 3_000,
		},
		output_tokens_per_call: {
			lower: 1,
			upper: 50,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 30,
		quality_blend: {
			intelligence: 0.3,
			agentic: 0.7,
		},
	},
	refine_translate: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 500,
			upper: 20_000,
		},
		output_tokens_per_call: {
			lower: 500,
			upper: 20_000,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 35,
		quality_blend: {
			intelligence: 0.35,
			agentic: 0.65,
		},
	},
	extract_structure: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 3_000,
			upper: 20_000,
		},
		output_tokens_per_call: {
			lower: 100,
			upper: 1_200,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 45,
		quality_blend: {
			intelligence: 0.4,
			agentic: 0.6,
		},
	},
	chat_reasoning: {
		weight: 0.2,
		calls: 4,
		input_tokens_per_call: {
			lower: 1_000,
			upper: 12_000,
		},
		output_tokens_per_call: {
			lower: 300,
			upper: 2_000,
		},
		cacheable_input_share: 0.5,
		cache_hit_rate_after_first_call: {
			lower: 0.5,
			upper: 0.9,
		},
		quality_full_credit_at: 60,
		quality_blend: {
			intelligence: 0.55,
			agentic: 0.45,
		},
	},
	long_synthesis: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 20_000,
			upper: 80_000,
		},
		output_tokens_per_call: {
			lower: 1_500,
			upper: 6_000,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 75,
		quality_blend: {
			intelligence: 0.65,
			agentic: 0.35,
		},
	},
	agentic_loop: {
		weight: 0.2,
		calls: 8,
		input_tokens_per_call: {
			lower: 8_000,
			upper: 60_000,
		},
		output_tokens_per_call: {
			lower: 500,
			upper: 4_000,
		},
		cacheable_input_share: 0.7,
		cache_hit_rate_after_first_call: {
			lower: 0.5,
			upper: 0.9,
		},
		quality_full_credit_at: 90,
		quality_blend: {
			intelligence: 0.25,
			agentic: 0.75,
		},
	},
} as const satisfies Record<string, SimulationProfile>;

export const SIMULATION_INPUT_TOKEN_SECONDS = 0.0001;

const SIMULATION_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(SIMULATION_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof SIMULATION_PROFILES, number>;

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

const overallWeight = (key: keyof typeof OVERALL_RELATIVE_SCORE_WEIGHTS) =>
	percent(OVERALL_RELATIVE_SCORE_WEIGHTS[key]);

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

export const INTELLIGENCE_BENCHMARK_DISPLAY_KEYS =
	SELECTED_INTELLIGENCE_BENCHMARKS;
export const AGENTIC_BENCHMARK_DISPLAY_KEYS = SELECTED_AGENTIC_BENCHMARKS;

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
const equalInputWeight = (inputs: readonly unknown[]) =>
	inputs.length > 0 ? percent(1 / inputs.length) : "-";
const blendInputText = (inputs: readonly unknown[]) =>
	`each input ${equalInputWeight(inputs)}`;
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
	terminalbench_hard: "TerminalBench Hard",
	terminal_bench_2: "Terminal-Bench 2.0",
	browsecomp: "BrowseComp",
	hle: "HLE",
	critpt: "CritPt",
	gdpval_normalized: "GDPVal",
	apex_agents: "APEX Agents",
	agents_last_exam: "Agents' Last Exam",
	deep_swe: "DeepSWE",
} as const satisfies Record<BenchmarkKey, string>;
const SPEED_INPUT_LABELS = [
	"AA task seconds",
	"DeepSWE task seconds",
	"Agents' Last Exam task seconds",
	"Workflow simulated seconds",
] as const;
const SPEED_DIRECT_INPUT_LABELS = SPEED_INPUT_LABELS.filter(
	(label) => label !== "Workflow simulated seconds",
);
const VALUE_INPUT_LABELS = [
	"AA task cost",
	"AA intel per dollar",
	"DeepSWE task cost",
	"Agents' Last Exam task cost",
	"Blend price",
	"Quality-adjusted blend value",
	"Workflow simulated value",
] as const;
const qualityScoreRows = (indexLabel: string) =>
	[
		[indexLabel, qualityWeight("index")],
		["Baseline benchmarks", qualityWeight("baseline")],
		["Frontier benchmarks", qualityWeight("frontier")],
	] as const;
const qualityScoreRowsWithBenchmarkGroups = (
	indexLabel: string,
	benchmarkRows: Readonly<{
		baseline: readonly ModelStatsColumnTooltipRow[];
		frontier: readonly ModelStatsColumnTooltipRow[];
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
const speedInputRows = () =>
	[
		...SPEED_DIRECT_INPUT_LABELS.map(
			(label) => [label, equalInputWeight(SPEED_INPUT_LABELS)] as const,
		),
		{
			title: "Workflow simulation mix",
			kind: "workflow_simulation",
			weight: equalInputWeight(SPEED_INPUT_LABELS),
			rows: WORKFLOW_SIMULATION_TOOLTIP_ROWS,
		},
	] as const;
const valueInputRows = () => {
	const inputWeight = equalInputWeight(VALUE_INPUT_LABELS);
	return [
		["AA task cost", inputWeight],
		["AA intel per dollar", inputWeight],
		["DeepSWE task cost", inputWeight],
		["Agents' Last Exam task cost", inputWeight],
		{
			title: "Blend price profile",
			kind: "price_profile",
			weight: inputWeight,
			rows: priceProfileRows(),
		},
		["Quality-adjusted blend value", inputWeight],
		{
			title: "Workflow simulation mix",
			kind: "workflow_simulation",
			weight: inputWeight,
			rows: WORKFLOW_SIMULATION_TOOLTIP_ROWS,
		},
	] as const;
};

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
		body: "Percentile blend of task runtime and workflow-simulated runtime. Displayed only when at least two speed components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(SPEED_INPUT_LABELS)],
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
		body: "Percentile blend of task cost, intelligence per dollar, blend price, quality-adjusted price, and workflow-simulated work per dollar. Displayed only when at least two value components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(VALUE_INPUT_LABELS)],
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
		body: "Estimated cost for one Artificial Analysis Intelligence task.",
		rows: [["Formula", "total cost / task count"]],
	},
	aaSeconds: {
		title: "AA seconds per task",
		body: "Estimated runtime for one Artificial Analysis Intelligence task.",
		rows: [["Formula", "latency + tokens / throughput"]],
	},
	aaTokens: {
		title: "AA output tokens per task",
		body: "Estimated output tokens for one Artificial Analysis Intelligence task.",
		rows: [["Formula", "output tokens / task count"]],
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
	},
	deepSWESeconds: {
		title: "DeepSWE seconds per task",
		body: "Mean runtime for one DeepSWE task.",
	},
	deepSWETokens: {
		title: "DeepSWE output tokens per task",
		body: "Mean output tokens for one DeepSWE task.",
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
	agentsLastExamSeconds: {
		title: "Agents' Last Exam runtime",
		body: "Full Overall harness runtime, using the lower of median and mean.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Split", FULL_OVERALL_TEXT],
			["Sort", LOWER_FIRST_TEXT],
		],
	},
	agentsLastExamInputTokens: {
		title: "Agents' Last Exam input tokens",
		body: "Full Overall harness input-token usage, using the lower of median and mean.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Split", FULL_OVERALL_TEXT],
			["Sort", LOWER_FIRST_TEXT],
		],
	},
	agentsLastExamOutputTokens: {
		title: "Agents' Last Exam output tokens",
		body: "Full Overall harness output-token usage, using the lower of median and mean.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Split", FULL_OVERALL_TEXT],
			["Sort", LOWER_FIRST_TEXT],
		],
	},
} as const satisfies ModelStatsColumnTooltips;

/** Centralized stage config for matching, enrichment, pruning, and scoring. */
export const STAGE_CONFIG = {
	matcher: {
		variantTokens: [
			"flash-lite",
			"flash",
			"pro",
			"preview",
			"nano",
			"mini",
			"lite",
			"max",
			"image",
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
		priceProfiles: PRICE_PROFILES,
		simulationProfiles: SIMULATION_PROFILES,
		simulationInputTokenSeconds: SIMULATION_INPUT_TOKEN_SECONDS,
		benchmarkPortfolio: BENCHMARK_PORTFOLIO,
		frontierBenchmarkKeys: FRONTIER_BENCHMARKS,
		qualityScoreWeights: QUALITY_SCORE_WEIGHTS,
		overallRelativeScoreWeights: OVERALL_RELATIVE_SCORE_WEIGHTS,
		columnTooltips: COLUMN_TOOLTIPS,
	},
} satisfies ModelAtlasStageConfig;
