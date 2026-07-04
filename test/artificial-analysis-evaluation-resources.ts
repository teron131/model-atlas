/** Verifies AA evaluation-page resource parsing for benchmark telemetry. */

import {
	buildArtificialAnalysisEvaluationResourceMap,
	findArtificialAnalysisEvaluationResourceRow,
	processArtificialAnalysisEvaluationResourceRows,
} from "../src/model-atlas/scrapers/artificial-analysis/evaluation-resources";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const page = {
	benchmark_key: "hle",
	url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
	task_count: 2,
};
const terminalBenchPage = {
	benchmark_key: "terminalbench_v21",
	score_key: "terminalbench_v2_1",
	url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
	task_count: 2,
};

const rows = processArtificialAnalysisEvaluationResourceRows(
	[
		{
			name: "Claude Fable 5 (Adaptive Reasoning, Max Effort)",
			short_name: "Claude Fable 5 (max)",
			slug: "claude-fable-5",
			model_creators: {
				name: "Anthropic",
				slug: "anthropic",
			},
			hle: 0.42,
			evalCost: {
				total: 4,
			},
			evalTimePerTask: 12,
			tokenCounts: {
				inputTokens: 20,
				answerTokens: 30,
				reasoningTokens: 50,
				outputTokens: 80,
			},
		},
		{
			name: "Missing Score",
			slug: "missing-score",
			model_creators: {
				name: "Test",
				slug: "test",
			},
			evalCost: {
				total: 4,
			},
			evalTimePerTask: 12,
			tokenCounts: {
				inputTokens: 20,
				outputTokens: 80,
			},
		},
	],
	page,
);

assertDeepEqual(rows, [
	{
		benchmark_key: "hle",
		source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
		model_id: "anthropic/claude-fable-5",
		model: "Claude Fable 5 (max)",
		provider: "Anthropic",
		provider_id: "anthropic",
		reasoning_effort: "max",
		score: 0.42,
		task_count: 2,
		cost_per_task_usd: 2,
		seconds_per_task: 12,
		tokens_per_task: 50,
		input_tokens_per_task: 10,
		output_tokens_per_task: 40,
		answer_tokens_per_task: 15,
		reasoning_tokens_per_task: 25,
	},
]);

const rowsByBenchmark = buildArtificialAnalysisEvaluationResourceMap(rows);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"hle",
		["Claude Fable 5 max"],
		rowsByBenchmark,
	)?.cost_per_task_usd,
	2,
);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"critpt",
		["Claude Fable 5 max"],
		rowsByBenchmark,
	),
	null,
);

assertDeepEqual(
	processArtificialAnalysisEvaluationResourceRows(
		[
			{
				short_name: "GPT-5.5 (xhigh)",
				slug: "gpt-5-5",
				model_creators: {
					name: "OpenAI",
					slug: "openai",
				},
				terminalbench_v2_1: 0.84,
				evalCost: {
					total: 2,
				},
				evalTimePerTask: 100,
				tokenCounts: {
					inputTokens: 8,
					outputTokens: 12,
				},
			},
		],
		terminalBenchPage,
	)[0],
	{
		benchmark_key: "terminalbench_v21",
		source_url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
		model_id: "openai/gpt-5-5",
		model: "GPT-5.5 (xhigh)",
		provider: "OpenAI",
		provider_id: "openai",
		reasoning_effort: "xhigh",
		score: 0.84,
		task_count: 2,
		cost_per_task_usd: 1,
		seconds_per_task: 100,
		tokens_per_task: 10,
		input_tokens_per_task: 4,
		output_tokens_per_task: 6,
		answer_tokens_per_task: null,
		reasoning_tokens_per_task: null,
	},
);

const effortRows = processArtificialAnalysisEvaluationResourceRows(
	[
		{
			short_name: "GPT-5.2",
			slug: "gpt-5-2-non-reasoning",
			model_creators: {
				name: "OpenAI",
				slug: "openai",
			},
			hle: 0.1,
			evalCost: {
				total: 0.2,
			},
			evalTimePerTask: 2,
			tokenCounts: {
				inputTokens: 8,
				outputTokens: 12,
			},
		},
		{
			short_name: "GPT-5.2 (low)",
			slug: "gpt-5-2-low",
			model_creators: {
				name: "OpenAI",
				slug: "openai",
			},
			hle: 0.2,
			evalCost: {
				total: 1,
			},
			evalTimePerTask: 10,
			tokenCounts: {
				inputTokens: 20,
				outputTokens: 30,
			},
		},
		{
			short_name: "GPT-5.2 (xhigh)",
			slug: "gpt-5-2",
			model_creators: {
				name: "OpenAI",
				slug: "openai",
			},
			hle: 0.3,
			evalCost: {
				total: 4,
			},
			evalTimePerTask: 40,
			tokenCounts: {
				inputTokens: 80,
				outputTokens: 120,
			},
		},
	],
	page,
);
const effortRowsByBenchmark =
	buildArtificialAnalysisEvaluationResourceMap(effortRows);
for (const candidateName of [
	"GPT-5.2",
	"GPT-5.2 low",
	"GPT-5.2 xhigh",
	"openai/gpt-5-2-non-reasoning",
	"openai/gpt-5-2-low",
	"openai/gpt-5-2",
]) {
	assertDeepEqual(
		findArtificialAnalysisEvaluationResourceRow(
			"hle",
			[candidateName],
			effortRowsByBenchmark,
		)?.reasoning_effort,
		"xhigh",
	);
}
