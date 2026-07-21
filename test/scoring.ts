/** Exercises component scoring, benchmark imputation, anchors, and scoring configuration invariants. */

import {
	STAGE_CONFIG,
	validateBenchmarkPortfolio,
} from "../src/model-atlas/constants";
import {
	effectiveSampleSize,
	logInputMinMaxScores,
	logitPercentageScore,
	meanOfFiniteWithMinimum,
	medianOfFinite,
	minMaxScores,
	percentileRank,
	quantileFromSorted,
	weightedPercentileRank,
	weightedQuantile,
	weightedQuantileRank,
	winsorizedMinMaxScores,
} from "../src/model-atlas/math-utils";
import { buildCurrentLlmStatsMetadata } from "../src/model-atlas/stats/metadata";
import { benchmarkMetricValue } from "../src/model-atlas/stats/resource-metrics";
import {
	attachFinalScores,
	blendedPriceValue,
	buildBenchmarkImputationByModel,
	buildBenchmarkImputationDiagnosticsByKey,
	buildComponentScores,
	buildQualityScoringContext,
	simulatedBlendSeconds,
} from "../src/model-atlas/stats/scores";
import {
	normalizedMetricValue,
	prepareBenchmarkScoring,
} from "../src/model-atlas/stats/scores/benchmark-imputation";
import { benchmarkResourceEfficiencyScores } from "../src/model-atlas/stats/scores/final-scoring";
import type {
	BenchmarkPortfolio,
	LlmStatsModelCandidate,
} from "../src/model-atlas/stats/types";

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

function assertThrowsWithMessage(
	action: () => void,
	expectedMessage: string,
): void {
	try {
		action();
	} catch (error) {
		assertEqual((error as Error).message, expectedMessage);
		return;
	}
	throw new Error(`Expected error: ${expectedMessage}`);
}

const rawAgentBenchmarkValues = new Map([
	["agent_arena", [-0.15305257102824063, 0, 0.1394124051275084]],
	["vending_bench_2", [-31.18399999999995, 9_000, 10_936.763333333334]],
]);
assertClose(
	normalizedMetricValue(rawAgentBenchmarkValues, "agent_arena", 0),
	52.3319,
);
assertClose(
	normalizedMetricValue(rawAgentBenchmarkValues, "vending_bench_2", 9_000),
	82.3416,
);

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
const weightedCalibrationValues = [
	{ value: 0, weight: 1 },
	{ value: 50, weight: 1 },
	{ value: 100, weight: 1 },
];
const splitWeightedCalibrationValues = [
	{ value: 0, weight: 1 },
	{ value: 50, weight: 0.5 },
	{ value: 50, weight: 0.5 },
	{ value: 100, weight: 1 },
];
assertClose(
	weightedQuantile(splitWeightedCalibrationValues, 0.75),
	weightedQuantile(weightedCalibrationValues, 0.75) ?? 0,
);
assertClose(
	weightedPercentileRank(splitWeightedCalibrationValues, 50),
	weightedPercentileRank(weightedCalibrationValues, 50) ?? 0,
);
assertClose(weightedQuantileRank(weightedCalibrationValues, 50), 50);
assertClose(
	weightedQuantile(
		weightedCalibrationValues,
		(weightedQuantileRank(weightedCalibrationValues, 50) ?? 0) / 100,
	),
	50,
);
assertClose(effectiveSampleSize([1, 1, 1]), 3);
assertClose(effectiveSampleSize([0.5, 0.5]), 2);
assertEqual(logitPercentageScore(1.01) > logitPercentageScore(1), true);
const winsorizedScores = winsorizedMinMaxScores(
	[1, 2, 3, 10],
	[1, 2, 3, 10].map((value) => ({ value, weight: 1 })),
	"lower",
	0.25,
);
assertClose(winsorizedScores[0], 100);
assertClose(winsorizedScores[3], 0);
assertEqual((winsorizedScores[1] ?? 0) > (winsorizedScores[2] ?? 0), true);
assertEqual(medianOfFinite([100, null, 0, 50]), 50);
assertEqual(meanOfFiniteWithMinimum([100, null, null], 2), null);
assertEqual(meanOfFiniteWithMinimum([100, 50, null], 2), 75);
assertEqual(
	STAGE_CONFIG.scoring.columnTooltips.value?.rows?.some(
		([label]) => label === "Blend",
	),
	false,
);
assertEqual(
	STAGE_CONFIG.scoring.columnTooltips.speed?.rows?.some(
		([label]) => label === "Blend",
	),
	false,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.value).includes(
		"Log blended price ↓",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.value).includes(
		"Quality-adjusted log blended price ↓",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.value).includes("cost ↓"),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"Throughput",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.intelligence).includes(
		"observed min-max range to 0-100",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.intelligence).includes(
		"weighted mean x evidence confidence",
	),
	true,
);
assertEqual(
	STAGE_CONFIG.scoring.columnTooltips.agentsLastExamCost?.body,
	"Estimated cost per Full Overall task, using the lower of median and mean per-task cost.",
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips).includes(
		"per Full Overall run",
	),
	false,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.intelligence).includes(
		"frontier subtracts 1.0x error; baseline subtracts 0.5x error",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"log input, then min-max",
	),
	true,
);

validateBenchmarkPortfolio(STAGE_CONFIG.scoring.benchmarkPortfolio);
assertEqual(
	JSON.stringify(STAGE_CONFIG.final.benchmarkAdmission.indexBenchmarkKeys),
	JSON.stringify([
		"aa_intelligence_index",
		"epoch_capabilities_index",
		"vals_index",
	]),
);
for (const key of [
	"aa_intelligence_index",
	"epoch_capabilities_index",
	"vals_index",
] as const) {
	assertEqual(
		STAGE_CONFIG.scoring.benchmarkPortfolio[key].benchmarkImportance,
		0.5,
	);
}
assertEqual(
	benchmarkMetricValue(
		{ intelligence: { intelligence_index: 73.5 } },
		"aa_intelligence_index",
	),
	73.5,
);
assertEqual(
	STAGE_CONFIG.scoring.benchmarkPortfolio.itbench_sre?.group,
	"frontier",
);
assertEqual(
	STAGE_CONFIG.scoring.benchmarkPortfolio.itbench_sre?.benchmarkImportance,
	1,
);
assertEqual(
	STAGE_CONFIG.scoring.benchmarkPortfolio.itbench_sre?.dimensionLoadings
		.agentic,
	1,
);
assertEqual(
	STAGE_CONFIG.scoring.benchmarkPortfolio.itbench_sre?.dimensionLoadings
		.intelligence,
	0,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.agentic).includes(
		'["ITBench","5.3%"]',
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.agentic).includes(
		'["Agent Arena","5.3%"]',
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.agentic).includes(
		'["Vending-Bench 2","5.3%"]',
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.agentic).includes(
		'["ALE-Bench","3.2%"]',
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.agentic).includes(
		'["FrontierCode","5.3%"]',
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.intelligence).includes(
		'["ALE-Bench","2.7%"]',
	),
	true,
);
assertThrowsWithMessage(
	() =>
		validateBenchmarkPortfolio({
			test: {
				group: "frontier",
				benchmarkImportance: 0,
				dimensionLoadings: { intelligence: 1, agentic: 0 },
			},
		}),
	"Benchmark importance must be finite and positive for test",
);
assertThrowsWithMessage(
	() =>
		validateBenchmarkPortfolio({
			test: {
				group: "frontier",
				benchmarkImportance: 1,
				dimensionLoadings: { intelligence: 0.8, agentic: 0.3 },
			},
		}),
	"Dimension loadings must be finite, non-negative, and sum to one for test",
);
assertThrowsWithMessage(
	() =>
		validateBenchmarkPortfolio({
			test: {
				group: "invalid",
				benchmarkImportance: 1,
				dimensionLoadings: { intelligence: 1, agentic: 0 },
			},
		} as unknown as BenchmarkPortfolio),
	"Invalid benchmark group for test: invalid",
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"Latency ↓",
	),
	true,
);
assertEqual(
	JSON.stringify(STAGE_CONFIG.scoring.columnTooltips.speed).includes(
		"model-excluded expectation",
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
	scoringConfig: STAGE_CONFIG.scoring,
});
const aaOnlyTimeTooltip = JSON.stringify(
	aaOnlyResourceMetadata.scoring.column_tooltips.speed,
);
const aaOnlyValueTooltip = JSON.stringify(
	aaOnlyResourceMetadata.scoring.column_tooltips.value,
);
assertEqual(aaOnlyTimeTooltip.includes("33.3% each"), false);
assertEqual(aaOnlyTimeTooltip.includes("Frontier benchmark runtime"), false);
assertEqual(aaOnlyValueTooltip.includes("25.0% each"), false);
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
	scoringConfig: STAGE_CONFIG.scoring,
});
assertEqual(
	JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.speed).includes(
		"25.0% each",
	),
	false,
);
assertEqual(
	JSON.stringify(mixedResourceMetadata.scoring.column_tooltips.value).includes(
		"20.0% each",
	),
	false,
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
	scoringConfig: STAGE_CONFIG.scoring,
});
assertEqual(
	JSON.stringify(
		tokenProxyResourceMetadata.scoring.column_tooltips.speed,
	).includes("DeepSWE runtime"),
	true,
);

const broadAAResourceOnlyModels = attachFinalScores(
	[
		{
			...modelCandidate({
				id: "test/broad-aa-a",
				gdpvalScore: 90,
				artificialAnalysisCost: 0.1,
				artificialAnalysisSeconds: 1,
				throughputTokensPerSecond: 100,
				latencySeconds: 1,
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
				throughputTokensPerSecond: 50,
				latencySeconds: 2,
				disableBaseCost: true,
			}),
			evaluations: { gdpval_normalized: 10, hle: 10 },
		},
	],
	STAGE_CONFIG.scoring,
);
assertClose(broadAAResourceOnlyModels[0]?.scores.value_score, 32.4);
assertClose(broadAAResourceOnlyModels[1]?.scores.value_score, 32.4);

const tokenProxySpeedModels = attachFinalScores(
	[
		modelCandidate({
			id: "test/token-proxy-fast",
			deepSWEScore: 90,
			deepSWECost: 1,
			deepSWEOutputTokens: 1_000,
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/token-proxy-slow",
			deepSWEScore: 80,
			deepSWECost: 1,
			deepSWEOutputTokens: 1_000,
			throughputTokensPerSecond: 10,
			latencySeconds: 1,
			disableBaseCost: true,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertClose(tokenProxySpeedModels[0]?.scores.speed_score, 83.3333);
assertClose(tokenProxySpeedModels[1]?.scores.speed_score, 33.3333);

const latencySpeedModels = attachFinalScores(
	[
		modelCandidate({
			id: "test/low-latency",
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
		}),
		modelCandidate({
			id: "test/high-latency",
			throughputTokensPerSecond: 100,
			latencySeconds: 10,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertClose(latencySpeedModels[0]?.scores.speed_score, 100);
assertClose(latencySpeedModels[1]?.scores.speed_score, 25);

const gapExampleValues = [1, 2, 3, 50, 60, 70, 95, 99];
const minMaxGapScores = minMaxScores(gapExampleValues, "higher");
const percentileGapScores = gapExampleValues.map((value) =>
	percentileRank(gapExampleValues, value),
);
assertClose(minMaxGapScores[3], 50);
assertClose(minMaxGapScores[4], 60.2040816327);
assertClose(
	((minMaxGapScores[3] ?? 0) - (minMaxGapScores[2] ?? 0)) /
		((minMaxGapScores[4] ?? 0) - (minMaxGapScores[3] ?? 0)),
	4.7,
);
assertClose(
	((percentileGapScores[3] ?? 0) - (percentileGapScores[2] ?? 0)) /
		((percentileGapScores[4] ?? 0) - (percentileGapScores[3] ?? 0)),
	1,
);
assertClose(logInputMinMaxScores([1, 10, 100], "higher")[1], 50);
assertClose(logInputMinMaxScores([1, 10, 100], "lower")[1], 50);

// Provider speed inputs are logged before outer min-max normalization.
const absoluteGapSpeedModels = attachFinalScores(
	[10, 20, 100].map((throughputTokensPerSecond) =>
		modelCandidate({
			id: `test/absolute-gap-speed-${throughputTokensPerSecond}`,
			throughputTokensPerSecond,
			latencySeconds: 1,
			disableBaseCost: true,
		}),
	),
	STAGE_CONFIG.scoring,
);
assertClose(absoluteGapSpeedModels[1]?.scores.speed_score, 48.1885);

// Price inputs are logged once; conditional and workflow-derived signals are not logged again.
const absoluteGapValueModels = attachFinalScores(
	[1, 10, 100].map((blendedPrice) =>
		modelCandidate({
			id: `test/absolute-gap-value-${blendedPrice}`,
			intelligenceScore: 50,
			agenticScore: 50,
			blendedPrice,
		}),
	),
	STAGE_CONFIG.scoring,
);
assertClose(absoluteGapValueModels[1]?.scores.value_score, 54.6345);

const fractionalBenchmarkConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["omniscience_accuracy", "hle"],
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: {
		omniscience_accuracy: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.8, agentic: 0.2 },
		},
		hle: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
		},
	},
} as const;
const fractionalBenchmarkModels = [
	{
		id: "fractional-min",
		evaluations: { omniscience_accuracy: 0, hle: 0 },
	},
	{
		id: "fractional-max",
		evaluations: { omniscience_accuracy: 100, hle: 100 },
	},
	{
		id: "fractional-target",
		evaluations: { omniscience_accuracy: 0, hle: 100 },
	},
];
const fractionalBenchmarkComponentScores = buildComponentScores(
	fractionalBenchmarkModels[2] ?? {},
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	fractionalBenchmarkConfig,
	buildQualityScoringContext(
		fractionalBenchmarkModels,
		fractionalBenchmarkConfig,
	),
);
assertClose(fractionalBenchmarkComponentScores?.intelligence_score, 20);

const importanceWeightedConfig = {
	...fractionalBenchmarkConfig,
	benchmarkPortfolio: {
		omniscience_accuracy: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
		},
		hle: {
			group: "frontier",
			benchmarkImportance: 3,
			dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
		},
	},
} as const;
const importanceWeightedContext = buildQualityScoringContext(
	fractionalBenchmarkModels,
	importanceWeightedConfig,
);
const importanceWeightedScores = buildComponentScores(
	fractionalBenchmarkModels[2] ?? {},
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	importanceWeightedConfig,
	importanceWeightedContext,
);
assertClose(importanceWeightedScores?.intelligence_score, 75);

const groupFlippedScores = buildComponentScores(
	fractionalBenchmarkModels[2] ?? {},
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	{
		...importanceWeightedConfig,
		benchmarkPortfolio: {
			omniscience_accuracy: {
				...importanceWeightedConfig.benchmarkPortfolio.omniscience_accuracy,
				group: "frontier",
			},
			hle: {
				...importanceWeightedConfig.benchmarkPortfolio.hle,
				group: "baseline",
			},
		},
	},
	importanceWeightedContext,
);
assertClose(groupFlippedScores?.intelligence_score, 75);

const fractionalCoverageComponentScores = buildComponentScores(
	{ id: "fractional-sparse", evaluations: { hle: 100 } },
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	fractionalBenchmarkConfig,
	buildQualityScoringContext(
		fractionalBenchmarkModels,
		fractionalBenchmarkConfig,
	),
);
assertClose(fractionalCoverageComponentScores?.intelligence_score, 10.4);

const sparseBenchmarkKeys = Array.from(
	{ length: 12 },
	(_, index) => `quality_${index}`,
);
const sparseCoverageBenchmarkPortfolio = Object.fromEntries(
	sparseBenchmarkKeys.map((key) => [
		key,
		{
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 1, agentic: 0 },
		},
	]),
) as Record<
	string,
	{
		group: "frontier";
		benchmarkImportance: 1;
		dimensionLoadings: { intelligence: 1; agentic: 0 };
	}
>;
const sparseCoverageConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: sparseBenchmarkKeys,
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: sparseCoverageBenchmarkPortfolio,
} as const;
const sparseCoverageModels = [
	{
		id: "sparse-min",
		evaluations: Object.fromEntries(sparseBenchmarkKeys.map((key) => [key, 0])),
	},
	{
		id: "sparse-max",
		evaluations: Object.fromEntries(
			sparseBenchmarkKeys.map((key) => [key, 100]),
		),
	},
	{
		id: "sparse-target",
		evaluations: { quality_0: 100 },
	},
];
const sparseCoverageComponentScores = buildComponentScores(
	sparseCoverageModels[2] ?? {},
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	sparseCoverageConfig,
	buildQualityScoringContext(sparseCoverageModels, sparseCoverageConfig),
);
assertClose(sparseCoverageComponentScores?.intelligence_score, 0);

const directResourceScoredModels = attachFinalScores(
	[
		modelCandidate({
			id: "test/frontier-efficient",
			deepSWEScore: 90,
			deepSWECost: 0.1,
			deepSWESeconds: 90,
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
		}),
		modelCandidate({
			id: "test/frontier-middle",
			deepSWEScore: 50,
			deepSWECost: 0.5,
			deepSWESeconds: 50,
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
		}),
		modelCandidate({
			id: "test/frontier-fast",
			deepSWEScore: 10,
			deepSWECost: 0.9,
			deepSWESeconds: 10,
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertClose(directResourceScoredModels[0]?.scores.value_score, 67.2);
assertClose(directResourceScoredModels[1]?.scores.value_score, 67.2);
assertClose(directResourceScoredModels[2]?.scores.value_score, 67.2);
assertClose(directResourceScoredModels[0]?.scores.speed_score, 83.3333);
assertClose(directResourceScoredModels[1]?.scores.speed_score, 83.3333);
assertClose(directResourceScoredModels[2]?.scores.speed_score, 83.3333);

const isolatedQualityResourceModels = attachFinalScores(
	[
		modelCandidate({
			id: "test/ordinary-quality-a",
			deepSWEScore: 10,
			deepSWECost: 1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/ordinary-quality-b",
			deepSWEScore: 20,
			deepSWECost: 1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/ordinary-quality-c",
			deepSWEScore: 30,
			deepSWECost: 1,
			disableBaseCost: true,
		}),
		modelCandidate({
			id: "test/isolated-expensive-frontier",
			deepSWEScore: 99,
			deepSWECost: 1_000,
			disableBaseCost: true,
		}),
	],
	STAGE_CONFIG.scoring,
);
assertEqual(
	(isolatedQualityResourceModels.at(-1)?.scores.value_score ?? 100) < 20,
	true,
);

const flatResidualScores = benchmarkResourceEfficiencyScores(
	[
		{ id: "test/flat-resource-a" },
		{ id: "test/flat-resource-b" },
		{ id: "test/flat-resource-c" },
		{ id: "test/flat-resource-d" },
	],
	[50, 50, 50, 50],
	[1, 1, 1, 1],
);
for (const score of flatResidualScores) {
	assertClose(score, 50);
}
const orderedHybridResourceScores = benchmarkResourceEfficiencyScores(
	[
		{ id: "test/ordered-resource-a" },
		{ id: "test/ordered-resource-b" },
		{ id: "test/ordered-resource-c" },
		{ id: "test/ordered-resource-d" },
	],
	[50, 50, 50, 50],
	[1, 2, 3, 4],
);
assertClose(orderedHybridResourceScores[0], 100);
assertClose(orderedHybridResourceScores[3], 12.5);

const valueScoredModels = attachFinalScores(
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
	STAGE_CONFIG.scoring,
);
assertClose(valueScoredModels[0]?.scores.value_score, 16.2);
assertClose(valueScoredModels[1]?.scores.value_score, 10.4995);
assertClose(valueScoredModels[2]?.scores.value_score, 7.2);

const scaleNormalizedResourceConfig = {
	...STAGE_CONFIG.scoring,
	benchmarkPortfolio: {
		cheap_frontier: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0, agentic: 1 },
			resourcePolicy: {
				source: "benchmark",
				unit: "per_task",
				tokenMeasure: "tokens",
			},
		},
		expensive_frontier: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0, agentic: 1 },
			resourcePolicy: {
				source: "benchmark",
				unit: "per_task",
				tokenMeasure: "tokens",
			},
		},
	},
} as const;
const scaleNormalizedResourceModels = attachFinalScores(
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
assertClose(scaleNormalizedResourceModels[0]?.scores.value_score, 32.4);
assertClose(scaleNormalizedResourceModels[1]?.scores.value_score, 32.4);

const sparseResourceCoverageModels = attachFinalScores(
	[
		{
			...modelCandidate({
				id: "test/full-resource-coverage",
				throughputTokensPerSecond: 100,
				latencySeconds: 1,
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
				throughputTokensPerSecond: 100,
				latencySeconds: 1,
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
assertClose(sparseResourceCoverageModels[0]?.scores.value_score, 44.8);
assertClose(sparseResourceCoverageModels[1]?.scores.value_score, 2.4296);

const resourceModelVariants = [
	resourceModel("b", 2, "low"),
	resourceModel("b", 4, "high"),
];
const resourceComparisonModel = resourceModel("c", 3);
const resourceModels = [
	resourceModel("a", 1),
	...resourceModelVariants,
	resourceComparisonModel,
	resourceModel("d", 8),
];
const modelBalancedResourceScore = attachFinalScores(
	resourceModels,
	STAGE_CONFIG.scoring,
).find((model) => model.id === resourceComparisonModel.id)?.scores;
const duplicatedModelResourceScore = attachFinalScores(
	[
		...resourceModels,
		...resourceModelVariants.map((model) => ({
			...model,
			task_metrics: { ...model.task_metrics },
		})),
	],
	STAGE_CONFIG.scoring,
).find((model) => model.id === resourceComparisonModel.id)?.scores;
assertClose(
	duplicatedModelResourceScore?.speed_score,
	modelBalancedResourceScore?.speed_score ?? 0,
);
assertClose(
	duplicatedModelResourceScore?.value_score,
	modelBalancedResourceScore?.value_score ?? 0,
);

const normalizedContextModels = [
	imputationModel("observed-a", 0, 0, 0, 0),
	imputationModel("observed-b", 10, 20, 200, 0.2),
	imputationModel("observed-c", 20, 40, 400, 0.4),
	imputationModel("observed-d", 30, 60, 600, 0.6),
	imputationModel("observed-e", 40, 80, 800, 0.8),
	imputationModel("observed-f", 50, 100, 1_000, 1),
	imputationModel("missing", null, 0, 1_000, 0),
];
const normalizedContextBenchmarkKeys = [
	"target",
	"wide",
	"narrow",
	"steady",
] as const;
const normalizedContextBenchmarkPortfolio = Object.fromEntries(
	normalizedContextBenchmarkKeys.map((key) => {
		const intelligenceLoading =
			key === "wide" ? 0.8 : key === "target" ? 1 : 0.1;
		return [
			key,
			{
				group: "baseline",
				benchmarkImportance: 1,
				dimensionLoadings: {
					intelligence: intelligenceLoading,
					agentic: 1 - intelligenceLoading,
				},
			},
		] as const;
	}),
);
const normalizedContextConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: normalizedContextBenchmarkKeys,
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: normalizedContextBenchmarkPortfolio,
};
const normalizedContextImputations = buildBenchmarkImputationByModel(
	normalizedContextModels,
	normalizedContextConfig,
);
assertClose(
	normalizedContextImputations
		.get(normalizedContextModels.at(-1) ?? {})
		?.get("target"),
	37.5,
);

const repeatedModelVariants = [
	{
		...imputationModel("model-b", 10, 20, 200, 0.2),
		reasoning_effort: "low",
	},
	{
		...imputationModel("model-b", 20, 40, 400, 0.4),
		reasoning_effort: "high",
	},
];
const modelBalancedMissingModel = imputationModel(
	"model-missing",
	null,
	100,
	1_000,
	1,
);
const modelBalancedModels = [
	imputationModel("model-a", 0, 0, 0, 0),
	...repeatedModelVariants,
	imputationModel("model-c", 30, 60, 600, 0.6),
	imputationModel("model-d", 40, 80, 800, 0.8),
	imputationModel("model-e", 50, 100, 1_000, 1),
	imputationModel("model-f", 60, 120, 1_200, 1.2),
	modelBalancedMissingModel,
];
const modelsWithDuplicatedVariants = [
	...modelBalancedModels.slice(0, -1),
	...repeatedModelVariants.map((model) => ({
		...model,
		intelligence: { ...model.intelligence },
	})),
	modelBalancedMissingModel,
];
const modelBalancedImputation = buildBenchmarkImputationByModel(
	modelBalancedModels,
	normalizedContextConfig,
)
	.get(modelBalancedMissingModel)
	?.get("target");
const duplicatedModelImputation = buildBenchmarkImputationByModel(
	modelsWithDuplicatedVariants,
	normalizedContextConfig,
)
	.get(modelBalancedMissingModel)
	?.get("target");
assertEqual(modelBalancedImputation != null, true);
assertClose(duplicatedModelImputation, modelBalancedImputation ?? 0);
const modelBalancedDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	modelBalancedModels,
	normalizedContextConfig,
).get("target");
const duplicatedModelDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	modelsWithDuplicatedVariants,
	normalizedContextConfig,
).get("target");
assertEqual(modelBalancedDiagnostic?.validationSampleCount, 7);
assertEqual(duplicatedModelDiagnostic?.validationSampleCount, 9);
assertEqual(modelBalancedDiagnostic?.effectiveModelCount, 6);
assertEqual(duplicatedModelDiagnostic?.effectiveModelCount, 6);
assertClose(
	duplicatedModelDiagnostic?.normalizedMedianAbsoluteError,
	modelBalancedDiagnostic?.normalizedMedianAbsoluteError ?? 0,
);

const frontierPercentileConfig = {
	...normalizedContextConfig,
	intelligenceBenchmarkKeys: ["agents_last_exam", "gdpval_normalized", "hle"],
	benchmarkPortfolio: STAGE_CONFIG.scoring.benchmarkPortfolio,
};
const frontierPercentileModels = [
	{
		id: "observed-frontier-a",
		evaluations: { agents_last_exam: 0.2, gdpval_normalized: 0, hle: 0 },
	},
	{
		id: "observed-frontier-b",
		evaluations: { agents_last_exam: 0.5, gdpval_normalized: 50, hle: 50 },
	},
	{
		id: "observed-frontier-c",
		evaluations: { agents_last_exam: 0.8, gdpval_normalized: 100, hle: 100 },
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
assertEqual(
	frontierPercentileImputations
		.get(frontierPercentileModels.at(-1) ?? {})
		?.has("agents_last_exam") ?? false,
	false,
);
const sparseFrontierDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	frontierPercentileModels,
	frontierPercentileConfig,
).get("agents_last_exam");
assertEqual(sparseFrontierDiagnostic?.validationSampleCount, 0);
assertEqual(sparseFrontierDiagnostic?.effectiveModelCount, 0);
assertEqual(sparseFrontierDiagnostic?.normalizedMedianAbsoluteError, null);
assertEqual(sparseFrontierDiagnostic?.rawPenalty, null);
assertEqual(sparseFrontierDiagnostic?.imputationAllowed, false);

const unreliableReferenceModels = [0, 1, 2, 3, 4].map((value) => ({
	id: `unreliable-observed-${value}`,
	evaluations: {
		target: value % 2 === 0 ? 0 : 100,
		c1: value,
		c2: value,
		c3: value,
	},
}));
const unreliableMissingModel = {
	id: "unreliable-missing",
	evaluations: { c1: 4, c2: 4, c3: 4 },
};
const unreliableConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["target", "c1", "c2", "c3"],
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: {
		target: intelligenceBenchmarkEntry(),
		c1: intelligenceBenchmarkEntry(),
		c2: intelligenceBenchmarkEntry(),
		c3: intelligenceBenchmarkEntry(),
	},
} as const;
const unreliableModels = [...unreliableReferenceModels, unreliableMissingModel];
const unreliableDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	unreliableModels,
	unreliableConfig,
).get("target");
assertEqual(unreliableDiagnostic?.validationSampleCount, 5);
assertEqual(unreliableDiagnostic?.effectiveModelCount, 5);
assertClose(unreliableDiagnostic?.normalizedMedianAbsoluteError, 50);
assertClose(unreliableDiagnostic?.rawPenalty, 50);
assertEqual(unreliableDiagnostic?.imputationAllowed, false);
assertEqual(
	buildBenchmarkImputationByModel(unreliableModels, unreliableConfig)
		.get(unreliableMissingModel)
		?.has("target") ?? false,
	false,
);

const sharedTargetModels = [
	dualContextImputationModel("shared-observed-a", 0, 0, 0),
	dualContextImputationModel("shared-observed-b", 10, 1, 1),
	dualContextImputationModel("shared-observed-c", 20, 2, 2),
	dualContextImputationModel("shared-observed-d", 30, 3, 3),
	dualContextImputationModel("shared-observed-e", 40, 4, 4),
	dualContextImputationModel("shared-observed-f", 50, 5, 5),
	dualContextImputationModel("shared-missing", null, 5, 0),
];
const sharedTargetConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["shared_target", "i1", "i2", "i3"],
	agenticBenchmarkKeys: ["shared_target", "a1", "a2", "a3"],
	benchmarkPortfolio: {
		shared_target: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.25, agentic: 0.75 },
		},
		i1: intelligenceBenchmarkEntry(),
		i2: intelligenceBenchmarkEntry(),
		i3: intelligenceBenchmarkEntry(),
		a1: agenticBenchmarkEntry(),
		a2: agenticBenchmarkEntry(),
		a3: agenticBenchmarkEntry(),
	},
} as const;
const sharedTargetModel = sharedTargetModels.at(-1);
if (sharedTargetModel == null) {
	throw new Error("Expected a shared-target missing model");
}
const sharedTargetImputation = buildBenchmarkImputationByModel(
	sharedTargetModels,
	sharedTargetConfig,
)
	.get(sharedTargetModel)
	?.get("shared_target");
assertClose(sharedTargetImputation, 10);
assertClose(
	prepareBenchmarkScoring(sharedTargetModels, sharedTargetConfig)
		.benchmarkImputationConfidenceByModel.get(sharedTargetModel)
		?.get("shared_target"),
	0.5,
);
const reorderedSharedTargetImputation = buildBenchmarkImputationByModel(
	sharedTargetModels,
	{
		...sharedTargetConfig,
		intelligenceBenchmarkKeys: ["i3", "i2", "i1", "shared_target"],
		agenticBenchmarkKeys: ["a3", "a2", "a1", "shared_target"],
	},
)
	.get(sharedTargetModel)
	?.get("shared_target");
assertClose(reorderedSharedTargetImputation, 10);
assertEqual("shared_target" in sharedTargetModel.evaluations, false);

const missingGroupPenaltyPortfolio = {
	...sharedTargetConfig.benchmarkPortfolio,
	i1: { ...intelligenceBenchmarkEntry(), group: "frontier" },
	i2: { ...intelligenceBenchmarkEntry(), group: "frontier" },
	i3: { ...intelligenceBenchmarkEntry(), group: "frontier" },
	a1: { ...agenticBenchmarkEntry(), group: "frontier" },
	a2: { ...agenticBenchmarkEntry(), group: "frontier" },
	a3: { ...agenticBenchmarkEntry(), group: "frontier" },
} as const;
const baselineMissingConfig = {
	...sharedTargetConfig,
	benchmarkPortfolio: missingGroupPenaltyPortfolio,
};
const frontierMissingConfig = {
	...baselineMissingConfig,
	benchmarkPortfolio: {
		...missingGroupPenaltyPortfolio,
		shared_target: {
			...missingGroupPenaltyPortfolio.shared_target,
			group: "frontier",
		},
	},
} as const;
const baselineMissingDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	sharedTargetModels,
	baselineMissingConfig,
).get("shared_target");
const frontierMissingDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	sharedTargetModels,
	frontierMissingConfig,
).get("shared_target");
assertEqual(baselineMissingDiagnostic?.imputationAllowed, true);
assertClose(
	frontierMissingDiagnostic?.normalizedMedianAbsoluteError,
	baselineMissingDiagnostic?.normalizedMedianAbsoluteError ?? 0,
);
const baselineMissingValue = buildBenchmarkImputationByModel(
	sharedTargetModels,
	baselineMissingConfig,
)
	.get(sharedTargetModel)
	?.get("shared_target");
const frontierMissingValue = buildBenchmarkImputationByModel(
	sharedTargetModels,
	frontierMissingConfig,
)
	.get(sharedTargetModel)
	?.get("shared_target");
assertClose(baselineMissingValue, 10);
assertClose(frontierMissingValue, 7.5);
assertEqual(
	(frontierMissingValue ?? Number.POSITIVE_INFINITY) <
		(baselineMissingValue ?? Number.NEGATIVE_INFINITY),
	true,
);

const nonRecursiveReferenceModels = [0, 1, 2, 3, 4, 5].map((value) => ({
	id: `non-recursive-observed-${value}`,
	evaluations: {
		target: value * 10,
		bridge: value * 10,
		bridge2: value * 10,
		i1: value,
		i2: value,
		a1: value,
		a2: value,
		a3: value,
	},
}));
const nonRecursiveMissingModel = {
	id: "non-recursive-missing",
	evaluations: { i1: 5, i2: 5, a1: 5, a2: 5, a3: 5 },
};
const nonRecursiveImputations = buildBenchmarkImputationByModel(
	[...nonRecursiveReferenceModels, nonRecursiveMissingModel],
	{
		...STAGE_CONFIG.scoring,
		intelligenceBenchmarkKeys: ["target", "bridge", "bridge2", "i1", "i2"],
		agenticBenchmarkKeys: ["bridge", "bridge2", "a1", "a2", "a3"],
		benchmarkPortfolio: {
			target: intelligenceBenchmarkEntry(),
			bridge: {
				group: "baseline",
				benchmarkImportance: 1,
				dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
			},
			bridge2: {
				group: "baseline",
				benchmarkImportance: 1,
				dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
			},
			i1: intelligenceBenchmarkEntry(),
			i2: intelligenceBenchmarkEntry(),
			a1: agenticBenchmarkEntry(),
			a2: agenticBenchmarkEntry(),
			a3: agenticBenchmarkEntry(),
		},
	},
).get(nonRecursiveMissingModel);
assertClose(nonRecursiveImputations?.get("bridge"), 47.5);
assertClose(nonRecursiveImputations?.get("bridge2"), 47.5);
assertEqual(nonRecursiveImputations?.has("target"), false);

const crossEffortConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["target", "c1", "c2", "c3"],
	agenticBenchmarkKeys: [],
	benchmarkPortfolio: {
		target: intelligenceBenchmarkEntry(),
		c1: intelligenceBenchmarkEntry(),
		c2: intelligenceBenchmarkEntry(),
		c3: intelligenceBenchmarkEntry(),
	},
} as const;
const crossEffortModels = crossEffortImputationModels(7);
const crossEffortTarget = crossEffortModels.at(-1);
if (crossEffortTarget == null) {
	throw new Error("Expected a cross-effort imputation target");
}
const crossEffortValue = buildBenchmarkImputationByModel(
	crossEffortModels,
	crossEffortConfig,
)
	.get(crossEffortTarget)
	?.get("target");
assertClose(crossEffortValue, 19.3707);
const crossEffortConfidence = prepareBenchmarkScoring(
	crossEffortModels,
	crossEffortConfig,
)
	.benchmarkImputationConfidenceByModel.get(crossEffortTarget)
	?.get("target");
if (!(crossEffortConfidence != null && crossEffortConfidence > 0)) {
	throw new Error("Expected validated cross-effort evidence credit");
}
const crossEffortDiagnostic = buildBenchmarkImputationDiagnosticsByKey(
	crossEffortModels,
	crossEffortConfig,
).get("target");
assertEqual(crossEffortDiagnostic?.includesCrossEffort, true);
if (!((crossEffortDiagnostic?.crossEffortEffectiveModelCount ?? 0) >= 4)) {
	throw new Error("Expected independent cross-effort validation coverage");
}

const reverseCrossEffortModels = reverseCrossEffortImputationModels(7);
const reverseCrossEffortTarget = reverseCrossEffortModels.at(-2);
if (reverseCrossEffortTarget == null) {
	throw new Error("Expected a reverse cross-effort imputation target");
}
const reverseCrossEffortValue = buildBenchmarkImputationByModel(
	reverseCrossEffortModels,
	crossEffortConfig,
)
	.get(reverseCrossEffortTarget)
	?.get("target");
if (!(reverseCrossEffortValue != null && reverseCrossEffortValue > 0)) {
	throw new Error(
		"Expected lower-effort evidence to inform the maximum effort",
	);
}

const unlinkedEffortModels = crossEffortModels.map((model) => ({
	...model,
	name: `${model.name} ${model.reasoning_effort}`,
}));
assertClose(
	buildBenchmarkImputationByModel(unlinkedEffortModels, crossEffortConfig)
		.get(unlinkedEffortModels.at(-1) ?? {})
		?.get("target"),
	0,
);
assertEqual(
	prepareBenchmarkScoring(unlinkedEffortModels, crossEffortConfig)
		.benchmarkImputationConfidenceByModel.get(unlinkedEffortModels.at(-1) ?? {})
		?.has("target") ?? false,
	true,
);

const sparseTransitionModels = crossEffortImputationModels(4);
assertClose(
	buildBenchmarkImputationByModel(sparseTransitionModels, crossEffortConfig)
		.get(sparseTransitionModels.at(-1) ?? {})
		?.get("target"),
	0,
);
assertEqual(
	buildBenchmarkImputationDiagnosticsByKey(
		sparseTransitionModels,
		crossEffortConfig,
	).get("target")?.includesCrossEffort,
	false,
);

const sparseBenchmarkContextModels = crossEffortModels.map((model, index) =>
	index === crossEffortModels.length - 1
		? { ...model, evaluations: { c1: 0 } }
		: model,
);
assertEqual(
	buildBenchmarkImputationByModel(
		sparseBenchmarkContextModels,
		crossEffortConfig,
	)
		.get(sparseBenchmarkContextModels.at(-1) ?? {})
		?.has("target") ?? false,
	false,
);

const sparseSiblingContextModels = crossEffortModels.map((model, index) =>
	index === crossEffortModels.length - 2
		? {
				...model,
				evaluations: {
					target: model.evaluations.target,
					c1: model.evaluations.c1,
				},
			}
		: model,
);
assertClose(
	buildBenchmarkImputationByModel(sparseSiblingContextModels, crossEffortConfig)
		.get(sparseSiblingContextModels.at(-1) ?? {})
		?.get("target"),
	0,
);

const imputationCoverageModels = [
	{
		id: "imputation-coverage-min",
		evaluations: { target: 0, c1: 0, c2: 0, c3: 0 },
	},
	{
		id: "imputation-coverage-max",
		evaluations: { target: 100, c1: 100, c2: 100, c3: 100 },
	},
];
const imputationCoverageContext = buildQualityScoringContext(
	imputationCoverageModels,
	crossEffortConfig,
);
const imputationCoverageTarget = {
	id: "imputation-coverage-target",
	evaluations: { c1: 100 },
};
const imputedHighValues = new Map([
	["target", 100],
	["c2", 100],
	["c3", 100],
]);
const untrustedImputationScores = buildComponentScores(
	imputationCoverageTarget,
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	crossEffortConfig,
	imputationCoverageContext,
	imputedHighValues,
);
const validatedImputationScores = buildComponentScores(
	imputationCoverageTarget,
	{
		throughput_tokens_per_second_median: null,
		latency_seconds_median: null,
		e2e_latency_seconds_median: null,
	},
	[],
	crossEffortConfig,
	imputationCoverageContext,
	imputedHighValues,
	new Map([
		["target", 0.5],
		["c2", 0.5],
		["c3", 0.5],
	]),
);
assertClose(untrustedImputationScores?.intelligence_score, 21.6);
assertClose(validatedImputationScores?.intelligence_score, 100);

function modelCandidate(options: {
	id: string;
	intelligenceScore?: number | null;
	agenticScore?: number | null;
	blendedPrice?: number | null;
	artificialAnalysisCost?: number | null;
	artificialAnalysisSeconds?: number | null;
	deepSWEScore?: number | null;
	deepSWECost?: number | null;
	deepSWESeconds?: number | null;
	deepSWEOutputTokens?: number | null;
	throughputTokensPerSecond?: number | null;
	latencySeconds?: number | null;
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
		reasoning: null,
		reasoning_effort: null,
		release_date: null,
		modalities: null,
		open_weights: null,
		cost: options.disableBaseCost
			? null
			: {
					input: 1,
					output: 1,
					blended_price: options.blendedPrice ?? null,
				},
		context_window: null,
		speed: {
			throughput_tokens_per_second_median:
				options.throughputTokensPerSecond ?? null,
			latency_seconds_median: options.latencySeconds ?? null,
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
		component_scores: {
			intelligence_score: options.intelligenceScore ?? null,
			agentic_score: options.agenticScore ?? null,
			speed_score: null,
		},
		scores: null,
	};
}

function resourceModel(
	modelKey: string,
	resourceScale: number,
	reasoningEffort: string | null = null,
): LlmStatsModelCandidate {
	return {
		...modelCandidate({
			id: `test/resource-model-${modelKey}`,
			intelligenceScore: 50,
			agenticScore: 50,
			deepSWEScore: 50,
			deepSWECost: resourceScale,
			deepSWESeconds: resourceScale * 10,
			throughputTokensPerSecond: 100,
			latencySeconds: 1,
			disableBaseCost: true,
		}),
		reasoning_effort: reasoningEffort,
	};
}

function imputationModel(
	id: string,
	target: number | null,
	steady: number,
	wide: number,
	narrow: number,
) {
	return {
		id,
		intelligence: {
			steady,
			wide,
			narrow,
			...(target == null ? {} : { target }),
		},
		evaluations: null,
	};
}

function dualContextImputationModel(
	id: string,
	target: number | null,
	intelligenceContext: number,
	agenticContext: number,
) {
	return {
		id,
		evaluations: {
			i1: intelligenceContext,
			i2: intelligenceContext,
			i3: intelligenceContext,
			a1: agenticContext,
			a2: agenticContext,
			a3: agenticContext,
			...(target == null ? {} : { shared_target: target }),
		},
	};
}

function crossEffortImputationModels(modelCount: number) {
	return Array.from({ length: modelCount }, (_, index) => {
		const name = `Cross-effort Model ${index}`;
		return [
			{
				id: `test/cross-effort-${index}`,
				name,
				reasoning_effort: "max",
				evaluations: {
					target: index * 20,
					c1: index * 20,
					c2: index * 20,
					c3: index * 20,
				},
			},
			{
				id: `test/cross-effort-${index}`,
				name,
				reasoning_effort: "low",
				evaluations: {
					...(index === modelCount - 1 ? {} : { target: index * 10 }),
					c1: 0,
					c2: 0,
					c3: 0,
				},
			},
		];
	}).flat();
}

function reverseCrossEffortImputationModels(modelCount: number) {
	return Array.from({ length: modelCount }, (_, index) => {
		const name = `Reverse cross-effort Model ${index}`;
		return [
			{
				id: `test/reverse-cross-effort-${index}`,
				name,
				reasoning_effort: "max",
				evaluations: {
					...(index === modelCount - 1 ? {} : { target: index * 20 }),
					c1: 0,
					c2: 0,
					c3: 0,
				},
			},
			{
				id: `test/reverse-cross-effort-${index}`,
				name,
				reasoning_effort: "low",
				evaluations: {
					target: index * 10,
					c1: index * 10,
					c2: index * 10,
					c3: index * 10,
				},
			},
		];
	}).flat();
}

function intelligenceBenchmarkEntry() {
	return {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	} as const;
}

function agenticBenchmarkEntry() {
	return {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	} as const;
}
