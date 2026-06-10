import {
	buildDeepSWEScoreByModelName,
	type DeepSWELeaderboardRow,
	findDeepSWEModelScore,
	summarizeDeepSWEBestModelScores,
	summarizeDeepSWEDefaultModelScores,
} from "../src/model-atlas/llm/scrapers/deep-swe";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

function row(model: string, passAt1: number): DeepSWELeaderboardRow {
	return {
		model,
		reasoning_effort: null,
		config: null,
		pass_at_1: passAt1,
		ci_lo: null,
		ci_hi: null,
		ci_half: null,
		mean_cost_usd: 2,
		mean_duration_seconds: 4,
		mean_output_tokens: 6,
	};
}

const rows = summarizeDeepSWEBestModelScores([
	row("gpt-5-5", 0.48),
	row("gpt-5-5", 0.7),
	row("claude-opus-4-8", 0.58),
]);

assertDeepEqual(
	rows.map(({ model, pass_at_1 }) => ({
		model,
		pass_at_1,
	})),
	[
		{ model: "gpt-5-5", pass_at_1: 0.7 },
		{ model: "claude-opus-4-8", pass_at_1: 0.58 },
	],
);

const scoreByModelName = buildDeepSWEScoreByModelName(rows);

assertDeepEqual(
	findDeepSWEModelScore(["missing", "GPT 5.5"], scoreByModelName)?.pass_at_1,
	0.7,
);

assertDeepEqual(
	summarizeDeepSWEDefaultModelScores([
		{ ...row("gpt-5-5", 0.7), reasoning_effort: "max" },
		{ ...row("gpt-5-5", 0.62), reasoning_effort: "xhigh" },
		row("claude-opus-4-8", 0.58),
	]).map(({ model, pass_at_1 }) => ({ model, pass_at_1 })),
	[
		{ model: "gpt-5-5", pass_at_1: 0.62 },
		{ model: "claude-opus-4-8", pass_at_1: 0.58 },
	],
);
