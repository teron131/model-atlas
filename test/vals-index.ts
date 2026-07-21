/** Exercises Vals Index Astro payload parsing and model-name score matching. */

import {
	buildValsIndexMap,
	findValsIndexScore,
	processValsIndexPageHtml,
} from "../src/model-atlas/scrapers/vals/index-benchmark";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function astro(value: unknown): unknown[] {
	return [0, value];
}

function astroArray(value: unknown[]): unknown[] {
	return [1, value];
}

function propsAttribute(value: unknown): string {
	return JSON.stringify(value).replace(/"/g, "&quot;");
}

const pageHtml = `
	<astro-island
		component-url="/_astro/BenchmarkView.C9mJF4S8.js"
		props="${propsAttribute({
			benchmarkView: astro({
				default: astro({
					metadata: astro({
						benchmark: astro("Vals Index"),
						slug: astro("vals_index"),
						version: astro("1.2"),
						updated: astro("2026-07-01"),
						dataset_type: astro("private"),
						industry: astro("index"),
						tasks: astro({
							overall: astro("Overall"),
							finance_agent: astro("Finance Agent v2"),
						}),
						models: astroArray([
							astro("anthropic/claude-fable-5"),
							astro("openai/gpt-5.5"),
						]),
					}),
					tasks: astro({
						overall: astro({
							"anthropic/claude-fable-5": astro({
								accuracy: astro(75.145),
								provider: astro("Anthropic"),
							}),
							"openai/gpt-5.5": astro({
								accuracy: astro(67.951),
								provider: astro("OpenAI"),
							}),
						}),
						finance_agent: astro({
							"anthropic/claude-fable-5": astro({
								accuracy: astro(82.5),
								provider: astro("Anthropic"),
							}),
							"bad/missing-accuracy": astro({
								latency: astro(1),
								provider: astro("Bad"),
							}),
						}),
					}),
				}),
			}),
			title: astro("Industry Average Accuracy Comparison"),
		})}"
	></astro-island>
`;

const parsed = processValsIndexPageHtml(pageHtml);

assertDeepEqual(parsed.metadata, {
	benchmark: "Vals Index",
	slug: "vals_index",
	version: "1.2",
	updated: "2026-07-01",
	dataset_type: "private",
	industry: "index",
	task_labels: {
		overall: "Overall",
		finance_agent: "Finance Agent v2",
	},
});

assertDeepEqual(parsed.model_scores, [
	{
		task: "overall",
		task_label: "Overall",
		model_id: "anthropic/claude-fable-5",
		model: "claude-fable-5",
		provider: "Anthropic",
		score: 0.75145,
	},
	{
		task: "overall",
		task_label: "Overall",
		model_id: "openai/gpt-5.5",
		model: "gpt-5.5",
		provider: "OpenAI",
		score: 0.67951,
	},
]);

assertDeepEqual(parsed.task_rows.length, 3);
assertDeepEqual(parsed.task_rows[0]?.task, "finance_agent");
assertDeepEqual(parsed.task_rows[0]?.score, 0.825);

const rowsByModelName = buildValsIndexMap(parsed.model_scores);

assertDeepEqual(
	findValsIndexScore(["missing", "Claude Fable 5"], rowsByModelName),
	0.75145,
);
assertDeepEqual(
	findValsIndexScore(["openai/gpt-5.5"], rowsByModelName),
	0.67951,
);
assertDeepEqual(
	findValsIndexScore(["bad/missing-accuracy"], rowsByModelName),
	null,
);

assertDeepEqual(processValsIndexPageHtml("<main>No island</main>"), {
	metadata: null,
	task_rows: [],
	model_scores: [],
});
