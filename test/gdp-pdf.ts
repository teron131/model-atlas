/** Verifies GDP.pdf parsing and matching through the shared benchmark-observation contract. */

import {
  buildBenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../src/model-atlas/benchmarks/observation";
import {
  processSurgeBenchmarkPageHtml,
  surgeLeaderboardScoreRows,
} from "../src/model-atlas/benchmarks/scrapers/surge/results";

function assertDeepEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

const pageHtml = `
	<h2 class="renamed-ranking-title">Model Rankings</h2>
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
	<div role="listitem" class="renamed-ranking-row">
		<div data-leaderboard-rank="">3</div>
		<img data-alt="Wrong logo" alt='Google logo' />
		<div class="head-rank-table-name-wrap">
			<div class="head-rank-table-brand"><div class="txt fs-10 fw-med">Gemini</div></div>
			<div class="head-rank-table-name"><div class="txt fs-14 fw-med">3 Pro</div></div>
		</div>
		<div data-data-score="99" data-score='22' fs-list-field="foundational-score" class="txt fs-14">22</div><div>%</div>
	</div>
	<div role="listitem" class="lead-rank-corecraft-item w-dyn-item">
		<div data-leaderboard-rank="">4</div>
		<img alt="Example logo" />
		<div class="txt fs-14 fw-med corecraft-model is-logo">Invalid Score</div>
		<div data-score="105">105</div><div>%</div>
	</div>
	<section id="newsletter"></section>
`;
const rows = surgeLeaderboardScoreRows(pageHtml);

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
  {
    provider: "Google",
    model: "Gemini 3 Pro",
    score: 0.22,
    last_updated: "06/06/2026",
  },
]);

const rowsWithoutRankingHeading = surgeLeaderboardScoreRows(`
	<div class="txt fs-12">Last updated 06/06/2026</div>
	<div class="renamed-ranking-row" data-kind="score-row" role = 'listitem'>
		<img alt="Google logo" />
		<div class="head-rank-table-name-wrap">
			<div class="head-rank-table-brand"><div class="txt fs-10 fw-med">Gemini</div></div>
			<div class="head-rank-table-name"><div class="txt fs-14 fw-med">3 Pro</div></div>
		</div>
		<div data-score="22" fs-list-field="foundational-score" class="txt fs-14">22</div><div>%</div>
	</div>
`);

assertDeepEqual(rowsWithoutRankingHeading, [
  {
    provider: "Google",
    model: "Gemini 3 Pro",
    score: 0.22,
    last_updated: "06/06/2026",
  },
]);

const observationRows = processSurgeBenchmarkPageHtml(
  pageHtml,
  "gdp_pdf",
  "https://surgehq.ai/leaderboards/gdp-pdf",
);
const rowsByModelName = buildBenchmarkObservationLookup(observationRows);

assertDeepEqual(
  findBenchmarkObservation(["missing", "GPT-5.5"], "xhigh", rowsByModelName)?.canonical_value,
  0.25,
);
assertDeepEqual(
  findBenchmarkObservation(["Mythos 5"], null, rowsByModelName)?.canonical_value,
  0.3,
);
