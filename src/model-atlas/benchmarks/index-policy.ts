/** Aggregate-index policy owns breadth, effort eligibility, component overlap, admission fields, and resource semantics; consumers supply observed evidence. */

import { medianOfFinite } from "../math-utils";
import type { BenchmarkPortfolioEntry, BenchmarkResourcePolicy } from "./factory";
import { ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS } from "./field-keys";

type IndexPolicy = {
  representedBenchmarks: number;
  effortAware: boolean;
  standaloneComponents: readonly string[];
  admissionFields: readonly string[] | null;
  resources: {
    key: string;
    policy: BenchmarkResourcePolicy;
    imputationKinds: readonly string[];
  } | null;
};

const REPORTED_BREADTH = {
  aa_intelligence_index: 10,
  surge_intelligence_index: 8,
  vals_index: 7,
} as const;

/** Keep index order stable for presentation and retain Epoch's existing inferred-breadth policy. */
export const INDEX_POLICIES = {
  aa_intelligence_index: {
    representedBenchmarks: REPORTED_BREADTH.aa_intelligence_index,
    effortAware: true,
    admissionFields: ARTIFICIAL_ANALYSIS_INDEX_SCORE_KEYS,
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
    standaloneComponents: [
      "briefcase",
      "gdpval_normalized",
      "tau_banking",
      "scicode",
      "hle",
      "gdp_pdf",
      "critpt",
    ],
  },
  epoch_capabilities_index: {
    representedBenchmarks: requiredMedian(Object.values(REPORTED_BREADTH)),
    effortAware: false,
    admissionFields: null,
    resources: null,
    standaloneComponents: [],
  },
  surge_intelligence_index: {
    representedBenchmarks: REPORTED_BREADTH.surge_intelligence_index,
    effortAware: false,
    admissionFields: null,
    resources: null,
    standaloneComponents: [],
  },
  vals_index: {
    representedBenchmarks: REPORTED_BREADTH.vals_index,
    effortAware: false,
    admissionFields: null,
    resources: null,
    standaloneComponents: [],
  },
} as const satisfies Record<string, IndexPolicy>;

export type IndexBenchmarkKey = keyof typeof INDEX_POLICIES;

export const INDEX_BENCHMARK_KEYS = Object.keys(INDEX_POLICIES) as IndexBenchmarkKey[];

export const INDEX_REPRESENTED_BENCHMARK_COUNTS = Object.fromEntries(
  INDEX_BENCHMARK_KEYS.map((key) => [key, INDEX_POLICIES[key].representedBenchmarks]),
) as Record<IndexBenchmarkKey, number>;

export const INDEX_REPRESENTED_BENCHMARK_MEDIAN = requiredMedian(
  Object.values(INDEX_REPRESENTED_BENCHMARK_COUNTS),
);

export const AA_INDEX_STANDALONE_COMPONENT_KEYS: ReadonlySet<string> = new Set(
  INDEX_POLICIES.aa_intelligence_index.standaloneComponents,
);

export const INDEX_SCORING_WEIGHT = {
  group: "baseline",
  benchmarkImportance: 0.5,
  dimensionLoadings: { intelligence: 0.5, agentic: 0.5 },
} as const satisfies Omit<BenchmarkPortfolioEntry, "resourcePolicy">;

export function isAggregateIndex(key: string): key is IndexBenchmarkKey {
  return Object.hasOwn(INDEX_POLICIES, key);
}

/** Resolve index-only rules without treating ordinary task benchmarks as aggregate evidence. */
export function indexPolicy(key: string): IndexPolicy | null {
  return isAggregateIndex(key) ? INDEX_POLICIES[key] : null;
}

/** Count each included component once, without reconstructing index values or inferring missing observations. */
export function residualIndexBreadth(key: string, includedKeys: readonly string[] = []): number {
  if (!isAggregateIndex(key)) return 1;
  const policy: IndexPolicy = INDEX_POLICIES[key];
  const overlap = new Set(
    includedKeys.filter((candidate) => policy.standaloneComponents.includes(candidate)),
  ).size;
  return Math.max(0, policy.representedBenchmarks - overlap);
}

function requiredMedian(values: readonly number[]): number {
  const median = medianOfFinite(values);
  if (median == null)
    throw new Error("Index benchmark representation counts must contain a finite value");
  return median;
}
