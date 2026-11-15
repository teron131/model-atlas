/** Comparable resource baskets preserve each model's index-backed variant coverage and use the same observed evidence on both axes. */

import {
  isAggregateIndex,
  residualIndexBreadth,
} from "../../../../src/model-atlas/benchmarks/index-policy";
import { canonicalModelKey } from "../../../../src/model-atlas/identity/normalization";
import { modelVariantKey } from "../../../../src/model-atlas/stats/model-variants";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import {
  aggregateFrontierBenchmarkRows,
  frontierAxisValue,
  type FrontierBenchmarkAxisKey,
  type FrontierBenchmarkRow,
  isScoreAxis,
  mergedBenchmarkSourceRows,
  normalizedFrontierBenchmarkRows,
  normalizedFrontierBenchmarkScoreRows,
  positiveMetric,
} from "./analysis";

export type CommonBenchmarkComparison = {
  rows: FrontierBenchmarkRow[];
  benchmarkKeys: readonly string[];
  indexVariantCount: number;
  excludedVariantCount: number;
  groups: CommonModelEvidence[];
};

type CommonModelEvidence = {
  modelKey: string;
  model: ModelAtlasModel;
  benchmarkKeys: readonly string[];
  indexShare: number;
  effortCount: number;
};

/** Each model keeps one observed basket across its displayed efforts; unrelated models cannot shrink it. */
export function commonBenchmarkComparison(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[],
  selectedBenchmarkKeys: readonly string[],
  axisKey: FrontierBenchmarkAxisKey,
): CommonBenchmarkComparison {
  if (selectedBenchmarkKeys.length < 2) {
    // One benchmark keeps its native units with its sources merged per variant; ALE-Bench alone needs the normalized chart scale.
    const [key] = selectedBenchmarkKeys;
    const selectedRows = key == null ? [] : rows.filter((row) => row.baseBenchmarkKey === key);
    return {
      rows: mergedBenchmarkSourceRows(
        key === "ale_bench"
          ? normalizedFrontierBenchmarkScoreRows(selectedRows, referenceRows)
          : selectedRows,
      ),
      benchmarkKeys: selectedBenchmarkKeys,
      indexVariantCount: 0,
      excludedVariantCount: 0,
      groups: [],
    };
  }
  const selected = new Set(selectedBenchmarkKeys);
  const metric = (row: FrontierBenchmarkRow) => frontierAxisValue(row, axisKey);
  const observed = rows.filter(
    (row) =>
      selected.has(row.baseBenchmarkKey) && positiveMetric(metric(row), isScoreAxis(axisKey)),
  );
  // Uncalibrated or unpaired observations cannot enter a normalized basket or its disclosure.
  const normalized = normalizedFrontierBenchmarkRows(observed, referenceRows).filter((row) =>
    positiveMetric(metric(row), true),
  );
  const result: FrontierBenchmarkRow[] = [];
  const groups: CommonModelEvidence[] = [];
  let indexVariantCount = 0;
  let excludedVariantCount = 0;
  const rowsByModel = new Map<string, FrontierBenchmarkRow[]>();
  for (const row of normalized) {
    const key = canonicalModelKey(row.model);
    const group = rowsByModel.get(key) ?? [];
    group.push(row);
    rowsByModel.set(key, group);
  }
  // Models follow the leaderboard: each by its strongest listed variant's Intelligence Score, ties in arrival order.
  const strongest = (modelRows: FrontierBenchmarkRow[]) =>
    Math.max(...modelRows.map((row) => row.model.scores.intelligence_score));
  const ranked = [...rowsByModel].sort(([, left], [, right]) => strongest(right) - strongest(left));
  for (const [modelKey, modelRows] of ranked) {
    const rowsByVariant = new Map<string, FrontierBenchmarkRow[]>();
    for (const row of modelRows) {
      const key = modelVariantKey(row.model);
      const group = rowsByVariant.get(key) ?? [];
      group.push(row);
      rowsByVariant.set(key, group);
    }
    const allVariants = [...rowsByVariant.values()];
    const indexVariants = allVariants.filter((variant) =>
      variant.some((row) => isAggregateIndex(row.baseBenchmarkKey)),
    );
    const variants = indexVariants.length > 0 ? indexVariants : allVariants;
    const compared = new Set(variants.map((variant) => modelVariantKey(variant[0]!.model)));
    const benchmarkKeys = selectedBenchmarkKeys.filter((key) =>
      variants.every((variant) => variant.some((row) => row.baseBenchmarkKey === key)),
    );
    const shared = new Set(benchmarkKeys);
    const commonRows = modelRows.filter(
      (row) => shared.has(row.baseBenchmarkKey) && compared.has(modelVariantKey(row.model)),
    );
    const plotted = aggregateFrontierBenchmarkRows(commonRows);
    result.push(...plotted);
    indexVariantCount += indexVariants.length;
    excludedVariantCount += allVariants.length - variants.length;
    // Each benchmark contributes all of its sources from the first variant that measured it, so their shared weight counts once.
    const components = benchmarkKeys.flatMap((key) => {
      const row = modelRows.find((candidate) => candidate.baseBenchmarkKey === key);
      return row == null
        ? []
        : modelRows.filter(
            (candidate) =>
              candidate.baseBenchmarkKey === key &&
              modelVariantKey(candidate.model) === modelVariantKey(row.model),
          );
    });
    const includedBaseKeys = [...new Set(components.map((row) => row.baseBenchmarkKey))];
    const totalWeight = components.reduce(
      (sum, row) => sum + row.weight * residualIndexBreadth(row.baseBenchmarkKey, includedBaseKeys),
      0,
    );
    const indexWeight = components
      .filter((row) => isAggregateIndex(row.baseBenchmarkKey))
      .reduce(
        (sum, row) =>
          sum + row.weight * residualIndexBreadth(row.baseBenchmarkKey, includedBaseKeys),
        0,
      );
    groups.push({
      modelKey,
      model: modelRows[0]!.model,
      benchmarkKeys,
      indexShare: totalWeight > 0 ? indexWeight / totalWeight : 0,
      effortCount: plotted.length,
    });
  }
  return {
    rows: result.sort((left, right) => right.score - left.score),
    benchmarkKeys: [...new Set(groups.flatMap((group) => group.benchmarkKeys))],
    indexVariantCount,
    excludedVariantCount,
    groups,
  };
}
