/** Exercises shared VALS hydration parsing, source-specific eligibility, metadata, and failure fallback. */

import assert from "node:assert/strict";

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkObservationKey,
} from "../src/model-atlas/benchmarks/registry";
import {
	getValsSourceStats,
	processValsBenchmarkPageHtml,
	type ValsBenchmarkDefinition,
} from "../src/model-atlas/scrapers/vals/common";

function astro(value: unknown): unknown[] {
	return [0, value];
}

function row(accuracy: number): unknown {
	return astro({
		accuracy: astro(accuracy),
		latency: astro(12.5),
		stderr: astro(4.25),
		cost_per_test: astro(1.75),
		temperature: astro(0.7),
		top_p: astro(0.95),
		max_output_tokens: astro(32_000),
		reasoning: astro({ budget_tokens: astro(8_000) }),
		reasoning_effort: astro("high"),
		verbosity: astro("medium"),
		compute_effort: astro("max"),
		provider: astro("OpenAI"),
		harness: astro("Source Harness"),
		task_results: astro({ sample: astro({ passed: astro(true) }) }),
		usage: astro({ output_tokens: astro(123) }),
	});
}

function task(accuracy: number): unknown {
	return astro({ "openai/gpt-test": row(accuracy) });
}

const pageHtml = `<astro-island component-url="/_astro/BenchmarkView.hash.js" props="${JSON.stringify(
	{
		benchmarkView: astro({
			default: astro({
				metadata: astro({
					benchmark: astro("Synthetic VALS Bench"),
					slug: astro("synthetic"),
					benchmark_id: astro("synthetic_id"),
					family: astro("synthetic_family"),
					version: astro("2"),
					updated: astro("2026-07-21"),
					dataset_type: astro("private"),
					industry: astro("testing"),
					runner: astro("external"),
					mode: astro("agentic"),
					tasks: astro({
						overall: astro("Overall"),
						all_pass: astro("All-Pass"),
						partial: astro("Raw Pass Rate"),
						patch: astro("Patch"),
						secondary: astro("Secondary Evidence"),
					}),
				}),
				tasks: astro({
					overall: astro({
						"openai/gpt-test": row(75),
						"anthropic/claude-test": astro({
							accuracy: astro(50),
							provider: astro("Anthropic"),
						}),
					}),
					all_pass: task(65),
					partial: task(55),
					patch: task(45),
					secondary: task(35),
				}),
			}),
		}),
	},
).replace(/"/g, "&quot;")}"></astro-island>`;

const valsBenchmarkKeys = [
	"code_migration",
	"cyberbench",
	"emb",
	"finance_agent_v2",
	"legal_research",
	"medcode",
	"programbench",
	"public_benefits_bench",
	"vibe_code",
] as const satisfies readonly BenchmarkObservationKey[];

function valsDefinition(benchmarkKey: BenchmarkObservationKey) {
	const binding = BENCHMARK_OBSERVATION_BINDINGS.find(
		(candidate) => candidate.benchmark === benchmarkKey,
	);
	assert.ok(binding);
	assert.equal(binding.loader.kind, "vals");
	if (binding.loader.kind !== "vals") throw new Error("Expected VALS loader");
	return {
		benchmarkKey,
		canonicalTask: binding.loader.canonicalTask,
		includeReasoningEffortInModel:
			"includeReasoningEffortInModel" in binding.loader
				? binding.loader.includeReasoningEffortInModel
				: undefined,
		sourceUrl: binding.loader.sourceUrl,
	} satisfies ValsBenchmarkDefinition;
}

for (const benchmarkKey of valsBenchmarkKeys) {
	const definition = valsDefinition(benchmarkKey);
	const processPage = (html: string) =>
		processValsBenchmarkPageHtml(html, definition);
	const rows = processPage(pageHtml);
	assert.equal(rows.length, 6);
	assert.equal(
		rows.every((row) => row.benchmark_key === benchmarkKey),
		true,
	);
	assert.deepEqual(
		[
			...new Set(
				rows
					.filter((row) => row.score_eligible)
					.map((row) => row.metadata.task),
			),
		],
		[definition.canonicalTask],
	);
	assert.equal(
		rows.find((row) => row.metadata.task === "secondary")?.score_eligible,
		false,
	);
	assert.deepEqual(processPage("<main>Malformed</main>"), []);
}

const legalDefinition = valsDefinition("legal_research");
const legalRows = processValsBenchmarkPageHtml(pageHtml, legalDefinition);
const overall = legalRows.find(
	(row) =>
		row.model_id === "openai/gpt-test" && row.metadata.task === "overall",
);
assert.ok(overall);
assert.equal(overall.model, "gpt-test (high)");
assert.equal(overall.base_model, "gpt-test");
assert.equal(overall.reasoning_effort, "high");
assert.equal(overall.rank, 1);
assert.equal(overall.canonical_value, 0.75);
assert.equal(overall.reported_value, 75);
assert.equal(overall.standard_error, 4.25);
assert.equal(overall.metadata.task_label, "Overall");
assert.equal(overall.metadata.benchmark_version, "2");
assert.equal(overall.metadata.runner, "external");
assert.equal(overall.metadata.mode, "agentic");
assert.equal(overall.metadata.cost_per_test_usd, 1.75);
assert.equal(overall.metadata.latency_seconds, 12.5);
assert.equal(overall.metadata.temperature, 0.7);
assert.equal(overall.metadata.top_p, 0.95);
assert.equal(overall.metadata.max_output_tokens, 32_000);
assert.equal(overall.metadata.compute_effort, "max");
assert.equal(overall.metadata.harness, "Source Harness");
assert.equal(overall.metadata.reasoning, '{"budget_tokens":8000}');
assert.equal(overall.metadata.task_results, '{"sample":{"passed":true}}');
assert.equal(overall.metadata.usage, '{"output_tokens":123}');

void getValsSourceStats(legalDefinition, {
	url: "http://127.0.0.1:1",
	timeoutMs: 10,
}).then((payload) => {
	assert.deepEqual(payload, { fetched_at_epoch_seconds: null, data: [] });
});
