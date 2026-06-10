import { asFiniteNumber } from "../../shared";
import type {
	ModelStatsScoringSources,
	ModelStatsSelectedCost,
	ModelStatsSelectedIntelligenceIndexCost,
	ModelStatsSelectedSpeed,
	ModelStatsSelectedTaskMetrics,
	ModelStatsSelectedTaskMetricValues,
} from "../types";

const ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS = 12_826;

type TaskMetricValues = ModelStatsSelectedTaskMetricValues;

function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

/** Build normalized per-task metrics for AA Intelligence, DeepSWE, and ALE runs. */
export function buildTaskMetrics(
	intelligenceIndexCost: ModelStatsSelectedIntelligenceIndexCost,
	speed: ModelStatsSelectedSpeed,
	cost: ModelStatsSelectedCost,
	scoringSources: ModelStatsScoringSources,
): ModelStatsSelectedTaskMetrics {
	const taskMetrics: NonNullable<ModelStatsSelectedTaskMetrics> = {};
	const artificialAnalysis = buildArtificialAnalysisTaskMetrics(
		intelligenceIndexCost,
		speed,
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
	return hasFields(taskMetrics) ? taskMetrics : null;
}

/** Normalize AA Intelligence run telemetry to one repeated evaluation attempt. */
function buildArtificialAnalysisTaskMetrics(
	intelligenceIndexCost: ModelStatsSelectedIntelligenceIndexCost,
	speed: ModelStatsSelectedSpeed,
): TaskMetricValues | null {
	if (intelligenceIndexCost == null) {
		return null;
	}
	const cost = asFiniteNumber(intelligenceIndexCost.total_cost);
	const outputTokens = artificialAnalysisOutputTokens(intelligenceIndexCost);
	const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
	const throughputTokensPerSecond = asFiniteNumber(
		speed.throughput_tokens_per_second_median,
	);
	const taskMetrics: TaskMetricValues = {};

	if (cost != null && cost >= 0) {
		taskMetrics.cost =
			cost / ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS;
	}
	if (outputTokens != null && outputTokens >= 0) {
		const outputTokensPerTask =
			outputTokens / ARTIFICIAL_ANALYSIS_INTELLIGENCE_REPEATED_ATTEMPTS;
		taskMetrics.output_tokens = outputTokensPerTask;
		if (
			latencySeconds != null &&
			latencySeconds >= 0 &&
			throughputTokensPerSecond != null &&
			throughputTokensPerSecond > 0
		) {
			taskMetrics.seconds =
				latencySeconds + outputTokensPerTask / throughputTokensPerSecond;
		}
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

function artificialAnalysisOutputTokens(
	intelligenceIndexCost: NonNullable<ModelStatsSelectedIntelligenceIndexCost>,
): number | null {
	const outputTokens = asFiniteNumber(intelligenceIndexCost.output_tokens);
	if (outputTokens != null) {
		return outputTokens;
	}
	const answerTokens = asFiniteNumber(intelligenceIndexCost.answer_tokens) ?? 0;
	const reasoningTokens =
		asFiniteNumber(intelligenceIndexCost.reasoning_tokens) ?? 0;
	const totalOutputTokens = answerTokens + reasoningTokens;
	return totalOutputTokens > 0 ? totalOutputTokens : null;
}

/** Expose DeepSWE's own per-task attempt telemetry beside the AA normalized values. */
function buildDeepSWETaskMetrics(
	scoringSources: ModelStatsScoringSources,
): TaskMetricValues | null {
	const deepSWE = scoringSources?.deep_swe;
	if (deepSWE == null) {
		return null;
	}
	return {
		cost: deepSWE.mean_cost_usd,
		seconds: deepSWE.mean_duration_seconds,
		output_tokens: deepSWE.mean_output_tokens,
	};
}

/** Expose Agents' Last Exam resource telemetry using the lower of median and mean. */
function buildAgentsLastExamTaskMetrics(
	scoringSources: ModelStatsScoringSources,
	cost: ModelStatsSelectedCost,
): TaskMetricValues | null {
	const agentsLastExam = scoringSources?.agents_last_exam;
	if (agentsLastExam == null) {
		return null;
	}
	const inputTokens = Math.min(
		agentsLastExam.median_total_input_tokens,
		agentsLastExam.mean_total_input_tokens,
	);
	const outputTokens = Math.min(
		agentsLastExam.median_total_output_tokens,
		agentsLastExam.mean_total_output_tokens,
	);
	const taskMetrics: TaskMetricValues = {
		seconds: Math.min(
			agentsLastExam.median_total_duration_seconds,
			agentsLastExam.mean_total_duration_seconds,
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

/** Estimate task cost from per-million input/output token prices and observed tokens. */
function tokenUsageTaskCost(
	cost: ModelStatsSelectedCost,
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
