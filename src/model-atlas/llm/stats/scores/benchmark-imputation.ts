/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

import {
	mapFiniteNumbers,
	meanOfFinite,
	minMaxScale,
	percentileRank,
	quantileFromSorted,
} from "../../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import type { ScoringConfig } from "../types";

export type BenchmarkImputationByModel = ReadonlyMap<
	JsonObject,
	ReadonlyMap<string, number>
>;

export type QualityScoringContext = {
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>;
	indexValuesByKey: ReadonlyMap<string, readonly number[]>;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_VALUES = 3;
const MIN_FRONTIER_IMPUTATION_EVIDENCE_VALUES = 2;
const NON_FRONTIER_IMPUTATION_CONFIDENCE_MULTIPLIER = 0.5;
const INDEX_SCALE_KEY_SEPARATOR = "\u0000";
export const INTELLIGENCE_INDEX_KEYS = [
	"intelligence_index",
	"artificial_analysis_intelligence_index",
] as const;
export const AGENTIC_INDEX_KEYS = [
	"agentic_index",
	"artificial_analysis_agentic_index",
] as const;

/** Read a benchmark metric from either intelligence or evaluation fields. */
export function metricValue(model: JsonObject, key: string): number | null {
	const intelligence = asRecord(model.intelligence);
	const evaluations = asRecord(model.evaluations);
	return (
		asFiniteNumber(intelligence[key]) ??
		asFiniteNumber(evaluations[key]) ??
		null
	);
}

/** Return the first finite metric value from candidate keys. */
export function firstMetricValue(
	model: JsonObject,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = metricValue(model, key);
		if (value != null) {
			return value;
		}
	}
	return null;
}

export function indexScaleKey(indexKeys: readonly string[]): string {
	return indexKeys.join(INDEX_SCALE_KEY_SEPARATOR);
}

export function normalizedMetricValue(
	valuesByKey: ReadonlyMap<string, readonly number[]>,
	key: string,
	value: number | null,
): number | null {
	return minMaxScale(valuesByKey.get(key) ?? [], value);
}

/** Compute normalized evidence context for percentile-based benchmark imputation. */
function observedNormalizedEvidenceScore(
	model: JsonObject,
	indexKeys: readonly string[],
	benchmarkKeys: readonly string[],
	excludedBenchmarkKey: string,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
	minEvidenceValues: number,
): number | null {
	const values = [
		indexKeys.length > 0
			? normalizedMetricValue(
					valuesByKey,
					indexScaleKey(indexKeys),
					firstMetricValue(model, indexKeys),
				)
			: null,
		...benchmarkKeys
			.filter((key) => key !== excludedBenchmarkKey)
			.map((key) =>
				normalizedMetricValue(valuesByKey, key, metricValue(model, key)),
			),
	];
	const finiteValueCount = values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	).length;
	return finiteValueCount >= minEvidenceValues ? meanOfFinite(values) : null;
}

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
		floorValue +
		NON_FRONTIER_IMPUTATION_CONFIDENCE_MULTIPLIER * (mappedValue - floorValue)
	);
}

/** Impute missing selected benchmark values by mapping same-dimension score percentile onto that benchmark's observed distribution. */
function buildDimensionBenchmarkImputations(
	models: JsonObject[],
	indexKeys: readonly string[],
	benchmarkKeys: readonly string[],
	frontierBenchmarkKeys: ReadonlySet<string>,
): Map<JsonObject, Map<string, number>> {
	const imputationByModel = new Map<JsonObject, Map<string, number>>();
	const valuesByKey = new Map<string, number[]>();
	valuesByKey.set(
		indexScaleKey(indexKeys),
		mapFiniteNumbers(models, (model) => firstMetricValue(model, indexKeys)),
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
		const contextIndexKeys = isFrontierBenchmark ? [] : indexKeys;
		const minEvidenceValues = isFrontierBenchmark
			? MIN_FRONTIER_IMPUTATION_EVIDENCE_VALUES
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
					contextIndexKeys,
					contextBenchmarkKeys,
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
				contextIndexKeys,
				contextBenchmarkKeys,
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
			INTELLIGENCE_INDEX_KEYS,
			scoringConfig.intelligenceBenchmarkKeys,
			frontierBenchmarkKeys,
		),
		buildDimensionBenchmarkImputations(
			models,
			AGENTIC_INDEX_KEYS,
			scoringConfig.agenticBenchmarkKeys,
			frontierBenchmarkKeys,
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

	const indexValuesByKey = new Map<string, number[]>();
	for (const indexKeys of [INTELLIGENCE_INDEX_KEYS, AGENTIC_INDEX_KEYS]) {
		const values = models
			.map((model) => firstMetricValue(model, indexKeys))
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			);
		indexValuesByKey.set(indexScaleKey(indexKeys), values);
	}

	return { benchmarkValuesByKey, indexValuesByKey };
}
