import { STAGE_CONFIG } from "../src/model-atlas/constants";
import {
	attachRelativeScores,
	blendedPriceValue,
	buildBenchmarkImputationByModel,
	buildQualityScoringContext,
	buildScores,
	simulatedBlendSeconds,
} from "../src/model-atlas/llm/model-stats/scores";
import type { ModelStatsModelCandidate } from "../src/model-atlas/llm/model-stats/types";
import {
	meanOfFiniteWithMinimum,
	quantileFromSorted,
} from "../src/model-atlas/math-utils";

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
assertEqual(meanOfFiniteWithMinimum([100, null, null], 2), null);
assertEqual(meanOfFiniteWithMinimum([100, 50, null], 2), 75);

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
	{},
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

const scoredModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/a",
			intelligenceScore: 90,
			agenticScore: 80,
			blendPrice: 4,
			aaCost: 0.1,
			aaSeconds: 10,
			deepSWECost: 0.2,
			deepSWESeconds: 40,
			tps: 100,
			latency: 1,
		}),
		modelCandidate({
			id: "test/b",
			intelligenceScore: 80,
			agenticScore: 70,
			blendPrice: 2,
			aaCost: 0.2,
			aaSeconds: 20,
			deepSWECost: 0.1,
			deepSWESeconds: 20,
			tps: 50,
			latency: 2,
		}),
		modelCandidate({
			id: "test/c",
			intelligenceScore: 70,
			agenticScore: 60,
			blendPrice: 8,
			aaCost: 0.05,
			aaSeconds: 5,
			deepSWECost: 0.4,
			deepSWESeconds: 80,
			tps: 200,
			latency: 0.5,
		}),
	],
	STAGE_CONFIG.scoring,
);

assertClose(scoredModels[0]?.relative_scores.value_score, 72.2223);
assertClose(scoredModels[1]?.relative_scores.value_score, 72.2222);
assertClose(scoredModels[2]?.relative_scores.value_score, 55.5555);
assertClose(scoredModels[0]?.relative_scores.speed_score, 66.6667);
assertClose(scoredModels[1]?.relative_scores.speed_score, 55.5556);
assertClose(scoredModels[2]?.relative_scores.speed_score, 77.7778);

const sparseComponentModels = attachRelativeScores(
	[
		modelCandidate({
			id: "test/sparse-a",
			blendPrice: 2,
			tps: 100,
			latency: 1,
		}),
		modelCandidate({
			id: "test/sparse-b",
			blendPrice: 4,
			tps: 50,
			latency: 2,
		}),
		modelCandidate({
			id: "test/sparse-c",
			blendPrice: 8,
			tps: 25,
			latency: 3,
		}),
	],
	STAGE_CONFIG.scoring,
);

assertEqual(sparseComponentModels[0]?.relative_scores.value_score, null);
assertEqual(sparseComponentModels[0]?.relative_scores.speed_score, null);

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
	aaCost?: number | null;
	aaSeconds?: number | null;
	deepSWECost?: number | null;
	deepSWESeconds?: number | null;
	tps?: number | null;
	latency?: number | null;
}): ModelStatsModelCandidate {
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
		cost: {
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
				cost: options.aaCost,
				seconds: options.aaSeconds,
			},
			deep_swe: {
				cost: options.deepSWECost,
				seconds: options.deepSWESeconds,
			},
		},
		evaluations: null,
		scores: {
			intelligence_score: options.intelligenceScore ?? null,
			agentic_score: options.agenticScore ?? null,
			speed_score: null,
			value_score: null,
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
