/** Component score builders for final Model Atlas model rows. */

import {
	type BenchmarkDimension,
	benchmarkDimensionWeight,
} from "../../config/benchmark-portfolio";
import {
	coverageConfidence,
	meanOfFinite,
	quantileFromSorted,
	weightedCoverageRatio,
	weightedMeanOfFinite,
} from "../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import type {
	LlmStatsNullableComponentScores,
	LlmStatsSpeed,
	ScoringConfig,
} from "../types";
import {
	metricValue,
	normalizedMetricValue,
	type QualityScoringContext,
} from "./benchmark-imputation";

type BenchmarkScoreInput = {
	value: number | null;
	evidenceConfidence: number;
	weight: number;
};

function isObservedBenchmark(model: JsonObject, key: string): boolean {
	return metricValue(model, key) != null;
}

/** Measure the observed share of one dimension's configured benchmark weight. */
export function observedBenchmarkCoverage(
	model: unknown,
	keys: readonly string[],
	dimension: BenchmarkDimension,
	scoringConfig: ScoringConfig,
): number | null {
	const modelRecord = asRecord(model);
	return weightedCoverageRatio(
		keys.flatMap((key) => {
			const weight = benchmarkDimensionWeight(
				key,
				dimension,
				scoringConfig.benchmarkPortfolio,
			);
			const isObserved = isObservedBenchmark(modelRecord, key);
			return weight > 0 ? [{ value: isObserved ? 1 : null, weight }] : [];
		}),
	);
}

/** Measure observed coverage across the selected portfolio without dimension loadings. */
export function observedBenchmarkPortfolioCoverage(
	model: unknown,
	keys: readonly string[],
	scoringConfig: ScoringConfig,
): number | null {
	const modelRecord = asRecord(model);
	return weightedCoverageRatio(
		keys.flatMap((key) => {
			const weight =
				scoringConfig.benchmarkPortfolio[key]?.benchmarkImportance ?? 0;
			const isObserved = isObservedBenchmark(modelRecord, key);
			return weight > 0 ? [{ value: isObserved ? 1 : null, weight }] : [];
		}),
	);
}

/** Count observed benchmarks without allowing imputed values to satisfy admission. */
export function observedBenchmarkCount(
	model: unknown,
	keys: readonly string[],
): number {
	const modelRecord = asRecord(model);
	return keys.reduce(
		(count, key) => count + (isObservedBenchmark(modelRecord, key) ? 1 : 0),
		0,
	);
}

function selectedBenchmarkScoreInputs(
	model: JsonObject,
	keys: readonly string[],
	dimension: BenchmarkDimension,
	qualityContext: QualityScoringContext,
	scoringConfig: ScoringConfig,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
	imputedConfidenceByKey: ReadonlyMap<string, number> = new Map(),
): BenchmarkScoreInput[] {
	const inputs: BenchmarkScoreInput[] = [];
	for (const key of keys) {
		const dimensionWeight = benchmarkDimensionWeight(
			key,
			dimension,
			scoringConfig.benchmarkPortfolio,
		);
		if (!(dimensionWeight > 0)) {
			continue;
		}
		const observedValue = metricValue(model, key);
		const imputedValue = imputedValuesByKey.get(key) ?? null;
		const rawValue = observedValue ?? imputedValue;
		const value = normalizedMetricValue(
			qualityContext.benchmarkValuesByKey,
			key,
			rawValue,
		);
		inputs.push({
			value,
			evidenceConfidence:
				observedValue != null
					? 1
					: imputedValue == null
						? 0
						: (imputedConfidenceByKey.get(key) ?? 0),
			weight: dimensionWeight,
		});
	}
	return inputs;
}

/** Score selected benchmarks while scaling confidence by observed and validated-imputed evidence. */
function qualityScore(
	benchmarkScoreInputs: BenchmarkScoreInput[],
): number | null {
	const qualityMean = weightedMeanOfFinite(
		benchmarkScoreInputs.map(({ value, weight }) => ({ value, weight })),
	);
	const evidenceCoverage = weightedMeanOfFinite(
		benchmarkScoreInputs.map(({ evidenceConfidence, weight }) => ({
			value: evidenceConfidence,
			weight,
		})),
	);
	return qualityMean == null || evidenceCoverage == null
		? null
		: qualityMean * coverageConfidence(evidenceCoverage, 1);
}

/** Estimate a blended price from effective input/output prices, falling back to published models.dev prices. */
export function blendedPriceValue(
	costLike: unknown,
	scoringConfig: ScoringConfig,
): number | null {
	const cost = asRecord(costLike);
	const inputCost = asFiniteNumber(cost.input);
	const outputCost = asFiniteNumber(cost.output);
	const weightedInputCost = asFiniteNumber(cost.weighted_input);
	const weightedOutputCost = asFiniteNumber(cost.weighted_output);
	if (
		inputCost == null ||
		outputCost == null ||
		inputCost <= 0 ||
		outputCost <= 0
	) {
		return null;
	}
	const useWeightedCosts =
		weightedInputCost != null &&
		weightedInputCost > 0 &&
		weightedOutputCost != null &&
		weightedOutputCost > 0;
	const effectiveInputCost = useWeightedCosts ? weightedInputCost : inputCost;
	const effectiveOutputCost = useWeightedCosts
		? weightedOutputCost
		: outputCost;
	return weightedMeanOfFinite(
		Object.values(scoringConfig.priceProfiles).map((profile) => ({
			value:
				profile.input * effectiveInputCost +
				profile.output * effectiveOutputCost,
			weight: profile.weight,
		})),
	);
}

export function deriveSpeedOutputTokenAnchors(
	openRouterSpeedById: Map<string, JsonObject>,
	scoringConfig: ScoringConfig,
): number[] {
	const impliedTokenUsages = Array.from(openRouterSpeedById.values())
		.map((speed) => {
			const throughputTokensPerSecond = asFiniteNumber(
				speed.throughput_tokens_per_second_median,
			);
			const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
			const e2eLatencySeconds = asFiniteNumber(
				speed.e2e_latency_seconds_median,
			);
			if (
				throughputTokensPerSecond == null ||
				throughputTokensPerSecond <= 0 ||
				latencySeconds == null ||
				e2eLatencySeconds == null
			) {
				return null;
			}
			const generationSeconds = e2eLatencySeconds - latencySeconds;
			if (generationSeconds <= 0) {
				return null;
			}
			return generationSeconds * throughputTokensPerSecond;
		})
		.filter((value): value is number => value != null && Number.isFinite(value))
		.sort((left, right) => left - right);

	if (impliedTokenUsages.length === 0) {
		return [...scoringConfig.defaultSpeedOutputTokenAnchors];
	}

	const q0 = impliedTokenUsages[0] ?? null;
	const [q1, q2, q3] = scoringConfig.speedAnchorQuantiles.map((quantile) =>
		quantileFromSorted(impliedTokenUsages, quantile),
	);
	const q4 = impliedTokenUsages.at(-1) ?? null;
	const numericQuantileAnchors = [q0, q1, q2, q3, q4].filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	if (numericQuantileAnchors.length !== 5) {
		return [...scoringConfig.defaultSpeedOutputTokenAnchors];
	}

	const sourceMin = numericQuantileAnchors[0] as number;
	const sourceMax = numericQuantileAnchors.at(-1) as number;
	if (!(sourceMax > sourceMin)) {
		return [...scoringConfig.defaultSpeedOutputTokenAnchors];
	}

	return numericQuantileAnchors.map((anchor) => {
		const normalized = (anchor - sourceMin) / (sourceMax - sourceMin);
		const mapped =
			scoringConfig.speedOutputTokenRangeMin +
			normalized *
				(scoringConfig.speedOutputTokenRangeMax -
					scoringConfig.speedOutputTokenRangeMin);
		return Math.round(mapped);
	});
}

export function buildComponentScores(
	model: JsonObject,
	speed: LlmStatsSpeed,
	speedOutputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	qualityContext: QualityScoringContext,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
	imputedConfidenceByKey: ReadonlyMap<string, number> = new Map(),
): LlmStatsNullableComponentScores | null {
	const intelligenceBenchmarkInputs = selectedBenchmarkScoreInputs(
		model,
		scoringConfig.intelligenceBenchmarkKeys,
		"intelligence",
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
		imputedConfidenceByKey,
	);
	const agenticBenchmarkInputs = selectedBenchmarkScoreInputs(
		model,
		scoringConfig.agenticBenchmarkKeys,
		"agentic",
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
		imputedConfidenceByKey,
	);
	const intelligenceScore = qualityScore(intelligenceBenchmarkInputs);
	const agenticScore = qualityScore(agenticBenchmarkInputs);
	const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
	const throughputTokensPerSecond = asFiniteNumber(
		speed.throughput_tokens_per_second_median,
	);
	const e2eLatencySeconds = asFiniteNumber(speed.e2e_latency_seconds_median);
	const imaginedSpeedScore = meanOfFinite(
		speedOutputTokenAnchors.map((targetTokens) =>
			latencySeconds != null &&
			throughputTokensPerSecond != null &&
			throughputTokensPerSecond > 0
				? targetTokens /
					(latencySeconds + targetTokens / throughputTokensPerSecond)
				: null,
		),
	);
	const sortedAnchors = [...speedOutputTokenAnchors].sort(
		(left, right) => left - right,
	);
	const representativeTargetTokens = quantileFromSorted(sortedAnchors, 0.5);
	const observedE2eSpeedScore =
		representativeTargetTokens != null &&
		e2eLatencySeconds != null &&
		e2eLatencySeconds > 0
			? representativeTargetTokens / e2eLatencySeconds
			: null;
	const speedScore = meanOfFinite([imaginedSpeedScore, observedE2eSpeedScore]);
	if (intelligenceScore == null && agenticScore == null && speedScore == null) {
		return null;
	}
	return {
		intelligence_score: intelligenceScore,
		agentic_score: agenticScore,
		speed_score: speedScore,
	};
}
