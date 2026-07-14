/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

import {
	type BenchmarkDimension,
	benchmarkDimensionWeight,
} from "../../config/benchmark-portfolio";
import {
	clamp01,
	clampScore,
	mapFiniteNumbers,
	minMaxScale,
	weightedFinitePartCount,
	weightedMeanOfFinite,
	weightedMedianOfFinite,
	weightedQuantile,
	weightedQuantileRank,
} from "../../math-utils";
import {
	asFiniteNumber,
	asRecord,
	canonicalModelKey,
	canonicalReasoningEffort,
	type JsonObject,
} from "../../shared";
import type { ScoringConfig } from "../types";
import {
	calibrationObservations,
	effectiveModelCount,
} from "./calibration-population";

export type BenchmarkImputationByModel = ReadonlyMap<
	JsonObject,
	ReadonlyMap<string, number>
>;

export type BenchmarkImputationConfidenceByModel = ReadonlyMap<
	JsonObject,
	ReadonlyMap<string, number>
>;

export type BenchmarkImputationDiagnostic = {
	validationSampleCount: number;
	effectiveModelCount: number;
	normalizedMedianAbsoluteError: number | null;
	rawPenalty: number | null;
	imputationAllowed: boolean;
	crossEffortUsed: boolean;
	crossEffortEffectiveModelCount: number;
	crossEffortNormalizedMedianAbsoluteError: number | null;
	crossEffortRawPenalty: number | null;
};

export type BenchmarkImputationDiagnosticsByKey = ReadonlyMap<
	string,
	BenchmarkImputationDiagnostic
>;

export type QualityScoringContext = {
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>;
};

type PreparedBenchmarkScoring = {
	benchmarkImputationByModel: BenchmarkImputationByModel;
	benchmarkImputationConfidenceByModel: BenchmarkImputationConfidenceByModel;
	qualityContext: QualityScoringContext;
};

type BenchmarkImputationPreparation = {
	benchmarkImputationByModel: Map<JsonObject, Map<string, number>>;
	benchmarkImputationConfidenceByModel: Map<JsonObject, Map<string, number>>;
	benchmarkImputationDiagnosticsByKey: Map<
		string,
		BenchmarkImputationDiagnostic
	>;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_MODELS = 3;
const MIN_IMPUTATION_VALIDATION_MODELS = 4;
const MIN_CROSS_EFFORT_REFERENCE_MODELS = 4;
const MIN_CROSS_EFFORT_VALIDATION_MODELS = 4;
const MIN_CROSS_EFFORT_ERROR_REDUCTION_RATIO = 0.02;
const MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR = 25;
const FRONTIER_MISSING_ERROR_MULTIPLIER = 1;
const BASELINE_MISSING_ERROR_MULTIPLIER = 0.5;
const IMPUTATION_DIMENSIONS = ["intelligence", "agentic"] as const;
const DEFAULT_EFFORT_KEY = "\u0000default";
const EFFORT_TRANSITION_SEPARATOR = "\u001f";

type EffortRowsByModel = ReadonlyMap<
	string,
	ReadonlyMap<string, readonly JsonObject[]>
>;

type DimensionBenchmarkContext = {
	benchmarkKeys: readonly string[];
	benchmarkWeights: ReadonlyMap<string, number>;
};

export function metricValue(model: JsonObject, key: string): number | null {
	const intelligence = asRecord(model.intelligence);
	const evaluations = asRecord(model.evaluations);
	return (
		asFiniteNumber(intelligence[key]) ??
		asFiniteNumber(evaluations[key]) ??
		null
	);
}

export function normalizedMetricValue(
	valuesByKey: ReadonlyMap<string, readonly number[]>,
	key: string,
	value: number | null,
): number | null {
	const normalized = minMaxScale(valuesByKey.get(key) ?? [], value);
	return normalized == null ? null : clampScore(normalized);
}

function observedNormalizedEvidenceScore(
	model: JsonObject,
	benchmarkKeys: readonly string[],
	benchmarkWeights: ReadonlyMap<string, number>,
	excludedBenchmarkKey: string | null,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	const parts = benchmarkKeys
		.filter((key) => key !== excludedBenchmarkKey)
		.map((key) => ({
			value: normalizedMetricValue(valuesByKey, key, metricValue(model, key)),
			weight: benchmarkWeights.get(key) ?? 0,
		}));
	return weightedFinitePartCount(parts) >= MIN_IMPUTATION_EVIDENCE_VALUES
		? weightedMeanOfFinite(parts)
		: null;
}

function effortKey(model: JsonObject): string {
	return canonicalReasoningEffort(model.reasoning_effort) ?? DEFAULT_EFFORT_KEY;
}

function effortRowsByModel(models: readonly JsonObject[]): EffortRowsByModel {
	const mutable = new Map<string, Map<string, JsonObject[]>>();
	for (const model of models) {
		const modelKey = canonicalModelKey(model);
		const rowsByEffort =
			mutable.get(modelKey) ?? new Map<string, JsonObject[]>();
		const key = effortKey(model);
		const rows = rowsByEffort.get(key) ?? [];
		rows.push(model);
		rowsByEffort.set(key, rows);
		mutable.set(modelKey, rowsByEffort);
	}
	return mutable;
}

function siblingEffortContextScore(
	targetModel: JsonObject,
	sourceEffortKey: string,
	rowsByModel: EffortRowsByModel,
	benchmarkKeys: readonly string[],
	benchmarkWeights: ReadonlyMap<string, number>,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	const sourceRows = rowsByModel
		.get(canonicalModelKey(targetModel))
		?.get(sourceEffortKey);
	if (sourceRows == null) {
		return null;
	}
	return weightedMeanOfFinite(
		sourceRows.map((sourceRow) => ({
			value: observedNormalizedEvidenceScore(
				sourceRow,
				benchmarkKeys,
				benchmarkWeights,
				null,
				valuesByKey,
			),
			weight: 1,
		})),
	);
}

/** Resolve one dimension's selected benchmarks and effective weights for imputation context. */
function dimensionBenchmarkContext(
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
): DimensionBenchmarkContext {
	const benchmarkKeys =
		dimension === "intelligence"
			? scoringConfig.intelligenceBenchmarkKeys
			: scoringConfig.agenticBenchmarkKeys;
	return {
		benchmarkKeys,
		benchmarkWeights: new Map(
			benchmarkKeys.map(
				(key) =>
					[
						key,
						benchmarkDimensionWeight(
							key,
							dimension,
							scoringConfig.benchmarkPortfolio,
						),
					] as const,
			),
		),
	};
}

/** Penalize a validated benchmark prediction by its group-specific error multiple. */
function imputedBenchmarkValue(
	mappedValue: number | null,
	diagnostic: BenchmarkImputationDiagnostic,
	isFrontierBenchmark: boolean,
): number | null {
	const rawPenalty = diagnostic.crossEffortUsed
		? diagnostic.crossEffortRawPenalty
		: diagnostic.rawPenalty;
	if (
		mappedValue == null ||
		!diagnostic.imputationAllowed ||
		rawPenalty == null
	) {
		return null;
	}
	const errorMultiplier = isFrontierBenchmark
		? FRONTIER_MISSING_ERROR_MULTIPLIER
		: BASELINE_MISSING_ERROR_MULTIPLIER;
	return Math.max(0, mappedValue - errorMultiplier * rawPenalty);
}

/** Convert held-out normalized error into partial evidence credit for a validated prediction. */
function imputationConfidence(
	diagnostic: BenchmarkImputationDiagnostic,
): number {
	const normalizedError = diagnostic.crossEffortUsed
		? diagnostic.crossEffortNormalizedMedianAbsoluteError
		: diagnostic.normalizedMedianAbsoluteError;
	if (!diagnostic.imputationAllowed || normalizedError == null) {
		return 0;
	}
	return clamp01(1 - normalizedError / MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR);
}

/** Build one dimension-specific predictor from observed context and target values only. */
function buildDimensionBenchmarkPredictor(
	models: JsonObject[],
	targetBenchmarkKey: string,
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): ((model: JsonObject) => number | null) | null {
	const { benchmarkKeys, benchmarkWeights } = dimensionBenchmarkContext(
		dimension,
		scoringConfig,
	);
	const referenceContextScores = calibrationObservations(models, (model) => {
		if (metricValue(model, targetBenchmarkKey) == null) {
			return null;
		}
		return observedNormalizedEvidenceScore(
			model,
			benchmarkKeys,
			benchmarkWeights,
			targetBenchmarkKey,
			valuesByKey,
		);
	});
	const targetObservations = referenceContextScores.map((observation) => ({
		...observation,
		value: metricValue(observation.item, targetBenchmarkKey) as number,
	}));
	if (
		effectiveModelCount(referenceContextScores) <
		MIN_IMPUTATION_REFERENCE_MODELS
	) {
		return null;
	}
	return (model) => {
		const contextScore = observedNormalizedEvidenceScore(
			model,
			benchmarkKeys,
			benchmarkWeights,
			targetBenchmarkKey,
			valuesByKey,
		);
		if (contextScore == null) {
			return null;
		}
		const percentile = weightedQuantileRank(
			referenceContextScores,
			contextScore,
		);
		return percentile == null
			? null
			: weightedQuantile(targetObservations, percentile / 100);
	};
}

type WeightedBenchmarkPredictor = {
	predict: ((model: JsonObject) => number | null) | null;
	weight: number;
};

type BenchmarkPredictors = {
	direct: WeightedBenchmarkPredictor[];
	crossEffort: WeightedBenchmarkPredictor[];
};

type BenchmarkPrediction = {
	value: number;
	crossEffortUsed: boolean;
};

function selectedBenchmarkKeys(scoringConfig: ScoringConfig): string[] {
	return [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	];
}

function observedValuesByBenchmark(
	models: JsonObject[],
	benchmarkKeys: readonly string[],
): Map<string, number[]> {
	return new Map(
		benchmarkKeys.map(
			(key) =>
				[
					key,
					mapFiniteNumbers(models, (model) => metricValue(model, key)),
				] as const,
		),
	);
}

/** Learn one directed sibling-effort context mapping for a target benchmark and dimension. */
function buildCrossEffortDimensionPredictor(
	calibrationModels: JsonObject[],
	calibrationRows: EffortRowsByModel,
	contextRows: EffortRowsByModel,
	targetBenchmarkKey: string,
	targetEffortKey: string,
	sourceEffortKey: string,
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): ((model: JsonObject) => number | null) | null {
	const { benchmarkKeys, benchmarkWeights } = dimensionBenchmarkContext(
		dimension,
		scoringConfig,
	);
	const referenceContextScores = calibrationObservations(
		calibrationModels,
		(model) => {
			if (
				effortKey(model) !== targetEffortKey ||
				metricValue(model, targetBenchmarkKey) == null ||
				observedNormalizedEvidenceScore(
					model,
					benchmarkKeys,
					benchmarkWeights,
					targetBenchmarkKey,
					valuesByKey,
				) == null
			) {
				return null;
			}
			return siblingEffortContextScore(
				model,
				sourceEffortKey,
				calibrationRows,
				benchmarkKeys,
				benchmarkWeights,
				valuesByKey,
			);
		},
	);
	if (
		effectiveModelCount(referenceContextScores) <
		MIN_CROSS_EFFORT_REFERENCE_MODELS
	) {
		return null;
	}
	const targetObservations = referenceContextScores.map((observation) => ({
		...observation,
		value: metricValue(observation.item, targetBenchmarkKey) as number,
	}));
	return (model) => {
		if (
			effortKey(model) !== targetEffortKey ||
			observedNormalizedEvidenceScore(
				model,
				benchmarkKeys,
				benchmarkWeights,
				targetBenchmarkKey,
				valuesByKey,
			) == null
		) {
			return null;
		}
		const contextScore = siblingEffortContextScore(
			model,
			sourceEffortKey,
			contextRows,
			benchmarkKeys,
			benchmarkWeights,
			valuesByKey,
		);
		const percentile = weightedQuantileRank(
			referenceContextScores,
			contextScore,
		);
		return percentile == null
			? null
			: weightedQuantile(targetObservations, percentile / 100);
	};
}

/** List directed target/source effort pairs backed by an observed target benchmark. */
function crossEffortTransitions(
	models: readonly JsonObject[],
	targetBenchmarkKey: string,
	rowsByModel: EffortRowsByModel,
): Array<readonly [targetEffort: string, sourceEffort: string]> {
	const transitions = new Set<string>();
	for (const model of models) {
		if (metricValue(model, targetBenchmarkKey) == null) {
			continue;
		}
		const targetEffort = effortKey(model);
		for (const sourceEffort of rowsByModel
			.get(canonicalModelKey(model))
			?.keys() ?? []) {
			if (sourceEffort !== targetEffort) {
				transitions.add(
					`${targetEffort}${EFFORT_TRANSITION_SEPARATOR}${sourceEffort}`,
				);
			}
		}
	}
	return [...transitions].map((transition) => {
		const separator = transition.indexOf(EFFORT_TRANSITION_SEPARATOR);
		return [
			transition.slice(0, separator),
			transition.slice(separator + 1),
		] as const;
	});
}

function buildWeightedBenchmarkPredictors(
	models: JsonObject[],
	targetBenchmarkKey: string,
	scoringConfig: ScoringConfig,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
	contextModels: JsonObject[],
	includeCrossEffort: boolean,
): BenchmarkPredictors {
	const portfolioEntry = scoringConfig.benchmarkPortfolio[targetBenchmarkKey];
	if (portfolioEntry == null) {
		return { direct: [], crossEffort: [] };
	}
	const direct = IMPUTATION_DIMENSIONS.map((dimension) => ({
		predict:
			portfolioEntry.dimensionLoadings[dimension] > 0
				? buildDimensionBenchmarkPredictor(
						models,
						targetBenchmarkKey,
						dimension,
						scoringConfig,
						valuesByKey,
					)
				: null,
		weight: portfolioEntry.dimensionLoadings[dimension],
	}));
	if (!includeCrossEffort) {
		return { direct, crossEffort: [] };
	}
	const calibrationRows = effortRowsByModel(models);
	const contextRows =
		contextModels === models
			? calibrationRows
			: effortRowsByModel(contextModels);
	const crossEffort = crossEffortTransitions(
		models,
		targetBenchmarkKey,
		calibrationRows,
	).flatMap(([targetEffort, sourceEffort]) =>
		IMPUTATION_DIMENSIONS.map((dimension) => ({
			predict:
				portfolioEntry.dimensionLoadings[dimension] > 0
					? buildCrossEffortDimensionPredictor(
							models,
							calibrationRows,
							contextRows,
							targetBenchmarkKey,
							targetEffort,
							sourceEffort,
							dimension,
							scoringConfig,
							valuesByKey,
						)
					: null,
			weight: portfolioEntry.dimensionLoadings[dimension],
		})),
	);
	return { direct, crossEffort };
}

/** Blend the direct estimate with cross-effort evidence only when both are available. */
function predictedBenchmarkValue(
	model: JsonObject,
	predictors: BenchmarkPredictors,
): BenchmarkPrediction | null {
	const predictionFor = (sources: readonly WeightedBenchmarkPredictor[]) =>
		weightedMeanOfFinite(
			sources.map(({ predict, weight }) => ({
				value: predict?.(model) ?? null,
				weight,
			})),
		);
	const directPrediction = predictionFor(predictors.direct);
	if (directPrediction == null) {
		return null;
	}
	const crossEffortPrediction = predictionFor(predictors.crossEffort);
	if (crossEffortPrediction == null) {
		return { value: directPrediction, crossEffortUsed: false };
	}
	const value = weightedMeanOfFinite([
		{ value: directPrediction, weight: 1 },
		{ value: crossEffortPrediction, weight: 1 },
	]);
	return {
		value: value ?? directPrediction,
		crossEffortUsed: true,
	};
}

/** Validate one benchmark's imputer while withholding every variant of the observed model. */
function benchmarkImputationDiagnostic(
	models: JsonObject[],
	benchmarkKeys: readonly string[],
	targetBenchmarkKey: string,
	scoringConfig: ScoringConfig,
	includeCrossEffort: boolean,
): BenchmarkImputationDiagnostic {
	const normalizedAbsoluteErrorByModel = new Map<JsonObject, number>();
	const rawAbsoluteErrorByModel = new Map<JsonObject, number>();
	const crossEffortPredictionModels = new Set<JsonObject>();
	const calibrationByHeldOutModel = new Map<
		string,
		{
			predictors: BenchmarkPredictors;
			targetValues: readonly number[];
		}
	>();
	for (const heldOutModel of models) {
		const actualValue = metricValue(heldOutModel, targetBenchmarkKey);
		if (actualValue == null) {
			continue;
		}
		const heldOutModelKey = canonicalModelKey(heldOutModel);
		let calibration = calibrationByHeldOutModel.get(heldOutModelKey);
		if (calibration == null) {
			const trainingModels = models.filter(
				(model) => canonicalModelKey(model) !== heldOutModelKey,
			);
			const trainingValuesByKey = observedValuesByBenchmark(
				trainingModels,
				benchmarkKeys,
			);
			calibration = {
				predictors: buildWeightedBenchmarkPredictors(
					trainingModels,
					targetBenchmarkKey,
					scoringConfig,
					trainingValuesByKey,
					models,
					includeCrossEffort,
				),
				targetValues: trainingValuesByKey.get(targetBenchmarkKey) ?? [],
			};
			calibrationByHeldOutModel.set(heldOutModelKey, calibration);
		}
		const prediction = predictedBenchmarkValue(
			heldOutModel,
			calibration.predictors,
		);
		const normalizedPrediction = minMaxScale(
			calibration.targetValues,
			prediction?.value ?? null,
		);
		const normalizedActual = minMaxScale(calibration.targetValues, actualValue);
		if (normalizedPrediction == null || normalizedActual == null) {
			continue;
		}
		if (prediction?.crossEffortUsed) {
			crossEffortPredictionModels.add(heldOutModel);
		}
		normalizedAbsoluteErrorByModel.set(
			heldOutModel,
			Math.abs(normalizedPrediction - normalizedActual),
		);
		if (prediction != null) {
			rawAbsoluteErrorByModel.set(
				heldOutModel,
				Math.abs(prediction.value - actualValue),
			);
		}
	}
	const validationErrors = calibrationObservations(
		models,
		(model) => normalizedAbsoluteErrorByModel.get(model) ?? null,
	);
	const normalizedMedianAbsoluteError =
		weightedMedianOfFinite(validationErrors);
	const rawErrors = calibrationObservations(
		models,
		(model) => rawAbsoluteErrorByModel.get(model) ?? null,
	);
	const rawPenalty = weightedMedianOfFinite(rawErrors);
	const crossEffortValidationErrors = calibrationObservations(
		models,
		(model) =>
			crossEffortPredictionModels.has(model)
				? (normalizedAbsoluteErrorByModel.get(model) ?? null)
				: null,
	);
	const crossEffortRawErrors = calibrationObservations(models, (model) =>
		crossEffortPredictionModels.has(model)
			? (rawAbsoluteErrorByModel.get(model) ?? null)
			: null,
	);
	const validationModelCount = effectiveModelCount(validationErrors);
	const crossEffortValidationModelCount = effectiveModelCount(
		crossEffortValidationErrors,
	);
	const crossEffortNormalizedMedianAbsoluteError = weightedMedianOfFinite(
		crossEffortValidationErrors,
	);
	const crossEffortRawPenalty = weightedMedianOfFinite(crossEffortRawErrors);
	const crossEffortValidationAllowed =
		!includeCrossEffort ||
		(crossEffortValidationModelCount >= MIN_CROSS_EFFORT_VALIDATION_MODELS &&
			crossEffortNormalizedMedianAbsoluteError != null &&
			crossEffortNormalizedMedianAbsoluteError <=
				MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR &&
			crossEffortRawPenalty != null);
	return {
		validationSampleCount: validationErrors.length,
		effectiveModelCount: validationModelCount,
		normalizedMedianAbsoluteError,
		rawPenalty,
		imputationAllowed:
			validationModelCount >= MIN_IMPUTATION_VALIDATION_MODELS &&
			normalizedMedianAbsoluteError != null &&
			normalizedMedianAbsoluteError <= MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR &&
			rawPenalty != null &&
			crossEffortValidationAllowed,
		crossEffortUsed: includeCrossEffort,
		crossEffortEffectiveModelCount: crossEffortValidationModelCount,
		crossEffortNormalizedMedianAbsoluteError,
		crossEffortRawPenalty,
	};
}

/** Require reliable cross-only validation and a material improvement over the direct imputer. */
function preferCrossEffortDiagnostic(
	oneDimensional: BenchmarkImputationDiagnostic,
	twoDimensional: BenchmarkImputationDiagnostic,
): boolean {
	if (!twoDimensional.imputationAllowed) {
		return false;
	}
	if (!oneDimensional.imputationAllowed) {
		return true;
	}
	return (
		twoDimensional.normalizedMedianAbsoluteError != null &&
		oneDimensional.normalizedMedianAbsoluteError != null &&
		oneDimensional.normalizedMedianAbsoluteError > 0 &&
		twoDimensional.normalizedMedianAbsoluteError <=
			oneDimensional.normalizedMedianAbsoluteError *
				(1 - MIN_CROSS_EFFORT_ERROR_REDUCTION_RATIO)
	);
}

function prepareBenchmarkImputation(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): BenchmarkImputationPreparation {
	const imputationByModel = new Map<JsonObject, Map<string, number>>();
	const imputationConfidenceByModel = new Map<
		JsonObject,
		Map<string, number>
	>();
	const diagnosticsByKey = new Map<string, BenchmarkImputationDiagnostic>();
	const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
	const valuesByKey = observedValuesByBenchmark(models, benchmarkKeys);
	for (const key of benchmarkKeys) {
		const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
		if (portfolioEntry == null) {
			continue;
		}
		const oneDimensionalDiagnostic = benchmarkImputationDiagnostic(
			models,
			benchmarkKeys,
			key,
			scoringConfig,
			false,
		);
		const twoDimensionalDiagnostic = benchmarkImputationDiagnostic(
			models,
			benchmarkKeys,
			key,
			scoringConfig,
			true,
		);
		const useCrossEffort = preferCrossEffortDiagnostic(
			oneDimensionalDiagnostic,
			twoDimensionalDiagnostic,
		);
		const selectedDiagnostic = useCrossEffort
			? twoDimensionalDiagnostic
			: oneDimensionalDiagnostic;
		diagnosticsByKey.set(key, selectedDiagnostic);
		if (!selectedDiagnostic.imputationAllowed) {
			continue;
		}
		const dimensionPredictors = buildWeightedBenchmarkPredictors(
			models,
			key,
			scoringConfig,
			valuesByKey,
			models,
			useCrossEffort,
		);
		for (const model of models) {
			if (metricValue(model, key) != null) {
				continue;
			}
			const prediction = predictedBenchmarkValue(model, dimensionPredictors);
			const diagnostic = prediction?.crossEffortUsed
				? twoDimensionalDiagnostic
				: oneDimensionalDiagnostic;
			const imputedValue = imputedBenchmarkValue(
				prediction?.value ?? null,
				diagnostic,
				portfolioEntry.group === "frontier",
			);
			if (imputedValue == null || !Number.isFinite(imputedValue)) {
				continue;
			}
			const imputedValuesByKey =
				imputationByModel.get(model) ?? new Map<string, number>();
			imputedValuesByKey.set(key, imputedValue);
			imputationByModel.set(model, imputedValuesByKey);
			const confidenceByKey =
				imputationConfidenceByModel.get(model) ?? new Map<string, number>();
			confidenceByKey.set(key, imputationConfidence(diagnostic));
			imputationConfidenceByModel.set(model, confidenceByKey);
		}
	}
	return {
		benchmarkImputationByModel: imputationByModel,
		benchmarkImputationConfidenceByModel: imputationConfidenceByModel,
		benchmarkImputationDiagnosticsByKey: diagnosticsByKey,
	};
}

/** Precompute one benchmark-owned imputation from observed evidence only; source fields stay nullable. */
export function buildBenchmarkImputationByModel(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
	return prepareBenchmarkImputation(models, scoringConfig)
		.benchmarkImputationByModel;
}

/** Report leave-one-model-out reliability evidence for every selected benchmark imputer. */
export function buildBenchmarkImputationDiagnosticsByKey(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): Map<string, BenchmarkImputationDiagnostic> {
	return prepareBenchmarkImputation(models, scoringConfig)
		.benchmarkImputationDiagnosticsByKey;
}

/** Precompute raw comparison distributions used to normalize quality fields before averaging. */
export function buildQualityScoringContext(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): QualityScoringContext {
	const benchmarkValuesByKey = new Map<string, number[]>();
	const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
	for (const key of benchmarkKeys) {
		const values = models
			.map((model) => metricValue(model, key))
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			);
		benchmarkValuesByKey.set(key, values);
	}

	return { benchmarkValuesByKey };
}

/** Prepare benchmark imputations and quality normalization context in dependency order. */
export function prepareBenchmarkScoring(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): PreparedBenchmarkScoring {
	const { benchmarkImputationByModel, benchmarkImputationConfidenceByModel } =
		prepareBenchmarkImputation(models, scoringConfig);
	const qualityContext = buildQualityScoringContext(models, scoringConfig);
	return {
		benchmarkImputationByModel,
		benchmarkImputationConfidenceByModel,
		qualityContext,
	};
}
