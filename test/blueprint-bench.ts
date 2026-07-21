import {
	buildBlueprintBenchMap,
	findBlueprintBenchScore,
	processBlueprintBenchPageHtml,
} from "../src/model-atlas/scrapers/blueprint-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processBlueprintBenchPageHtml(`
	<h3>Leaderboard</h3>
	<table>
		<thead><tr><th></th><th>Model</th><th>Score</th></tr></thead>
		<tbody>
			<tr><td>1</td><td>Human*</td><td>0.586</td></tr>
			<tr><td colspan="3">Leaderboard note</td></tr>
			<tr><td>2</td><td>Claude Fable 5</td><td>0.386</td></tr>
			<tr><td>3</td><td>GPT 5.5</td><td>0.362</td></tr>
			<tr><td>11</td><td>Gemini 3 Flash</td><td>0.000**</td></tr>
		</tbody>
	</table>
	<p>**Score at or below the random baseline</p>
	<h2>The eval</h2>
`);

assertDeepEqual(rows, [
	{
		model: "Claude Fable 5",
		score: 0.386,
	},
	{
		model: "GPT 5.5",
		score: 0.362,
	},
	{
		model: "Gemini 3 Flash",
		score: 0,
	},
]);

const rowsByModelName = buildBlueprintBenchMap(rows);

assertDeepEqual(
	findBlueprintBenchScore(["missing", "GPT-5.5"], rowsByModelName),
	0.362,
);

assertDeepEqual(
	findBlueprintBenchScore(["Gemini 3 Flash"], rowsByModelName),
	0,
);
