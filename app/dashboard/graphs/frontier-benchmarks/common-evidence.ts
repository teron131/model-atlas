/** Comparable resource baskets preserve each model's index-backed variant coverage and use the same observed evidence on both axes. */

import { canonicalModelKey } from "../../../../src/model-atlas/identity/normalization";
import type { ModelAtlasPublishedModel } from "../../../../src/model-atlas/stats/types";
import { modelVariantKey } from "../../shared/model-display";
import {
  frontierBenchmarkAxisConfig,
  type FrontierBenchmarkAxisKey,
  type FrontierBenchmarkRow,
  frontierEvidenceWeight,
  isIndexProxy,
  isScoreAxis,
  meanFrontierBenchmarkRows,
  normalizedFrontierBenchmarkRows,
  positiveMetric,
  selectedFrontierBenchmarkRows,
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
  model: ModelAtlasPublishedModel;
  benchmarkKeys: readonly string[];
  indexShare: number;
  effortCount: number;
};

/** Each model keeps one observed basket across its displayed efforts; unrelated models cannot shrink it. */
export function sharedFrontierBenchmarkComparison(
  rows: FrontierBenchmarkRow[],
  referenceRows: FrontierBenchmarkRow[],
  selectedBenchmarkKeys: readonly string[],
  axisKey: FrontierBenchmarkAxisKey,
): CommonBenchmarkComparison {
  if (selectedBenchmarkKeys.length < 2) {
    return {
      rows: selectedFrontierBenchmarkRows(rows, referenceRows, selectedBenchmarkKeys),
      benchmarkKeys: selectedBenchmarkKeys,
      indexVariantCount: 0,
      excludedVariantCount: 0,
      groups: [],
    };
  }
  const selected = new Set(selectedBenchmarkKeys);
  const metric = frontierBenchmarkAxisConfig[axisKey].get;
  const observed = rows.filter(
    (row) => selected.has(row.benchmarkKey) && positiveMetric(metric(row), isScoreAxis(axisKey)),
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
  for (const [modelKey, modelRows] of rowsByModel) {
    const rowsByVariant = new Map<string, FrontierBenchmarkRow[]>();
    for (const row of modelRows) {
      const key = modelVariantKey(row.model);
      const group = rowsByVariant.get(key) ?? [];
      group.push(row);
      rowsByVariant.set(key, group);
    }
    const allVariants = [...rowsByVariant.values()];
    const indexVariants = allVariants.filter((variant) =>
      variant.some((row) => isIndexProxy(row.benchmarkKey)),
    );
    const variants = indexVariants.length > 0 ? indexVariants : allVariants;
    const compared = new Set(variants.map((variant) => modelVariantKey(variant[0]!.model)));
    const benchmarkKeys = selectedBenchmarkKeys.filter((key) =>
      variants.every((variant) => variant.some((row) => row.benchmarkKey === key)),
    );
    const shared = new Set(benchmarkKeys);
    const commonRows = modelRows.filter(
      (row) => shared.has(row.benchmarkKey) && compared.has(modelVariantKey(row.model)),
    );
    const plotted = meanFrontierBenchmarkRows(commonRows);
    result.push(...plotted);
    indexVariantCount += indexVariants.length;
    excludedVariantCount += allVariants.length - variants.length;
    const totalWeight = benchmarkKeys.reduce(
      (sum, key) => sum + frontierEvidenceWeight(key, benchmarkKeys),
      0,
    );
    const indexWeight = benchmarkKeys
      .filter(isIndexProxy)
      .reduce((sum, key) => sum + frontierEvidenceWeight(key, benchmarkKeys), 0);
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
