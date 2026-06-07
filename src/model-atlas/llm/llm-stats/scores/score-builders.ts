/** Raw score builders for final Model Atlas model rows. */

import {
	meanOfFinite,
	quantileFromSorted,
	weightedMeanOfFinite,
} from "../../../math-utils";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import type {
	ModelStatsNullableScores,
	ModelStatsSelectedCost,
	ModelStatsSelectedSpeed,
	ScoringConfig,
} from "../types";
import {
	AGENTIC_INDEX_KEYS,
	firstMetricValue,
	INTELLIGENCE_INDEX_KEYS,
	indexScaleKey,
	metricValue,
	normalizedMetricValue,
	type QualityScoringContext,
} from "./benchmark-imputation";

/** Read selected benchmarks as explicitly weighted normalized score parts. */
function selectedBenchmarkScoreParts(
	model: JsonObject,
	keys: readonly string[],
	qualityContext: QualityScoringContext,
	scoringConfig: ScoringConfig,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
): Array<{ value: number | null; weight: number }> {
	const parts: Array<{ value: number | null; weight: number }> = [];
	for (const key of keys) {
		const rawValue =
			metricValue(model, key) ?? imputedValuesByKey.get(key) ?? null;
		const value = normalizedMetricValue(
			qualityContext.benchmarkValuesByKey,
			key,
			rawValue,
		);
		const weight = scoringConfig.benchmarkScoreWeights[key] ?? 1;
		parts.push({ value, weight });
	}
	return parts;
}

/** Blend an upstream quality index with the selected benchmark average. */
function qualityScore(
	qualityIndexScore: number | null,
	selectedBenchmarkParts: Array<{ value: number | null; weight: number }>,
	scoringConfig: ScoringConfig,
): number | null {
	const benchmarkMean = weightedMeanOfFinite(selectedBenchmarkParts);
	const qualityMean = weightedMeanOfFinite([
		{
			value: qualityIndexScore,
			weight: scoringConfig.qualityScoreWeights.index,
		},
		{
			value: benchmarkMean,
			weight: scoringConfig.qualityScoreWeights.selected_benchmarks,
		},
	]);
	return qualityMean;
}

/** Estimate a blended price from effective input/output prices, falling back to base models.dev prices. */
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

/** Derive representative output-token anchors from OpenRouter latency/throughput observations. */
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

/** Compute the raw score bundle for a single final model row. */
export function buildScores(
	model: JsonObject,
	cost: ModelStatsSelectedCost,
	speed: ModelStatsSelectedSpeed,
	speedOutputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	qualityContext: QualityScoringContext,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
): ModelStatsNullableScores | null {
	const intelligenceIndex = firstMetricValue(model, INTELLIGENCE_INDEX_KEYS);
	const agenticIndex = firstMetricValue(model, AGENTIC_INDEX_KEYS);
	const intelligenceIndexScore = normalizedMetricValue(
		qualityContext.indexValuesByKey,
		indexScaleKey(INTELLIGENCE_INDEX_KEYS),
		intelligenceIndex,
	);
	const agenticIndexScore = normalizedMetricValue(
		qualityContext.indexValuesByKey,
		indexScaleKey(AGENTIC_INDEX_KEYS),
		agenticIndex,
	);
	const intelligenceBenchmarkParts = selectedBenchmarkScoreParts(
		model,
		scoringConfig.intelligenceBenchmarkKeys,
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
	);
	const agenticBenchmarkParts = selectedBenchmarkScoreParts(
		model,
		scoringConfig.agenticBenchmarkKeys,
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
	);
	const intelligenceScore = qualityScore(
		intelligenceIndexScore,
		intelligenceBenchmarkParts,
		scoringConfig,
	);
	const agenticScore = qualityScore(
		agenticIndexScore,
		agenticBenchmarkParts,
		scoringConfig,
	);
	const blendedPrice = blendedPriceValue(cost, scoringConfig);
	const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
	const throughputTokensPerSecond = asFiniteNumber(
		speed.throughput_tokens_per_second_median,
	);
	const e2eLatencySeconds = asFiniteNumber(speed.e2e_latency_seconds_median);
	const valueScore =
		blendedPrice != null && blendedPrice > 0 ? 1 / blendedPrice : null;
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
	if (
		intelligenceScore == null &&
		agenticScore == null &&
		valueScore == null &&
		speedScore == null
	) {
		return null;
	}
	return {
		intelligence_score: intelligenceScore,
		agentic_score: agenticScore,
		speed_score: speedScore,
		value_score: valueScore,
	};
}
