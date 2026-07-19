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

/** Translate canonical benchmark keys to exact fields retained from provider payloads. */
const INTELLIGENCE_SOURCE_FIELD_BY_BENCHMARK: Readonly<
	Record<string, string>
> = {
	aa_intelligence_index: "intelligence_index",
};

export function benchmarkMetricValue(
	model: BenchmarkMetricModel,
	key: string,
): number | null {
	const intelligenceKey = INTELLIGENCE_SOURCE_FIELD_BY_BENCHMARK[key] ?? key;
	return (
		asFiniteNumber(asRecord(model.intelligence)[intelligenceKey]) ??
		asFiniteNumber(asRecord(model.evaluations)[key]) ??
		null
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
