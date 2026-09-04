/** Benchmark explanations combine observed coverage in the current view with the payload's configured scoring weights. */

import { benchmarkDimensionWeight } from "../../../src/model-atlas/benchmarks/registry";
import type {
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltipRow,
} from "../../../src/model-atlas/config/tooltips";
import {
  type BenchmarkMetricModel,
  benchmarkMetricValue,
} from "../../../src/model-atlas/pipeline/scores/resource-metrics";
import type { ModelAtlasMetadata } from "../../../src/model-atlas/stats/types";
import { benchmarkTooltips } from "./constants";

export type BenchmarkTooltipContext = {
  models: readonly BenchmarkMetricModel[];
  scoring: ModelAtlasMetadata["scoring"] | undefined;
  unit?: "models" | "variants";
};

/** Enrich a benchmark's explanation without treating missing or estimated results as observed coverage. */
export function benchmarkTooltip(
  key: string,
  { models, scoring, unit = "models" }: BenchmarkTooltipContext,
): ModelAtlasColumnTooltip | undefined {
  const tooltip = benchmarkTooltips[key];
  if (tooltip == null) {
    return undefined;
  }
  const coverage = benchmarkCoverage(models, key);
  const coverageValue =
    coverage.total === 0
      ? `No ${unit} in current view`
      : `${coverage.observed} of ${coverage.total} ${unit} (${benchmarkCoverageLabel(coverage)})`;
  const rows: ModelAtlasColumnTooltipRow[] = [...(tooltip.rows ?? []), ["Coverage", coverageValue]];
  if (scoring != null && scoring.benchmark_portfolio[key] != null) {
    rows.push(
      ["Intel weight", dimensionWeightLabel(key, "intelligence", scoring)],
      ["Agentic weight", dimensionWeightLabel(key, "agentic", scoring)],
    );
  }
  return {
    ...tooltip,
    rows,
  };
}

/** Count direct benchmark values, including zero scores, in the supplied display population. */
export function benchmarkCoverage(models: readonly BenchmarkMetricModel[], key: string) {
  return {
    observed: models.filter((model) => benchmarkMetricValue(model, key) != null).length,
    total: models.length,
  };
}

export function benchmarkCoverageLabel({ observed, total }: { observed: number; total: number }) {
  return total === 0 ? "-" : `${Math.round((observed / total) * 100)}%`;
}

function dimensionWeightLabel(
  key: string,
  dimension: "intelligence" | "agentic",
  scoring: ModelAtlasMetadata["scoring"],
): string {
  const keys = scoring[`${dimension}_benchmark_keys`];
  const portfolio = scoring.benchmark_portfolio;
  const weight = keys.includes(key) ? benchmarkDimensionWeight(key, dimension, portfolio) : 0;
  const totalWeight = keys.reduce(
    (total, benchmark) => total + benchmarkDimensionWeight(benchmark, dimension, portfolio),
    0,
  );
  const share = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
  return `${Number((weight * 100).toFixed(1))}% · ${share.toFixed(1)}% share`;
}
