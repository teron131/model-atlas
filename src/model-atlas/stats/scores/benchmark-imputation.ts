/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

import {
	type BenchmarkDimension,
	benchmarkDimensionWeight,
} from "../../config/benchmark-portfolio";
import {
	mapFiniteNumbers,
	medianOfFinite,
	minMaxScale,
	percentileRank,
	quantileFromSorted,
	weightedFinitePartCount,
	weightedMeanOfFinite,
} from "../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import type { ScoringConfig } from "../types";

export type BenchmarkImputationByModel = ReadonlyMap<
	JsonObject,
	ReadonlyMap<string, number>
>;

export type BenchmarkImputationDiagnostic = {
	validationSampleCount: number;
	normalizedMedianAbsoluteError: number | null;
	rawPenalty: number | null;
	imputationAllowed: boolean;
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
	qualityContext: QualityScoringContext;
};

type BenchmarkImputationPreparation = {
	benchmarkImputationByModel: Map<JsonObject, Map<string, number>>;
	benchmarkImputationDiagnosticsByKey: Map<
		string,
		BenchmarkImputationDiagnostic
	>;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_VALUES = 3;
const MIN_IMPUTATION_VALIDATION_VALUES = 4;
const MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR = 25;
const FRONTIER_MISSING_ERROR_MULTIPLIER = 1;
const BASELINE_MISSING_ERROR_MULTIPLIER = 0.5;
const IMPUTATION_DIMENSIONS = ["intelligence", "agentic"] as const;

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
	return minMaxScale(valuesByKey.get(key) ?? [], value);
}

function observedNormalizedEvidenceScore(
	model: JsonObject,
	benchmarkKeys: readonly string[],
	benchmarkWeights: ReadonlyMap<string, number>,
	excludedBenchmarkKey: string,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
	minEvidenceValues: number,
): number | null {
	const parts = benchmarkKeys
		.filter((key) => key !== excludedBenchmarkKey)
		.map((key) => ({
			value: normalizedMetricValue(valuesByKey, key, metricValue(model, key)),
			weight: benchmarkWeights.get(key) ?? 0,
		}));
	return weightedFinitePartCount(parts) >= minEvidenceValues
		? weightedMeanOfFinite(parts)
		: null;
}

/** Penalize a validated benchmark prediction by its group-specific error multiple. */
function imputedBenchmarkValue(
	mappedValue: number | null,
	diagnostic: BenchmarkImputationDiagnostic,
	isFrontierBenchmark: boolean,
): number | null {
	if (
		mappedValue == null ||
		!diagnostic.imputationAllowed ||
		diagnostic.rawPenalty == null
	) {
		return null;
	}
	const errorMultiplier = isFrontierBenchmark
		? FRONTIER_MISSING_ERROR_MULTIPLIER
		: BASELINE_MISSING_ERROR_MULTIPLIER;
	return Math.max(0, mappedValue - errorMultiplier * diagnostic.rawPenalty);
}

/** Build one dimension-specific predictor from observed context and target values only. */
function buildDimensionBenchmarkPredictor(
	models: JsonObject[],
	targetBenchmarkKey: string,
	observedTargetValues: number[],
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): ((model: JsonObject) => number | null) | null {
	const selectedBenchmarkKeys =
		dimension === "intelligence"
			? scoringConfig.intelligenceBenchmarkKeys
			: scoringConfig.agenticBenchmarkKeys;
	const benchmarkWeights = new Map(
		selectedBenchmarkKeys.map(
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
	);
	const referenceContextScores = models
		.filter((model) => metricValue(model, targetBenchmarkKey) != null)
		.map((model) =>
			observedNormalizedEvidenceScore(
				model,
				selectedBenchmarkKeys,
				benchmarkWeights,
				targetBenchmarkKey,
				valuesByKey,
				MIN_IMPUTATION_EVIDENCE_VALUES,
			),
		)
		.filter(
			(value): value is number => value != null && Number.isFinite(value),
		);
	if (
		observedTargetValues.length < MIN_IMPUTATION_REFERENCE_VALUES ||
		referenceContextScores.length < MIN_IMPUTATION_REFERENCE_VALUES
	) {
		return null;
	}
	return (model) => {
		const contextScore = observedNormalizedEvidenceScore(
			model,
			selectedBenchmarkKeys,
			benchmarkWeights,
			targetBenchmarkKey,
			valuesByKey,
			MIN_IMPUTATION_EVIDENCE_VALUES,
		);
		if (contextScore == null) {
			return null;
		}
		const percentile = percentileRank(referenceContextScores, contextScore);
		return percentile == null
			? null
			: quantileFromSorted(observedTargetValues, percentile / 100);
	};
}

type WeightedBenchmarkPredictor = {
	predict: ((model: JsonObject) => number | null) | null;
	weight: number;
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

function buildWeightedBenchmarkPredictors(
	models: JsonObject[],
	targetBenchmarkKey: string,
	observedTargetValues: number[],
	scoringConfig: ScoringConfig,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): WeightedBenchmarkPredictor[] {
	const portfolioEntry = scoringConfig.benchmarkPortfolio[targetBenchmarkKey];
	if (portfolioEntry == null) {
		return [];
	}
	return IMPUTATION_DIMENSIONS.map((dimension) => ({
		predict:
			portfolioEntry.dimensionLoadings[dimension] > 0
				? buildDimensionBenchmarkPredictor(
						models,
						targetBenchmarkKey,
						observedTargetValues,
						dimension,
						scoringConfig,
						valuesByKey,
					)
				: null,
		weight: portfolioEntry.dimensionLoadings[dimension],
	}));
}

function predictedBenchmarkValue(
	model: JsonObject,
	predictors: readonly WeightedBenchmarkPredictor[],
): number | null {
	return weightedMeanOfFinite(
		predictors.map(({ predict, weight }) => ({
			value: predict?.(model) ?? null,
			weight,
		})),
	);
}

/** Validate one benchmark's imputer by withholding each observed model from all calibration evidence. */
function benchmarkImputationDiagnostic(
	models: JsonObject[],
	benchmarkKeys: readonly string[],
	targetBenchmarkKey: string,
	scoringConfig: ScoringConfig,
	observedTargetValues: number[],
): BenchmarkImputationDiagnostic {
	const normalizedAbsoluteErrors: number[] = [];
	for (const heldOutModel of models) {
		const actualValue = metricValue(heldOutModel, targetBenchmarkKey);
		if (actualValue == null) {
			continue;
		}
		const trainingModels = models.filter((model) => model !== heldOutModel);
		const trainingValuesByKey = observedValuesByBenchmark(
			trainingModels,
			benchmarkKeys,
		);
		const trainingTargetValues = [
			...(trainingValuesByKey.get(targetBenchmarkKey) ?? []),
		].sort((left, right) => left - right);
		const prediction = predictedBenchmarkValue(
			heldOutModel,
			buildWeightedBenchmarkPredictors(
				trainingModels,
				targetBenchmarkKey,
				trainingTargetValues,
				scoringConfig,
				trainingValuesByKey,
			),
		);
		const normalizedPrediction = minMaxScale(trainingTargetValues, prediction);
		const normalizedActual = minMaxScale(trainingTargetValues, actualValue);
		if (normalizedPrediction == null || normalizedActual == null) {
			continue;
		}
		normalizedAbsoluteErrors.push(
			Math.abs(normalizedPrediction - normalizedActual),
		);
	}
	const normalizedMedianAbsoluteError = medianOfFinite(
		normalizedAbsoluteErrors,
	);
	const observedMinimum = observedTargetValues[0] ?? null;
	const observedMaximum = observedTargetValues.at(-1) ?? null;
	const observedRange =
		observedMinimum == null || observedMaximum == null
			? null
			: observedMaximum - observedMinimum;
	const rawPenalty =
		normalizedMedianAbsoluteError == null ||
		observedRange == null ||
		observedRange <= 0
			? null
			: (normalizedMedianAbsoluteError / 100) * observedRange;
	return {
		validationSampleCount: normalizedAbsoluteErrors.length,
		normalizedMedianAbsoluteError,
		rawPenalty,
		imputationAllowed:
			normalizedAbsoluteErrors.length >= MIN_IMPUTATION_VALIDATION_VALUES &&
			normalizedMedianAbsoluteError != null &&
			normalizedMedianAbsoluteError <= MAX_NORMALIZED_MEDIAN_ABSOLUTE_ERROR &&
			rawPenalty != null,
	};
}

function prepareBenchmarkImputation(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): BenchmarkImputationPreparation {
	const imputationByModel = new Map<JsonObject, Map<string, number>>();
	const diagnosticsByKey = new Map<string, BenchmarkImputationDiagnostic>();
	const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
	const valuesByKey = observedValuesByBenchmark(models, benchmarkKeys);
	for (const key of benchmarkKeys) {
		const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
		if (portfolioEntry == null) {
			continue;
		}
		const observedValues = [...(valuesByKey.get(key) ?? [])].sort(
			(left, right) => left - right,
		);
		const diagnostic = benchmarkImputationDiagnostic(
			models,
			benchmarkKeys,
			key,
			scoringConfig,
			observedValues,
		);
		diagnosticsByKey.set(key, diagnostic);
		if (!diagnostic.imputationAllowed) {
			continue;
		}
		const dimensionPredictors = buildWeightedBenchmarkPredictors(
			models,
			key,
			observedValues,
			scoringConfig,
			valuesByKey,
		);
		for (const model of models) {
			if (metricValue(model, key) != null) {
				continue;
			}
			const mappedValue = predictedBenchmarkValue(model, dimensionPredictors);
			const imputedValue = imputedBenchmarkValue(
				mappedValue,
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
		}
	}
	return {
		benchmarkImputationByModel: imputationByModel,
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
	benchmarkImputationByModel: BenchmarkImputationByModel,
): QualityScoringContext {
	const benchmarkValuesByKey = new Map<string, number[]>();
	const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
	for (const key of benchmarkKeys) {
		const values = models
			.map(
				(model) =>
					metricValue(model, key) ??
					benchmarkImputationByModel.get(model)?.get(key) ??
					null,
			)
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
	const { benchmarkImputationByModel } = prepareBenchmarkImputation(
		models,
		scoringConfig,
	);
	const qualityContext = buildQualityScoringContext(
		models,
		scoringConfig,
		benchmarkImputationByModel,
	);
	return {
		benchmarkImputationByModel,
		qualityContext,
	};
}
