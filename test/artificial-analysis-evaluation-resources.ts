/** Verifies AA evaluation-page resource parsing for benchmark telemetry. */

import {
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES,
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
	task_run_count: 2,
};
const terminalBenchPage = {
	benchmark_key: "terminalbench_v21",
	score_key: "terminalbench_v2_1",
	url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
	task_run_count: 2,
};
const configuredBriefcasePage =
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES.find(
		(page) => page.benchmark_key === "briefcase",
	);
if (configuredBriefcasePage == null) {
	throw new Error("Briefcase AA evaluation resource page is missing");
}
const briefcasePage = {
	...configuredBriefcasePage,
	task_run_count: 2,
};
const automationBenchPage = {
	benchmark_key: "automation_bench",
	score_path: ["automation_bench_breakdown", "summary", "completion"],
	url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
	task_run_count: 2,
};
const harveyLabPage = {
	benchmark_key: "harvey_lab",
	score_path: ["harvey_lab_breakdown", "all_pass"],
	url: "https://artificialanalysis.ai/evaluations/harvey-lab-aa",
	task_run_count: 2,
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
		task_run_count: 2,
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
		task_run_count: 2,
		cost_per_task_usd: 1,
		seconds_per_task: 100,
		tokens_per_task: 10,
		input_tokens_per_task: 4,
		output_tokens_per_task: 6,
		answer_tokens_per_task: null,
		reasoning_tokens_per_task: null,
	},
);

assertDeepEqual(
	processArtificialAnalysisEvaluationResourceRows(
		[
			{
				short_name: "Claude Fable 5 (max)",
				slug: "claude-fable-5",
				model_creators: {
					name: "Anthropic",
					slug: "anthropic",
				},
				briefcase: {
					elo: 1500,
					totalToolMs: 4000,
				},
				briefcaseCost: {
					total: 6,
				},
				canonicalEvalTokenCounts: {
					briefcase: {
						input: 20,
						answer: 30,
						reasoning: 50,
					},
				},
				timescaleData: {
					median_output_speed: 10,
				},
			},
		],
		briefcasePage,
	)[0]?.seconds_per_task,
	6,
);

assertDeepEqual(
	processArtificialAnalysisEvaluationResourceRows(
		[
			{
				short_name: "Claude Fable 5 (max)",
				slug: "claude-fable-5",
				model_creators: {
					name: "Anthropic",
					slug: "anthropic",
				},
				briefcase: {
					elo: 1500,
					totalToolMs: 4000,
				},
				briefcase_breakdown: {
					telemetry: {
						total_generation_ms: 18_000,
					},
				},
				briefcaseCost: {
					total: 6,
				},
				canonicalEvalTokenCounts: {
					briefcase: {
						input: 20,
						answer: 30,
						reasoning: 50,
					},
				},
				timescaleData: {
					median_output_speed: 10,
				},
			},
		],
		briefcasePage,
	)[0],
	{
		benchmark_key: "briefcase",
		source_url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
		model_id: "anthropic/claude-fable-5",
		model: "Claude Fable 5 (max)",
		provider: "Anthropic",
		provider_id: "anthropic",
		reasoning_effort: "max",
		score: 1500,
		task_run_count: 2,
		cost_per_task_usd: 3,
		seconds_per_task: 9,
		tokens_per_task: 50,
		input_tokens_per_task: 10,
		output_tokens_per_task: 40,
		answer_tokens_per_task: 15,
		reasoning_tokens_per_task: 25,
	},
);

assertDeepEqual(
	processArtificialAnalysisEvaluationResourceRows(
		[
			{
				short_name: "Grok 4.5",
				slug: "grok-4-5",
				model_creators: {
					name: "xAI",
					slug: "x-ai",
				},
				automation_bench_breakdown: {
					summary: {
						completion: 0.72,
					},
				},
				evalCost: {
					total: 1,
				},
				evalTimePerTask: 91,
				tokenCounts: {
					inputTokens: 20,
					answerTokens: 6,
					reasoningTokens: 4,
				},
			},
		],
		automationBenchPage,
	)[0],
	{
		benchmark_key: "automation_bench",
		source_url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
		model_id: "x-ai/grok-4-5",
		model: "Grok 4.5",
		provider: "xAI",
		provider_id: "x-ai",
		reasoning_effort: null,
		score: 0.72,
		task_run_count: 2,
		cost_per_task_usd: 0.5,
		seconds_per_task: 91,
		tokens_per_task: 15,
		input_tokens_per_task: 10,
		output_tokens_per_task: 5,
		answer_tokens_per_task: 3,
		reasoning_tokens_per_task: 2,
	},
);

assertDeepEqual(
	processArtificialAnalysisEvaluationResourceRows(
		[
			{
				short_name: "Claude Fable 5 (max)",
				slug: "claude-fable-5",
				model_creators: {
					name: "Anthropic",
					slug: "anthropic",
				},
				harvey_lab_breakdown: {
					all_pass: 0.142,
					criteria_pass: 0.9048,
					num_tasks: 120,
				},
				evalCost: {
					total: 8,
				},
				evalTimePerTask: 240,
				tokenCounts: {
					inputTokens: 200,
					answerTokens: 50,
					reasoningTokens: 30,
				},
			},
		],
		harveyLabPage,
	)[0],
	{
		benchmark_key: "harvey_lab",
		source_url: "https://artificialanalysis.ai/evaluations/harvey-lab-aa",
		model_id: "anthropic/claude-fable-5",
		model: "Claude Fable 5 (max)",
		provider: "Anthropic",
		provider_id: "anthropic",
		reasoning_effort: "max",
		score: 0.142,
		task_run_count: 2,
		cost_per_task_usd: 4,
		seconds_per_task: 240,
		tokens_per_task: 140,
		input_tokens_per_task: 100,
		output_tokens_per_task: 40,
		answer_tokens_per_task: 25,
		reasoning_tokens_per_task: 15,
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
