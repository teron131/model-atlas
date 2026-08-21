/** Composes Model Atlas benchmark declarations into configured runtime and presentation views. */

import {
  ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_ALIASES,
  ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_KEYS_AFTER,
  BENCHMARK_COLUMNS,
  BENCHMARK_DISPLAY_ORDER,
  BENCHMARK_EXTENDED_SOURCES,
  BENCHMARK_IMPUTATION_OVERRIDES,
  BENCHMARK_LABELS,
  BENCHMARK_PERSISTENCE_OVERRIDES,
  BENCHMARK_PROCESSING_OVERRIDES,
  BENCHMARK_RESOURCE_POLICIES,
  BENCHMARK_SCORING_LABELS,
  BENCHMARK_SCORING_WEIGHTS,
  BENCHMARK_STANDARD_SOURCES,
  BENCHMARK_TASK_METRIC_COLUMNS,
  BENCHMARK_TOOLTIPS,
  type BenchmarkKey,
  MODEL_ATLAS_ADDITIONAL_BENCHMARK_KEYS_AFTER,
} from "./catalog";
import {
  applyBenchmarkTransform,
  type BenchmarkAggregationPolicy,
  type BenchmarkDefinition,
  type BenchmarkDimension,
  type BenchmarkGroup,
  type BenchmarkPersistenceFacet,
  type BenchmarkPortfolio,
  type BenchmarkPortfolioEntry,
  type BenchmarkProcessingFacet,
  type BenchmarkScoringFacet,
  type BenchmarkSourceAdapter,
  type BenchmarkSourceFacet,
  type BenchmarkSourceGroup,
  type BenchmarkSourceInput,
  type BenchmarkSourceRuntime,
  type BenchmarkSourceTransform,
  defineBenchmarks,
} from "./factory";

export type { BenchmarkKey } from "./catalog";
export { BENCHMARK_TASK_METRIC_COLUMNS, INDEX_BENCHMARK_KEYS } from "./catalog";

const IDENTITY_TRANSFORM = {
  kind: "identity",
} as const satisfies BenchmarkSourceTransform;
const DIRECT_AGGREGATION = {
  kind: "direct",
} as const satisfies BenchmarkAggregationPolicy;
const DEFAULT_BENCHMARK_PERSISTENCE = {
  location: { kind: "benchmark" },
} as const satisfies BenchmarkPersistenceFacet;

function resolveBenchmarkProcessing(
  overrides: Partial<BenchmarkProcessingFacet> = {},
): BenchmarkProcessingFacet {
  return {
    transform: overrides.transform ?? IDENTITY_TRANSFORM,
    aggregation: overrides.aggregation ?? DIRECT_AGGREGATION,
    ...(overrides.sourceCrosswalk == null ? {} : { sourceCrosswalk: overrides.sourceCrosswalk }),
  };
}

export type BenchmarkObservationKey = keyof typeof BENCHMARK_STANDARD_SOURCES;

type StandardBenchmarkSourceFacet<Key extends BenchmarkObservationKey> = {
  inputs: readonly [
    {
      group: (typeof BENCHMARK_STANDARD_SOURCES)[Key]["group"];
      id: (typeof BENCHMARK_STANDARD_SOURCES)[Key]["id"];
      roles: (typeof BENCHMARK_STANDARD_SOURCES)[Key] extends {
        roles: infer Roles extends readonly ["observation", ...("resource" | "validation")[]];
      }
        ? Roles
        : readonly ["observation"];
      adapters: readonly [
        {
          kind: "benchmark_observation";
          sourceDataKey: (typeof BENCHMARK_STANDARD_SOURCES)[Key]["sourceDataKey"];
          sourceRowsKey: (typeof BENCHMARK_STANDARD_SOURCES)[Key]["sourceRowsKey"];
        },
      ];
    },
  ];
};

type DeclaredBenchmarkSources = {
  [Key in BenchmarkKey]: Key extends keyof typeof BENCHMARK_EXTENDED_SOURCES
    ? (typeof BENCHMARK_EXTENDED_SOURCES)[Key]
    : Key extends BenchmarkObservationKey
      ? StandardBenchmarkSourceFacet<Key>
      : never;
};

type ResolvedBenchmarkSourceInput<Input> = Input & {
  evidenceKey?: string;
  adapters?: readonly BenchmarkSourceAdapter[];
  runtime?: BenchmarkSourceRuntime;
};

type ResolvedBenchmarkSourceInputs<
  Inputs extends readonly [BenchmarkSourceInput, ...BenchmarkSourceInput[]],
> = Inputs extends readonly [
  infer First extends BenchmarkSourceInput,
  ...infer Rest extends BenchmarkSourceInput[],
]
  ? readonly [
      ResolvedBenchmarkSourceInput<First>,
      ...{
        readonly [Index in keyof Rest]: ResolvedBenchmarkSourceInput<Rest[Index]>;
      },
    ]
  : never;

type ResolvedBenchmarkSourceFacet<Facet extends BenchmarkSourceFacet> = {
  inputs: ResolvedBenchmarkSourceInputs<Facet["inputs"]>;
};

type BenchmarkSources = {
  [Key in BenchmarkKey]: ResolvedBenchmarkSourceFacet<DeclaredBenchmarkSources[Key]>;
};

/** Compose source facets from extended declarations and standard observation sources. */
function composeBenchmarkSources(): BenchmarkSources {
  return Object.fromEntries(
    Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => {
      const benchmarkKey = key as BenchmarkKey;
      const extended = BENCHMARK_EXTENDED_SOURCES[
        benchmarkKey as keyof typeof BENCHMARK_EXTENDED_SOURCES
      ] as BenchmarkSourceFacet | undefined;
      if (extended != null) return [benchmarkKey, extended];

      const source = BENCHMARK_STANDARD_SOURCES[benchmarkKey as BenchmarkObservationKey];
      if (source == null) {
        throw new Error(`Missing benchmark source declaration: ${benchmarkKey}`);
      }
      return [
        benchmarkKey,
        {
          inputs: [
            {
              group: source.group,
              id: source.id,
              roles: "roles" in source ? source.roles : ["observation"],
              adapters: [
                {
                  kind: "benchmark_observation",
                  sourceDataKey: source.sourceDataKey,
                  sourceRowsKey: source.sourceRowsKey,
                },
              ],
            },
          ],
        },
      ];
    }),
  ) as unknown as BenchmarkSources;
}

const BENCHMARK_SOURCES = composeBenchmarkSources();
const BENCHMARK_PROCESSING = Object.fromEntries(
  Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => [
    key,
    resolveBenchmarkProcessing(
      BENCHMARK_PROCESSING_OVERRIDES[key as keyof typeof BENCHMARK_PROCESSING_OVERRIDES],
    ),
  ]),
) as Readonly<Record<BenchmarkKey, BenchmarkProcessingFacet>>;
const BENCHMARK_PERSISTENCE = Object.fromEntries(
  Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => [
    key,
    BENCHMARK_PERSISTENCE_OVERRIDES[key as keyof typeof BENCHMARK_PERSISTENCE_OVERRIDES] ??
      DEFAULT_BENCHMARK_PERSISTENCE,
  ]),
) as Readonly<Record<BenchmarkKey, BenchmarkPersistenceFacet>>;
const BENCHMARK_SCORING = Object.fromEntries(
  Object.entries(BENCHMARK_SCORING_WEIGHTS).map(([key, weight]) => [
    key,
    {
      ...weight,
      normalization: { kind: "min_max", output: [0, 100] },
      imputation: BENCHMARK_IMPUTATION_OVERRIDES[
        key as keyof typeof BENCHMARK_IMPUTATION_OVERRIDES
      ] ?? { kind: "contextual" },
    },
  ]),
) as unknown as Readonly<Record<BenchmarkKey, BenchmarkScoringFacet>>;
const BENCHMARK_ORDER_BY_KEY = Object.fromEntries(
  BENCHMARK_DISPLAY_ORDER.map((key, order) => [key, order]),
) as Readonly<Record<BenchmarkKey, number>>;

type BenchmarkCatalogEntry = BenchmarkDefinition & {
  scoring: BenchmarkScoringFacet;
};

type BenchmarkCatalog = Readonly<{
  [Key in BenchmarkKey]: Omit<BenchmarkCatalogEntry, "source" | "presentation"> & {
    source: BenchmarkSources[Key];
    presentation: {
      title: (typeof BENCHMARK_TOOLTIPS)[Key]["title"];
      label: (typeof BENCHMARK_LABELS)[Key];
      scoringLabel: string;
      description: (typeof BENCHMARK_TOOLTIPS)[Key]["body"];
      details: (typeof BENCHMARK_TOOLTIPS)[Key]["rows"];
      order: number;
      column: (typeof BENCHMARK_COLUMNS)[Key];
      taskMetricColumns: Key extends keyof typeof BENCHMARK_TASK_METRIC_COLUMNS
        ? (typeof BENCHMARK_TASK_METRIC_COLUMNS)[Key]
        : readonly [];
    };
  };
}>;

/** Join literal catalog facets and apply shared defaults at the registry boundary. */
function composeBenchmarkCatalog(): BenchmarkCatalog {
  return Object.fromEntries(
    Object.entries(BENCHMARK_SCORING).map(([key, scoring]) => [
      key,
      {
        source: BENCHMARK_SOURCES[key as BenchmarkKey],
        processing: BENCHMARK_PROCESSING[key as BenchmarkKey],
        persistence: BENCHMARK_PERSISTENCE[key as BenchmarkKey],
        scoring,
        presentation: {
          title: BENCHMARK_TOOLTIPS[key as BenchmarkKey].title,
          label: BENCHMARK_LABELS[key as BenchmarkKey],
          scoringLabel:
            BENCHMARK_SCORING_LABELS[key as BenchmarkKey] ?? BENCHMARK_LABELS[key as BenchmarkKey],
          description: BENCHMARK_TOOLTIPS[key as BenchmarkKey].body,
          details: BENCHMARK_TOOLTIPS[key as BenchmarkKey].rows,
          order: BENCHMARK_ORDER_BY_KEY[key as BenchmarkKey],
          column: BENCHMARK_COLUMNS[key as BenchmarkKey],
          taskMetricColumns:
            BENCHMARK_TASK_METRIC_COLUMNS[key as keyof typeof BENCHMARK_TASK_METRIC_COLUMNS] ?? [],
        },
        ...(key in BENCHMARK_RESOURCE_POLICIES
          ? {
              resources:
                BENCHMARK_RESOURCE_POLICIES[key as keyof typeof BENCHMARK_RESOURCE_POLICIES],
            }
          : {}),
      },
    ]),
  ) as unknown as BenchmarkCatalog;
}

const benchmarkFactory = defineBenchmarks(composeBenchmarkCatalog());

export const BENCHMARK_CATALOG = benchmarkFactory.definitions;
export const BENCHMARK_PORTFOLIO = benchmarkFactory.portfolio as Readonly<
  Record<BenchmarkKey, BenchmarkPortfolioEntry>
>;
export const BENCHMARK_KEYS = benchmarkFactory.scoredKeys as BenchmarkKey[];

type BenchmarkSourceInputUnion = {
  [Key in BenchmarkKey]: BenchmarkSources[Key]["inputs"][number];
}[BenchmarkKey];
type BenchmarkRuntimeBindingUnion = BenchmarkSourceInputUnion extends infer Input
  ? Input extends {
      group: BenchmarkSourceGroup;
      runtime: BenchmarkSourceRuntime;
    }
    ? {
        key: Input["runtime"]["key"];
        publicRows: Input["runtime"]["publicRows"];
        sourceGroup: Input["group"];
      }
    : never
  : never;

export type BenchmarkRuntimeKey = BenchmarkRuntimeBindingUnion["key"];

/** Derive executable source runtime keys from the source declarations. */
export const BENCHMARK_RUNTIME_KEYS = Object.values(BENCHMARK_SOURCES).flatMap((source) =>
  source.inputs.flatMap((input) => (input.runtime == null ? [] : [input.runtime.key])),
) as BenchmarkRuntimeKey[];

export type BenchmarkRuntimeKeyFor<Group extends BenchmarkSourceGroup> = Extract<
  BenchmarkRuntimeBindingUnion,
  { sourceGroup: Group }
>["key"];
export type PublicBenchmarkRuntimeKeyFor<Group extends BenchmarkSourceGroup> = Extract<
  BenchmarkRuntimeBindingUnion,
  { sourceGroup: Group; publicRows: true }
>["key"];

export const BENCHMARK_DISPLAY_KEYS = benchmarkFactory.orderedKeys as BenchmarkKey[];
export const BENCHMARK_OBSERVATION_KEYS = Object.keys(
  BENCHMARK_STANDARD_SOURCES,
) as BenchmarkObservationKey[];
export const BENCHMARK_OBSERVATION_RAW_TABLE = "benchmark_observation_raw_rows" as const;
export const BENCHMARK_OBSERVATION_BINDINGS = BENCHMARK_OBSERVATION_KEYS.map((key) => {
  const source = BENCHMARK_STANDARD_SOURCES[key];
  return {
    benchmark: key,
    loader: source.loader,
    rawTable: BENCHMARK_OBSERVATION_RAW_TABLE,
    sourceDataKey: source.sourceDataKey,
    sourceRowsKey: source.sourceRowsKey,
  };
});
export type BenchmarkObservationBinding = (typeof BENCHMARK_OBSERVATION_BINDINGS)[number];
export type BenchmarkObservationDataKey = BenchmarkObservationBinding["sourceDataKey"];
export type BenchmarkObservationRowsKey = BenchmarkObservationBinding["sourceRowsKey"];
export type BenchmarkResourceKey = keyof typeof BENCHMARK_RESOURCE_POLICIES;

export const ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES = BENCHMARK_KEYS.flatMap((key) =>
  BENCHMARK_CATALOG[key].source.inputs.flatMap((input) =>
    (input.adapters ?? []).flatMap((adapter) =>
      adapter.kind === "artificial_analysis_resource_page"
        ? [{ benchmarkKey: key, ...adapter }]
        : [],
    ),
  ),
);
export const ARTIFICIAL_ANALYSIS_CONTEXT_KEY_BY_ALIAS = Object.fromEntries(
  Object.entries(ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_ALIASES).flatMap(([key, aliases]) =>
    aliases.map((alias) => [alias, key] as const),
  ),
) as Readonly<Record<string, string>>;
export const ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS = BENCHMARK_KEYS.flatMap(
  (key) =>
    (
      ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_KEYS_AFTER as Partial<
        Record<BenchmarkKey, readonly string[]>
      >
    )[key] ?? [],
);
export const MODEL_ATLAS_BENCHMARK_KEYS = BENCHMARK_KEYS.flatMap((key) => [
  ...(BENCHMARK_CATALOG[key].persistence.location.kind === "benchmark" ? [key] : []),
  ...((
    MODEL_ATLAS_ADDITIONAL_BENCHMARK_KEYS_AFTER as Partial<Record<BenchmarkKey, readonly string[]>>
  )[key] ?? []),
]);

/** Return the declared payload location for a known benchmark. */
export const benchmarkValueLocation = (key: string) =>
  BENCHMARK_CATALOG[key as BenchmarkKey]?.persistence.location ?? null;

/** Apply one benchmark's declarative source transform to a normalized source value. */
export function transformBenchmarkSourceValue(key: BenchmarkKey, value: number): number {
  return applyBenchmarkTransform(value, BENCHMARK_CATALOG[key].processing.transform);
}

/** Look up the portfolio entry for a benchmark key. */
export const benchmarkPortfolioEntry = (key: string) =>
  BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;
export const benchmarkResourcePolicy = (
  key: string,
  portfolio: Readonly<Record<string, BenchmarkPortfolioEntry>> = BENCHMARK_PORTFOLIO,
) => portfolio[key]?.resourcePolicy ?? null;
const benchmarkKeysInGroup = (group: BenchmarkGroup) =>
  BENCHMARK_KEYS.filter((key) => BENCHMARK_PORTFOLIO[key].group === group);

/** Return a benchmark's effective dimension weight as importance multiplied by loading. */
export const benchmarkDimensionWeight = (
  key: string,
  dimension: BenchmarkDimension,
  portfolio: BenchmarkPortfolio = BENCHMARK_PORTFOLIO,
) => {
  const entry = portfolio[key];
  return entry == null ? 0 : entry.benchmarkImportance * entry.dimensionLoadings[dimension];
};
const selectedBenchmarksForDimension = (dimension: BenchmarkDimension) =>
  BENCHMARK_KEYS.filter((key) => benchmarkDimensionWeight(key, dimension) > 0);

export const BASELINE_BENCHMARKS = benchmarkKeysInGroup("baseline");
export const FRONTIER_BENCHMARKS = benchmarkKeysInGroup("frontier");
export const SELECTED_INTELLIGENCE_BENCHMARKS = selectedBenchmarksForDimension("intelligence");
export const SELECTED_AGENTIC_BENCHMARKS = selectedBenchmarksForDimension("agentic");
export const INTELLIGENCE_BENCHMARK_DISPLAY_KEYS = SELECTED_INTELLIGENCE_BENCHMARKS;
export const AGENTIC_BENCHMARK_DISPLAY_KEYS = SELECTED_AGENTIC_BENCHMARKS;
