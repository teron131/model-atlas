import {
	buildCursorBenchScoreByModelName,
	findCursorBenchScore,
	processCursorBenchPageHtml,
} from "../src/model-atlas/llm/scrapers/cursorbench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processCursorBenchPageHtml(`
	<table>
		<thead>
			<tr>
				<th>Model</th>
				<th>Score</th>
				<th>Cost</th>
				<th>Cost / task</th>
				<th>Tokens</th>
				<th>Tokens / task</th>
				<th>Steps</th>
				<th>Steps / task</th>
			</tr>
		</thead>
		<tbody>
			<tr><td>1</td><td>Fable 5 Max</td><td>72.9%</td><td>$18.02</td><td>63,842</td><td>76</td></tr>
			<tr><td>2</td><td>Composer 2.5</td><td>63.2%</td><td>$0.55</td><td>15,152</td><td>37</td></tr>
			<tr><td>3</td><td>GPT-5.5 Medium</td><td>59.2%</td><td>$2.22</td><td>9,065</td><td>35</td></tr>
			<tr><td>4</td><td>Gemini 3.5 Flash</td><td>49.8%</td><td>$1.94</td><td>35,105</td><td>79</td></tr>
		</tbody>
	</table>
	<h2>Changelog</h2>
`);

assertDeepEqual(rows, [
	{
		rank: 1,
		model: "Fable 5 Max",
		base_model: "Fable 5",
		reasoning_effort: "Max",
		score: 0.729,
		cost_per_task_usd: 18.02,
		tokens_per_task: 63842,
		steps_per_task: 76,
	},
	{
		rank: 3,
		model: "GPT-5.5 Medium",
		base_model: "GPT-5.5",
		reasoning_effort: "Medium",
		score: 0.592,
		cost_per_task_usd: 2.22,
		tokens_per_task: 9065,
		steps_per_task: 35,
	},
	{
		rank: 4,
		model: "Gemini 3.5 Flash",
		base_model: "Gemini 3.5 Flash",
		reasoning_effort: null,
		score: 0.498,
		cost_per_task_usd: 1.94,
		tokens_per_task: 35105,
		steps_per_task: 79,
	},
]);

const scoreByModelName = buildCursorBenchScoreByModelName(rows);

assertDeepEqual(
	findCursorBenchScore(["missing", "GPT 5.5 Medium"], scoreByModelName),
	0.592,
);

assertDeepEqual(findCursorBenchScore(["Composer 2.5"], scoreByModelName), null);
