/** Composes Model Atlas benchmark declarations into configured runtime and presentation views. */

import {
	ARTIFICIAL_ANALYSIS_AUXILIARY_EVALUATION_ALIASES,
	ARTIFICIAL_ANALYSIS_AUXILIARY_KEYS_AFTER,
	BENCHMARK_COLUMNS,
	BENCHMARK_DISPLAY_ORDER,
	BENCHMARK_IMPUTATION_OVERRIDES,
	BENCHMARK_LABELS,
	BENCHMARK_OBSERVATION_SOURCES,
	BENCHMARK_PERSISTENCE_OVERRIDES,
	BENCHMARK_PROCESSING_OVERRIDES,
	BENCHMARK_RESOURCES,
	BENCHMARK_SCORING_LABELS,
	BENCHMARK_SCORING_WEIGHTS,
	BENCHMARK_SOURCE_OVERRIDES,
	BENCHMARK_TASK_METRIC_COLUMNS,
	BENCHMARK_TOOLTIPS,
	type BenchmarkKey,
	MODEL_ATLAS_AUXILIARY_KEYS_AFTER,
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
	location: { kind: "evaluation" },
	exposure: "public",
} as const satisfies BenchmarkPersistenceFacet;

function benchmarkProcessing(
	overrides: Partial<BenchmarkProcessingFacet> = {},
): BenchmarkProcessingFacet {
	return {
		transform: overrides.transform ?? IDENTITY_TRANSFORM,
		aggregation: overrides.aggregation ?? DIRECT_AGGREGATION,
		...(overrides.sourceCrosswalk == null
			? {}
			: { sourceCrosswalk: overrides.sourceCrosswalk }),
	};
}

export type BenchmarkObservationKey =
	keyof typeof BENCHMARK_OBSERVATION_SOURCES;

type GenericBenchmarkSourceFacet<Key extends BenchmarkObservationKey> = {
	inputs: readonly [
		{
			group: (typeof BENCHMARK_OBSERVATION_SOURCES)[Key]["group"];
			id: (typeof BENCHMARK_OBSERVATION_SOURCES)[Key]["id"];
			roles: readonly ["observation"];
			adapters: readonly [
				{
					kind: "benchmark_observation";
					sourceDataKey: (typeof BENCHMARK_OBSERVATION_SOURCES)[Key]["sourceDataKey"];
					sourceRowsKey: (typeof BENCHMARK_OBSERVATION_SOURCES)[Key]["sourceRowsKey"];
				},
			];
		},
	];
};

type DeclaredBenchmarkSources = {
	[Key in BenchmarkKey]: Key extends keyof typeof BENCHMARK_SOURCE_OVERRIDES
		? (typeof BENCHMARK_SOURCE_OVERRIDES)[Key]
		: Key extends BenchmarkObservationKey
			? GenericBenchmarkSourceFacet<Key>
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
				readonly [Index in keyof Rest]: ResolvedBenchmarkSourceInput<
					Rest[Index]
				>;
			},
		]
	: never;

type ResolvedBenchmarkSourceFacet<Facet extends BenchmarkSourceFacet> = {
	inputs: ResolvedBenchmarkSourceInputs<Facet["inputs"]>;
};

type BenchmarkSources = {
	[Key in BenchmarkKey]: ResolvedBenchmarkSourceFacet<
		DeclaredBenchmarkSources[Key]
	>;
};

/** Compose source facets from literal overrides and the shared benchmark-observation declaration. */
function benchmarkSources(): BenchmarkSources {
	return Object.fromEntries(
		Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => {
			const benchmarkKey = key as BenchmarkKey;
			const override = BENCHMARK_SOURCE_OVERRIDES[
				benchmarkKey as keyof typeof BENCHMARK_SOURCE_OVERRIDES
			] as BenchmarkSourceFacet | undefined;
			if (override != null) return [benchmarkKey, override];

			const source =
				BENCHMARK_OBSERVATION_SOURCES[benchmarkKey as BenchmarkObservationKey];
			if (source == null) {
				throw new Error(
					`Missing benchmark source declaration: ${benchmarkKey}`,
				);
			}
			return [
				benchmarkKey,
				{
					inputs: [
						{
							group: source.group,
							id: source.id,
							roles: ["observation"],
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

const BENCHMARK_SOURCES = benchmarkSources();
const BENCHMARK_PROCESSING = Object.fromEntries(
	Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => [
		key,
		benchmarkProcessing(
			BENCHMARK_PROCESSING_OVERRIDES[
				key as keyof typeof BENCHMARK_PROCESSING_OVERRIDES
			],
		),
	]),
) as Readonly<Record<BenchmarkKey, BenchmarkProcessingFacet>>;
const BENCHMARK_PERSISTENCE = Object.fromEntries(
	Object.keys(BENCHMARK_SCORING_WEIGHTS).map((key) => [
		key,
		BENCHMARK_PERSISTENCE_OVERRIDES[
			key as keyof typeof BENCHMARK_PERSISTENCE_OVERRIDES
		] ?? DEFAULT_BENCHMARK_PERSISTENCE,
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
	[Key in BenchmarkKey]: Omit<
		BenchmarkCatalogEntry,
		"source" | "presentation"
	> & {
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
						BENCHMARK_SCORING_LABELS[key as BenchmarkKey] ??
						BENCHMARK_LABELS[key as BenchmarkKey],
					description: BENCHMARK_TOOLTIPS[key as BenchmarkKey].body,
					details: BENCHMARK_TOOLTIPS[key as BenchmarkKey].rows,
					order: BENCHMARK_ORDER_BY_KEY[key as BenchmarkKey],
					column: BENCHMARK_COLUMNS[key as BenchmarkKey],
					taskMetricColumns:
						BENCHMARK_TASK_METRIC_COLUMNS[
							key as keyof typeof BENCHMARK_TASK_METRIC_COLUMNS
						] ?? [],
				},
				...(key in BENCHMARK_RESOURCES
					? {
							resources:
								BENCHMARK_RESOURCES[key as keyof typeof BENCHMARK_RESOURCES],
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
type BenchmarkRuntimeBindingUnion =
	BenchmarkSourceInputUnion extends infer Input
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
export const BENCHMARK_RUNTIME_KEYS = Object.values(BENCHMARK_SOURCES).flatMap(
	(source) =>
		source.inputs.flatMap((input) =>
			input.runtime == null ? [] : [input.runtime.key],
		),
) as BenchmarkRuntimeKey[];

export type BenchmarkRuntimeKeyFor<Group extends BenchmarkSourceGroup> =
	Extract<BenchmarkRuntimeBindingUnion, { sourceGroup: Group }>["key"];
export type PublicBenchmarkRuntimeKeyFor<Group extends BenchmarkSourceGroup> =
	Extract<
		BenchmarkRuntimeBindingUnion,
		{ sourceGroup: Group; publicRows: true }
	>["key"];

export const BENCHMARK_DISPLAY_KEYS =
	benchmarkFactory.orderedKeys as BenchmarkKey[];
export const BENCHMARK_OBSERVATION_KEYS = Object.keys(
	BENCHMARK_OBSERVATION_SOURCES,
) as BenchmarkObservationKey[];
export const BENCHMARK_OBSERVATION_RAW_TABLE =
	"benchmark_observation_raw_rows" as const;
export const BENCHMARK_OBSERVATION_BINDINGS = BENCHMARK_OBSERVATION_KEYS.map(
	(key) => {
		const source = BENCHMARK_OBSERVATION_SOURCES[key];
		return {
			benchmark: key,
			loader: source.loader,
			rawSourceKey: key,
			rawTable: BENCHMARK_OBSERVATION_RAW_TABLE,
			source: source.id,
			sourceDataKey: source.sourceDataKey,
			sourceRowsKey: source.sourceRowsKey,
		};
	},
);
export type BenchmarkObservationBinding =
	(typeof BENCHMARK_OBSERVATION_BINDINGS)[number];
export type BenchmarkObservationDataKey =
	BenchmarkObservationBinding["sourceDataKey"];
export type BenchmarkObservationRowsKey =
	BenchmarkObservationBinding["sourceRowsKey"];
export type BenchmarkResourceKey = keyof typeof BENCHMARK_RESOURCES;

function benchmarkSourceAdapters(key: BenchmarkKey): BenchmarkSourceAdapter[] {
	return BENCHMARK_CATALOG[key].source.inputs.flatMap(
		(input) => input.adapters ?? [],
	);
}

export const ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES =
	BENCHMARK_KEYS.flatMap((key) =>
		benchmarkSourceAdapters(key).flatMap((adapter) =>
			adapter.kind === "artificial_analysis_resource_page"
				? [{ benchmarkKey: key, ...adapter }]
				: [],
		),
	);
export const ARTIFICIAL_ANALYSIS_EVALUATION_KEY_BY_ALIAS = Object.fromEntries([
	...BENCHMARK_KEYS.flatMap((key) =>
		benchmarkSourceAdapters(key).flatMap((adapter) =>
			adapter.kind === "artificial_analysis_leaderboard"
				? adapter.aliases.map((alias) => [alias, key] as const)
				: [],
		),
	),
	...Object.entries(ARTIFICIAL_ANALYSIS_AUXILIARY_EVALUATION_ALIASES).flatMap(
		([key, aliases]) => aliases.map((alias) => [alias, key] as const),
	),
]) as Readonly<Record<string, string>>;
export const ARTIFICIAL_ANALYSIS_EVALUATION_KEYS = BENCHMARK_KEYS.flatMap(
	(key) => {
		const hasLeaderboardAdapter = benchmarkSourceAdapters(key).some(
			(adapter) => adapter.kind === "artificial_analysis_leaderboard",
		);
		return [
			...(hasLeaderboardAdapter ? [key] : []),
			...((
				ARTIFICIAL_ANALYSIS_AUXILIARY_KEYS_AFTER as Partial<
					Record<BenchmarkKey, readonly string[]>
				>
			)[key] ?? []),
		];
	},
);
export const MODEL_ATLAS_EVALUATION_KEYS = BENCHMARK_KEYS.flatMap((key) => [
	...(BENCHMARK_CATALOG[key].persistence.location.kind === "evaluation"
		? [key]
		: []),
	...((
		MODEL_ATLAS_AUXILIARY_KEYS_AFTER as Partial<
			Record<BenchmarkKey, readonly string[]>
		>
	)[key] ?? []),
]);

/** Return the declared payload location for a known benchmark. */
export const benchmarkValueLocation = (key: string) =>
	BENCHMARK_CATALOG[key as BenchmarkKey]?.persistence.location ?? null;

/** Apply one benchmark's declarative source transform to a normalized source value. */
export function transformBenchmarkSourceValue(
	key: BenchmarkKey,
	value: number,
): number {
	return applyBenchmarkTransform(
		value,
		BENCHMARK_CATALOG[key].processing.transform,
	);
}

/** Look up the portfolio entry for a benchmark key. */
export const benchmarkPortfolioEntry = (key: string) =>
	BENCHMARK_PORTFOLIO[key as BenchmarkKey] ?? null;
export const benchmarkResourcePolicy = (
	key: string,
	portfolio: Readonly<
		Record<string, BenchmarkPortfolioEntry>
	> = BENCHMARK_PORTFOLIO,
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
	return entry == null
		? 0
		: entry.benchmarkImportance * entry.dimensionLoadings[dimension];
};
const selectedBenchmarksForDimension = (dimension: BenchmarkDimension) =>
	BENCHMARK_KEYS.filter((key) => benchmarkDimensionWeight(key, dimension) > 0);

export const BASELINE_BENCHMARKS = benchmarkKeysInGroup("baseline");
export const FRONTIER_BENCHMARKS = benchmarkKeysInGroup("frontier");
export const SELECTED_INTELLIGENCE_BENCHMARKS =
	selectedBenchmarksForDimension("intelligence");
export const SELECTED_AGENTIC_BENCHMARKS =
	selectedBenchmarksForDimension("agentic");
export const INTELLIGENCE_BENCHMARK_DISPLAY_KEYS =
	SELECTED_INTELLIGENCE_BENCHMARKS;
export const AGENTIC_BENCHMARK_DISPLAY_KEYS = SELECTED_AGENTIC_BENCHMARKS;
