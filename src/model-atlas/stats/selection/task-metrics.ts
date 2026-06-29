/** Task metric projection for Model Atlas. */

import { asFiniteNumber } from "../../shared";
import type {
	LlmStatsCost,
	LlmStatsIntelligenceIndexCost,
	LlmStatsScoringSources,
	LlmStatsTaskMetrics,
	LlmStatsTaskMetricValues,
} from "../types";

type TaskMetricValues = LlmStatsTaskMetricValues;

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

export function buildTaskMetrics(
	intelligenceIndexCost: LlmStatsIntelligenceIndexCost,
	cost: LlmStatsCost,
	scoringSources: LlmStatsScoringSources,
): LlmStatsTaskMetrics {
	const taskMetrics: NonNullable<LlmStatsTaskMetrics> = {};
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
	const taskCount = asFiniteNumber(deepSWE.n_tasks_attempted);
	if (taskCount == null || taskCount <= 0) {
		return null;
	}
	return {
		cost: deepSWE.mean_cost_usd / taskCount,
		seconds: deepSWE.mean_duration_seconds / taskCount,
		output_tokens: deepSWE.mean_output_tokens / taskCount,
	};
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
