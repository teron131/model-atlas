/** Shared resource-metric rules for benchmark cost, speed, and availability scoring. */

import type { BenchmarkResourcePolicy } from "../../benchmarks/factory";
import { benchmarkValueLocation } from "../../benchmarks/registry";
import { positiveFiniteNumber } from "../../numeric";
import { asFiniteNumber, asRecord } from "../../runtime";
import type { ModelAtlasTaskMetricValues } from "../model-types";

export type BenchmarkMetricModel = {
	benchmarks?: unknown;
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
			asFiniteNumber(asRecord(model.benchmarks)[key]) ??
			null
		);
	}
	if (location == null) {
		return (
			asFiniteNumber(asRecord(model.intelligence)[key]) ??
			asFiniteNumber(asRecord(model.benchmarks)[key]) ??
			null
		);
	}
	return asFiniteNumber(asRecord(model.benchmarks)[key]) ?? null;
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

function taskMetricValues(value: unknown): ModelAtlasTaskMetricValues | null {
	const record = asRecord(value);
	const cost = asFiniteNumber(record.cost);
	const seconds = asFiniteNumber(record.seconds);
	const tokens = asFiniteNumber(record.tokens);
	const inputTokens = asFiniteNumber(record.input_tokens);
	const outputTokens = asFiniteNumber(record.output_tokens);
	const metrics = {
		...(cost == null ? {} : { cost }),
		...(seconds == null ? {} : { seconds }),
		...(tokens == null ? {} : { tokens }),
		...(inputTokens == null ? {} : { input_tokens: inputTokens }),
		...(outputTokens == null ? {} : { output_tokens: outputTokens }),
	};
	return Object.keys(metrics).length === 0 ? null : metrics;
}

/** Resolve direct benchmark telemetry over its declared shared-source fallback. */
export function benchmarkTaskMetrics(
	model: ResourceMetricModel,
	key: string,
	resourcePolicy?: BenchmarkResourcePolicy,
): ModelAtlasTaskMetricValues | null {
	const taskMetrics = asRecord(model.task_metrics);
	const fallback =
		resourcePolicy?.source === "artificial_analysis"
			? taskMetricValues(taskMetrics.artificial_analysis)
			: null;
	const direct = taskMetricValues(taskMetrics[key]);
	const metrics = { ...fallback, ...direct };
	return Object.keys(metrics).length === 0 ? null : metrics;
}
