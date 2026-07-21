/** Verifies AA evaluation-page resource parsing for benchmark telemetry. */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES,
	buildArtificialAnalysisDefaultEffortResourceMap,
	buildArtificialAnalysisObservationResourceMap,
	findArtificialAnalysisEvaluationResourceRow,
	getArtificialAnalysisEvaluationResourceStats,
	processArtificialAnalysisEvaluationResourceRows,
} from "../src/model-atlas/scrapers/artificial-analysis/benchmark-resources";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const hlePage = {
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
const configuredItbenchPage =
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES.find(
		(page) => page.benchmark_key === "itbench_sre",
	);
if (configuredItbenchPage == null) {
	throw new Error("ITBench evaluation resource page is missing");
}
assertDeepEqual(configuredItbenchPage, {
	benchmark_key: "itbench_sre",
	score_key: "it_bench_sre",
	url: "https://artificialanalysis.ai/evaluations/itbench-aa",
	task_run_count: 177,
});
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
const hleRows = processArtificialAnalysisEvaluationResourceRows(
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
	hlePage,
);

assertDeepEqual(hleRows, [
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

const hleRowsByBenchmark =
	buildArtificialAnalysisDefaultEffortResourceMap(hleRows);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"hle",
		["Claude Fable 5 max"],
		hleRowsByBenchmark,
	)?.cost_per_task_usd,
	2,
);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"critpt",
		["Claude Fable 5 max"],
		hleRowsByBenchmark,
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
				short_name: "GPT-5.6 Sol (max)",
				slug: "gpt-5-6-sol",
				model_creators: {
					name: "OpenAI",
					slug: "openai",
				},
				it_bench_sre: 0.56,
				evalCost: { total: 177 },
				evalTimePerTask: 100,
				tokenCounts: {
					inputTokens: 17_700,
					answerTokens: 1_770,
					reasoningTokens: 1_770,
					outputTokens: 3_540,
				},
			},
		],
		configuredItbenchPage,
	)[0],
	{
		benchmark_key: "itbench_sre",
		source_url: "https://artificialanalysis.ai/evaluations/itbench-aa",
		model_id: "openai/gpt-5-6-sol",
		model: "GPT-5.6 Sol (max)",
		provider: "OpenAI",
		provider_id: "openai",
		reasoning_effort: "max",
		score: 0.56,
		task_run_count: 177,
		cost_per_task_usd: 1,
		seconds_per_task: 100,
		tokens_per_task: 120,
		input_tokens_per_task: 100,
		output_tokens_per_task: 20,
		answer_tokens_per_task: 10,
		reasoning_tokens_per_task: 10,
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
			hle: 0.4,
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
		{
			short_name: "GPT-5.2 (max)",
			slug: "gpt-5-2-max",
			model_creators: {
				name: "OpenAI",
				slug: "openai",
			},
			hle: 0.35,
			evalCost: {
				total: 6,
			},
			evalTimePerTask: 60,
			tokenCounts: {
				inputTokens: 100,
				outputTokens: 140,
			},
		},
	],
	hlePage,
);
const effortRowsByBenchmark =
	buildArtificialAnalysisDefaultEffortResourceMap(effortRows);
const effortObservationsByBenchmark =
	buildArtificialAnalysisObservationResourceMap(effortRows);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"hle",
		["openai/gpt-5-2-non-reasoning"],
		effortObservationsByBenchmark,
	)?.reasoning_effort,
	"none",
);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"hle",
		["openai/gpt-5-2-low"],
		effortObservationsByBenchmark,
	)?.reasoning_effort,
	"low",
);
assertDeepEqual(
	findArtificialAnalysisEvaluationResourceRow(
		"hle",
		["openai/gpt-5-2-max"],
		effortObservationsByBenchmark,
	)?.reasoning_effort,
	"max",
);
for (const candidateName of [
	"GPT-5.2",
	"GPT-5.2 low",
	"GPT-5.2 xhigh",
	"openai/gpt-5-2-non-reasoning",
	"openai/gpt-5-2-low",
	"openai/gpt-5-2",
	"openai/gpt-5-2-max",
]) {
	const defaultRow = findArtificialAnalysisEvaluationResourceRow(
		"hle",
		[candidateName],
		effortRowsByBenchmark,
	);
	assertDeepEqual(defaultRow?.reasoning_effort, "max");
	assertDeepEqual(defaultRow?.score, 0.35);
	assertDeepEqual(defaultRow?.cost_per_task_usd, 3);
}

let activeRequests = 0;
let maxActiveRequests = 0;
let completedRequests = 0;
const server = createServer((_request, response) => {
	activeRequests += 1;
	maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
	setTimeout(() => {
		activeRequests -= 1;
		completedRequests += 1;
		response.writeHead(404, { "content-type": "text/plain" });
		response.end("not found");
	}, 20);
});

await new Promise<void>((resolve) => {
	server.listen(0, "127.0.0.1", resolve);
});
try {
	const address = server.address() as AddressInfo;
	await getArtificialAnalysisEvaluationResourceStats({
		concurrency: 2,
		requestJitterMs: 0,
		timeoutMs: 1_000,
		pages: Array.from({ length: 6 }, (_, index) => ({
			benchmark_key: `test_${index}`,
			url: `http://127.0.0.1:${address.port}/${index}`,
			task_run_count: 1,
		})),
	});
	assertDeepEqual(completedRequests, 6);
	assertDeepEqual(maxActiveRequests, 2);
} finally {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
