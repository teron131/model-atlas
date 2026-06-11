import {
	buildGdpPdfScoreByModelName,
	findGdpPdfScore,
	processGdpPdfPageHtml,
} from "../src/model-atlas/llm/scrapers/gdp-pdf";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processGdpPdfPageHtml(`
	<div class="lead-rank-table-title">Model Rankings</div>
	<div class="txt fs-12">Last updated 06/06/2026</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<div data-leaderboard-rank="">1</div>
		<img alt="Anthropic logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">Claude Fable 5 / Mythos 5</div>
		<div data-score="30">30</div><div>%</div>
	</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<div data-leaderboard-rank="">2</div>
		<img alt="OpenAI logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">GPT-5.5 (xHigh reasoning)</div>
		<div data-score="25">25</div><div>%</div>
	</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<div data-leaderboard-rank="">3</div>
		<img alt="Example logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">Invalid Score</div>
		<div data-score="105">105</div><div>%</div>
	</div>
	<section id="newsletter"></section>
`);

assertDeepEqual(rows, [
	{
		provider: "Anthropic",
		model: "Claude Fable 5 / Mythos 5",
		score: 0.3,
		last_updated: "06/06/2026",
	},
	{
		provider: "OpenAI",
		model: "GPT-5.5 (xHigh reasoning)",
		score: 0.25,
		last_updated: "06/06/2026",
	},
]);

const scoreByModelName = buildGdpPdfScoreByModelName(rows);

assertDeepEqual(
	findGdpPdfScore(["missing", "GPT-5.5"], scoreByModelName),
	0.25,
);
assertDeepEqual(findGdpPdfScore(["Mythos 5"], scoreByModelName), 0.3);
