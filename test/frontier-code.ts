/** Verifies FrontierCode 1.1 effort preservation, official-best provenance, eligibility, and resource parsing. */

import assert from "node:assert/strict";

import { processFrontierCodePayload } from "../src/model-atlas/scrapers/frontier-code";

function metrics(score: number, passRate = score + 0.05) {
	return {
		correct: Number(passRate.toFixed(6)),
		new_score: score,
		cost: 6.3,
		tokens: 33_167.8,
		tool_calls: null,
		steps: 24,
		ote: null,
	};
}

const rows = processFrontierCodePayload({
	v1_1: {
		models: ["Claude Fable 5", "GPT-5.6 Sol", "SWE-1.7"],
		efforts: {
			"Claude Fable 5": ["xhigh", "max"],
			"GPT-5.6 Sol": ["max"],
			"SWE-1.7": ["none"],
		},
		harness: {
			"Claude Fable 5": "claude-code",
			"GPT-5.6 Sol": "codex",
			"SWE-1.7": "devin",
		},
		subsets: { main: 100, extended: 150 },
		data: {
			"Claude Fable 5": {
				xhigh: { main: metrics(0.535), extended: metrics(0.649) },
				max: { main: metrics(0.516), extended: metrics(0.636) },
			},
			"GPT-5.6 Sol": {
				max: { main: metrics(0.475), extended: metrics(0.606) },
			},
			"SWE-1.7": {
				none: { main: metrics(0.4233), extended: metrics(0.5461) },
			},
		},
	},
});

assert.equal(rows.length, 4);
assert.deepEqual(
	rows.map((row) => [
		row.model,
		row.reasoning_effort,
		row.official_rank,
		row.official_best_effort,
	]),
	[
		["Claude Fable 5 (xhigh)", "xhigh", 1, true],
		["Claude Fable 5 (max)", "max", 1, false],
		["GPT-5.6 Sol (max)", "max", 2, true],
		["SWE-1.7 (none)", "none", 3, true],
	],
);
assert.equal(rows[0]?.main.score, 0.535);
assert.equal(rows[0]?.main.pass_rate, 0.585);
assert.equal(rows[0]?.extended.score, 0.649);
assert.equal(rows[0]?.cost_per_task_usd, 6.3);
assert.equal(rows[0]?.tokens_per_task, 33_167.8);
assert.equal(rows[0]?.main.steps_per_task, 24);
assert.equal(rows[0]?.main.tool_calls_per_task, null);
assert.equal(
	rows.find((row) => row.base_model === "SWE-1.7")?.score_eligible,
	false,
);

assert.deepEqual(
	processFrontierCodePayload({
		v1_1: {
			models: ["Wrong revision shape"],
			efforts: {},
			harness: {},
			subsets: { main: 50, extended: 150 },
			data: {},
		},
	}),
	[],
);
