/** Exercises Artificial Analysis leaderboard projection and scoring inputs. */

import { SIMULATION_PROFILES } from "../src/model-atlas/config";
import {
	buildBenchmarkImputationByModel,
	buildComponentScoreResult,
	buildQualityScoringContext,
} from "../src/model-atlas/pipeline/scores";
import {
	ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
	processArtificialAnalysisLeaderboardRows,
} from "../src/model-atlas/scrapers/artificial-analysis/leaderboard";
import { cleanArtificialAnalysisModelName } from "../src/model-atlas/scrapers/artificial-analysis/model-labels";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = stableJson(actual);
	const expectedJson = stableJson(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableJson(item)).join(",")}]`;
	}
	if (value != null && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

const rows = processArtificialAnalysisLeaderboardRows(
	[
		{
			slug: "alpha",
			name: "Alpha",
			modelCreatorName: "Acme",
			modelCreatorSlug: "acme",
			intelligenceIndex: 70,
			medianOutputTokensPerSecond: 59,
			medianTimeToFirstTokenSeconds: 94,
			medianEndToEndResponseTimeSeconds: 103,
			apexAgents: 0.47,
			critpt: 0.31,
			scicode: 0.42,
			tauBanking: 0.52,
			terminalbenchV21: 0.53,
			itbenchSre: 0.31,
			mmmuPro: 0.24,
		},
		{
			slug: "beta",
			name: "Beta",
			modelCreatorName: "Acme",
			modelCreatorSlug: "acme",
			intelligenceIndex: 65,
			scicode: 0.36,
			terminalbenchV21: 0.47,
		},
		{
			slug: "gamma",
			name: "Gamma",
			modelCreatorName: "Acme",
			modelCreatorSlug: "acme",
			intelligenceIndex: 60,
			scicode: 0.28,
		},
	],
	{
		selectedColumns: [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
	},
);

assertDeepEqual(rows[0]?.benchmarks, {
	apex_agents: 0.47,
	critpt: 0.31,
	itbench_sre: 0.31,
	mmmu_pro: 0.24,
	scicode: 0.42,
	tau_banking: 0.52,
	terminalbench_v21: 0.53,
});
assertDeepEqual(rows[1]?.benchmarks, {
	scicode: 0.36,
	terminalbench_v21: 0.47,
});
assertDeepEqual(rows[0]?.median_speed, 59);
assertDeepEqual(rows[0]?.median_time, 94);
assertDeepEqual(rows[0]?.median_end_to_end_response_time, 103);
assertDeepEqual(
	processArtificialAnalysisLeaderboardRows(
		[
			{
				slug: "gpt-5-5",
				name: "GPT-5.5 (xhigh)",
				modelCreatorName: "OpenAI",
				modelCreatorSlug: "openai",
				intelligenceIndex: 55,
			},
			{
				slug: "claude-opus-4-7",
				name: "Claude Opus 4.7 (Non-reasoning, high)",
				modelCreatorName: "Anthropic",
				modelCreatorSlug: "anthropic",
				intelligenceIndex: 43,
			},
		],
		{ selectedColumns: ["model_id", "name", "reasoning_effort"] },
	),
	[
		{
			model_id: "openai/gpt-5-5",
			name: "GPT-5.5 (xhigh)",
			reasoning_effort: "xhigh",
		},
		{
			model_id: "anthropic/claude-opus-4-7",
			name: "Claude Opus 4.7 (Non-reasoning, high)",
			reasoning_effort: "none",
		},
	],
);
assertDeepEqual(
	processArtificialAnalysisLeaderboardRows(
		[
			{
				slug: "claude-fable-5",
				model_url:
					"https://artificialanalysis.ai/models/anthropic/claude-fable-5",
				name: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
				modelCreatorName: "Anthropic",
				modelCreatorSlug: "anthropic",
				intelligenceIndex: 64.9,
			},
		],
		{ selectedColumns: ["model_id", "name"] },
	),
	[
		{
			model_id: "anthropic/claude-fable-5",
			name: "Claude Fable 5",
		},
	],
);
assertDeepEqual(
	processArtificialAnalysisLeaderboardRows(
		[
			{
				model_id: "anthropic/claude-fable-5",
				model_url:
					"https://artificialanalysis.ai/models/anthropic/claude-fable-5",
				name: "Claude Fable 5",
				modelCreatorName: "Anthropic",
				modelCreatorSlug: "anthropic",
				intelligence_index: 64.9,
				agentic_index: 80.5,
				terminalbench_v21: 0.72,
				tauBanking: 0.58,
				input_cost: 10,
				output_cost: 50,
				total_tokens: 2_000_000,
				intelligenceIndexCostPerTask: {
					cost: {
						total: 1.5,
					},
				},
				intelligenceIndexTimePerTask: 120,
				intelligenceIndexOutputTokensPerTask: {
					output: 42_000,
				},
			},
		],
		{
			selectedColumns: [
				"model_id",
				"intelligence",
				"intelligence_index_cost",
				"benchmarks",
			],
		},
	),
	[
		{
			model_id: "anthropic/claude-fable-5",
			intelligence: {
				agentic_index: 80.5,
				coding_index: null,
				intelligence_index: 64.9,
				omniscience_accuracy: null,
				omniscience_index: null,
			},
			intelligence_index_cost: {
				answer_tokens: null,
				input_cost: 10,
				input_tokens: null,
				output_cost: 50,
				output_tokens: null,
				reasoning_cost: null,
				reasoning_tokens: null,
				total_cost: null,
				total_tokens: 2_000_000,
				cost_per_task: 1.5,
				seconds_per_task: 120,
				output_tokens_per_task: 42000,
			},
			benchmarks: {
				tau_banking: 0.58,
				terminalbench_v21: 0.72,
			},
		},
	],
);
assertDeepEqual(
	cleanArtificialAnalysisModelName(
		"Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
	),
	"Claude Fable 5",
);
assertDeepEqual(
	cleanArtificialAnalysisModelName("Claude Fable 5 (with fallback)"),
	"Claude Fable 5",
);

const scoringRows = [
	{
		intelligence: {
			agentic_index: 40,
		},
		benchmarks: {
			gdpval_normalized: 0.4,
			scicode: 0.4,
			tau_banking: 0.4,
			terminalbench_v21: 0.4,
			apex_agents: 0.1,
		},
	},
	{
		intelligence: {
			agentic_index: 60,
		},
		benchmarks: {
			apex_agents: 0.3,
			gdpval_normalized: 0.6,
			scicode: 0.6,
			tau_banking: 0.6,
			terminalbench_v21: 0.6,
		},
	},
	{
		intelligence: {
			agentic_index: 80,
		},
		benchmarks: {
			apex_agents: 0.5,
			gdpval_normalized: 0.8,
			scicode: 0.8,
			tau_banking: 0.8,
			terminalbench_v21: 0.8,
		},
	},
	{
		intelligence: {
			agentic_index: 70,
		},
		benchmarks: {
			gdpval_normalized: 0.7,
			scicode: 0.7,
			tau_banking: 0.7,
			terminalbench_v21: 0.7,
		},
	},
];
const scoringConfig = {
	intelligenceBenchmarkKeys: [],
	intelligenceBenchmarkDisplayKeys: [],
	agenticBenchmarkKeys: [
		"apex_agents",
		"gdpval_normalized",
		"scicode",
		"tau_banking",
		"terminalbench_v21",
	],
	agenticBenchmarkDisplayKeys: [
		"apex_agents",
		"gdpval_normalized",
		"scicode",
		"tau_banking",
		"terminalbench_v21",
	],
	defaultSpeedOutputTokenAnchors: [],
	speedOutputTokenRangeMin: 0,
	speedOutputTokenRangeMax: 0,
	speedAnchorQuantiles: [],
	priceProfiles: {
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
	},
	simulationProfiles: SIMULATION_PROFILES,
	secondsPerInputToken: 0.0001,
	benchmarkPortfolio: {
		scicode: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.8, agentic: 0.2 },
		},
		tau_banking: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
		},
		terminalbench_v21: {
			group: "baseline",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.2, agentic: 0.8 },
		},
		gdpval_normalized: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
		},
		apex_agents: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.45, agentic: 0.55 },
		},
	},
	confidence: {
		intelligence: { floor: 0, full: 1 },
		agentic: { floor: 0, full: 1 },
	},
	columnTooltips: {},
} as const;
const imputationByModel = buildBenchmarkImputationByModel(
	scoringRows,
	scoringConfig,
);
const qualityScoringContext = buildQualityScoringContext(
	scoringRows,
	scoringConfig,
);
const emptySpeed = {
	throughput_tokens_per_second_median: null,
	latency_seconds_median: null,
	e2e_latency_seconds_median: null,
};
const componentScoresWithMissingApex = buildComponentScoreResult(
	scoringRows[3] ?? {},
	emptySpeed,
	[],
	scoringConfig,
	qualityScoringContext,
	imputationByModel.get(scoringRows[3] ?? {}),
).componentScores;
assertDeepEqual(componentScoresWithMissingApex, {
	agentic_score: 74.99999999999997,
	intelligence_score: null,
	speed_score: null,
});
