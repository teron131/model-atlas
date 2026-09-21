/** Aggregate-index policy owns breadth, effort eligibility, component overlap, and resource semantics; consumers supply observed evidence. */

import { canonicalReasoningEffort } from "../identity/normalization";
import { medianOfFinite } from "../math-utils";
import { asFiniteNumber, asRecord } from "../runtime";
import type { BenchmarkPortfolioEntry, BenchmarkResourcePolicy } from "./factory";

type IndexPolicy = {
  representedBenchmarks: number;
  effortAware: boolean;
  componentBenchmarkKeys: readonly string[] | null;
  resources: {
    key: string;
    policy: BenchmarkResourcePolicy;
    imputationKinds: readonly string[];
  } | null;
};

const REPORTED_BREADTH = {
  aa_intelligence_index: 10,
  cais_capabilities_index: 7,
  surge_intelligence_index: 8,
  vals_index: 7,
} as const;

export const INDEX_REPRESENTED_BENCHMARK_MEDIAN = requiredMedian(Object.values(REPORTED_BREADTH));

/** Admission follows complete fixed portfolios, not ECI's minimum publication threshold. */
export const MINIMUM_REPORTED_INDEX_BREADTH = Math.min(...Object.values(REPORTED_BREADTH));

/** Record exact known constituent keys so direct and cross-index overlap can be counted once. */
export const INDEX_POLICIES = {
  aa_intelligence_index: {
    representedBenchmarks: REPORTED_BREADTH.aa_intelligence_index,
    effortAware: true,
    resources: {
      key: "artificial_analysis",
      policy: {
        source: "artificial_analysis",
        unit: "per_task",
        tokenMeasure: "output_tokens",
        qualityCoordinate: "linear",
      },
      imputationKinds: ["tokens", "output_tokens"],
    },
    componentBenchmarkKeys: [
      "briefcase",
      "gdpval_normalized",
      "automation_bench",
      "terminal_bench_4",
      "scicode",
      "hle",
      "gdp_pdf",
      "critpt",
      "omniscience_accuracy",
      "aa_lcr",
    ],
  },
  cais_capabilities_index: {
    representedBenchmarks: REPORTED_BREADTH.cais_capabilities_index,
    effortAware: true,
    resources: null,
    componentBenchmarkKeys: [
      "enigmaeval",
      "erqa",
      "hle",
      "intphys2",
      "mindcube",
      "spatialviz",
      "textquests",
    ],
  },
  epoch_capabilities_index: {
    representedBenchmarks: INDEX_REPRESENTED_BENCHMARK_MEDIAN,
    effortAware: false,
    resources: null,
    componentBenchmarkKeys: null,
  },
  surge_intelligence_index: {
    representedBenchmarks: REPORTED_BREADTH.surge_intelligence_index,
    effortAware: false,
    resources: null,
    componentBenchmarkKeys: null,
  },
  vals_index: {
    representedBenchmarks: REPORTED_BREADTH.vals_index,
    effortAware: false,
    resources: null,
    componentBenchmarkKeys: null,
  },
} as const satisfies Record<string, IndexPolicy>;

export type IndexBenchmarkKey = keyof typeof INDEX_POLICIES;

export const INDEX_BENCHMARK_KEYS = Object.keys(INDEX_POLICIES) as IndexBenchmarkKey[];

export const INDEX_REPRESENTED_BENCHMARK_COUNTS = Object.fromEntries(
  INDEX_BENCHMARK_KEYS.map((key) => [key, INDEX_POLICIES[key].representedBenchmarks]),
) as Record<IndexBenchmarkKey, number>;

export const AA_INDEX_COMPONENT_BENCHMARK_KEYS: ReadonlySet<string> = new Set(
  INDEX_POLICIES.aa_intelligence_index.componentBenchmarkKeys,
);

export const INDEX_SCORING_WEIGHT = {
  group: "baseline",
  benchmarkImportance: 1,
  dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
} as const satisfies Omit<BenchmarkPortfolioEntry, "resourcePolicy">;

export const CAIS_INDEX_SCORING_WEIGHT = {
  group: "baseline",
  benchmarkImportance: 1,
  dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
} as const satisfies Omit<BenchmarkPortfolioEntry, "resourcePolicy">;

export function isAggregateIndex(key: string): key is IndexBenchmarkKey {
  return Object.hasOwn(INDEX_POLICIES, key);
}

/** Resolve index-only rules without treating ordinary task benchmarks as aggregate evidence. */
export function indexPolicy(key: string): IndexPolicy | null {
  return isAggregateIndex(key) ? INDEX_POLICIES[key] : null;
}

/** Unlabelled indexes remain metadata and admission evidence, rather than substitutes for explicitly labelled variant measurements. */
export function excludesVariantIndex(model: { reasoning_effort?: unknown }, key: string): boolean {
  const policy = indexPolicy(key);
  return (
    canonicalReasoningEffort(model.reasoning_effort) != null &&
    policy != null &&
    !policy.effortAware
  );
}

/** Read support from the assigned observation, preserving unknown counts instead of borrowing another model's breadth. */
export function reportedIndexBenchmarkCount(model: unknown, key: string): number | null {
  const sources = asRecord(asRecord(model).scoring_sources);
  const count = asFiniteNumber(asRecord(asRecord(sources[key]).metadata).benchmark_count);
  return count != null && Number.isInteger(count) && count > 0 ? count : null;
}

/** Count each included component once, without reconstructing index values or inferring missing observations. */
export function residualIndexBreadth(
  key: string,
  includedKeys: readonly string[] = [],
  reportedCount?: number | null,
): number {
  const policy = indexPolicy(key);
  const breadth = representedIndexBreadth(key, reportedCount);
  const componentBenchmarkKeys = policy?.componentBenchmarkKeys ?? [];
  const overlap = new Set(
    includedKeys.filter((candidate) => componentBenchmarkKeys.includes(candidate)),
  ).size;
  return Math.max(0, breadth - overlap);
}

/** Allocate one evidence credit across duplicate known constituents while preserving each index's opaque remainder. */
export function qualityIndexBreadths(
  indexes: readonly { key: string; reportedCount?: number | null }[],
  observedBenchmarkKeys: readonly string[] = [],
): Map<string, number> {
  const directlyObserved = new Set(observedBenchmarkKeys);
  const componentOwners = new Map<string, number>();
  for (const { key } of indexes) {
    for (const component of indexPolicy(key)?.componentBenchmarkKeys ?? []) {
      if (!directlyObserved.has(component)) {
        componentOwners.set(component, (componentOwners.get(component) ?? 0) + 1);
      }
    }
  }

  return new Map(
    indexes.map(({ key, reportedCount }) => {
      const breadth = representedIndexBreadth(key, reportedCount);
      const components = indexPolicy(key)?.componentBenchmarkKeys ?? [];
      const overlap = components.reduce((sum, component) => {
        if (directlyObserved.has(component)) return sum + 1;
        const owners = componentOwners.get(component) ?? 1;
        return sum + (1 - 1 / owners);
      }, 0);
      return [key, Math.max(0, breadth - overlap)];
    }),
  );
}

/** ECI deliberately uses the fixed cross-index median; other indexes may retain edition-specific reported breadth. */
function representedIndexBreadth(key: string, reportedCount?: number | null): number {
  const policy = indexPolicy(key);
  if (key === "epoch_capabilities_index") return INDEX_REPRESENTED_BENCHMARK_MEDIAN;
  return reportedCount != null && Number.isInteger(reportedCount) && reportedCount > 0
    ? reportedCount
    : (policy?.representedBenchmarks ?? 1);
}

function requiredMedian(values: readonly number[]): number {
  const median = medianOfFinite(values);
  if (median == null)
    throw new Error("Index benchmark representation counts must contain a finite value");
  return median;
}
