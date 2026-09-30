/** Descriptive resource use compares observed amounts with model-balanced benchmark medians, independently of achieved quality. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import {
  excludesVariantIndex,
  INDEX_BENCHMARK_KEYS,
  indexPolicy,
  residualIndexBreadth,
} from "../benchmarks/index-policy";
import {
  BENCHMARK_RESOURCE_SOURCE_LABELS,
  resourceSourceMetricKey,
  resourceSourcesFromMetadata,
} from "../benchmarks/resource-sources";
import { canonicalModelKey } from "../identity/normalization";
import { positiveFiniteNumber, weightedMedianOfFinite } from "../math-utils";
import type { ModelAtlasModel } from "../pipeline/model-types";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  separatedBenchmarkResourceSources,
} from "../pipeline/scores/resource-metrics";
import { asFiniteNumber, asRecord } from "../runtime";

export type ResourceRatioKind = "cost" | "time" | "tokens";
export type ResourceRatioObservation = {
  model: ModelAtlasModel;
  benchmarkKey: string;
  baseBenchmarkKey: string;
  amount: number;
  quality: number;
  weight: number;
};
export type ResourceRatioSummary = {
  ratio: number | null;
  benchmarkCount: number;
  sourceCount: number;
};

/** Keep observed quality-resource pairs only, reserving missing source shares; index breadth is allocated after a caller selects its supported basket. */
export function resourceRatioObservations(
  models: readonly ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
  kind: ResourceRatioKind,
): ResourceRatioObservation[] {
  const observations: ResourceRatioObservation[] = [];
  const allocations = sourceAllocations(models, Object.keys(portfolio));
  for (const model of models) {
    for (const [key, entry] of Object.entries(portfolio)) {
      if (entry.resourcePolicy == null || indexPolicy(key) != null) continue;
      observations.push(...benchmarkObservations(model, key, kind, allocations.get(key) ?? 1));
    }
    for (const key of INDEX_BENCHMARK_KEYS) {
      const policy = indexPolicy(key);
      const quality = benchmarkMetricValue(model, key);
      if (
        portfolio[key] == null ||
        policy?.resources == null ||
        excludesVariantIndex(model, key) ||
        quality == null
      )
        continue;
      const amount = metricAmount(benchmarkTaskMetrics(model, policy.resources.key), kind);
      if (amount != null)
        observations.push({
          model,
          benchmarkKey: policy.resources.key,
          baseBenchmarkKey: key,
          amount,
          quality,
          weight: 1,
        });
    }
  }
  return observations;
}

/** Each base model contributes one reference vote per source, shared equally across its valid effort observations; singleton populations have no reference. */
export function resourceRatioReferences(
  observations: readonly ResourceRatioObservation[],
): Map<string, number> {
  const groups = new Map<string, ResourceRatioObservation[]>();
  for (const observation of observations) {
    if (
      positiveFiniteNumber(observation.amount) == null ||
      positiveFiniteNumber(observation.weight) == null
    )
      continue;
    const group = groups.get(observation.benchmarkKey) ?? [];
    group.push(observation);
    groups.set(observation.benchmarkKey, group);
  }
  const references = new Map<string, number>();
  for (const [key, group] of groups) {
    const counts = new Map<string, number>();
    for (const observation of group) {
      const modelKey = canonicalModelKey(observation.model);
      counts.set(modelKey, (counts.get(modelKey) ?? 0) + 1);
    }
    if (counts.size < 2) continue;
    const reference = weightedMedianOfFinite(
      group.map((observation) => ({
        value: observation.amount,
        weight: 1 / counts.get(canonicalModelKey(observation.model))!,
      })),
    );
    if (reference != null && reference > 0) references.set(key, reference);
  }
  return references;
}

/** Summarize one model's measured basket against fixed population references, allocating index breadth only after reference-supported components are selected. */
export function summarizeResourceRatios(
  observations: readonly ResourceRatioObservation[],
  references: ReadonlyMap<string, number>,
): ResourceRatioSummary {
  const supported = observations.filter(
    (observation) =>
      positiveFiniteNumber(references.get(observation.benchmarkKey)) != null &&
      positiveFiniteNumber(observation.amount) != null &&
      positiveFiniteNumber(observation.weight) != null,
  );
  const includedKeys = supported.map((observation) => observation.baseBenchmarkKey);
  const allocated = supported
    .map((observation) => ({
      ...observation,
      weight: observation.weight * residualIndexBreadth(observation.baseBenchmarkKey, includedKeys),
    }))
    .filter((observation) => observation.weight > 0);
  return {
    ratio: weightedMedianOfFinite(
      allocated.map((observation) => ({
        value: observation.amount / references.get(observation.benchmarkKey)!,
        weight: observation.weight,
      })),
    ),
    benchmarkCount: new Set(allocated.map((observation) => observation.baseBenchmarkKey)).size,
    sourceCount: new Set(allocated.map((observation) => observation.benchmarkKey)).size,
  };
}

/** Prefer compatible direct telemetry; otherwise preserve each observed source’s paired quality and reserved weight. */
function benchmarkObservations(
  model: ModelAtlasModel,
  key: string,
  kind: ResourceRatioKind,
  slots: number,
): ResourceRatioObservation[] {
  const metadata = asRecord(asRecord(asRecord(asRecord(model).scoring_sources)[key]).metadata);
  const field =
    kind === "cost" ? "cost" : kind === "time" ? "seconds_per_task" : `${kind}_per_task`;
  const direct =
    metadata[`fusion_${field}_estimated`] === true ||
    metadata[`fusion_${field}_comparable`] === false
      ? null
      : metricAmount(benchmarkTaskMetrics(model, key), kind);
  const quality = benchmarkMetricValue(model, key);
  if (direct != null && quality != null)
    return [
      {
        model,
        benchmarkKey: key,
        baseBenchmarkKey: key,
        amount: direct,
        quality,
        weight: 1,
      },
    ];
  const separated = separatedBenchmarkResourceSources(model, key);
  const observations: ResourceRatioObservation[] = [];
  for (const source of ["source_a", "source_b", "source_c"] as const) {
    const benchmarkKey = resourceSourceMetricKey(key, source);
    const task = asRecord(asRecord(model.task_metrics)[benchmarkKey]);
    const sourceAmount = asFiniteNumber(task.quality) != null ? metricAmount(task, kind) : null;
    const original = separated.find((candidate) => candidate.source === source);
    const amount =
      sourceAmount ??
      (original == null
        ? null
        : kind === "cost"
          ? original.cost
          : kind === "time"
            ? original.reportedSeconds
            : original.tokens);
    if (amount != null && amount > 0)
      observations.push({
        model,
        benchmarkKey,
        baseBenchmarkKey: key,
        amount,
        quality: sourceAmount != null ? asFiniteNumber(task.quality)! : original!.quality,
        weight: 1 / Math.max(2, slots),
      });
  }
  return observations;
}

/** Total consumption requires a complete input/output pair or an explicitly reported total; output-only telemetry never becomes total tokens. */
function metricAmount(task: unknown, kind: ResourceRatioKind): number | null {
  const metrics = asRecord(task);
  if (kind !== "tokens") return positiveFiniteNumber(metrics[kind === "time" ? "seconds" : kind]);
  const input = asFiniteNumber(metrics.input_tokens);
  const output = asFiniteNumber(metrics.output_tokens);
  return input != null && input >= 0 && output != null && output >= 0
    ? positiveFiniteNumber(input + output)
    : positiveFiniteNumber(metrics.tokens);
}

/** Catalogue declarations and observed source slots reserve missing source shares before any model is summarized. */
function sourceAllocations(
  models: readonly ModelAtlasModel[],
  keys: readonly string[],
): Map<string, number> {
  return new Map(
    keys.map((key) => {
      const declared = asRecord(asRecord(BENCHMARK_RESOURCE_SOURCE_LABELS)[key]);
      const slots = new Set(Object.keys(declared));
      for (const model of models) {
        const metadata = asRecord(
          asRecord(asRecord(asRecord(model).scoring_sources)[key]).metadata,
        );
        for (const source of resourceSourcesFromMetadata(metadata)) slots.add(source);
        for (const source of ["source_a", "source_b", "source_c"] as const)
          if (Object.hasOwn(asRecord(model.task_metrics), resourceSourceMetricKey(key, source)))
            slots.add(source);
      }
      return [key, slots.size];
    }),
  );
}
