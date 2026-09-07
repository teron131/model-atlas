/** Quality coordinates own observed normalization anchors and the bounded Agentic token adjustment used by scoring and sibling estimation. */

import {
  calibrationObservations,
  effectiveModelCount,
} from "../../benchmarks/calibration-population";
import type { BenchmarkDimension } from "../../benchmarks/factory";
import type { ScoringConfig } from "../../config/stage";
import { canonicalModelKey, canonicalReasoningEffort } from "../../identity/normalization";
import { clamp } from "../../math-utils";
import type { JsonObject } from "../../runtime";
import type { ModelAtlasCandidate } from "../model-types";
import { type EffortResourceImputation, imputedTaskResource } from "./imputation/resource-evidence";
import {
  clampScore,
  logitUnitScore,
  minMaxRange,
  type MinMaxRange,
  minMaxScale,
} from "./normalization";
import { qualityAdjustedResourceMultipliers } from "./resource-efficiency";
import {
  benchmarkMetricValue,
  type BenchmarkTokenMeasure,
  directBenchmarkTokens,
} from "./resource-metrics";

/** Normalized sibling estimates affect scoring only; observations and evidence counts remain separate. */
export type QualityScoringContext = {
  siblingQualityEstimates?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  benchmarkRangesByKey: ReadonlyMap<string, MinMaxRange | null>;
  agenticTokenAdjustments?: ReadonlyMap<string, AgenticTokenAdjustment>;
};

type AgenticTokenAdjustment = {
  resourceKey: string;
  measure: BenchmarkTokenMeasure;
  range: MinMaxRange | null;
  multipliersByObservation: ReadonlyMap<string, number>;
};

const TOKEN_MEASURES = ["tokens", "output_tokens"] as const;

/** Precompute finite comparison ranges used to normalize quality fields before averaging. */
export function buildQualityScoringContext(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): QualityScoringContext {
  const benchmarkKeys = [
    ...new Set([
      ...scoringConfig.intelligenceBenchmarkKeys,
      ...scoringConfig.agenticBenchmarkKeys,
      ...scoringConfig.previewAdditionalIntelligenceBenchmarkKeys,
    ]),
  ];
  const benchmarkRangesByKey = observedRangesByBenchmark(models, benchmarkKeys);
  return { benchmarkRangesByKey };
}

/** Normalize a raw observation against the shared measured population. */
export function normalizedMetricValue(
  rangesByKey: ReadonlyMap<string, MinMaxRange | null>,
  key: string,
  value: number | null,
): number | null {
  const normalized = minMaxScale(rangesByKey.get(key) ?? null, value);
  return normalized == null ? null : clampScore(normalized);
}

/** Keep normalization ranges independent of estimates. */
export function observedRangesByBenchmark(
  models: JsonObject[],
  benchmarkKeys: readonly string[],
): Map<string, MinMaxRange | null> {
  return new Map(
    benchmarkKeys.map(
      (key) => [key, minMaxRange(models.map((model) => benchmarkMetricValue(model, key)))] as const,
    ),
  );
}

/** Build only the Agentic scoring projection; raw quality, imputation inputs, and telemetry remain unchanged. */
export function buildAgenticTokenScoringContext(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  qualityContext: QualityScoringContext,
  tokenImputation?: EffortResourceImputation,
): QualityScoringContext {
  const adjustments = new Map<string, AgenticTokenAdjustment>();
  if (scoringConfig.agenticTokenModifierCap === 0) {
    return { ...qualityContext, agenticTokenAdjustments: adjustments };
  }
  for (const key of scoringConfig.agenticBenchmarkKeys) {
    const coordinate =
      scoringConfig.benchmarkPortfolio[key]?.resourcePolicy?.qualityCoordinate ??
      (key === "aa_intelligence_index" ? "linear" : null);
    if (coordinate == null) continue;
    const resourceKey = key === "aa_intelligence_index" ? "artificial_analysis" : key;
    const qualityRange = qualityContext.benchmarkRangesByKey.get(key);
    if (qualityRange == null || !(qualityRange.min < qualityRange.max)) continue;
    const qualities = models.map((model) => benchmarkMetricValue(model, key));
    for (const measure of TOKEN_MEASURES) {
      const directTokensByModel = new Map(
        models.map((model) => [model, directBenchmarkTokens(model, resourceKey, measure)]),
      );
      const estimates = models.map((model) =>
        tokenImputation == null ? null : imputedTaskResource(tokenImputation, model, key, measure),
      );
      const tokensByModel = new Map(
        models.map((model, index) => [
          model,
          directTokensByModel.get(model) ?? estimates[index]?.amount ?? null,
        ]),
      );
      const observations = calibrationObservations(models, (model) =>
        benchmarkMetricValue(model, key) == null ? null : (directTokensByModel.get(model) ?? null),
      );
      if (effectiveModelCount(observations) < 3) continue;
      const tokens = observations.map(({ value }) => value);
      // The first supported measure owns the benchmark, even when its token population is flat.
      if (!(Math.min(...tokens) < Math.max(...tokens))) break;
      const multipliers = qualityAdjustedResourceMultipliers(
        models,
        qualities.map((value) =>
          value == null || coordinate === "linear" ? value : logitUnitScore(value),
        ),
        models.map((model) => {
          const amount = tokensByModel.get(model) ?? null;
          return amount == null ? null : Math.log(amount);
        }),
        scoringConfig.agenticTokenModifierCap,
        coordinate,
        models.map((model) => directTokensByModel.get(model) != null),
      );
      const values: number[] = [];
      const multipliersByObservation = new Map<string, number>();
      for (const [index, model] of models.entries()) {
        const value = normalizedMetricValue(
          qualityContext.benchmarkRangesByKey,
          key,
          qualities[index] ?? null,
        );
        if (value == null) continue;
        const direct = directTokensByModel.get(model) != null;
        const credit = direct ? 1 : (estimates[index]?.confidence ?? 0);
        const multiplier = 1 + credit * (multipliers[index]! - 1);
        // Estimated resource use cannot move normalization anchors or become peer evidence.
        values.push(value * (direct ? multiplier : 1));
        multipliersByObservation.set(
          tokenObservationKey(model, qualities[index]!, directTokensByModel.get(model) ?? null),
          multiplier,
        );
      }
      adjustments.set(key, {
        resourceKey,
        measure,
        range: minMaxRange(values),
        multipliersByObservation,
      });
      // One consistent measure owns the entire benchmark; do not mix totals and output-only rows.
      break;
    }
  }
  return { ...qualityContext, agenticTokenAdjustments: adjustments };
}

/** Historical candidates can share an ID and effort; their distinct quality/token observations must not overwrite each other. */
function tokenObservationKey(
  model: { id?: unknown; name?: unknown; reasoning_effort?: unknown },
  quality: number,
  tokens: number | null,
): string {
  return JSON.stringify([
    model.id ?? model.name,
    canonicalReasoningEffort(model.reasoning_effort),
    quality,
    tokens,
  ]);
}

/** Apply token efficiency only in the Agentic view, before the adjusted cohort is mapped back to 0–100. */
export function normalizedQualityBenchmarkValue(
  model: {
    id?: unknown;
    name?: unknown;
    reasoning_effort?: unknown;
    benchmarks?: unknown;
    intelligence?: unknown;
    task_metrics?: unknown;
  },
  key: string,
  rawValue: number | null,
  dimension: BenchmarkDimension,
  context: QualityScoringContext,
): number | null {
  const value = normalizedMetricValue(context.benchmarkRangesByKey, key, rawValue);
  const adjustment = dimension === "agentic" ? context.agenticTokenAdjustments?.get(key) : null;
  if (value == null || adjustment == null) return value;
  const observed = benchmarkMetricValue(model, key);
  const multiplier =
    observed == null
      ? 1
      : (adjustment.multipliersByObservation.get(
          tokenObservationKey(
            model,
            observed,
            directBenchmarkTokens(model, adjustment.resourceKey, adjustment.measure),
          ),
        ) ?? 1);
  const adjusted = minMaxScale(adjustment.range, value * multiplier);
  return adjusted == null ? null : clamp(adjusted, 0, 100);
}

/** Stable identity lookup survives candidate enrichment and keeps quality dimensions separate. */
export function siblingQualityKey(
  model: { id?: unknown; name?: unknown; reasoning_effort?: unknown },
  dimension: BenchmarkDimension,
): string {
  return JSON.stringify([
    canonicalModelKey(model),
    canonicalReasoningEffort(model.reasoning_effort),
    dimension,
  ]);
}
