import {
	agentsLastExamBenchmarkScore,
	buildAgentsLastExamMap,
	findAgentsLastExamModelScore,
	processAgentsLastExamLeaderboardRows,
	summarizeAgentsLastExamModelScores,
} from "../src/model-atlas/scrapers/agents-last-exam";
import { buildTaskMetrics } from "../src/model-atlas/stats/selection/task-metrics";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processAgentsLastExamLeaderboardRows([
	{
		split: "full/overall",
		harness: "codex",
		model: "gpt-5-5",
		harnessVariant: null,
		runs: 146,
		tasks: 145,
		splitTasks: 149,
		passes: 39,
		passRate: 0.26,
		avgScore: 0.44,
		totalDurationS: 291_752,
		totalInputTokens: 577_686_408,
		totalOutputTokens: 3_856_937,
		totalCostUsd: 290,
		costSource: "db",
	},
	{
		split: "full/overall",
		harness: "openclaw",
		model: "gpt-5-5",
		harnessVariant: "xhigh",
		runs: 53,
		tasks: 53,
		splitTasks: 55,
		passes: 10,
		passRate: 0.18,
		avgScore: 0.34,
		totalDurationS: 98_570,
		totalInputTokens: 116_041_374,
		totalOutputTokens: 1_132_752,
		totalCostUsd: 106,
		costSource: "list",
	},
	{
		split: "cli",
		harness: "codex",
		model: "gpt-5-5",
		harnessVariant: null,
		runs: 103,
		tasks: 103,
		splitTasks: 105,
		passes: 27,
		passRate: 0.25,
		avgScore: 0.45,
		totalDurationS: 127_482,
		totalInputTokens: 375_083_014,
		totalOutputTokens: 2_384_819,
		totalCostUsd: 206,
		costSource: "db",
	},
	{
		split: "full/overall",
		harness: "codex",
		model: "claude-opus-4-8",
		harnessVariant: null,
		runs: 102,
		tasks: 102,
		splitTasks: 105,
		passes: 17,
		passRate: 0.16,
		avgScore: 0.39,
		totalDurationS: 1_151_355,
		totalInputTokens: 112_447_742,
		totalOutputTokens: 1_784_448,
		totalCostUsd: 306,
		costSource: "official",
	},
	{ split: "skip", harness: "skip", model: "skip", avgScore: 0.9 },
]);

assertDeepEqual(rows, [
	{
		split: "full/overall",
		harness: "codex",
		model: "gpt-5-5",
		harness_variant: null,
		runs: 146,
		tasks: 145,
		split_tasks: 149,
		passes: 39,
		accuracy: 0.26,
		score: 0.44,
		total_duration_seconds: 291_752,
		total_input_tokens: 577_686_408,
		total_output_tokens: 3_856_937,
		total_cost_usd: 290,
		cost_source: "db",
	},
	{
		split: "full/overall",
		harness: "openclaw",
		model: "gpt-5-5",
		harness_variant: "xhigh",
		runs: 53,
		tasks: 53,
		split_tasks: 55,
		passes: 10,
		accuracy: 0.18,
		score: 0.34,
		total_duration_seconds: 98_570,
		total_input_tokens: 116_041_374,
		total_output_tokens: 1_132_752,
		total_cost_usd: 106,
		cost_source: "list",
	},
	{
		split: "cli",
		harness: "codex",
		model: "gpt-5-5",
		harness_variant: null,
		runs: 103,
		tasks: 103,
		split_tasks: 105,
		passes: 27,
		accuracy: 0.25,
		score: 0.45,
		total_duration_seconds: 127_482,
		total_input_tokens: 375_083_014,
		total_output_tokens: 2_384_819,
		total_cost_usd: 206,
		cost_source: "db",
	},
	{
		split: "full/overall",
		harness: "codex",
		model: "claude-opus-4-8",
		harness_variant: null,
		runs: 102,
		tasks: 102,
		split_tasks: 105,
		passes: 17,
		accuracy: 0.16,
		score: 0.39,
		total_duration_seconds: 1_151_355,
		total_input_tokens: 112_447_742,
		total_output_tokens: 1_784_448,
		total_cost_usd: 306,
		cost_source: "official",
	},
]);

const modelScores = summarizeAgentsLastExamModelScores(rows);

assertDeepEqual(modelScores, [
	{
		model: "gpt-5-5",
		split: "full/overall",
		median_score: 0.39,
		mean_score: 0.39,
		median_accuracy: 0.22,
		mean_accuracy: 0.22,
		median_total_duration_seconds: 195_161,
		mean_total_duration_seconds: 195_161,
		median_total_input_tokens: 346_863_891,
		mean_total_input_tokens: 346_863_891,
		median_total_output_tokens: 2_494_844.5,
		mean_total_output_tokens: 2_494_844.5,
		median_duration_seconds_per_task: (291_752 / 145 + 98_570 / 53) / 2,
		mean_duration_seconds_per_task: (291_752 / 145 + 98_570 / 53) / 2,
		median_input_tokens_per_task: (577_686_408 / 145 + 116_041_374 / 53) / 2,
		mean_input_tokens_per_task: (577_686_408 / 145 + 116_041_374 / 53) / 2,
		median_output_tokens_per_task: (3_856_937 / 145 + 1_132_752 / 53) / 2,
		mean_output_tokens_per_task: (3_856_937 / 145 + 1_132_752 / 53) / 2,
		median_cost_usd_per_task: 2,
		mean_cost_usd_per_task: 2,
		frequency: 2,
	},
	{
		model: "claude-opus-4-8",
		split: "full/overall",
		median_score: 0.39,
		mean_score: 0.39,
		median_accuracy: 0.16,
		mean_accuracy: 0.16,
		median_total_duration_seconds: 1_151_355,
		mean_total_duration_seconds: 1_151_355,
		median_total_input_tokens: 112_447_742,
		mean_total_input_tokens: 112_447_742,
		median_total_output_tokens: 1_784_448,
		mean_total_output_tokens: 1_784_448,
		median_duration_seconds_per_task: 1_151_355 / 102,
		mean_duration_seconds_per_task: 1_151_355 / 102,
		median_input_tokens_per_task: 112_447_742 / 102,
		mean_input_tokens_per_task: 112_447_742 / 102,
		median_output_tokens_per_task: 1_784_448 / 102,
		mean_output_tokens_per_task: 1_784_448 / 102,
		median_cost_usd_per_task: 3,
		mean_cost_usd_per_task: 3,
		frequency: 1,
	},
]);

const gptScore = modelScores[0];
if (gptScore == null) {
	throw new Error("Expected a gpt-5-5 score row");
}

const scoreByModelName = buildAgentsLastExamMap([
	...modelScores,
	{
		...gptScore,
		model: "GPT-5.5",
		median_score: 0.37,
		mean_score: 0.37,
		frequency: 7,
	},
]);

const matchedScore = findAgentsLastExamModelScore(
	["missing", "gpt-5-5"],
	scoreByModelName,
);

assertDeepEqual(matchedScore?.frequency, 7);
assertDeepEqual(agentsLastExamBenchmarkScore(matchedScore ?? gptScore), 0.37);

assertDeepEqual(
	buildTaskMetrics(null, {
		agents_last_exam: gptScore,
	})?.agents_last_exam,
	{
		seconds: (291_752 / 145 + 98_570 / 53) / 2,
		input_tokens: (577_686_408 / 145 + 116_041_374 / 53) / 2,
		output_tokens: (3_856_937 / 145 + 1_132_752 / 53) / 2,
		cost: 2,
	},
);

const slashProviderScore = findAgentsLastExamModelScore(
	["anthropic/claude-fable-5"],
	buildAgentsLastExamMap([
		{
			...gptScore,
			model: "anthropic-claude-fable-5",
			median_score: 0.36,
			mean_score: 0.36,
		},
	]),
);

assertDeepEqual(slashProviderScore?.model, "anthropic-claude-fable-5");
