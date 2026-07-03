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
