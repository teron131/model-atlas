import { STAGE_CONFIG } from "../src/model-atlas/constants";
import {
	meanOfFiniteWithMinimum,
	medianOfFinite,
	quantileFromSorted,
} from "../src/model-atlas/math-utils";
import { buildCurrentLlmStatsMetadata } from "../src/model-atlas/stats/metadata";
import {
	attachRelativeScores,
	blendedPriceValue,
	buildBenchmarkImputationByModel,
	buildQualityScoringContext,
	buildScores,
	simulatedBlendSeconds,
} from "../src/model-atlas/stats/scores";
import type { LlmStatsModelCandidate } from "../src/model-atlas/stats/types";

function assertEqual(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`Expected ${expected}, got ${actual}`);
	}
}

function assertClose(
	actual: unknown,
	expected: number,
	epsilon = 0.0001,
): void {
	if (typeof actual !== "number" || Math.abs(actual - expected) > epsilon) {
		throw new Error(`Expected ${expected}, got ${actual}`);
	}
}

assertEqual(
	blendedPriceValue(
		{
			input: 5,
			output: 25,
			cache_read: 0.5,
			cache_write: 6.25,
			weighted_input: 1.5,
			weighted_output: 25,
		},
		STAGE_CONFIG.scoring,
	),
	13.1325,
);

assertEqual(
	blendedPriceValue(
		{
			input: 2.5,
			output: 7.5,
			cache_read: 0.5,
			cache_write: 3.125,
			weighted_input: 0,
			weighted_output: 0,
		},
		STAGE_CONFIG.scoring,
	),
	4.975,
);

assertClose(
	simulatedBlendSeconds(
		{
			throughput_tokens_per_second_median: 100,
			latency_seconds_median: 1,
			e2e_latency_seconds_median: 3,
		},
		STAGE_CONFIG.scoring,
	),
	55.9474,
);

const sparseQuantileValues = [0, 50, 100];
assertEqual(quantileFromSorted(sparseQuantileValues, 0), 0);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.05), 5);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.5), 50);
assertEqual(quantileFromSorted(sparseQuantileValues, 0.95), 95);
assertEqual(quantileFromSorted(sparseQuantileValues, 1), 100);
assertEqual(medianOfFinite([100, null, 0, 50]), 50);
assertEqual(meanOfFiniteWithMinimum([100, null, null], 2), null);
assertEqual(meanOfFiniteWithMinimum([100, 50, null], 2), 75);
assertEqual(
	STAGE_CONFIG.scoring.columnTooltips.value?.rows?.[1]?.[1],
	"equal slots: blended price, quality per price, workflow price value, and each benchmark cost (7.7% each)",
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.value).includes(
		"Blended price, lower is cheaper",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.value).includes(
		"cost, lower is cheaper",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"Throughput, higher is faster",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"Latency, lower is faster",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"Runtime inputs are inverted",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes("runtime"),
	true,
);

const aaOnlyResourceMetadata = buildCurrentLlmStatsMetadata({
	models: [
		{
			evaluations: { hle: 90 },
		},
	],
	resourceModels: [
		{
			evaluations: { hle: 90 },
			task_metrics: {
				artificial_analysis: { cost: 0.1, seconds: 10 },
			},
		},
	],
	benchmarkUpdateHealth: {},
	scoringConfig: {
		...STAGE_CONFIG.scoring,
		frontierBenchmarkKeys: ["hle", "deep_swe"],
	},
});
const aaOnlyTimeTooltip = JSON.stringify(
	aaOnlyResourceMetadata.scoring.column_tooltips.speed,
);
const aaOnlyValueTooltip = JSON.stringify(
	aaOnlyResourceMetadata.scoring.column_tooltips.value,
);
assertEqual(aaOnlyTimeTooltip.includes("33.3% each"), true);
assertEqual(aaOnlyTimeTooltip.includes("Frontier benchmark runtime"), false);
assertEqual(aaOnlyValueTooltip.includes("25.0% each"), true);
assertEqual(aaOnlyValueTooltip.includes("Frontier benchmark cost"), false);

const mixedResourceMetadata = buildCurrentLlmStatsMetadata({
	models: [
		{
			evaluations: { hle: 90, deep_swe: 80 },
		},
	],
	resourceModels: [
		{
			evaluations: { hle: 90, deep_swe: 80 },
			task_metrics: {
				artificial_analysis: { cost: 0.1, seconds: 10 },
				deep_swe: { cost: 0.2, seconds: 20 },
			},
		},
	],
	benchmarkUpdateHealth: {},
	scoringConfig: {
		...STAGE_CONFIG.scoring,
		frontierBenchmarkKeys: ["hle", "deep_swe"],
	},
});
assertEqual(
	JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.speed).includes(
		"25.0% each",
	),
	true,
);
assertEqual(
	JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.value).includes(
		"20.0% each",
	),
	true,
);

const tokenProxyResourceMetadata = buildCurrentLlmStatsMetadata({
	models: [
		{
			evaluations: { deep_swe: 80 },
		},
	],
	resourceModels: [
		{
			evaluations: { deep_swe: 80 },
			speed: { throughput_tokens_per_second_median: 50 },
			task_metrics: {
				deep_swe: { cost: 0.2, output_tokens: 1_000 },
			},
		},
	],
	benchmarkUpdateHealth: {},
	scoringConfig: {
		...STAGE_CONFIG.scoring,
		frontierBenchmarkKeys: ["deep_swe"],
	},
});
assertEqual(
	JSON.stringify(
		tokenProxyResourceMetadata.scoring.column_tooltips.speed,
	).includes("DeepSWE runtime"),
	true,
);

const broadAAResourceOnlyModels = attachRelativeScores(
	[
		{
			...modelCandidate({
				id: "test/broad-aa-a",
				gdpvalScore: 90,
				artificialAnalysisCost: 0.1,
				artificialAnalysisSeconds: 1,
				tps: 100,
				latency: 1,
				disableBaseCost: true,
			}),
			evaluations: { gdpval_normalized: 90, hle: 90 },
		},
		{
			...modelCandidate({
				id: "test/broad-aa-b",
				gdpvalScore: 10,
				artificialAnalysisCost: 10,
				artificialAnalysisSeconds: 100,
				tps: 50,
				latency: 2,
				disableBaseCost: true,
			}),
			evaluations: { gdpval_normalized: 10, hle: 10 },
		},
	],
	STAGE_CONFIG.scoring,
);
assertClose(broadAAResourceOnlyModels[0]?.relative_scores.value_score, 64.8);
assertClose(broadAAResourceOnlyModels[1]?.relative_scores.value_score, 64.8);

const tokenProxySpeedModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/token-proxy-fast",
			deepSWEScore: 90,
			deepSWECost: 1,
			deepSWEOutputTokens: 1_000,
			tps: 100,
			latency: 1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/token-proxy-slow",
			deepSWEScore: 80,
			deepSWECost: 1,
			deepSWEOutputTokens: 1_000,
			tps: 10,
			latency: 1,
			disableBaseCost: true,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertClose(tokenProxySpeedModels[0]?.relative_scores.speed_score, 100);
assertClose(tokenProxySpeedModels[1]?.relative_scores.speed_score, 74.9993);

const latencySpeedModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/low-latency",
			tps: 100,
			latency: 1,
		}),
		modelCandidate({
			id: "test/high-latency",
			tps: 100,
			latency: 10,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertClose(latencySpeedModels[0]?.relative_scores.speed_score, 100);
assertClose(latencySpeedModels[1]?.relative_scores.speed_score, 62.5);

const groupPolicyConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["omniscience_accuracy", "hle"],
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: {
		omniscience_accuracy: {
			group: "baseline",
			intelligencePortion: 1,
			agenticPortion: 0,
		},
		hle: {
			group: "frontier",
			intelligencePortion: 1,
			agenticPortion: 0,
		},
	},
	frontierBenchmarkKeys: [],
} as const;
const groupPolicyModels = [
	{
		id: "group-min",
		intelligence: { intelligence_index: 0 },
		evaluations: { omniscience_accuracy: 0, hle: 0 },
	},
	{
		id: "group-max",
		intelligence: { intelligence_index: 100 },
		evaluations: { omniscience_accuracy: 100, hle: 100 },
	},
	{
		id: "group-target",
		intelligence: { intelligence_index: 100 },
		evaluations: { omniscience_accuracy: 0, hle: 100 },
	},
];
const groupPolicyScores = buildScores(
	groupPolicyModels[2] ?? {},
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	groupPolicyConfig,
	buildQualityScoringContext(groupPolicyModels, groupPolicyConfig, new Map()),
);
assertClose(groupPolicyScores?.intelligence_score, 70);

const directResourceScoredModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/frontier-efficient",
			deepSWEScore: 90,
			deepSWECost: 0.1,
			deepSWESeconds: 90,
			tps: 100,
			latency: 1,
		}),
		modelCandidate({
			id: "test/frontier-middle",
			deepSWEScore: 50,
			deepSWECost: 0.5,
			deepSWESeconds: 50,
			tps: 100,
			latency: 1,
		}),
		modelCandidate({
			id: "test/frontier-fast",
			deepSWEScore: 10,
			deepSWECost: 0.9,
			deepSWESeconds: 10,
			tps: 100,
			latency: 1,
		}),
	],
	{
		...STAGE_CONFIG.scoring,
		frontierBenchmarkKeys: ["deep_swe"],
	},
);
assertClose(directResourceScoredModels[0]?.relative_scores.value_score, 89.6);
assertClose(
	directResourceScoredModels[1]?.relative_scores.value_score,
	88.4821,
);
assertClose(
	directResourceScoredModels[2]?.relative_scores.value_score,
	88.4535,
);
assertClose(directResourceScoredModels[0]?.relative_scores.speed_score, 99.147);
assertClose(
	directResourceScoredModels[1]?.relative_scores.speed_score,
	99.1683,
);
assertClose(directResourceScoredModels[2]?.relative_scores.speed_score, 100);

const valueScoredModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/cost-efficiency-cheap",
			deepSWEScore: 50,
			deepSWECost: 0.1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/cost-efficiency-middle",
			deepSWEScore: 50,
			deepSWECost: 0.5,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/cost-efficiency-expensive",
			deepSWEScore: 50,
			deepSWECost: 0.9,
			disableBaseCost: true,
		}),
	],
	{
		...STAGE_CONFIG.scoring,
		frontierBenchmarkKeys: ["deep_swe"],
	},
);
assertClose(valueScoredModels[0]?.relative_scores.value_score, 21.6);
assertClose(valueScoredModels[1]?.relative_scores.value_score, 14.4);
assertClose(valueScoredModels[2]?.relative_scores.value_score, 7.2);

const scaleNormalizedResourceConfig = {
	...STAGE_CONFIG.scoring,
	frontierBenchmarkKeys: ["cheap_frontier", "expensive_frontier"],
	benchmarkPortfolio: {
		cheap_frontier: {
			group: "frontier",
			intelligencePortion: 0,
			agenticPortion: 1,
			resourcePolicy: {
				source: "benchmark",
				unit: "per_task",
				tokenMeasure: "tokens",
			},
		},
		expensive_frontier: {
			group: "frontier",
			intelligencePortion: 0,
			agenticPortion: 1,
			resourcePolicy: {
				source: "benchmark",
				unit: "per_task",
				tokenMeasure: "tokens",
			},
		},
	},
} as const;
const scaleNormalizedResourceModels = attachRelativeScores(
	[
		{
			...modelCandidate({
				id: "test/cheap-scale-winner",
				disableBaseCost: true,
			}),
			evaluations: { cheap_frontier: 1, expensive_frontier: 0.5 },
			task_metrics: {
				cheap_frontier: { cost: 1 },
				expensive_frontier: { cost: 2000 },
			},
		},
		{
			...modelCandidate({
				id: "test/expensive-scale-winner",
				disableBaseCost: true,
			}),
			evaluations: { cheap_frontier: 0.5, expensive_frontier: 1 },
			task_metrics: {
				cheap_frontier: { cost: 2 },
				expensive_frontier: { cost: 1000 },
			},
		},
	],
	scaleNormalizedResourceConfig,
);
assertClose(
	scaleNormalizedResourceModels[0]?.relative_scores.value_score,
	64.8,
);
assertClose(
	scaleNormalizedResourceModels[1]?.relative_scores.value_score,
	64.8,
);

const sparseResourceCoverageModels = attachRelativeScores(
	[
		{
			...modelCandidate({
				id: "test/full-resource-coverage",
				tps: 100,
				latency: 1,
				disableBaseCost: true,
			}),
			evaluations: {
				gdpval_normalized: 50,
				hle: 50,
				deep_swe: 50,
			},
			task_metrics: {
				gdpval_normalized: { seconds: 10, cost: 1 },
				hle: { seconds: 10, cost: 1 },
				deep_swe: { seconds: 10, cost: 1 },
			},
		},
		{
			...modelCandidate({
				id: "test/sparse-resource-sprinter",
				tps: 100,
				latency: 1,
				disableBaseCost: true,
			}),
			evaluations: {
				gdpval_normalized: 100,
			},
			task_metrics: {
				gdpval_normalized: { seconds: 1, cost: 0.01 },
			},
		},
	],
	STAGE_CONFIG.scoring,
);
assertClose(sparseResourceCoverageModels[0]?.relative_scores.value_score, 89.6);
assertClose(
	sparseResourceCoverageModels[1]?.relative_scores.value_score,
	4.8593,
);

const normalizedContextModels = [
	imputationModel("observed-a", 0, 0, 0, 0),
	imputationModel("observed-b", 10, 33, 333, 0.33),
	imputationModel("observed-c", 20, 66, 666, 0.66),
	imputationModel("observed-d", 30, 100, 1_000, 1),
	imputationModel("missing", null, 0, 1_000, 0),
];
const normalizedContextConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["target", "wide", "narrow"],
	agenticBenchmarkKeys: [],
	frontierBenchmarkKeys: [],
};
const normalizedContextImputations = buildBenchmarkImputationByModel(
	normalizedContextModels,
	normalizedContextConfig,
);
assertClose(
	normalizedContextImputations
		.get(normalizedContextModels.at(-1) ?? {})
		?.get("target"),
	7.5,
);

const frontierPercentileConfig = {
	...normalizedContextConfig,
	intelligenceBenchmarkKeys: ["gdpval_normalized", "hle", "agents_last_exam"],
	frontierBenchmarkKeys: ["gdpval_normalized", "hle", "agents_last_exam"],
};
const frontierPercentileModels = [
	{
		id: "observed-frontier-a",
		evaluations: { gdpval_normalized: 0, hle: 0, agents_last_exam: 0.2 },
	},
	{
		id: "observed-frontier-b",
		evaluations: { gdpval_normalized: 50, hle: 50, agents_last_exam: 0.5 },
	},
	{
		id: "observed-frontier-c",
		evaluations: { gdpval_normalized: 100, hle: 100, agents_last_exam: 0.8 },
	},
	{
		id: "missing-frontier",
		evaluations: { gdpval_normalized: 100, hle: 100 },
	},
];
const frontierPercentileImputations = buildBenchmarkImputationByModel(
	frontierPercentileModels,
	frontierPercentileConfig,
);
assertClose(
	frontierPercentileImputations
		.get(frontierPercentileModels.at(-1) ?? {})
		?.get("agents_last_exam"),
	0.8,
);

function modelCandidate(options: {
	id: string;
	intelligenceScore?: number | null;
	agenticScore?: number | null;
	blendPrice?: number | null;
	artificialAnalysisCost?: number | null;
	artificialAnalysisSeconds?: number | null;
	deepSWEScore?: number | null;
	deepSWECost?: number | null;
	deepSWESeconds?: number | null;
	deepSWEOutputTokens?: number | null;
	tps?: number | null;
	latency?: number | null;
	gdpvalScore?: number | null;
	gdpvalCost?: number | null;
	gdpvalSeconds?: number | null;
	disableBaseCost?: boolean;
}): LlmStatsModelCandidate {
	const gdpvalTask =
		options.gdpvalCost == null && options.gdpvalSeconds == null
			? null
			: {
					cost: options.gdpvalCost ?? null,
					seconds: options.gdpvalSeconds ?? null,
				};
	const evaluations = {
		...(options.gdpvalScore == null
			? {}
			: { gdpval_normalized: options.gdpvalScore }),
		...(options.deepSWEScore == null ? {} : { deep_swe: options.deepSWEScore }),
	};
	return {
		id: options.id,
		name: options.id,
		provider: "test",
		logo: "",
		attachment: null,
		reasoning: null,
		release_date: null,
		modalities: null,
		open_weights: null,
		cost: options.disableBaseCost
			? null
			: {
					input: 1,
					output: 1,
					blended_price: options.blendPrice ?? null,
				},
		context_window: null,
		speed: {
			throughput_tokens_per_second_median: options.tps ?? null,
			latency_seconds_median: options.latency ?? null,
			e2e_latency_seconds_median: null,
		},
		intelligence: null,
		intelligence_index_cost: null,
		task_metrics: {
			artificial_analysis: {
				cost: options.artificialAnalysisCost,
				seconds: options.artificialAnalysisSeconds,
			},
			deep_swe: {
				cost: options.deepSWECost,
				seconds: options.deepSWESeconds,
				output_tokens: options.deepSWEOutputTokens,
			},
			...(gdpvalTask == null ? {} : { gdpval_normalized: gdpvalTask }),
		},
		evaluations: Object.keys(evaluations).length === 0 ? null : evaluations,
		scores: {
			intelligence_score: options.intelligenceScore ?? null,
			agentic_score: options.agenticScore ?? null,
			speed_score: null,
		},
		relative_scores: null,
	};
}

function imputationModel(
	id: string,
	target: number | null,
	intelligenceIndex: number,
	wide: number,
	narrow: number,
) {
	return {
		id,
		intelligence: {
			intelligence_index: intelligenceIndex,
			wide,
			narrow,
			...(target == null ? {} : { target }),
		},
		evaluations: null,
	};
}
