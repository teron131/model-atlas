/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

import {
	type BenchmarkDimension,
	benchmarkDimensionWeight,
} from "../../config/benchmark-portfolio";
import {
	mapFiniteNumbers,
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

export type QualityScoringContext = {
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>;
};

type PreparedBenchmarkScoring = {
	benchmarkImputationByModel: BenchmarkImputationByModel;
	qualityContext: QualityScoringContext;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_VALUES = 3;
const MIN_FRONTIER_EVIDENCE_VALUES = 2;
const NON_FRONTIER_CONFIDENCE_MULTIPLIER = 0.5;
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

/** Estimates missing benchmark scores from correlated selected-benchmark evidence. */
function imputedBenchmarkValue(
	mappedValue: number | null,
	floorValue: number | null,
	isFrontierBenchmark: boolean,
): number | null {
	if (mappedValue == null || floorValue == null) {
		return null;
	}
	if (isFrontierBenchmark) {
		return mappedValue;
	}
	return (
		floorValue + NON_FRONTIER_CONFIDENCE_MULTIPLIER * (mappedValue - floorValue)
	);
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
	const targetGroup =
		scoringConfig.benchmarkPortfolio[targetBenchmarkKey]?.group;
	const selectedBenchmarkKeys =
		dimension === "intelligence"
			? scoringConfig.intelligenceBenchmarkKeys
			: scoringConfig.agenticBenchmarkKeys;
	const contextBenchmarkKeys =
		targetGroup === "frontier"
			? selectedBenchmarkKeys.filter(
					(key) => scoringConfig.benchmarkPortfolio[key]?.group === "frontier",
				)
			: selectedBenchmarkKeys;
	const minEvidenceValues =
		targetGroup === "frontier"
			? MIN_FRONTIER_EVIDENCE_VALUES
			: MIN_IMPUTATION_EVIDENCE_VALUES;
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
				contextBenchmarkKeys,
				benchmarkWeights,
				targetBenchmarkKey,
				valuesByKey,
				minEvidenceValues,
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
			contextBenchmarkKeys,
			benchmarkWeights,
			targetBenchmarkKey,
			valuesByKey,
			minEvidenceValues,
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

/** Precompute one benchmark-owned imputation from observed evidence only; source fields stay nullable. */
export function buildBenchmarkImputationByModel(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
	const imputationByModel = new Map<JsonObject, Map<string, number>>();
	const benchmarkKeys = [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	];
	const valuesByKey = new Map(
		benchmarkKeys.map(
			(key) =>
				[
					key,
					mapFiniteNumbers(models, (model) => metricValue(model, key)),
				] as const,
		),
	);
	for (const key of benchmarkKeys) {
		const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
		if (portfolioEntry == null) {
			continue;
		}
		const observedValues = [...(valuesByKey.get(key) ?? [])].sort(
			(left, right) => left - right,
		);
		const dimensionPredictors = IMPUTATION_DIMENSIONS.map((dimension) => ({
			predict:
				portfolioEntry.dimensionLoadings[dimension] > 0
					? buildDimensionBenchmarkPredictor(
							models,
							key,
							observedValues,
							dimension,
							scoringConfig,
							valuesByKey,
						)
					: null,
			weight: portfolioEntry.dimensionLoadings[dimension],
		}));
		for (const model of models) {
			if (metricValue(model, key) != null) {
				continue;
			}
			const mappedValue = weightedMeanOfFinite(
				dimensionPredictors.map(({ predict, weight }) => ({
					value: predict?.(model) ?? null,
					weight,
				})),
			);
			const imputedValue = imputedBenchmarkValue(
				mappedValue,
				observedValues[0] ?? null,
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
	return imputationByModel;
}

/** Precompute raw comparison distributions used to normalize quality fields before averaging. */
export function buildQualityScoringContext(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
	benchmarkImputationByModel: BenchmarkImputationByModel,
): QualityScoringContext {
	const benchmarkValuesByKey = new Map<string, number[]>();
	const benchmarkKeys = [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	];
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
	const benchmarkImputationByModel = buildBenchmarkImputationByModel(
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
