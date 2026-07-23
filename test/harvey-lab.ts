/** Verifies Harvey LAB parsing, strict-score selection, configuration retention, and model matching. */

import {
	buildHarveyLabMap,
	processHarveyLabPageHtml,
} from "../src/model-atlas/benchmarks/scrapers/vals/harvey-lab";

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
				benchmark: "Harvey's Legal Agent Benchmark",
				slug: "hlab",
				version: "1",
				updated: "2026-07-17",
				dataset_type: "public",
				industry: "legal",
				tasks: {
					overall: "Overall",
					corporate_ma: "Corporate M&A",
					criteria_pass_rate: "Criteria Pass Rate",
				},
			},
			tasks: {
				overall: {
					"kimi/kimi-k3": {
						accuracy: 10.833333333333334,
						stderr: 2.287,
						latency: 2842.762,
						cost_per_test: null,
						temperature: 1,
						max_output_tokens: 262144,
						provider: "Moonshot AI",
					},
					"anthropic/claude-fable-5": {
						accuracy: 11.25,
						stderr: 2.4,
						latency: 1613.04,
						cost_per_test: 19.225253,
						compute_effort: "max",
						provider: "Anthropic",
					},
				},
				criteria_pass_rate: {
					"kimi/kimi-k3": {
						accuracy: 90.7946,
						provider: "Moonshot AI",
					},
					"anthropic/claude-fable-5": {
						accuracy: 90.48,
						compute_effort: "max",
						provider: "Anthropic",
					},
				},
				corporate_ma: {
					"kimi/kimi-k3": {
						accuracy: 20,
						provider: "Moonshot AI",
					},
				},
			},
		},
	}),
};
const pageHtml = `<astro-island component-url="/_astro/BenchmarkView.hash.js" props="${JSON.stringify(props).replace(/"/g, "&quot;")}"></astro-island>`;
const parsed = processHarveyLabPageHtml(pageHtml);

assertDeepEqual(parsed.metadata, {
	benchmark: "Harvey's Legal Agent Benchmark",
	slug: "hlab",
	version: "1",
	updated: "2026-07-17",
	dataset_type: "public",
	industry: "legal",
	task_labels: {
		overall: "Overall",
		corporate_ma: "Corporate M&A",
		criteria_pass_rate: "Criteria Pass Rate",
	},
});

assertDeepEqual(parsed.model_scores, [
	{
		task: "overall",
		task_label: "Overall",
		metric: "task_resolution",
		model_id: "anthropic/claude-fable-5",
		model: "claude-fable-5 (max)",
		base_model: "claude-fable-5",
		reasoning_effort: "max",
		provider: "Anthropic",
		rank: 1,
		score: 0.1125,
		criterion_pass: 0.9048,
		standard_error: 0.024,
		cost_per_task_usd: 19.225253,
		seconds_per_task: 1613.04,
		temperature: null,
		top_p: null,
		max_output_tokens: null,
		verbosity: null,
		compute_effort: "max",
		harness: null,
	},
	{
		task: "overall",
		task_label: "Overall",
		metric: "task_resolution",
		model_id: "kimi/kimi-k3",
		model: "kimi-k3",
		base_model: "kimi-k3",
		reasoning_effort: null,
		provider: "Moonshot AI",
		rank: 2,
		score: 0.108333,
		criterion_pass: 0.907946,
		standard_error: 0.02287,
		cost_per_task_usd: null,
		seconds_per_task: 2842.762,
		temperature: 1,
		top_p: null,
		max_output_tokens: 262144,
		verbosity: null,
		compute_effort: null,
		harness: null,
	},
]);

assertDeepEqual(parsed.task_rows.length, 5);
assertDeepEqual(
	parsed.task_rows.find(
		(row) => row.model_id === "kimi/kimi-k3" && row.task === "corporate_ma",
	)?.metric,
	"task_resolution",
);

const rowsByModelName = buildHarveyLabMap(parsed.model_scores);
assertDeepEqual(rowsByModelName.get("kimi/kimi-k3")?.score, 0.108333);
assertDeepEqual(rowsByModelName.get("claude-fable-5")?.score, 0.1125);
assertDeepEqual(rowsByModelName.get("claude-fable-5-max")?.score, 0.1125);

assertDeepEqual(processHarveyLabPageHtml("<main>No island</main>"), {
	metadata: null,
	task_rows: [],
	model_scores: [],
});
