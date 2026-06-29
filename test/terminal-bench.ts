import {
	buildTerminalBenchMap,
	findTerminalBenchMedianAccuracy,
	processTerminalBenchLeaderboardRows,
	summarizeTerminalBenchModelMedianAccuracy,
} from "../src/model-atlas/scrapers/terminal-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processTerminalBenchLeaderboardRows([
	{ agent: "A", model: ["M1"], accuracy: 0.2 },
	{ agent: "B", model: ["M1"], accuracy: 0.9 },
	{ agent: "C", model: ["M1", "M2"], accuracy: 0.4 },
	{ agent: "D", model: ["M2"], accuracy: 0.7 },
	{ agent: "E", model: ["Multiple"], accuracy: 0.9 },
	{ agent: "skip", model: [], accuracy: 0.9 },
]);

assertDeepEqual(rows, [
	{ agent: "A", model: "M1", accuracy: 0.2 },
	{ agent: "B", model: "M1", accuracy: 0.9 },
	{ agent: "C", model: "M1, M2", accuracy: 0.4 },
	{ agent: "D", model: "M2", accuracy: 0.7 },
	{ agent: "E", model: "Multiple", accuracy: 0.9 },
]);

assertDeepEqual(summarizeTerminalBenchModelMedianAccuracy(rows), [
	{ model: "M2", median_accuracy: 0.55, mean_accuracy: 0.55, frequency: 2 },
	{ model: "M1", median_accuracy: 0.4, mean_accuracy: 0.5, frequency: 3 },
]);

const terminalBenchAccuracyByModelName = buildTerminalBenchMap([
	{
		model: "GPT-5.3 Codex",
		median_accuracy: 0.8,
		mean_accuracy: 0.8,
		frequency: 1,
	},
	{
		model: "GPT-5.3-Codex",
		median_accuracy: 0.75,
		mean_accuracy: 0.78,
		frequency: 11,
	},
]);

assertDeepEqual(
	findTerminalBenchMedianAccuracy(
		["missing", "GPT 5.3 Codex"],
		terminalBenchAccuracyByModelName,
	),
	0.78,
);
