/** Descriptive resource use compares observed amounts, with the gaps scoring estimated, against model-balanced benchmark medians, independently of achieved quality. */

import { modelCalibrationWeights } from "../benchmarks/calibration-population";
import type { BenchmarkPortfolio } from "../benchmarks/factory";
import {
  INDEX_BENCHMARK_KEYS,
  indexPolicy,
  residualIndexBreadth,
} from "../benchmarks/index-policy";
import { benchmarkValue } from "../benchmarks/registry";
import {
  BENCHMARK_RESOURCE_SOURCE_LABELS,
  BENCHMARK_RESOURCE_SOURCES,
  resourceSourceMetricKey,
} from "../benchmarks/resource-sources";
import { canonicalModelKey } from "../identity/normalization";
import { positiveFiniteNumber, weightedMedianOfFinite } from "../math-utils";
import type { ModelAtlasModel, ModelAtlasTaskEstimateMetric } from "../pipeline/model-types";
import { benchmarkTaskMetrics, directBenchmarkTokens } from "../pipeline/scores/resource-metrics";
import { asFiniteNumber, asRecord, groupBy } from "../runtime";
import type { ModelAtlasPayload } from "./types";

export type ResourceRatioKind = "cost" | "time" | "tokens";
/** An amount on one benchmark source or index, measured or estimated, with its share of a summary's weight. */
type ResourceRatioAmount = {
  benchmarkKey: string;
  baseBenchmarkKey: string;
  amount: number;
  weight: number;
};
export type ResourceRatioObservation = ResourceRatioAmount & {
  model: ModelAtlasModel;
  quality: number;
};
export type ResourceRatioSummary = {
  ratio: number | null;
  benchmarkCount: number;
  sourceCount: number;
};
export type ResourceRatios = Record<ResourceRatioKind, ResourceRatioSummary>;

/** Keep observed quality-resource pairs only, reserving missing source shares; index breadth is allocated after a caller selects its supported basket. */
export function resourceRatioObservations(
  models: readonly ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
  kind: ResourceRatioKind,
): ResourceRatioObservation[] {
  const observations: ResourceRatioObservation[] = [];
  const allocations = sourceAllocations(models, portfolio);
  for (const model of models) {
    for (const [key, slots] of allocations) {
      observations.push(...benchmarkObservations(model, key, kind, slots));
    }
    for (const key of INDEX_BENCHMARK_KEYS) {
      const policy = indexPolicy(key);
      const quality = benchmarkValue(model, key);
      if (portfolio[key] == null || policy?.resources == null || quality == null) continue;
      const amount = metricAmount(model, policy.resources.key, kind);
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
    const modelKeys = group.map((observation) => canonicalModelKey(observation.model));
    if (new Set(modelKeys).size < 2) continue;
    const weights = modelCalibrationWeights(modelKeys);
    const reference = weightedMedianOfFinite(
      group.map((observation, index) => ({
        value: observation.amount,
        weight: weights[index]!,
      })),
    );
    if (reference != null && reference > 0) references.set(key, reference);
  }
  return references;
}

/** Summarize one variant's basket against fixed population references, allocating index breadth only after reference-supported components are selected; estimates join the median but not the counts, which report measured evidence only. */
export function summarizeResourceRatios(
  observations: readonly ResourceRatioAmount[],
  references: ReadonlyMap<string, number>,
  estimates: readonly ResourceRatioAmount[] = [],
): ResourceRatioSummary {
  const supported = (amounts: readonly ResourceRatioAmount[]) =>
    amounts.filter(
      (amount) =>
        positiveFiniteNumber(references.get(amount.benchmarkKey)) != null &&
        positiveFiniteNumber(amount.amount) != null &&
        positiveFiniteNumber(amount.weight) != null,
    );
  const measured = supported(observations);
  const estimated = supported(estimates);
  const includedKeys = [...measured, ...estimated].map((amount) => amount.baseBenchmarkKey);
  const allocated = (amounts: readonly ResourceRatioAmount[]) =>
    amounts
      .map((amount) => ({
        ...amount,
        weight: amount.weight * residualIndexBreadth(amount.baseBenchmarkKey, includedKeys),
      }))
      .filter((amount) => amount.weight > 0);
  const counted = allocated(measured);
  return {
    ratio: weightedMedianOfFinite(
      [...counted, ...allocated(estimated)].map((amount) => ({
        value: amount.amount / references.get(amount.benchmarkKey)!,
        weight: amount.weight,
      })),
    ),
    benchmarkCount: new Set(counted.map((amount) => amount.baseBenchmarkKey)).size,
    sourceCount: new Set(counted.map((amount) => amount.benchmarkKey)).size,
  };
}

/** The benchmarks a ratio can count across the population: those with a reference on at least one of their sources. */
export function resourceRatioBenchmarks(
  models: readonly ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
  kind: ResourceRatioKind,
): string[] {
  const observations = resourceRatioObservations(models, portfolio, kind);
  const references = resourceRatioReferences(observations);
  return [
    ...new Set(
      observations
        .filter((observation) => references.has(observation.benchmarkKey))
        .map((observation) => observation.baseBenchmarkKey),
    ),
  ];
}

/** Prepare the benchmark medians from every variant in the snapshot. Each call then reserves source shares across the displayed models and returns their ratios in display order. */
export function prepareDisplayResourceRatios(payload: ModelAtlasPayload) {
  const portfolio = payload.metadata.scoring.benchmark_portfolio;
  const references = byKind((kind) =>
    resourceRatioReferences(resourceRatioObservations(payload.models, portfolio, kind)),
  );
  return (models: readonly ModelAtlasModel[]): ResourceRatios[] => {
    const observations = byKind((kind) =>
      groupBy(resourceRatioObservations(models, portfolio, kind), (row) => row.model),
    );
    return models.map((model) =>
      byKind((kind) => {
        const measured = observations[kind].get(model) ?? [];
        return summarizeResourceRatios(
          measured,
          references[kind],
          estimatedAmounts(model, kind, measured),
        );
      }),
    );
  };
}

const ESTIMATE_METRICS = {
  cost: "cost",
  time: "seconds",
  tokens: "tokens",
} as const satisfies Record<ResourceRatioKind, ModelAtlasTaskEstimateMetric>;

/** The model's scoring estimates as ratio amounts keyed like its observations, an index's under its resource source; a benchmark the row measured in any form takes none, since a collapsed row can hold results its shown variant lacked. */
function estimatedAmounts(
  model: ModelAtlasModel,
  kind: ResourceRatioKind,
  observations: readonly ResourceRatioObservation[],
): ResourceRatioAmount[] {
  const measured = new Set(observations.map((observation) => observation.baseBenchmarkKey));
  return Object.entries(model.estimated_task_metrics ?? {}).flatMap(([key, metrics]) => {
    const estimate = metrics[ESTIMATE_METRICS[kind]];
    return estimate == null || measured.has(key)
      ? []
      : [
          {
            benchmarkKey: indexPolicy(key)?.resources?.key ?? key,
            baseBenchmarkKey: key,
            amount: estimate.amount,
            weight: estimate.evidence_factor,
          },
        ];
  });
}

/** Prefer compatible direct telemetry; otherwise preserve each observed source’s paired quality and reserved weight. */
function benchmarkObservations(
  model: ModelAtlasModel,
  key: string,
  kind: ResourceRatioKind,
  slots: number,
): ResourceRatioObservation[] {
  const direct = metricAmount(model, key, kind);
  const quality = benchmarkValue(model, key);
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
  const observations: ResourceRatioObservation[] = [];
  for (const source of BENCHMARK_RESOURCE_SOURCES) {
    const benchmarkKey = resourceSourceMetricKey(key, source);
    const sourceQuality = asFiniteNumber(
      asRecord(asRecord(model.task_metrics)[benchmarkKey]).quality,
    );
    if (sourceQuality == null) continue;
    const amount = metricAmount(model, benchmarkKey, kind);
    if (amount != null)
      observations.push({
        model,
        benchmarkKey,
        baseBenchmarkKey: key,
        amount,
        quality: sourceQuality,
        weight: 1 / Math.max(2, slots),
      });
  }
  return observations;
}

/** Reported amounts only: time never falls back to the throughput runtime proxy, and output-only telemetry never becomes total tokens. */
function metricAmount(model: ModelAtlasModel, key: string, kind: ResourceRatioKind): number | null {
  if (kind === "tokens") return directBenchmarkTokens(model, key, "tokens");
  return positiveFiniteNumber(
    benchmarkTaskMetrics(model, key)?.[kind === "time" ? "seconds" : kind],
  );
}

/** Catalogue declarations and observed source slots reserve missing source shares before any model is summarized. */
function sourceAllocations(
  models: readonly ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
): Map<string, number> {
  const allocations = new Map<string, number>();
  for (const [key, entry] of Object.entries(portfolio)) {
    if (entry.resourcePolicy == null || indexPolicy(key) != null) continue;
    const declared = asRecord(asRecord(BENCHMARK_RESOURCE_SOURCE_LABELS)[key]);
    const slots = new Set(Object.keys(declared));
    for (const source of BENCHMARK_RESOURCE_SOURCES) {
      const metric = resourceSourceMetricKey(key, source);
      if (
        !slots.has(source) &&
        models.some((model) => Object.hasOwn(asRecord(model.task_metrics), metric))
      )
        slots.add(source);
    }
    allocations.set(key, slots.size);
  }
  return allocations;
}

function byKind<T>(read: (kind: ResourceRatioKind) => T): Record<ResourceRatioKind, T> {
  return { cost: read("cost"), time: read("time"), tokens: read("tokens") };
}
