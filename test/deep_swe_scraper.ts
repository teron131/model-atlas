import {
	buildDeepSWEScoreByModelName,
	type DeepSWELeaderboardRow,
	findDeepSWEModelScore,
	summarizeDeepSWEBestModelScores,
} from "../src/model-atlas/llm/sources/deep-swe-scraper";

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
		pass_at_1: passAt1,
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
