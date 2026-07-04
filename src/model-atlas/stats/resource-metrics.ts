/** Shared resource-metric rules for benchmark cost, speed, and availability scoring. */

import { positiveFiniteNumber } from "../math-utils";
import { asFiniteNumber, asRecord } from "../shared";
import type { LlmStatsModelCandidate, LlmStatsTaskMetricValues } from "./types";

export type BenchmarkMetricModel = {
	evaluations?: unknown;
	intelligence?: unknown;
};

export type ResourceMetricModel = BenchmarkMetricModel & {
	speed?: unknown;
	task_metrics?: unknown;
};

export function benchmarkMetricValue(
	model: BenchmarkMetricModel,
	key: string,
): number | null {
	return (
		asFiniteNumber(asRecord(model.intelligence)[key]) ??
		asFiniteNumber(asRecord(model.evaluations)[key]) ??
		null
	);
}

function taskOutputTokens(task: unknown): number | null {
	const record = asRecord(task);
	return (
		positiveFiniteNumber(record.output_tokens) ??
		positiveFiniteNumber(record.tokens)
	);
}

function modelThroughputTokensPerSecond(
	model: ResourceMetricModel,
): number | null {
	return positiveFiniteNumber(
		asRecord(model.speed).throughput_tokens_per_second_median,
	);
}

/** Use served throughput as the runtime proxy when a benchmark reports output tokens but not wall time. */
export function effectiveTaskSeconds(
	model: ResourceMetricModel,
	task: unknown,
): number | null {
	const taskRecord = asRecord(task);
	const explicitSeconds = positiveFiniteNumber(taskRecord.seconds);
	if (explicitSeconds != null) {
		return explicitSeconds;
	}
	const outputTokens = taskOutputTokens(task);
	const throughput = modelThroughputTokensPerSecond(model);
	return outputTokens != null && throughput != null
		? outputTokens / throughput
		: null;
}

export function taskMetricFromModel(
	model: LlmStatsModelCandidate,
	key: string,
): LlmStatsTaskMetricValues | null {
	return model.task_metrics?.[key] ?? null;
}
