import {
	buildRiemannBenchScoreByModelName,
	findRiemannBenchScore,
	processRiemannBenchPageHtml,
} from "../src/model-atlas/llm/scrapers/riemann-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processRiemannBenchPageHtml(`
	<div class="lead-rank-table-title">Model Rankings</div>
	<div class="txt fs-12">Last updated 05/27/2026</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<img alt="Anthropic logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">Claude Fable 5 / Mythos 5</div>
		<div data-score="" fs-list-field="foundational-score">55</div><div>%</div>
	</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<img alt="OpenAI logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">GPT-5.5 (xHigh reasoning)</div>
		<div data-score="" fs-list-field="foundational-score">41.6</div><div>%</div>
	</div>
	<section id="newsletter"></section>
`);

assertDeepEqual(rows, [
	{
		provider: "Anthropic",
		model: "Claude Fable 5 / Mythos 5",
		score: 0.55,
		last_updated: "05/27/2026",
	},
	{
		provider: "OpenAI",
		model: "GPT-5.5 (xHigh reasoning)",
		score: 0.416,
		last_updated: "05/27/2026",
	},
]);

const scoreByModelName = buildRiemannBenchScoreByModelName(rows);

assertDeepEqual(
	findRiemannBenchScore(["missing", "GPT 5.5"], scoreByModelName),
	0.416,
);

assertDeepEqual(
	findRiemannBenchScore(["Claude Fable 5"], scoreByModelName),
	0.55,
);
