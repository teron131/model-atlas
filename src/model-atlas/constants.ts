/** Public tuning inputs for the selected Model Atlas pipeline. */

import type {
	ModelAtlasStageConfig,
	ModelStatsColumnTooltips,
	SimulationProfile,
} from "./llm/llm-stats/types";

export const MODEL_ATLAS_INTELLIGENCE_BENCHMARK_KEYS = [
	"omniscience_accuracy",
	"lcr",
	"hle",
	"scicode",
	"critpt",
] as const;

export const MODEL_ATLAS_AGENTIC_BENCHMARK_KEYS = [
	"gdpval_normalized",
	"terminalbench_hard",
	"ifbench",
	"apex_agents",
	"deep_swe",
	"terminal_bench_2",
] as const;

export const MODEL_ATLAS_BENCHMARK_SCORE_WEIGHTS = {
	deep_swe: 2,
} as const satisfies Readonly<Record<string, number>>;

export const MODEL_ATLAS_PRICE_PROFILES = {
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

const MODEL_ATLAS_PRICE_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(MODEL_ATLAS_PRICE_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof MODEL_ATLAS_PRICE_PROFILES, number>;

export const MODEL_ATLAS_QUALITY_SCORE_WEIGHTS = {
	index: 1,
	selected_benchmarks: 2,
} as const;

export const MODEL_ATLAS_OVERALL_RELATIVE_SCORE_WEIGHTS = {
	intelligence: 0.35,
	agentic: 0.25,
	speed: 0.2,
	value: 0.2,
} as const;

export const MODEL_ATLAS_SIMULATION_PROFILES = {
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

export const MODEL_ATLAS_SIMULATION_INPUT_TOKEN_SECONDS = 0.0001;

const MODEL_ATLAS_SIMULATION_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(MODEL_ATLAS_SIMULATION_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof MODEL_ATLAS_SIMULATION_PROFILES, number>;

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

const overallWeight = (
	key: keyof typeof MODEL_ATLAS_OVERALL_RELATIVE_SCORE_WEIGHTS,
) => percent(MODEL_ATLAS_OVERALL_RELATIVE_SCORE_WEIGHTS[key]);

const qualityWeight = (key: keyof typeof MODEL_ATLAS_QUALITY_SCORE_WEIGHTS) =>
	weightPercent(MODEL_ATLAS_QUALITY_SCORE_WEIGHTS, key);

const priceProfileWeight = (key: keyof typeof MODEL_ATLAS_PRICE_PROFILES) =>
	weightPercent(MODEL_ATLAS_PRICE_PROFILE_WEIGHTS, key);
const priceProfileRatio = (
	profile: keyof typeof MODEL_ATLAS_PRICE_PROFILES,
	key: "input" | "output",
) => percent(MODEL_ATLAS_PRICE_PROFILES[profile][key]);
const priceProfileInputOutputSplit = (
	profile: keyof typeof MODEL_ATLAS_PRICE_PROFILES,
) =>
	`input/output split ${priceProfileRatio(profile, "input")}/${priceProfileRatio(profile, "output")}`;
const priceProfileRow = (
	label: string,
	profile: keyof typeof MODEL_ATLAS_PRICE_PROFILES,
) =>
	[
		`${label} ${priceProfileInputOutputSplit(profile)}`,
		priceProfileWeight(profile),
	] as const;
const simulationProfileRow = (
	label: string,
	description: string,
	profile: keyof typeof MODEL_ATLAS_SIMULATION_PROFILES,
) =>
	[
		`${label} ${description}`,
		weightPercent(MODEL_ATLAS_SIMULATION_PROFILE_WEIGHTS, profile),
	] as const;
const effectivePriceProfileRatio = (key: "input" | "output") => {
	const totalWeight = Object.values(MODEL_ATLAS_PRICE_PROFILES).reduce(
		(sum, profile) => sum + profile.weight,
		0,
	);
	const weightedRatio = Object.values(MODEL_ATLAS_PRICE_PROFILES).reduce(
		(sum, profile) => sum + profile.weight * profile[key],
		0,
	);
	return totalWeight > 0 ? percent(weightedRatio / totalWeight, 1) : "-";
};

const benchmarkScoreWeight = (key: string) =>
	MODEL_ATLAS_BENCHMARK_SCORE_WEIGHTS[
		key as keyof typeof MODEL_ATLAS_BENCHMARK_SCORE_WEIGHTS
	] ?? 1;
const benchmarkInputWeight = (keys: readonly string[], key: string) => {
	const totalWeight = keys.reduce(
		(sum, benchmarkKey) => sum + benchmarkScoreWeight(benchmarkKey),
		0,
	);
	return totalWeight > 0
		? percent(benchmarkScoreWeight(key) / totalWeight)
		: "-";
};
const equalInputWeight = (inputs: readonly unknown[]) =>
	inputs.length > 0 ? percent(1 / inputs.length) : "-";
const blendInputText = (inputs: readonly unknown[]) =>
	`each input ${equalInputWeight(inputs)}`;
const RELATIVE_SCORE_TEXT = "relative to this model set";
const MIN_MAX_RELATIVE_SCORE_TEXT = "min-max relative score across models";
const PERCENTILE_SCORE_TEXT = "percentile rank; higher is better";
const LOWER_FIRST_TEXT = "lower values sort first";
const HIGHER_FIRST_TEXT = "higher values sort first";
const INTELLIGENCE_BENCHMARK_LABEL_BY_KEY = {
	omniscience_accuracy: "Omniscience accuracy",
	lcr: "LCR",
	hle: "HLE",
	scicode: "SciCode",
	critpt: "CritPt",
} as const satisfies Record<
	(typeof MODEL_ATLAS_INTELLIGENCE_BENCHMARK_KEYS)[number],
	string
>;
const AGENTIC_BENCHMARK_LABEL_BY_KEY = {
	gdpval_normalized: "GDPval",
	terminalbench_hard: "TerminalBench Hard",
	ifbench: "IFBench",
	apex_agents: "APEX Agents",
	deep_swe: "DeepSWE",
	terminal_bench_2: "Terminal-Bench 2.0",
} as const satisfies Record<
	(typeof MODEL_ATLAS_AGENTIC_BENCHMARK_KEYS)[number],
	string
>;
const SPEED_INPUT_LABELS = [
	"AA task seconds",
	"DeepSWE task seconds",
	"Simulation seconds",
] as const;
const VALUE_INPUT_LABELS = [
	"AA task cost",
	"AA intel per dollar",
	"DeepSWE task cost",
	"Blend price",
	"Quality-adjusted blend value",
	"Workflow simulated value",
] as const;
const qualityScoreRows = (indexLabel: string) =>
	[
		[indexLabel, qualityWeight("index")],
		["Selected benchmarks", qualityWeight("selected_benchmarks")],
	] as const;
const INTELLIGENCE_BENCHMARK_TOOLTIP_ROWS =
	MODEL_ATLAS_INTELLIGENCE_BENCHMARK_KEYS.map(
		(key) =>
			[
				INTELLIGENCE_BENCHMARK_LABEL_BY_KEY[key],
				benchmarkInputWeight(MODEL_ATLAS_INTELLIGENCE_BENCHMARK_KEYS, key),
			] as const,
	);
const AGENTIC_BENCHMARK_TOOLTIP_KEYS = [
	...MODEL_ATLAS_AGENTIC_BENCHMARK_KEYS.filter((key) => key !== "deep_swe"),
	"deep_swe",
] as const;
const AGENTIC_BENCHMARK_TOOLTIP_ROWS = AGENTIC_BENCHMARK_TOOLTIP_KEYS.map(
	(key) =>
		[
			AGENTIC_BENCHMARK_LABEL_BY_KEY[key],
			benchmarkInputWeight(MODEL_ATLAS_AGENTIC_BENCHMARK_KEYS, key),
		] as const,
);
const speedInputRows = () =>
	SPEED_INPUT_LABELS.map(
		(label) => [label, equalInputWeight(SPEED_INPUT_LABELS)] as const,
	);
const valueInputRows = () =>
	VALUE_INPUT_LABELS.map(
		(label) => [label, equalInputWeight(VALUE_INPUT_LABELS)] as const,
	);

export const MODEL_ATLAS_COLUMN_TOOLTIPS = {
	overall: {
		title: "Overall score",
		body: "Practical utility score from fixed relative component weights. The table is sorted by Intelligence by default; missing Speed or Value can be inferred for Overall only.",
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
				rows: speedInputRows(),
			},
			{
				title: "Value inputs",
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
				rows: qualityScoreRows("AA Intelligence Index"),
			},
			{
				title: "Benchmark mix",
				rows: INTELLIGENCE_BENCHMARK_TOOLTIP_ROWS,
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
				rows: qualityScoreRows("AA Agentic Index"),
			},
			{
				title: "Benchmark mix",
				rows: AGENTIC_BENCHMARK_TOOLTIP_ROWS,
			},
		],
	},
	speed: {
		title: "Speed score",
		body: "Relative speed score from percentile ranks over task and runtime estimates. Displayed only when at least two speed components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(SPEED_INPUT_LABELS)],
			["Sort", HIGHER_FIRST_TEXT],
		],
		sections: [
			{
				title: "Speed inputs",
				rows: speedInputRows(),
			},
			{
				title: "Simulation mix",
				rows: [
					simulationProfileRow(
						"Micro",
						"1 call, input 500-3k, output 1-50",
						"micro",
					),
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
				],
			},
		],
	},
	value: {
		title: "Value score",
		body: "Relative value score from percentile ranks over cheapness, task cost, intelligence-per-dollar, quality-adjusted blend price, and workflow-simulated useful work per dollar. Displayed only when at least two value components are present.",
		rows: [
			["Scale", PERCENTILE_SCORE_TEXT],
			["Blend", blendInputText(VALUE_INPUT_LABELS)],
			["Sort", HIGHER_FIRST_TEXT],
		],
		sections: [
			{
				title: "Value inputs",
				rows: valueInputRows(),
			},
			{
				title: "Blend price profile",
				rows: [
					priceProfileRow("Task", "task"),
					priceProfileRow("Chat", "chat"),
					priceProfileRow("Agentic", "agentic"),
				],
			},
		],
	},
	blend: {
		title: "Blend price",
		body: "Estimated USD per million tokens after applying the configured task/chat/agentic usage mix.",
		rows: [
			["Definition", "weighted input/output price"],
			["Formula", "sum(profile weight x profile price)"],
			["Input share", effectivePriceProfileRatio("input")],
			["Output share", effectivePriceProfileRatio("output")],
			["Sort", LOWER_FIRST_TEXT],
		],
		sections: [
			{
				title: "Price profile weights",
				rows: [
					priceProfileRow("Task", "task"),
					priceProfileRow("Chat", "chat"),
					priceProfileRow("Agentic", "agentic"),
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
		body: "Cost for one Artificial Analysis Intelligence attempt.",
		rows: [["Formula", "total cost / attempts"]],
	},
	aaSeconds: {
		title: "AA seconds per task",
		body: "Estimated time for one Artificial Analysis Intelligence attempt.",
		rows: [["Formula", "latency + tokens / throughput"]],
	},
	aaTokens: {
		title: "AA output tokens per task",
		body: "Output tokens for one Artificial Analysis Intelligence attempt.",
		rows: [["Formula", "output tokens / attempts"]],
	},
	deepSWECost: {
		title: "DeepSWE cost per task",
		body: "Mean DeepSWE task cost.",
	},
	deepSWESeconds: {
		title: "DeepSWE seconds per task",
		body: "Mean DeepSWE task duration.",
	},
	deepSWETokens: {
		title: "DeepSWE output tokens per task",
		body: "Mean DeepSWE output tokens.",
	},
} as const satisfies ModelStatsColumnTooltips;

/** Centralized stage config for matching, enrichment, pruning, and scoring. */
export const MODEL_ATLAS_STAGE_CONFIG = {
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
		intelligenceBenchmarkKeys: MODEL_ATLAS_INTELLIGENCE_BENCHMARK_KEYS,
		agenticBenchmarkKeys: MODEL_ATLAS_AGENTIC_BENCHMARK_KEYS,
		defaultSpeedOutputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
		speedOutputTokenRangeMin: 200,
		speedOutputTokenRangeMax: 8_000,
		speedAnchorQuantiles: [0.25, 0.5, 0.75],
		priceProfiles: MODEL_ATLAS_PRICE_PROFILES,
		simulationProfiles: MODEL_ATLAS_SIMULATION_PROFILES,
		simulationInputTokenSeconds: MODEL_ATLAS_SIMULATION_INPUT_TOKEN_SECONDS,
		benchmarkScoreWeights: MODEL_ATLAS_BENCHMARK_SCORE_WEIGHTS,
		qualityScoreWeights: MODEL_ATLAS_QUALITY_SCORE_WEIGHTS,
		overallRelativeScoreWeights: MODEL_ATLAS_OVERALL_RELATIVE_SCORE_WEIGHTS,
		columnTooltips: MODEL_ATLAS_COLUMN_TOOLTIPS,
	},
} satisfies ModelAtlasStageConfig;
