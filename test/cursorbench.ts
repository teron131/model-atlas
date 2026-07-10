/** Verifies CursorBench parsing, canonical names, and default-effort selection. */

import {
	buildCursorBenchMap,
	findCursorBenchScore,
	processCursorBenchPageHtml,
} from "../src/model-atlas/scrapers/cursorbench";

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
			<tr><td>1</td><td>Fable 5 Max</td><td>72.9</td><td>%</td><td>$</td><td>18.02</td><td>63,842</td><td>76</td></tr>
			<tr><td>2</td><td>Composer 2.5</td><td>63.2%</td><td>$0.55</td><td>15,152</td><td>37</td></tr>
			<tr><td>3</td><td>GPT-5.5 Medium</td><td>59.2%</td><td>$2.22</td><td>9,065</td><td>35</td></tr>
			<tr><td>4</td><td>Gemini 3.5 Flash</td><td>49.8%</td><td>$1.94</td><td>35,105</td><td>79</td></tr>
			<tr><td>5</td><td>Opus 4.8 High</td><td>58.4%</td><td>$4.41</td><td>36,788</td><td>45</td></tr>
			<tr><td>6</td><td>Kimi 2.6</td><td>47.6%</td><td>$1.27</td><td>24,783</td><td>56</td></tr>
			<tr><td>7</td><td>Claude Opus 4.8 Ultra</td><td>55.0%</td><td>$4.80</td><td>37,000</td><td>46</td></tr>
			<tr><td>8</td><td>Claude Fable 5 Non Reasoning</td><td>45.0%</td><td>$1.80</td><td>17,000</td><td>40</td></tr>
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
	{
		rank: 5,
		model: "Opus 4.8 High",
		base_model: "Opus 4.8",
		reasoning_effort: "High",
		score: 0.584,
		cost_per_task_usd: 4.41,
		tokens_per_task: 36788,
		steps_per_task: 45,
	},
	{
		rank: 6,
		model: "Kimi 2.6",
		base_model: "Kimi 2.6",
		reasoning_effort: null,
		score: 0.476,
		cost_per_task_usd: 1.27,
		tokens_per_task: 24783,
		steps_per_task: 56,
	},
	{
		rank: 7,
		model: "Claude Opus 4.8 Ultra",
		base_model: "Claude Opus 4.8",
		reasoning_effort: "Ultra",
		score: 0.55,
		cost_per_task_usd: 4.8,
		tokens_per_task: 37000,
		steps_per_task: 46,
	},
	{
		rank: 8,
		model: "Claude Fable 5 Non Reasoning",
		base_model: "Claude Fable 5",
		reasoning_effort: "Non Reasoning",
		score: 0.45,
		cost_per_task_usd: 1.8,
		tokens_per_task: 17000,
		steps_per_task: 40,
	},
]);

const compactRows = processCursorBenchPageHtml(`
	Model Score Cost Cost / task Tokens Tokens / task Steps Steps / task
	1 GPT-5.5 Medium 59.2% $2.22 9,065 35
	Changelog
`);

assertDeepEqual(compactRows, [
	{
		rank: 1,
		model: "GPT-5.5 Medium",
		base_model: "GPT-5.5",
		reasoning_effort: "Medium",
		score: 0.592,
		cost_per_task_usd: 2.22,
		tokens_per_task: 9065,
		steps_per_task: 35,
	},
]);

const scoreByModelName = buildCursorBenchMap(rows);

assertDeepEqual(
	findCursorBenchScore(["missing", "GPT 5.5 Medium"], scoreByModelName),
	0.592,
);

assertDeepEqual(
	findCursorBenchScore(["Claude Opus 4.8"], scoreByModelName),
	0.55,
);

assertDeepEqual(findCursorBenchScore(["Kimi K2.6"], scoreByModelName), 0.476);

assertDeepEqual(findCursorBenchScore(["Composer 2.5"], scoreByModelName), null);

const sourceDefaultRow = rows.find((row) => row.model === "Gemini 3.5 Flash");
if (sourceDefaultRow == null) {
	throw new Error("Expected the source-default Gemini fixture row");
}
const sourceDefaultScoreByModelName = buildCursorBenchMap([
	sourceDefaultRow,
	{
		...sourceDefaultRow,
		model: "Gemini 3.5 Flash High",
		reasoning_effort: "High",
		score: 0.9,
	},
]);
assertDeepEqual(
	findCursorBenchScore(["Gemini 3.5 Flash"], sourceDefaultScoreByModelName),
	0.498,
);
