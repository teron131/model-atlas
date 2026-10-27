/** Benchmark versioning dates each observation against the previous published model and reprices task costs across model-price transitions. */

import { TASK_COST_PRICE_TRANSITIONS, type TaskCostPriceTransition } from "../../config/stage";
import { asFiniteNumber, asRecord } from "../../runtime";
import type {
  ModelAtlasCandidate,
  ModelAtlasModel,
  ModelAtlasTaskMetricValues,
} from "../model-types";

type TaskMetricNumericKey =
  | "quality"
  | "cost"
  | "seconds"
  | "tokens"
  | "input_tokens"
  | "output_tokens";

const PRICE_RATIO_TOLERANCE = 1e-9;

export type BenchmarkVersioningOptions = {
  observedAt?: string;
  baselineDate: string;
  observedDate: string;
};

function uniformPriceRatio(transition: TaskCostPriceTransition): number {
  const inputRatio = transition.priceFrom.input / transition.priceBefore.input;
  const outputRatio = transition.priceFrom.output / transition.priceBefore.output;
  if (
    !Number.isFinite(inputRatio) ||
    !Number.isFinite(outputRatio) ||
    inputRatio <= 0 ||
    Math.abs(inputRatio - outputRatio) > PRICE_RATIO_TOLERANCE
  ) {
    throw new Error(
      `Task-cost repricing requires one positive input/output ratio for ${transition.modelId}`,
    );
  }
  return inputRatio;
}

function taskCostPriceRatio(
  modelId: string | null,
  observedAt: string | null,
  options: BenchmarkVersioningOptions,
): number {
  if (modelId == null || observedAt == null) {
    return 1;
  }
  let ratio = 1;
  for (const transition of TASK_COST_PRICE_TRANSITIONS) {
    if (
      transition.modelId !== modelId ||
      options.observedDate < transition.effectiveDate ||
      observedAt > transition.effectiveDate
    ) {
      continue;
    }
    ratio *= uniformPriceRatio(transition);
  }
  return ratio;
}

function rawTaskMetricValue(
  metrics: ModelAtlasTaskMetricValues | null | undefined,
  key: TaskMetricNumericKey,
): number | null {
  if (metrics == null) {
    return null;
  }
  if (key === "cost") {
    return asFiniteNumber(metrics.observed_cost) ?? asFiniteNumber(metrics.cost);
  }
  return asFiniteNumber(metrics[key]);
}

/** Serialize the normalized source-reported task row used by both change detection and history. */
export function taskMetricFingerprint(metrics: ModelAtlasTaskMetricValues): string {
  return JSON.stringify({
    quality: rawTaskMetricValue(metrics, "quality"),
    cost: rawTaskMetricValue(metrics, "cost"),
    seconds: rawTaskMetricValue(metrics, "seconds"),
    tokens: rawTaskMetricValue(metrics, "tokens"),
    input_tokens: rawTaskMetricValue(metrics, "input_tokens"),
    output_tokens: rawTaskMetricValue(metrics, "output_tokens"),
  });
}

function taskMetricContentMatches(
  current: ModelAtlasTaskMetricValues,
  previous: ModelAtlasTaskMetricValues | null | undefined,
): boolean {
  return previous != null && taskMetricFingerprint(current) === taskMetricFingerprint(previous);
}

/**
 * Date benchmark observations against the previous published model and reprice only task rows whose complete normalized telemetry remains unchanged across a model-price transition.
 */
export function versionCandidateBenchmarkData(
  candidate: ModelAtlasCandidate,
  previous: ModelAtlasModel | null | undefined,
  options: BenchmarkVersioningOptions,
): ModelAtlasCandidate {
  const previousBenchmarks = previous?.benchmarks ?? {};
  const previousBenchmarkDates = previous?.benchmark_dates ?? {};
  const benchmarkDates = Object.fromEntries(
    Object.entries(candidate.benchmarks ?? {}).flatMap(([key, value]) => {
      const currentValue = asFiniteNumber(value);
      if (currentValue == null) {
        return [];
      }
      const previousValue = asFiniteNumber(previousBenchmarks[key]);
      return [
        [
          key,
          previousValue === currentValue
            ? (previousBenchmarkDates[key] ?? options.baselineDate)
            : options.observedDate,
        ],
      ];
    }),
  );
  const previousTaskMetrics = previous?.task_metrics ?? {};
  const taskMetrics = Object.fromEntries(
    Object.entries(candidate.task_metrics ?? {}).flatMap(([key, metrics]) => {
      if (metrics == null) {
        return [];
      }
      const previousMetrics = previousTaskMetrics[key];
      const rowUnchanged = taskMetricContentMatches(metrics, previousMetrics);
      const observedAt = rowUnchanged
        ? (previousMetrics?.observed_at ?? options.baselineDate)
        : options.observedDate;
      const sourceMetadata = asRecord(asRecord(asRecord(candidate.scoring_sources)[key]).metadata);
      const observedCost =
        sourceMetadata.fusion_cost_estimated === true ? null : rawTaskMetricValue(metrics, "cost");
      const costPriceRatio = rowUnchanged
        ? taskCostPriceRatio(candidate.id, observedAt, options)
        : 1;
      return [
        [
          key,
          {
            ...metrics,
            observed_at: observedAt,
            ...(observedCost == null
              ? {}
              : {
                  observed_cost: observedCost,
                  cost: observedCost * costPriceRatio,
                  cost_price_ratio: costPriceRatio,
                }),
          },
        ],
      ];
    }),
  );
  return {
    ...candidate,
    task_metrics: Object.keys(taskMetrics).length > 0 ? taskMetrics : null,
    benchmark_dates: Object.keys(benchmarkDates).length > 0 ? benchmarkDates : null,
  };
}
