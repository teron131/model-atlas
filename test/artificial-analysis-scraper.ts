import { SIMULATION_PROFILES } from "../src/model-atlas/constants";
import {
	buildBenchmarkImputationByModel,
	buildQualityScoringContext,
	buildScores,
} from "../src/model-atlas/llm/llm-stats/scores";
import {
	ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS,
	processArtificialAnalysisScrapedRows,
} from "../src/model-atlas/llm/sources/artificial-analysis-scraper";

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

const rows = processArtificialAnalysisScrapedRows(
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
			terminalbenchHard: 0.43,
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
			terminalbenchHard: 0.37,
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
		selectedColumns: [...ARTIFICIAL_ANALYSIS_EVALS_ONLY_COLUMNS],
	},
);

assertDeepEqual(rows[0]?.evaluations, {
	apex_agents: 0.47,
	critpt: 0.31,
	itbench_sre: 0.31,
	mmmu_pro: 0.24,
	scicode: 0.42,
	terminalbench_hard: 0.43,
});
assertDeepEqual(rows[1]?.evaluations, {
	scicode: 0.36,
	terminalbench_hard: 0.37,
});
assertDeepEqual(rows[0]?.median_speed, 59);
assertDeepEqual(rows[0]?.median_time, 94);
assertDeepEqual(rows[0]?.median_end_to_end_response_time, 103);

const scoringRows = [
	{
		intelligence: {
			agentic_index: 40,
			omniscience_nonhallucination_rate: 0.4,
		},
		evaluations: {
			gdpval_normalized: 0.4,
			ifbench: 0.4,
			scicode: 0.4,
			terminalbench_hard: 0.4,
			terminal_bench_2: 0.4,
			apex_agents: 0.1,
		},
	},
	{
		intelligence: {
			agentic_index: 60,
			omniscience_nonhallucination_rate: 0.6,
		},
		evaluations: {
			gdpval_normalized: 0.6,
			ifbench: 0.6,
			scicode: 0.6,
			terminalbench_hard: 0.6,
			terminal_bench_2: 0.6,
			apex_agents: 0.3,
		},
	},
	{
		intelligence: {
			agentic_index: 80,
			omniscience_nonhallucination_rate: 0.8,
		},
		evaluations: {
			gdpval_normalized: 0.8,
			ifbench: 0.8,
			scicode: 0.8,
			terminalbench_hard: 0.8,
			terminal_bench_2: 0.8,
			apex_agents: 0.5,
		},
	},
	{
		intelligence: {
			agentic_index: 70,
			omniscience_nonhallucination_rate: 0.7,
		},
		evaluations: {
			gdpval_normalized: 0.7,
			ifbench: 0.7,
			scicode: 0.7,
			terminalbench_hard: 0.7,
			terminal_bench_2: 0.7,
		},
	},
];
const scoringConfig = {
	intelligenceBenchmarkKeys: [],
	intelligenceBenchmarkDisplayKeys: [],
	agenticBenchmarkKeys: [
		"omniscience_nonhallucination_rate",
		"gdpval_normalized",
		"ifbench",
		"scicode",
		"terminalbench_hard",
		"terminal_bench_2",
		"apex_agents",
	],
	agenticBenchmarkDisplayKeys: [
		"omniscience_nonhallucination_rate",
		"gdpval_normalized",
		"ifbench",
		"scicode",
		"terminalbench_hard",
		"terminal_bench_2",
		"apex_agents",
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
	simulationInputTokenSeconds: 0.0001,
	qualityScoreWeights: {
		index: 0.3,
		baseline: 0.3,
		frontier: 0.4,
	},
	benchmarkPortfolio: {
		scicode: {
			group: "baseline",
			intelligencePortion: 0.8,
			agenticPortion: 0.2,
		},
		terminalbench_hard: {
			group: "baseline",
			intelligencePortion: 0.2,
			agenticPortion: 0.8,
		},
		terminal_bench_2: {
			group: "baseline",
			intelligencePortion: 0.2,
			agenticPortion: 0.8,
		},
		gdpval_normalized: {
			group: "frontier",
			intelligencePortion: 0.6,
			agenticPortion: 0.4,
		},
		apex_agents: {
			group: "frontier",
			intelligencePortion: 0.45,
			agenticPortion: 0.55,
		},
	},
	floorImputedBenchmarkKeys: ["apex_agents"],
	overallRelativeScoreWeights: {
		intelligence: 0.4,
		agentic: 0.4,
		speed: 0.1,
		value: 0.1,
	},
	columnTooltips: {},
} as const;
const benchmarkImputationByModel = buildBenchmarkImputationByModel(
	scoringRows,
	scoringConfig,
);
const qualityScoringContext = buildQualityScoringContext(
	scoringRows,
	scoringConfig,
	benchmarkImputationByModel,
);
const emptySpeed = {
	throughput_tokens_per_second_median: null,
	latency_seconds_median: null,
	e2e_latency_seconds_median: null,
};
const scoreWithMissingApex = buildScores(
	scoringRows[3] ?? {},
	null,
	emptySpeed,
	[],
	scoringConfig,
	qualityScoringContext,
	benchmarkImputationByModel.get(scoringRows[3] ?? {}),
);
assertDeepEqual(scoreWithMissingApex, {
	agentic_score: 57.6315789473684,
	intelligence_score: null,
	value_score: null,
	speed_score: null,
});
