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
const IMPUTED_BENCHMARK_CONFIDENCE_MULTIPLIER = 0.5;
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
	if (key === "omniscience_nonhallucination_rate") {
		const nonhallucinationRate = asFiniteNumber(
			intelligence.omniscience_nonhallucination_rate,
		);
		if (nonhallucinationRate != null) {
			return nonhallucinationRate;
		}
		const nonhallucinationRateFromLegacyKey = asFiniteNumber(
			intelligence.omniscience_hallucination_rate,
		);
		return nonhallucinationRateFromLegacyKey;
	}
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

/** Compute normalized same-dimension evidence for percentile-based benchmark imputation. */
function observedNormalizedDimensionScore(
	model: JsonObject,
	indexKeys: readonly string[],
	benchmarkKeys: readonly string[],
	excludedBenchmarkKey: string,
	valuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	const indexValue = firstMetricValue(model, indexKeys);
	const indexKey = indexScaleKey(indexKeys);
	const values = [
		normalizedMetricValue(valuesByKey, indexKey, indexValue),
		...benchmarkKeys
			.filter((key) => key !== excludedBenchmarkKey)
			.map((key) =>
				normalizedMetricValue(valuesByKey, key, metricValue(model, key)),
			),
	];
	const finiteValueCount = values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	).length;
	return finiteValueCount >= MIN_IMPUTATION_EVIDENCE_VALUES
		? meanOfFinite(values)
		: null;
}

/** Impute missing selected benchmark values by mapping same-dimension score percentile onto that benchmark's observed distribution. */
function buildDimensionBenchmarkImputations(
	models: JsonObject[],
	indexKeys: readonly string[],
	benchmarkKeys: readonly string[],
	floorImputedBenchmarkKeys: ReadonlySet<string>,
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
		if (floorImputedBenchmarkKeys.has(key)) {
			continue;
		}
		const observedValues = models
			.map((model) => metricValue(model, key))
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			)
			.sort((left, right) => left - right);
		const referenceContextScores = models
			.filter((model) => metricValue(model, key) != null)
			.map((model) =>
				observedNormalizedDimensionScore(
					model,
					indexKeys,
					benchmarkKeys,
					key,
					valuesByKey,
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
			const contextScore = observedNormalizedDimensionScore(
				model,
				indexKeys,
				benchmarkKeys,
				key,
				valuesByKey,
			);
			const percentile = percentileRank(referenceContextScores, contextScore);
			const mappedValue =
				percentile == null
					? null
					: quantileFromSorted(observedValues, percentile / 100);
			const floorValue = observedValues[0] ?? null;
			const imputedValue =
				mappedValue == null || floorValue == null
					? null
					: floorValue +
						IMPUTED_BENCHMARK_CONFIDENCE_MULTIPLIER *
							(mappedValue - floorValue);
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

/** Add an imputed value to one model/key pair without mutating public source fields. */
function setImputedValue(
	imputationByModel: Map<JsonObject, Map<string, number>>,
	model: JsonObject,
	key: string,
	value: number,
): void {
	const valuesByKey = imputationByModel.get(model) ?? new Map<string, number>();
	valuesByKey.set(key, value);
	imputationByModel.set(model, valuesByKey);
}

/** Impute missing frontier benchmarks with the observed floor as a scoring-only proof penalty. */
function addFloorBenchmarkImputations(
	imputationByModel: Map<JsonObject, Map<string, number>>,
	models: JsonObject[],
	selectedBenchmarkKeys: ReadonlySet<string>,
	floorImputedBenchmarkKeys: ReadonlySet<string>,
): void {
	for (const key of floorImputedBenchmarkKeys) {
		if (!selectedBenchmarkKeys.has(key)) {
			continue;
		}
		const observedValues = models
			.map((model) => metricValue(model, key))
			.filter(
				(value): value is number => value != null && Number.isFinite(value),
			);
		if (observedValues.length === 0) {
			continue;
		}
		const floorValue = Math.min(...observedValues);
		for (const model of models) {
			if (metricValue(model, key) == null) {
				setImputedValue(imputationByModel, model, key, floorValue);
			}
		}
	}
}

/** Precompute benchmark imputations for scoring only; source benchmark fields stay nullable. */
export function buildBenchmarkImputationByModel(
	models: JsonObject[],
	scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
	const floorImputedBenchmarkKeys = new Set(
		scoringConfig.floorImputedBenchmarkKeys,
	);
	const selectedBenchmarkKeys = new Set([
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]);
	const imputationByModel = mergeBenchmarkImputations(
		buildDimensionBenchmarkImputations(
			models,
			INTELLIGENCE_INDEX_KEYS,
			scoringConfig.intelligenceBenchmarkKeys,
			floorImputedBenchmarkKeys,
		),
		buildDimensionBenchmarkImputations(
			models,
			AGENTIC_INDEX_KEYS,
			scoringConfig.agenticBenchmarkKeys,
			floorImputedBenchmarkKeys,
		),
	);
	addFloorBenchmarkImputations(
		imputationByModel,
		models,
		selectedBenchmarkKeys,
		floorImputedBenchmarkKeys,
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
