/** Shared resource-metric rules for benchmark cost, speed, and availability scoring. */

import type { BenchmarkPortfolio } from "../../benchmarks/factory";
import {
  INDEX_BENCHMARK_KEYS,
  indexPolicy,
  residualIndexBreadth,
} from "../../benchmarks/index-policy";
import { benchmarkValueLocation } from "../../benchmarks/registry";
import { MINIMUM_RESOURCE_BENCHMARKS } from "../../config/stage";
import { positiveFiniteNumber } from "../../math-utils";
import { asFiniteNumber, asRecord } from "../../runtime";
import type { ModelAtlasTaskMetricValues } from "../model-types";

export type BenchmarkMetricModel = {
  benchmarks?: unknown;
  intelligence?: unknown;
  scoring_sources?: unknown;
};

export type ResourceMetricModel = BenchmarkMetricModel & {
  speed?: unknown;
  task_metrics?: unknown;
};

/** Publish resource scores with enough observed task or index coverage, counting overlapping components once for each resource. */
export function applyResourceEvidenceRequirements<
  T extends ResourceMetricModel & {
    scores: { speed_score: number | null; value_score: number | null };
  },
>(model: T, portfolio: BenchmarkPortfolio): T {
  const counts = observedResourceEvidenceCounts(model, portfolio);
  const valueScore = counts.cost >= MINIMUM_RESOURCE_BENCHMARKS ? model.scores.value_score : null;
  const speedScore = counts.time >= MINIMUM_RESOURCE_BENCHMARKS ? model.scores.speed_score : null;
  return valueScore === model.scores.value_score && speedScore === model.scores.speed_score
    ? model
    : { ...model, scores: { ...model.scores, speed_score: speedScore, value_score: valueScore } };
}

/** AA supplies only residual breadth and only for its own measured quality/resource pair; standalone task telemetry stays untouched. */
export function observedResourceEvidenceCounts(
  model: ResourceMetricModel,
  portfolio: BenchmarkPortfolio,
): { cost: number; time: number } {
  const direct = observedResourceBenchmarkCounts(model, portfolio);
  const counts = { cost: direct.cost, time: direct.time };
  for (const indexKey of INDEX_BENCHMARK_KEYS) {
    const policy = indexPolicy(indexKey);
    if (
      policy?.resources == null ||
      portfolio[indexKey] == null ||
      benchmarkMetricValue(model, indexKey) == null
    )
      continue;
    const metrics = benchmarkTaskMetrics(model, policy.resources.key);
    for (const [kind, field] of [
      ["cost", "cost"],
      ["time", "seconds"],
    ] as const) {
      if (positiveFiniteNumber(metrics?.[field]) == null) continue;
      const overlap = policy.standaloneComponents.filter(
        (key) =>
          portfolio[key]?.resourcePolicy != null &&
          benchmarkMetricValue(model, key) != null &&
          positiveFiniteNumber(benchmarkTaskMetrics(model, key)?.[field]) != null,
      );
      counts[kind] += residualIndexBreadth(indexKey, overlap);
    }
  }
  return counts;
}

/** Direct quality-resource pairs drive publication gates; selected tasks without a pair remain in the denominator. */
export function observedResourceBenchmarkCounts(
  model: ResourceMetricModel,
  portfolio: BenchmarkPortfolio,
): {
  cost: number;
  time: number;
  selected: number;
} {
  const counts = { cost: 0, time: 0, selected: 0 };
  for (const [key, entry] of Object.entries(portfolio)) {
    if (entry.resourcePolicy == null) continue;
    counts.selected += 1;
    if (benchmarkMetricValue(model, key) == null) continue;
    const metrics = benchmarkTaskMetrics(model, key);
    if (positiveFiniteNumber(metrics?.cost) != null) counts.cost += 1;
    if (positiveFiniteNumber(metrics?.seconds) != null) counts.time += 1;
  }
  return counts;
}

export type BenchmarkTokenMeasure = "input-output" | "tokens" | "output_tokens";

/** Read one declared token measure directly, without borrowing an index's aggregate telemetry. */
export function directBenchmarkTokens(
  model: ResourceMetricModel,
  key: string,
  measure: BenchmarkTokenMeasure,
): number | null {
  const metrics = benchmarkTaskMetrics(model, key) ?? {};
  if (measure === "output_tokens") return positiveFiniteNumber(metrics.output_tokens);
  const input = asFiniteNumber(metrics.input_tokens);
  const output = asFiniteNumber(metrics.output_tokens);
  if (input != null && input >= 0 && output != null && output >= 0)
    return positiveFiniteNumber(input + output);
  return measure === "tokens" ? positiveFiniteNumber(metrics.tokens) : null;
}

export function benchmarkMetricValue(model: BenchmarkMetricModel, key: string): number | null {
  if (asRecord(asRecord(asRecord(model.scoring_sources)[key]).metadata).fusion_estimated === true)
    return null;
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

/** Read scoring-only fusion estimates without admitting them as measured normalization or training evidence. */
export function benchmarkFusionEstimate(
  model: BenchmarkMetricModel,
  key: string,
): { value: number; confidence: number } | null {
  const source = asRecord(asRecord(model.scoring_sources)[key]);
  const metadata = asRecord(source.metadata);
  const value = asFiniteNumber(source.canonical_value);
  return metadata.fusion_estimated === true && value != null
    ? { value, confidence: asFiniteNumber(metadata.fusion_confidence) ?? 0 }
    : null;
}

/** Use served throughput as the runtime proxy when a benchmark reports output tokens but not wall time. */
export function effectiveTaskSeconds(model: ResourceMetricModel, task: unknown): number | null {
  const taskRecord = asRecord(task);
  const explicitSeconds = positiveFiniteNumber(taskRecord.seconds);
  if (explicitSeconds != null) {
    return explicitSeconds;
  }
  const outputTokens = positiveFiniteNumber(taskRecord.output_tokens);
  const throughput = positiveFiniteNumber(
    asRecord(model.speed).throughput_tokens_per_second_median,
  );
  return outputTokens != null && throughput != null ? outputTokens / throughput : null;
}

/** Read telemetry for the named benchmark only; source-wide averages do not measure a missing task. */
export function benchmarkTaskMetrics(
  model: ResourceMetricModel,
  key: string,
): ModelAtlasTaskMetricValues | null {
  const record = asRecord(asRecord(model.task_metrics)[key]);
  const metadata = asRecord(asRecord(asRecord(model.scoring_sources)[key]).metadata);
  const cost = metadata.fusion_cost_estimated === true ? null : asFiniteNumber(record.cost);
  const seconds =
    metadata.fusion_seconds_per_task_estimated === true ? null : asFiniteNumber(record.seconds);
  const tokens =
    metadata.fusion_tokens_per_task_estimated === true ? null : asFiniteNumber(record.tokens);
  const inputTokens = asFiniteNumber(record.input_tokens);
  const outputTokens =
    metadata.fusion_output_tokens_per_task_estimated === true
      ? null
      : asFiniteNumber(record.output_tokens);
  const metrics = {
    ...(cost == null ? {} : { cost }),
    ...(seconds == null ? {} : { seconds }),
    ...(tokens == null ? {} : { tokens }),
    ...(inputTokens == null ? {} : { input_tokens: inputTokens }),
    ...(outputTokens == null ? {} : { output_tokens: outputTokens }),
  };
  return Object.keys(metrics).length === 0 ? null : metrics;
}

/** Validated fusion resource estimates enter scoring with their own confidence, never the measured peer or donor population. */
export function benchmarkFusionResourceEstimate(
  model: ResourceMetricModel,
  key: string,
  kind: "cost" | "time" | "tokens" | "output_tokens",
): { amount: number; confidence: number } | null {
  const metadata = asRecord(asRecord(asRecord(model.scoring_sources)[key]).metadata);
  const field =
    kind === "time" ? "seconds_per_task" : kind === "cost" ? "cost" : `${kind}_per_task`;
  const metrics = asRecord(asRecord(model.task_metrics)[key]);
  if (metadata[`fusion_${field}_estimated`] === true) {
    const amount = positiveFiniteNumber(metrics[kind === "time" ? "seconds" : kind]);
    if (amount != null)
      return { amount, confidence: asFiniteNumber(metadata[`fusion_${field}_confidence`]) ?? 0.5 };
  }
  if (kind === "time" && metadata.fusion_output_tokens_per_task_estimated === true) {
    const amount = effectiveTaskSeconds(model, { output_tokens: metrics.output_tokens });
    if (amount != null)
      return {
        amount,
        confidence: asFiniteNumber(metadata.fusion_output_tokens_per_task_confidence) ?? 0.5,
      };
  }
  return null;
}
