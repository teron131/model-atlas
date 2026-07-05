/** Verifies Terminal-Bench aggregate score/resource policy across source rows. */

import { terminalBenchAggregateRow } from "../src/model-atlas/stats/benchmarks/terminal-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

assertDeepEqual(
	terminalBenchAggregateRow({
		artificialAnalysisScore: 0.84,
		resourceRow: {
			benchmark_key: "terminalbench_v21",
			source_url:
				"https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
			model_id: "anthropic/claude-fable-5",
			model: "Claude Fable 5",
			provider: "Anthropic",
			provider_id: "anthropic",
			reasoning_effort: null,
			score: 0.84,
			task_run_count: 267,
			cost_per_task_usd: 1.1,
			seconds_per_task: 420,
			tokens_per_task: 300_000,
			input_tokens_per_task: 280_000,
			output_tokens_per_task: 20_000,
			answer_tokens_per_task: null,
			reasoning_tokens_per_task: null,
		},
		harnessRows: [
			{
				task: "overall",
				task_label: "Overall",
				source_model_id: "anthropic/claude-fable-5",
				model_id: "anthropic/claude-fable-5",
				model: "claude-fable-5",
				provider: "Anthropic",
				harness: null,
				score: 0.8,
				cost_per_task_usd: 1.3,
				seconds_per_task: 500,
			},
		],
	}),
	{
		model_id: "anthropic/claude-fable-5",
		model: "Claude Fable 5",
		provider: "Anthropic",
		harness: null,
		sources: ["artificial_analysis", "vals"],
		source_count: 2,
		score: 0.84,
		cost_per_task_usd: 1.2000000000000002,
		seconds_per_task: 460,
		tokens_per_task: 300000,
		input_tokens_per_task: 280000,
		output_tokens_per_task: 20000,
	},
);
