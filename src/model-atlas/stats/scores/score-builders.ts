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
	observed: boolean;
	weight: number;
};

function selectedBenchmarkScoreInputs(
	model: JsonObject,
	keys: readonly string[],
	dimension: BenchmarkDimension,
	qualityContext: QualityScoringContext,
	scoringConfig: ScoringConfig,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
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
		const rawValue = observedValue ?? imputedValuesByKey.get(key) ?? null;
		const value = normalizedMetricValue(
			qualityContext.benchmarkValuesByKey,
			key,
			rawValue,
		);
		inputs.push({
			value,
			observed: observedValue != null,
			weight: dimensionWeight,
		});
	}
	return inputs;
}

/** Score selected benchmarks by effective dimension weight while penalizing sparse observed weight coverage. */
function qualityScore(
	benchmarkScoreInputs: BenchmarkScoreInput[],
): number | null {
	const qualityMean = weightedMeanOfFinite(
		benchmarkScoreInputs.map(({ value, weight }) => ({ value, weight })),
	);
	const observedCoverage = weightedCoverageRatio(
		benchmarkScoreInputs.map(({ observed, weight }) => ({
			value: observed ? 1 : null,
			weight,
		})),
	);
	return qualityMean == null || observedCoverage == null
		? null
		: qualityMean * coverageConfidence(observedCoverage, 1);
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
): LlmStatsNullableComponentScores | null {
	const intelligenceBenchmarkInputs = selectedBenchmarkScoreInputs(
		model,
		scoringConfig.intelligenceBenchmarkKeys,
		"intelligence",
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
	);
	const agenticBenchmarkInputs = selectedBenchmarkScoreInputs(
		model,
		scoringConfig.agenticBenchmarkKeys,
		"agentic",
		qualityContext,
		scoringConfig,
		imputedValuesByKey,
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
