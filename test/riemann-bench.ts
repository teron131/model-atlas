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
	<h2 class="renamed-ranking-title">Model Rankings</h2>
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
	<div role="listitem" class="renamed-ranking-row">
		<img alt='Google logo' />
		<div class="head-rank-table-name-wrap">
			<div class="head-rank-table-brand"><div class="txt fs-10 fw-med">Google</div></div>
			<div class="head-rank-table-name"><div class="txt fs-14 fw-med">Gemini 3 Pro</div></div>
		</div>
		<div data-score="" fs-list-field="foundational-score" class="txt fs-14">38</div><div>%</div>
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
	{
		provider: "Google",
		model: "Gemini 3 Pro",
		score: 0.38,
		last_updated: "05/27/2026",
	},
]);

const rowsWithoutRankingHeading = processRiemannBenchPageHtml(`
	<div class="txt fs-12">Last updated 05/27/2026</div>
	<div class="renamed-ranking-row" data-kind="score-row" role = 'listitem'>
		<img alt="Google logo" />
		<div class="head-rank-table-name-wrap">
			<div class="head-rank-table-brand"><div class="txt fs-10 fw-med">Google</div></div>
			<div class="head-rank-table-name"><div class="txt fs-14 fw-med">Gemini 3 Pro</div></div>
		</div>
		<div data-score="" fs-list-field="foundational-score" class="txt fs-14">38</div><div>%</div>
	</div>
`);

assertDeepEqual(rowsWithoutRankingHeading, [
	{
		provider: "Google",
		model: "Gemini 3 Pro",
		score: 0.38,
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
