/** Exercises Terminal-Bench Astro parsing and model-name score matching. */

import {
	buildTerminalBenchMap,
	findTerminalBenchRows,
	processTerminalBenchPageHtml,
} from "../src/model-atlas/scrapers/vals/terminal-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function astro(value: unknown): unknown {
	if (Array.isArray(value)) {
		return [1, value.map(astro)];
	}
	if (value != null && typeof value === "object") {
		return [
			0,
			Object.fromEntries(
				Object.entries(value).map(([key, item]) => [key, astro(item)]),
			),
		];
	}
	return [0, value];
}

const props = {
	benchmarkView: astro({
		default: {
			metadata: {
				benchmark: "Terminal-Bench 2.1",
				slug: "terminal-bench-2-1",
				version: "2.1",
				updated: "2026-07-01",
				dataset_type: "public",
				industry: "coding",
				tasks: {
					overall: "Overall",
					hard: "Hard",
				},
			},
			tasks: {
				overall: {
					"anthropic/claude-fable-5": {
						accuracy: 80.524,
						latency: 504.537,
						cost_per_test: 1.429025,
						provider: "Anthropic",
						harness: null,
					},
					"anthropic/claude-opus-4-8": {
						accuracy: 71.91,
						latency: 929.902,
						cost_per_test: 2.409772,
						provider: "Anthropic",
						harness: null,
					},
					"anthropic/claude-opus-4-8-claude-code": {
						accuracy: 69.663,
						latency: 359.967,
						cost_per_test: 0.968098,
						provider: "Anthropic",
						harness: "Claude Code",
					},
				},
				hard: {
					"anthropic/claude-fable-5": {
						accuracy: 70,
						latency: 1496.794,
						cost_per_test: 1.271832,
						provider: "Anthropic",
						harness: null,
					},
					"anthropic/claude-opus-4-8-claude-code": {
						accuracy: 60,
						latency: 1250,
						cost_per_test: 1.2,
						provider: "Anthropic",
						harness: "Claude Code",
					},
				},
			},
		},
	}),
};
const pageHtml = `<astro-island component-url="/_astro/BenchmarkView.hash.js" props="${JSON.stringify(props).replace(/"/g, "&quot;")}"></astro-island>`;
const parsed = processTerminalBenchPageHtml(pageHtml);

assertDeepEqual(parsed.metadata, {
	benchmark: "Terminal-Bench 2.1",
	slug: "terminal-bench-2-1",
	version: "2.1",
	updated: "2026-07-01",
	dataset_type: "public",
	industry: "coding",
	task_labels: {
		overall: "Overall",
		hard: "Hard",
	},
});
assertDeepEqual(parsed.model_scores, [
	{
		task: "overall",
		task_label: "Overall",
		source_model_id: "anthropic/claude-fable-5",
		model_id: "anthropic/claude-fable-5",
		model: "claude-fable-5",
		provider: "Anthropic",
		harness: null,
		score: 0.80524,
		cost_per_task_usd: 1.429025,
		seconds_per_task: 504.537,
	},
	{
		task: "overall",
		task_label: "Overall",
		source_model_id: "anthropic/claude-opus-4-8",
		model_id: "anthropic/claude-opus-4-8",
		model: "claude-opus-4-8",
		provider: "Anthropic",
		harness: null,
		score: 0.7191,
		cost_per_task_usd: 2.409772,
		seconds_per_task: 929.902,
	},
	{
		task: "overall",
		task_label: "Overall",
		source_model_id: "anthropic/claude-opus-4-8-claude-code",
		model_id: "anthropic/claude-opus-4-8",
		model: "claude-opus-4-8",
		provider: "Anthropic",
		harness: "Claude Code",
		score: 0.69663,
		cost_per_task_usd: 0.968098,
		seconds_per_task: 359.967,
	},
]);
assertDeepEqual(
	parsed.task_rows.find(
		(row) =>
			row.task === "hard" &&
			row.source_model_id === "anthropic/claude-opus-4-8-claude-code",
	),
	{
		task: "hard",
		task_label: "Hard",
		source_model_id: "anthropic/claude-opus-4-8-claude-code",
		model_id: "anthropic/claude-opus-4-8-claude-code",
		model: "claude-opus-4-8-claude-code",
		provider: "Anthropic",
		harness: "Claude Code",
		score: 0.6,
		cost_per_task_usd: 1.2,
		seconds_per_task: 1250,
	},
);

const rowsByModelName = buildTerminalBenchMap(parsed.model_scores);
assertDeepEqual(
	findTerminalBenchRows(["Claude Fable 5"], rowsByModelName).map(
		(row) => row.score,
	),
	[0.80524],
);
assertDeepEqual(
	findTerminalBenchRows(["anthropic/claude-opus-4-8"], rowsByModelName).map(
		(row) => row.harness,
	),
	[null, "Claude Code"],
);
assertDeepEqual(processTerminalBenchPageHtml("<main>No island</main>"), {
	metadata: null,
	task_rows: [],
	model_scores: [],
});
