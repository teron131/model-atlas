/** Shared resource-metric rules for benchmark cost, speed, and availability scoring. */

import { benchmarkValueLocation } from "../../benchmarks/registry";
import { positiveFiniteNumber } from "../../numeric";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
	LlmStatsModelCandidate,
	LlmStatsTaskMetricValues,
} from "../model-types";

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
	const location = benchmarkValueLocation(key);
	if (location?.kind === "intelligence") {
		return (
			asFiniteNumber(asRecord(model.intelligence)[location.field]) ??
			asFiniteNumber(asRecord(model.evaluations)[key]) ??
			null
		);
	}
	if (location == null) {
		return (
			asFiniteNumber(asRecord(model.intelligence)[key]) ??
			asFiniteNumber(asRecord(model.evaluations)[key]) ??
			null
		);
	}
	return asFiniteNumber(asRecord(model.evaluations)[key]) ?? null;
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
	const outputTokens =
		positiveFiniteNumber(taskRecord.output_tokens) ??
		positiveFiniteNumber(taskRecord.tokens);
	const throughput = positiveFiniteNumber(
		asRecord(model.speed).throughput_tokens_per_second_median,
	);
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
