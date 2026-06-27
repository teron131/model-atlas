import {
	buildDeepSWEMap,
	DEEP_SWE_V1_1_LEADERBOARD_URL,
	DEEP_SWE_V1_LEADERBOARD_URL,
	type DeepSWELeaderboardRow,
	findDeepSWEModelScore,
	getDeepSWERawLeaderboardSourceRows,
	getDeepSWERawLeaderboardStats,
	preferredDeepSWELeaderboardRows,
	summarizeDeepSWEBestModelScores,
	summarizeDeepSWEDefaultModelScores,
} from "../src/model-atlas/llm/scrapers/deep-swe";
import { buildTaskMetrics } from "../src/model-atlas/llm/stats/selection/task-metrics";

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
		n_tasks_attempted: 113,
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

const scoreByModelName = buildDeepSWEMap(rows);

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

assertDeepEqual(
	preferredDeepSWELeaderboardRows([
		{ ...row("v1-only", 0.42), source_version: "v1" },
		{ ...row("v1.1-model", 0.4), source_version: "v1.1" },
	]).map(({ model }) => model),
	["v1.1-model"],
);

assertDeepEqual(
	preferredDeepSWELeaderboardRows([
		{ ...row("v1-fallback", 0.42), source_version: "v1" },
	]).map(({ model }) => model),
	["v1-fallback"],
);

assertDeepEqual(
	buildTaskMetrics(null, null, {
		deep_swe: {
			...row("gpt-5-5", 0.7),
			mean_cost_usd: 226,
			mean_duration_seconds: 1130,
			mean_output_tokens: 11300,
		},
	})?.deep_swe,
	{ cost: 2, seconds: 10, output_tokens: 100 },
);

const fallbackRows = await getDeepSWERawLeaderboardStats({
	urls: [
		"https://deepswe.datacurve.ai/artifacts/missing.json",
		DEEP_SWE_V1_1_LEADERBOARD_URL,
	],
});
const v1Rows = await getDeepSWERawLeaderboardStats({
	url: DEEP_SWE_V1_LEADERBOARD_URL,
});

if (fallbackRows.data.length === 0) {
	throw new Error("Expected DeepSWE v1.1 fallback fetch to return rows");
}
if (fallbackRows.source_version !== "v1.1") {
	throw new Error("Expected DeepSWE fallback fetch to report v1.1");
}
if (!fallbackRows.data.some((row) => row.n_tasks_attempted === 113)) {
	throw new Error("Expected DeepSWE v1.1 rows to scrape 113 attempted tasks");
}
if (!fallbackRows.data.every((row) => row.n_tasks_attempted > 0)) {
	throw new Error("Expected every DeepSWE v1.1 row to include attempted tasks");
}

const sourceRows = await getDeepSWERawLeaderboardSourceRows({
	urls: [DEEP_SWE_V1_1_LEADERBOARD_URL, DEEP_SWE_V1_LEADERBOARD_URL],
});
const sourceVersions = new Set(
	sourceRows.data.map((row) => row.source_version),
);
if (!sourceVersions.has("v1.1") || !sourceVersions.has("v1")) {
	throw new Error("Expected DeepSWE source rows to include v1.1 and v1");
}
if (
	preferredDeepSWELeaderboardRows(sourceRows.data).length !==
	sourceRows.data.filter((row) => row.source_version === "v1.1").length
) {
	throw new Error("Expected DeepSWE preferred rows to use v1.1 when present");
}
if (v1Rows.data.length === 0) {
	throw new Error("Expected DeepSWE v1 fetch to return rows");
}
if (v1Rows.source_version !== "v1") {
	throw new Error("Expected DeepSWE v1 fetch to report v1");
}
if (!v1Rows.data.every((row) => row.n_tasks_attempted > 0)) {
	throw new Error("Expected DeepSWE v1 rows to include attempted tasks");
}
