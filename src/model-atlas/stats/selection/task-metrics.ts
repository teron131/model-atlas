/** Task metric projection for Model Atlas. */

import { asFiniteNumber, asRecord } from "../../shared";
import type {
	LlmStatsCost,
	LlmStatsIntelligenceIndexCost,
	LlmStatsScoringSources,
	LlmStatsTaskMetrics,
	LlmStatsTaskMetricValues,
} from "../types";

type TaskMetricValues = LlmStatsTaskMetricValues;
type TaskMetricKey = keyof TaskMetricValues;

const GENERIC_TASK_METRIC_FIELDS = {
	cost: [
		"cost_per_task_usd",
		"cost_per_task",
		"mean_cost_usd",
		"median_cost_usd",
	],
	seconds: [
		"seconds_per_task",
		"duration_seconds_per_task",
		"mean_duration_seconds_per_run",
		"median_duration_seconds_per_run",
		"mean_duration_seconds",
		"median_duration_seconds",
	],
	tokens: ["tokens_per_task", "mean_tokens_per_task", "median_tokens_per_task"],
	input_tokens: [
		"input_tokens_per_task",
		"mean_input_tokens_per_task",
		"median_input_tokens_per_task",
		"mean_input_tokens_per_run",
		"median_input_tokens_per_run",
	],
	output_tokens: [
		"output_tokens_per_task",
		"mean_output_tokens_per_task",
		"median_output_tokens_per_task",
		"mean_output_tokens_per_run",
		"median_output_tokens_per_run",
		"mean_output_tokens",
		"median_output_tokens",
	],
} as const satisfies Record<TaskMetricKey, readonly string[]>;

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

export function buildTaskMetrics(
	intelligenceIndexCost: LlmStatsIntelligenceIndexCost,
	cost: LlmStatsCost,
	scoringSources: LlmStatsScoringSources,
): LlmStatsTaskMetrics {
	const taskMetrics: NonNullable<LlmStatsTaskMetrics> = {};
	for (const [key, source] of Object.entries(scoringSources ?? {})) {
		const sourceTaskMetrics = buildGenericSourceTaskMetrics(source);
		if (sourceTaskMetrics != null) {
			taskMetrics[key] = sourceTaskMetrics;
		}
	}
	const artificialAnalysis = buildArtificialAnalysisTaskMetrics(
		intelligenceIndexCost,
	);
	if (artificialAnalysis != null) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	const deepSWE = buildDeepSWETaskMetrics(scoringSources);
	if (deepSWE != null) {
		taskMetrics.deep_swe = deepSWE;
	}
	const agentsLastExam = buildAgentsLastExamTaskMetrics(scoringSources, cost);
	if (agentsLastExam != null) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	const automationBench = buildAutomationBenchTaskMetrics(scoringSources);
	if (automationBench != null) {
		taskMetrics.automation_bench = automationBench;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function firstFiniteNumber(
	record: Record<string, unknown>,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = asFiniteNumber(record[key]);
		if (value != null) {
			return value;
		}
	}
	return null;
}

function setNonNegativeMetric(
	taskMetrics: TaskMetricValues,
	key: TaskMetricKey,
	value: number | null,
): void {
	if (value != null && value >= 0) {
		taskMetrics[key] = value;
	}
}

/** Extract common per-task telemetry field shapes from any benchmark source row. */
function buildGenericSourceTaskMetrics(
	source: unknown,
): TaskMetricValues | null {
	const row = asRecord(source);
	const taskMetrics: TaskMetricValues = {};
	for (const [key, fields] of Object.entries(GENERIC_TASK_METRIC_FIELDS)) {
		setNonNegativeMetric(
			taskMetrics,
			key as TaskMetricKey,
			firstFiniteNumber(row, fields),
		);
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function buildArtificialAnalysisTaskMetrics(
	intelligenceIndexCost: LlmStatsIntelligenceIndexCost,
): TaskMetricValues | null {
	if (intelligenceIndexCost == null) {
		return null;
	}
	const costPerTask = asFiniteNumber(intelligenceIndexCost.cost_per_task);
	const outputTokensPerTask = asFiniteNumber(
		intelligenceIndexCost.output_tokens_per_task,
	);
	const secondsPerTask = asFiniteNumber(intelligenceIndexCost.seconds_per_task);
	const taskMetrics: TaskMetricValues = {};

	if (costPerTask != null && costPerTask >= 0) {
		taskMetrics.cost = costPerTask;
	}
	if (outputTokensPerTask != null && outputTokensPerTask >= 0) {
		taskMetrics.output_tokens = outputTokensPerTask;
	}
	if (secondsPerTask != null && secondsPerTask >= 0) {
		taskMetrics.seconds = secondsPerTask;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function buildDeepSWETaskMetrics(
	scoringSources: LlmStatsScoringSources,
): TaskMetricValues | null {
	const deepSWE = scoringSources?.deep_swe;
	if (deepSWE == null) {
		return null;
	}
	const taskMetrics: TaskMetricValues = {
		cost: deepSWE.mean_cost_usd,
		output_tokens: deepSWE.mean_output_tokens,
	};
	setNonNegativeMetric(taskMetrics, "seconds", deepSWE.mean_duration_seconds);
	return taskMetrics;
}

/** Expose Agents' Last Exam resource telemetry using the lower of median and mean. */
function buildAgentsLastExamTaskMetrics(
	scoringSources: LlmStatsScoringSources,
	cost: LlmStatsCost,
): TaskMetricValues | null {
	const agentsLastExam = scoringSources?.agents_last_exam;
	if (agentsLastExam == null) {
		return null;
	}
	const inputTokens = Math.min(
		agentsLastExam.median_input_tokens_per_run,
		agentsLastExam.mean_input_tokens_per_run,
	);
	const outputTokens = Math.min(
		agentsLastExam.median_output_tokens_per_run,
		agentsLastExam.mean_output_tokens_per_run,
	);
	const taskMetrics: TaskMetricValues = {
		seconds: Math.min(
			agentsLastExam.median_duration_seconds_per_run,
			agentsLastExam.mean_duration_seconds_per_run,
		),
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	};
	const taskCost = tokenUsageTaskCost(cost, inputTokens, outputTokens);
	if (taskCost != null) {
		taskMetrics.cost = taskCost;
	}
	return taskMetrics;
}

function buildAutomationBenchTaskMetrics(
	scoringSources: LlmStatsScoringSources,
): TaskMetricValues | null {
	const automationBench = scoringSources?.automation_bench;
	if (automationBench == null) {
		return null;
	}
	return {
		cost: automationBench.cost_per_task_usd,
	};
}

function tokenUsageTaskCost(
	cost: LlmStatsCost,
	inputTokens: number,
	outputTokens: number,
): number | null {
	const inputCost =
		asFiniteNumber(cost?.weighted_input) ?? asFiniteNumber(cost?.input);
	const outputCost =
		asFiniteNumber(cost?.weighted_output) ?? asFiniteNumber(cost?.output);
	return inputCost != null &&
		inputCost > 0 &&
		outputCost != null &&
		outputCost > 0
		? (inputTokens * inputCost + outputTokens * outputCost) / 1_000_000
		: null;
}
