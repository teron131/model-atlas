/** Verifies DeepSWE parsing, source preference, default-effort scoring, and task metrics. */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
	buildDeepSWEMap,
	DEEP_SWE_V1_1_LEADERBOARD_URL,
	DEEP_SWE_V1_LEADERBOARD_URL,
	type DeepSWELeaderboardRow,
	getDeepSWELeaderboardStats,
	getDeepSWERawLeaderboardSourceRows,
	preferredDeepSWELeaderboardRows,
	summarizeDeepSWEDefaultEffortRows,
} from "../src/model-atlas/scrapers/deep-swe";
import { buildTaskMetrics } from "../src/model-atlas/stats/selection/task-metrics";

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

const rows = summarizeDeepSWEDefaultEffortRows([
	{ ...row("gpt-5-5", 0.7), reasoning_effort: "xhigh" },
	{ ...row("gpt-5-5", 0.62), reasoning_effort: "max" },
	row("claude-opus-4-8", 0.58),
]);

assertDeepEqual(
	rows.map(({ model, pass_at_1 }) => ({
		model,
		pass_at_1,
	})),
	[
		{ model: "gpt-5-5", pass_at_1: 0.62 },
		{ model: "claude-opus-4-8", pass_at_1: 0.58 },
	],
);

const rowsByModelName = buildDeepSWEMap([
	...rows,
	row("gemini-3-flash-preview", 0.05),
]);

assertDeepEqual(rowsByModelName.get("gpt-5-5")?.pass_at_1, 0.62);
assertDeepEqual(rowsByModelName.get("gemini-3-flash-preview")?.pass_at_1, 0.05);
assertDeepEqual(rowsByModelName.get("gemini-3-flash"), undefined);

const collisionMap = buildDeepSWEMap([
	{
		...row("Example.Model", 0.7),
		reasoning_effort: "xhigh",
	},
	{
		...row("Example Model", 0.6),
		reasoning_effort: "max",
	},
]);
assertDeepEqual(collisionMap.get("example-model")?.pass_at_1, 0.6);

assertDeepEqual(
	summarizeDeepSWEDefaultEffortRows([
		row("source-default", 0.4),
		{ ...row("source-default", 0.8), reasoning_effort: "max" },
	])[0]?.pass_at_1,
	0.4,
);

assertDeepEqual(
	preferredDeepSWELeaderboardRows([
		{ ...row("v1-only", 0.42), source_version: "v1" },
		{ ...row("v1.1-model", 0.4), source_version: "v1.1" },
	]).map(({ model }) => model),
	["v1.1-model", "v1-only"],
);

assertDeepEqual(
	preferredDeepSWELeaderboardRows([
		{ ...row("duplicate", 0.42), source_version: "v1" },
		{ ...row("duplicate", 0.4), source_version: "v1.1" },
	]).map(({ model, pass_at_1 }) => ({ model, pass_at_1 })),
	[{ model: "duplicate", pass_at_1: 0.4 }],
);

assertDeepEqual(
	preferredDeepSWELeaderboardRows([
		{ ...row("v1-fallback", 0.42), source_version: "v1" },
	]).map(({ model }) => model),
	["v1-fallback"],
);

assertDeepEqual(
	buildTaskMetrics(null, {
		deep_swe: {
			...row("gpt-5-5", 0.7),
			mean_cost_usd: 226,
			mean_duration_seconds: 1130,
			mean_output_tokens: 11300,
		},
	})?.deep_swe,
	{ cost: 226, output_tokens: 11300, seconds: 1130 },
);

assertDeepEqual(
	buildTaskMetrics(null, {
		deep_swe: {
			...row("deepseek-v4-pro", 0.28),
			mean_cost_usd: 4.22,
			mean_duration_seconds: null,
			mean_output_tokens: 11_300,
		},
	})?.deep_swe,
	{ cost: 4.22, output_tokens: 11300 },
);

const fallbackRows = await getDeepSWELeaderboardStats({
	urls: [
		"https://deepswe.datacurve.ai/artifacts/missing.json",
		DEEP_SWE_V1_1_LEADERBOARD_URL,
	],
});
const v1Rows = await getDeepSWELeaderboardStats({
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
const preferredSourceRows = preferredDeepSWELeaderboardRows(sourceRows.data);
if (
	preferredSourceRows.length <
	sourceRows.data.filter((row) => row.source_version === "v1.1").length
) {
	throw new Error("Expected DeepSWE preferred rows to retain v1.1 rows");
}
if (preferredSourceRows.length > sourceRows.data.length) {
	throw new Error("Expected DeepSWE preferred rows not to invent rows");
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

let activeRequests = 0;
let maxActiveRequests = 0;
let completedRequests = 0;
const server = createServer((_request, response) => {
	activeRequests += 1;
	maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
	setTimeout(() => {
		activeRequests -= 1;
		completedRequests += 1;
		response.writeHead(200, { "content-type": "application/json" });
		response.end(
			JSON.stringify({
				rows: [
					{
						model: `model-${completedRequests}`,
						pass_at_1: 0.5,
						n_tasks_attempted: 113,
						mean_cost_usd: 2,
						mean_duration_seconds: 4,
						mean_output_tokens: 6,
					},
				],
			}),
		);
	}, 20);
});

await new Promise<void>((resolve) => {
	server.listen(0, "127.0.0.1", resolve);
});
try {
	const address = server.address() as AddressInfo;
	const boundedRows = await getDeepSWERawLeaderboardSourceRows({
		concurrency: 2,
		timeoutMs: 1_000,
		urls: Array.from(
			{ length: 6 },
			(_, index) => `http://127.0.0.1:${address.port}/${index}`,
		),
	});
	assertDeepEqual(completedRequests, 6);
	assertDeepEqual(maxActiveRequests, 2);
	assertDeepEqual(boundedRows.data.length, 6);
} finally {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
