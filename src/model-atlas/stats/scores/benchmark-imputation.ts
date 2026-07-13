/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

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

type BenchmarkDimension = "intelligence" | "agentic";

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_VALUES = 3;
const MIN_FRONTIER_EVIDENCE_VALUES = 2;
const NON_FRONTIER_CONFIDENCE_MULTIPLIER = 0.5;

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

/** Impute missing selected benchmark values by mapping same-dimension score percentile onto that benchmark's observed distribution. */
function buildDimensionBenchmarkImputations(
	models: JsonObject[],
	benchmarkKeys: readonly string[],
	frontierBenchmarkKeys: ReadonlySet<string>,
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
	const imputationByModel = new Map<JsonObject, Map<string, number>>();
	const valuesByKey = new Map<string, number[]>();
	const benchmarkWeights = new Map(
		benchmarkKeys.map((key) => {
			const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
			const weight =
				dimension === "intelligence"
					? portfolioEntry?.intelligencePortion
					: portfolioEntry?.agenticPortion;
			return [key, weight ?? 0] as const;
		}),
	);
	for (const key of benchmarkKeys) {
		valuesByKey.set(
			key,
			mapFiniteNumbers(models, (model) => metricValue(model, key)),
		);
	}
	for (const key of benchmarkKeys) {
		const isFrontierBenchmark = frontierBenchmarkKeys.has(key);
		const contextBenchmarkKeys = isFrontierBenchmark
			? benchmarkKeys.filter((benchmarkKey) =>
					frontierBenchmarkKeys.has(benchmarkKey),
				)
			: benchmarkKeys;
		const minEvidenceValues = isFrontierBenchmark
			? MIN_FRONTIER_EVIDENCE_VALUES
			: MIN_IMPUTATION_EVIDENCE_VALUES;
		const observedValues = models
			.map((model) => metricValue(model, key))
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			)
			.sort((left, right) => left - right);
		const referenceContextScores = models
			.filter((model) => metricValue(model, key) != null)
			.map((model) =>
				observedNormalizedEvidenceScore(
					model,
					contextBenchmarkKeys,
					benchmarkWeights,
					key,
					valuesByKey,
					minEvidenceValues,
				),
			)
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			);
		if (
			observedValues.length < MIN_IMPUTATION_REFERENCE_VALUES ||
			referenceContextScores.length < MIN_IMPUTATION_REFERENCE_VALUES
		) {
			continue;
		}
		for (const model of models) {
			if (metricValue(model, key) != null) {
				continue;
			}
			const contextScore = observedNormalizedEvidenceScore(
				model,
				contextBenchmarkKeys,
				benchmarkWeights,
				key,
				valuesByKey,
				minEvidenceValues,
			);
			const percentile = percentileRank(referenceContextScores, contextScore);
			const mappedValue =
				percentile == null
					? null
					: quantileFromSorted(observedValues, percentile / 100);
			const floorValue = observedValues[0] ?? null;
			const imputedValue = imputedBenchmarkValue(
				mappedValue,
				floorValue,
				isFrontierBenchmark,
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

/** Precompute benchmark imputations for scoring only; source benchmark fields stay nullable. */
export function buildBenchmarkImputationByModel(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
	const frontierBenchmarkKeys = new Set(scoringConfig.frontierBenchmarkKeys);
	const imputationByModel = mergeBenchmarkImputations(
		buildDimensionBenchmarkImputations(
			models,
			scoringConfig.intelligenceBenchmarkKeys,
			frontierBenchmarkKeys,
			"intelligence",
			scoringConfig,
		),
		buildDimensionBenchmarkImputations(
			models,
			scoringConfig.agenticBenchmarkKeys,
			frontierBenchmarkKeys,
			"agentic",
			scoringConfig,
		),
	);
	return imputationByModel;
}

function mergeBenchmarkImputations(
	...imputations: Array<Map<JsonObject, Map<string, number>>>
): Map<JsonObject, Map<string, number>> {
	const merged = new Map<JsonObject, Map<string, number>>();
	for (const imputation of imputations) {
		for (const [model, valuesByKey] of imputation) {
			const mergedValues = merged.get(model) ?? new Map<string, number>();
			for (const [key, value] of valuesByKey) {
				mergedValues.set(key, value);
			}
			merged.set(model, mergedValues);
		}
	}
	return merged;
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
