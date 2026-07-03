/** Verifies AA Terminal-Bench v2.1 resource row extraction and matching. */

import {
	buildTerminalBenchAAMap,
	findTerminalBenchAAResourceRow,
	processTerminalBenchAARows,
} from "../src/model-atlas/scrapers/artificial-analysis/terminal-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function effortRow(
	shortName: string,
	slug: string,
	provider = "OpenAI",
	providerSlug = "openai",
): unknown {
	return {
		short_name: shortName,
		slug,
		model_creators: { name: provider, slug: providerSlug },
		evalCost: { total: 267 },
		evalTimePerTask: 100,
		tokenCounts: { inputTokens: 267, outputTokens: 267 },
	};
}

const rows = processTerminalBenchAARows([
	{
		name: "Claude Fable 5 (Adaptive Reasoning, Max Effort)",
		short_name: "Claude Fable 5 (max)",
		slug: "claude-fable-5",
		model_creators: {
			name: "Anthropic",
			slug: "anthropic",
		},
		evalCost: {
			total: 267,
		},
		evalTimePerTask: 123,
		tokenCounts: {
			inputTokens: 534,
			outputTokens: 2670,
		},
	},
	{
		name: "Missing Cost",
		slug: "missing-cost",
		model_creators: {
			name: "Test",
			slug: "test",
		},
		evalTimePerTask: 10,
		tokenCounts: {
			inputTokens: 1,
			outputTokens: 1,
		},
	},
]);

assertDeepEqual(rows, [
	{
		model_id: "anthropic/claude-fable-5",
		model: "Claude Fable 5 (max)",
		provider: "Anthropic",
		provider_id: "anthropic",
		reasoning_effort: "max",
		cost_per_task_usd: 1,
		seconds_per_task: 123,
		tokens_per_task: 12,
		input_tokens_per_task: 2,
		output_tokens_per_task: 10,
	},
]);

const rowsByModelName = buildTerminalBenchAAMap(rows);
assertDeepEqual(
	findTerminalBenchAAResourceRow(["anthropic/claude-fable-5"], rowsByModelName)
		?.cost_per_task_usd,
	1,
);
assertDeepEqual(
	findTerminalBenchAAResourceRow(["Claude Fable 5 max"], rowsByModelName)
		?.output_tokens_per_task,
	10,
);

const effortRows = processTerminalBenchAARows([
	effortRow("GPT-5.5 (xhigh)", "gpt-5-5"),
	effortRow("GPT-5.5 (medium)", "gpt-5-5-medium"),
	effortRow("GPT-5.5 (Non-reasoning)", "gpt-5-5-non-reasoning"),
	effortRow("Qwen 3.7 Max", "qwen3-7-max", "Alibaba", "alibaba"),
]);

assertDeepEqual(
	effortRows.map((row) => [row.model_id, row.reasoning_effort]),
	[
		["alibaba/qwen3-7-max", null],
		["openai/gpt-5-5", "xhigh"],
		["openai/gpt-5-5-medium", "medium"],
		["openai/gpt-5-5-non-reasoning", "non-reasoning"],
	],
);

assertDeepEqual(
	processTerminalBenchAARows([effortRow("GPT-5.5", "gpt-5-5-medium")])[0]
		?.reasoning_effort,
	null,
);

assertDeepEqual(
	processTerminalBenchAARows([
		effortRow("Example (not high)", "example", "Example", "example"),
	])[0]?.reasoning_effort,
	null,
);
