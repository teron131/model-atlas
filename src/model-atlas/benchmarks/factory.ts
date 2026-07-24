/** Defines and validates generic benchmark contracts and derived views. */

export type BenchmarkSourceGroup =
	| "artificial_analysis"
	| "epoch"
	| "surge"
	| "vals"
	| "sparse";
type BenchmarkSourceRole =
	| "observation"
	| "resource"
	| "imputation"
	| "validation";
export type BenchmarkJsonPath = readonly [string, ...string[]];
export type BenchmarkSourceAdapter =
	| {
			kind: "benchmark_observation";
			sourceDataKey: string;
			sourceRowsKey: string;
	  }
	| {
			kind: "artificial_analysis_leaderboard";
			aliases: readonly [string, ...string[]];
	  }
	| {
			kind: "artificial_analysis_resource_page";
			url: string;
			taskRunCount: number;
			scoreKey?: string;
			scorePath?: BenchmarkJsonPath;
			costPath?: BenchmarkJsonPath;
			tokenCountsPath?: BenchmarkJsonPath;
			secondsProcessor?: "briefcase";
			rowDetectionKey?: string;
	  };

export type BenchmarkObservationLoader =
	| {
			kind: "vals";
			sourceUrl: string;
			canonicalTask: string;
			includeReasoningEffortInModel?: boolean;
			eligibility?: "exclude_aristotle";
	  }
	| { kind: "surge"; sourceUrl: string }
	| { kind: "epoch_runs"; task: string }
	| {
			kind: "zeroeval";
			sourceUrl: string;
			rankField?: string;
			observedAtField?: string;
	  }
	| { kind: "custom" };
export type BenchmarkSourceRuntime = {
	key: string;
	publicRows: boolean;
};
export type BenchmarkSourceInput = {
	group: BenchmarkSourceGroup;
	id: string;
	roles: readonly [BenchmarkSourceRole, ...BenchmarkSourceRole[]];
	evidenceKey?: string;
	adapters?: readonly BenchmarkSourceAdapter[];
	runtime?: BenchmarkSourceRuntime;
};
export type BenchmarkSourceFacet = {
	inputs: readonly [BenchmarkSourceInput, ...BenchmarkSourceInput[]];
};
export type BenchmarkGroup = "baseline" | "frontier";
type BenchmarkMetricFormat = "percent" | "score" | "number" | "currency";
export type BenchmarkSortDirection = "ascending" | "descending";
export type BenchmarkDimension = "intelligence" | "agentic";
export type BenchmarkResourceQualityCoordinate = "linear" | "logit";

type BenchmarkDimensionLoadings = Readonly<Record<BenchmarkDimension, number>>;

export type BenchmarkResourcePolicy = {
	source: "artificial_analysis" | "benchmark";
	unit: "per_task" | "total";
	tokenMeasure: "tokens" | "output_tokens";
	qualityCoordinate: BenchmarkResourceQualityCoordinate;
};

export type BenchmarkSourceTransform =
	| { kind: "identity" }
	| {
			kind: "linear";
			input: readonly [minimum: number, maximum: number];
			output: readonly [minimum: number, maximum: number];
			clamp: boolean;
	  };

export type BenchmarkAggregationPolicy =
	| { kind: "direct" }
	| { kind: "highest_effort" }
	| { kind: "mean" }
	| { kind: "custom" };

type BenchmarkSourceCrosswalkPolicy =
	| { kind: "validated_merge" }
	| { kind: "custom" };

export type BenchmarkProcessingFacet = {
	transform: BenchmarkSourceTransform;
	aggregation: BenchmarkAggregationPolicy;
	sourceCrosswalk?: BenchmarkSourceCrosswalkPolicy;
};

export type BenchmarkNormalizationPolicy =
	| { kind: "min_max"; output: readonly [minimum: number, maximum: number] }
	| { kind: "identity" };

export type BenchmarkImputationPolicy =
	| { kind: "none" }
	| { kind: "contextual" }
	| {
			kind: "additive_crosswalk";
			fallbackEvidenceKey: string;
			minimumModels: number;
			maximumMedianAbsoluteError: number;
			clamp?: readonly [minimum: number, maximum: number];
			fallback: "contextual" | "none";
	  };

export type BenchmarkScoringFacet = {
	group: BenchmarkGroup;
	benchmarkImportance: number;
	dimensionLoadings: BenchmarkDimensionLoadings;
	normalization: BenchmarkNormalizationPolicy;
	imputation: BenchmarkImputationPolicy;
};

type BenchmarkValueLocation =
	| { kind: "benchmark" }
	| { kind: "intelligence"; field: string };

export type BenchmarkPersistenceFacet = {
	location: BenchmarkValueLocation;
};

export type BenchmarkColumnFacet = {
	key: string;
	label: string;
	format: BenchmarkMetricFormat;
	defaultSort: BenchmarkSortDirection;
};

export type BenchmarkPresentationDetail = readonly [
	label: string,
	value: string,
];

export type BenchmarkTaskMetricColumnFacet = {
	key: string;
	metric: string;
	direction: BenchmarkSortDirection;
	label: string;
	format?: "duration";
	tooltip?: {
		title: string;
		body: string;
		details?: readonly BenchmarkPresentationDetail[];
	};
};

type BenchmarkPresentationFacet = {
	title: string;
	label: string;
	scoringLabel?: string;
	description: string;
	details?: readonly BenchmarkPresentationDetail[];
	order: number;
	column: BenchmarkColumnFacet;
	taskMetricColumns?: readonly BenchmarkTaskMetricColumnFacet[];
};

export type BenchmarkDefinition = {
	source: BenchmarkSourceFacet;
	processing: BenchmarkProcessingFacet;
	persistence: BenchmarkPersistenceFacet;
	presentation: BenchmarkPresentationFacet;
	scoring?: BenchmarkScoringFacet;
	resources?: BenchmarkResourcePolicy;
};

export type BenchmarkDefinitions = Readonly<
	Record<string, BenchmarkDefinition>
>;

type BenchmarkPolicyFacets = Pick<
	BenchmarkDefinition,
	"source" | "processing" | "persistence" | "scoring"
>;

export type BenchmarkPortfolioEntry = Pick<
	BenchmarkScoringFacet,
	"group" | "benchmarkImportance" | "dimensionLoadings"
> & {
	resourcePolicy?: BenchmarkResourcePolicy;
};

export type BenchmarkPortfolio = Readonly<
	Record<string, BenchmarkPortfolioEntry>
>;

type BenchmarkFactory<TDefinitions extends BenchmarkDefinitions> = {
	definitions: TDefinitions;
	scoredKeys: readonly (keyof TDefinitions & string)[];
	orderedKeys: readonly (keyof TDefinitions & string)[];
	portfolio: BenchmarkPortfolio;
};

const DIMENSION_LOADING_SUM_TOLERANCE = 1e-9;

/** Validate definitions and derive every commonly consumed benchmark view. */
export function defineBenchmarks<
	const TDefinitions extends BenchmarkDefinitions,
>(definitions: TDefinitions): BenchmarkFactory<TDefinitions> {
	validateDefinitions(definitions);

	type BenchmarkKey = keyof TDefinitions & string;
	const entries = Object.entries(definitions) as [
		BenchmarkKey,
		BenchmarkDefinition,
	][];
	const scoredEntries = entries.filter(
		(
			entry,
		): entry is [
			BenchmarkKey,
			BenchmarkDefinition & { scoring: BenchmarkScoringFacet },
		] => entry[1].scoring != null,
	);
	const portfolio = Object.fromEntries(
		scoredEntries.map(([key, definition]) => [
			key,
			{
				group: definition.scoring.group,
				benchmarkImportance: definition.scoring.benchmarkImportance,
				dimensionLoadings: definition.scoring.dimensionLoadings,
				...(definition.resources == null
					? {}
					: { resourcePolicy: definition.resources }),
			},
		]),
	) as BenchmarkPortfolio;
	validateBenchmarkPortfolio(portfolio);
	return {
		definitions,
		scoredKeys: scoredEntries.map(([key]) => key),
		orderedKeys: [...entries]
			.sort(
				([leftKey, left], [rightKey, right]) =>
					left.presentation.order - right.presentation.order ||
					left.presentation.label.localeCompare(
						right.presentation.label,
						"en",
						{
							sensitivity: "base",
						},
					) ||
					leftKey.localeCompare(rightKey),
			)
			.map(([key]) => key),
		portfolio,
	};
}

/** Apply the catalog-declared source transform. */
export function applyBenchmarkTransform(
	value: number,
	transform: BenchmarkSourceTransform,
): number {
	if (transform.kind === "identity") {
		return value;
	}
	const [inputMinimum, inputMaximum] = transform.input;
	const [outputMinimum, outputMaximum] = transform.output;
	const ratio = (value - inputMinimum) / (inputMaximum - inputMinimum);
	const mapped = outputMinimum + ratio * (outputMaximum - outputMinimum);
	return transform.clamp
		? Math.max(
				Math.min(outputMinimum, outputMaximum),
				Math.min(Math.max(outputMinimum, outputMaximum), mapped),
			)
		: mapped;
}

/** Reject an invalid scoring portfolio at public configuration boundaries. */
export function validateBenchmarkPortfolio(
	portfolio: BenchmarkPortfolio,
): void {
	for (const [key, entry] of Object.entries(portfolio)) {
		if (entry.group !== "baseline" && entry.group !== "frontier") {
			throw new Error(`Invalid benchmark group for ${key}: ${entry.group}`);
		}
		const resourcePolicy = entry.resourcePolicy;
		const qualityCoordinate = resourcePolicy?.qualityCoordinate;
		if (
			resourcePolicy != null &&
			qualityCoordinate !== "linear" &&
			qualityCoordinate !== "logit"
		) {
			throw new Error(
				`Invalid resource quality coordinate for ${key}: ${qualityCoordinate}`,
			);
		}
		validateBenchmarkWeight(key, entry);
	}
}

/** Reject invalid domain configuration at the single benchmark definition boundary. */
function validateDefinitions(definitions: BenchmarkDefinitions): void {
	validateBenchmarkPolicies(definitions);
	const displayOrders = new Set<number>();
	const columnKeys = new Set<string>();
	const taskMetricColumnKeys = new Set<string>();
	const runtimeKeys = new Set<string>();
	for (const [key, definition] of Object.entries(definitions)) {
		const hasResourceSource = definition.source.inputs.some((input) =>
			input.roles.includes("resource"),
		);
		if (hasResourceSource && definition.resources == null) {
			throw new Error(
				`Benchmark resource source requires a resource policy for ${key}`,
			);
		}
		if (!hasResourceSource && definition.resources != null) {
			throw new Error(
				`Benchmark resource policy requires a resource source for ${key}`,
			);
		}
		if (definition.resources != null && definition.scoring == null) {
			throw new Error(
				`Benchmark resource policy requires scoring policy for ${key}`,
			);
		}
		for (const input of definition.source.inputs) {
			if (input.runtime == null) {
				continue;
			}
			if (runtimeKeys.has(input.runtime.key)) {
				throw new Error(
					`Benchmark source runtime key must be unique: ${input.runtime.key}`,
				);
			}
			runtimeKeys.add(input.runtime.key);
		}
		if (definition.presentation.title.trim().length === 0) {
			throw new Error(`Benchmark title cannot be empty for ${key}`);
		}
		if (definition.presentation.label.trim().length === 0) {
			throw new Error(`Benchmark label cannot be empty for ${key}`);
		}
		if (definition.presentation.description.trim().length === 0) {
			throw new Error(`Benchmark description cannot be empty for ${key}`);
		}
		if (!Number.isFinite(definition.presentation.order)) {
			throw new Error(`Benchmark display order must be finite for ${key}`);
		}
		if (displayOrders.has(definition.presentation.order)) {
			throw new Error(
				`Benchmark display order must be unique for ${key}: ${definition.presentation.order}`,
			);
		}
		displayOrders.add(definition.presentation.order);
		if (definition.presentation.column.key.trim().length === 0) {
			throw new Error(`Benchmark column key cannot be empty for ${key}`);
		}
		if (columnKeys.has(definition.presentation.column.key)) {
			throw new Error(
				`Benchmark column key must be unique for ${key}: ${definition.presentation.column.key}`,
			);
		}
		columnKeys.add(definition.presentation.column.key);
		for (const [label, value] of definition.presentation.details ?? []) {
			if (label.trim().length === 0 || value.trim().length === 0) {
				throw new Error(
					`Benchmark presentation details cannot be empty for ${key}`,
				);
			}
		}
		for (const column of definition.presentation.taskMetricColumns ?? []) {
			if (
				column.key.trim().length === 0 ||
				column.metric.trim().length === 0 ||
				column.label.trim().length === 0
			) {
				throw new Error(
					`Benchmark task column fields cannot be empty for ${key}`,
				);
			}
			if (taskMetricColumnKeys.has(column.key)) {
				throw new Error(
					`Benchmark task column key must be unique for ${key}: ${column.key}`,
				);
			}
			taskMetricColumnKeys.add(column.key);
			if (
				column.tooltip != null &&
				(column.tooltip.title.trim().length === 0 ||
					column.tooltip.body.trim().length === 0)
			) {
				throw new Error(
					`Benchmark task column tooltip cannot be empty for ${key}: ${column.key}`,
				);
			}
			for (const [label, value] of column.tooltip?.details ?? []) {
				if (label.trim().length === 0 || value.trim().length === 0) {
					throw new Error(
						`Benchmark task column tooltip details cannot be empty for ${key}: ${column.key}`,
					);
				}
			}
		}
	}
}

/** Reject invalid benchmark policies before runtime consumers use them. */
function validateBenchmarkPolicies(
	definitions: Readonly<Record<string, BenchmarkPolicyFacets>>,
): void {
	for (const [key, definition] of Object.entries(definitions)) {
		validateSources(key, definition.source);
		validateProcessing(key, definition.processing, definition.source);
		validatePersistence(key, definition.persistence);
		if (definition.scoring != null) {
			validateScoring(key, definition.scoring, definition.source);
		}
	}
}

function validatePersistence(
	key: string,
	persistence: BenchmarkPersistenceFacet,
): void {
	if (
		persistence.location.kind === "intelligence" &&
		persistence.location.field.trim().length === 0
	) {
		throw new Error(`Benchmark intelligence field cannot be empty for ${key}`);
	}
}

function validateSources(key: string, source: BenchmarkSourceFacet): void {
	const sourceIds = new Set<string>();
	for (const input of source.inputs) {
		if (input.id.trim().length === 0) {
			throw new Error(`Benchmark source id cannot be empty for ${key}`);
		}
		if (input.runtime != null && input.runtime.key.trim().length === 0) {
			throw new Error(
				`Benchmark source runtime key cannot be empty for ${key}/${input.id}`,
			);
		}
		if (sourceIds.has(input.id)) {
			throw new Error(`Benchmark source ids must be unique for ${key}`);
		}
		sourceIds.add(input.id);
		if (new Set(input.roles).size !== input.roles.length) {
			throw new Error(
				`Benchmark source roles must be unique for ${key}/${input.id}`,
			);
		}
		if (
			input.roles.includes("imputation") &&
			(input.evidenceKey == null || input.evidenceKey.trim().length === 0)
		) {
			throw new Error(
				`Benchmark imputation source requires an evidence key for ${key}/${input.id}`,
			);
		}
		validateSourceAdapters(key, input);
	}
	if (!source.inputs.some((input) => input.roles.includes("observation"))) {
		throw new Error(`Benchmark must declare an observation source for ${key}`);
	}
}

function validateSourceAdapters(
	key: string,
	input: BenchmarkSourceInput,
): void {
	const adapterKinds = new Set<string>();
	for (const adapter of input.adapters ?? []) {
		if (adapterKinds.has(adapter.kind)) {
			throw new Error(
				`Benchmark source adapter kinds must be unique for ${key}/${input.id}`,
			);
		}
		adapterKinds.add(adapter.kind);
		if (
			adapter.kind === "benchmark_observation" &&
			(adapter.sourceDataKey.trim().length === 0 ||
				adapter.sourceRowsKey.trim().length === 0)
		) {
			throw new Error(
				`Benchmark score adapter requires a source-data key for ${key}/${input.id}`,
			);
		}
		if (adapter.kind === "artificial_analysis_leaderboard") {
			if (
				adapter.aliases.some((alias) => alias.trim().length === 0) ||
				new Set(adapter.aliases).size !== adapter.aliases.length
			) {
				throw new Error(
					`Artificial Analysis aliases must be non-empty and unique for ${key}/${input.id}`,
				);
			}
		}
		if (adapter.kind === "artificial_analysis_resource_page") {
			if (
				adapter.url.trim().length === 0 ||
				!Number.isInteger(adapter.taskRunCount) ||
				adapter.taskRunCount <= 0
			) {
				throw new Error(
					`Artificial Analysis resource page requires a URL and positive task count for ${key}/${input.id}`,
				);
			}
		}
	}
}

function validateLinearTransform(
	key: string,
	transform: BenchmarkSourceTransform,
): void {
	if (transform.kind !== "linear") {
		return;
	}
	const [inputMinimum, inputMaximum] = transform.input;
	const [outputMinimum, outputMaximum] = transform.output;
	if (
		!Number.isFinite(inputMinimum) ||
		!Number.isFinite(inputMaximum) ||
		!Number.isFinite(outputMinimum) ||
		!Number.isFinite(outputMaximum) ||
		inputMinimum === inputMaximum ||
		outputMinimum === outputMaximum
	) {
		throw new Error(
			`Linear benchmark transform must have finite ranges for ${key}`,
		);
	}
}

function validateProcessing(
	key: string,
	processing: BenchmarkProcessingFacet,
	source: BenchmarkSourceFacet,
): void {
	validateLinearTransform(key, processing.transform);
	if (processing.sourceCrosswalk == null) {
		return;
	}
	if (source.inputs.length < 2) {
		throw new Error(
			`Benchmark source crosswalk requires multiple sources for ${key}`,
		);
	}
}

function validateScoring(
	key: string,
	scoring: BenchmarkScoringFacet,
	source: BenchmarkSourceFacet,
): void {
	validateBenchmarkWeight(key, scoring);
	validateNormalization(key, scoring.normalization);
	const { imputation } = scoring;
	if (imputation.kind !== "additive_crosswalk") {
		return;
	}
	const imputationSource = source.inputs.find(
		(input) => input.evidenceKey === imputation.fallbackEvidenceKey,
	);
	if (imputationSource?.roles.includes("imputation") !== true) {
		throw new Error(
			`Benchmark additive crosswalk requires a matching imputation source for ${key}`,
		);
	}
	if (
		!Number.isInteger(imputation.minimumModels) ||
		imputation.minimumModels <= 0 ||
		!Number.isFinite(imputation.maximumMedianAbsoluteError) ||
		imputation.maximumMedianAbsoluteError <= 0
	) {
		throw new Error(
			`Benchmark additive crosswalk thresholds must be positive for ${key}`,
		);
	}
	if (
		imputation.clamp != null &&
		(!Number.isFinite(imputation.clamp[0]) ||
			!Number.isFinite(imputation.clamp[1]) ||
			imputation.clamp[0] >= imputation.clamp[1])
	) {
		throw new Error(
			`Benchmark additive crosswalk clamp must be an increasing finite range for ${key}`,
		);
	}
}

function validateNormalization(
	key: string,
	normalization: BenchmarkNormalizationPolicy,
): void {
	if (
		normalization.kind === "min_max" &&
		(!Number.isFinite(normalization.output[0]) ||
			!Number.isFinite(normalization.output[1]) ||
			normalization.output[0] === normalization.output[1])
	) {
		throw new Error(
			`Benchmark min-max normalization requires a finite output range for ${key}`,
		);
	}
}

function validateBenchmarkWeight(
	key: string,
	scoring: Pick<
		BenchmarkScoringFacet,
		"benchmarkImportance" | "dimensionLoadings"
	>,
): void {
	if (
		!Number.isFinite(scoring.benchmarkImportance) ||
		scoring.benchmarkImportance <= 0
	) {
		throw new Error(
			`Benchmark importance must be finite and positive for ${key}`,
		);
	}
	const { intelligence, agentic } = scoring.dimensionLoadings;
	if (
		!Number.isFinite(intelligence) ||
		!Number.isFinite(agentic) ||
		intelligence < 0 ||
		agentic < 0 ||
		Math.abs(intelligence + agentic - 1) > DIMENSION_LOADING_SUM_TOLERANCE
	) {
		throw new Error(
			`Dimension loadings must be finite, non-negative, and sum to one for ${key}`,
		);
	}
}
