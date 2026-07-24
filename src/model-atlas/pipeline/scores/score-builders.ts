/** Component score builders for final Model Atlas model rows. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import type { Confidence, ScoringConfig } from "../../config/stage";
import {
	meanOfFinite,
	quantileFromSorted,
	weightedMeanOfFinite,
} from "../../numeric";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import type {
	ModelAtlasConfidence,
	ModelAtlasNullableComponentScores,
	ModelAtlasSpeed,
} from "../model-types";
import {
	normalizedMetricValue,
	type QualityScoringContext,
} from "./benchmark-imputation";
import { evidenceMassConfidence } from "./normalization";
import { benchmarkMetricValue } from "./resource-metrics";

type BenchmarkScoreInput = {
	value: number | null;
	evidenceConfidence: number;
	weight: number;
};

type QualityScoreResult = {
	score: number | null;
	confidence: number | null;
};

type ComponentScoreResult = {
	componentScores: ModelAtlasNullableComponentScores | null;
	confidence: ModelAtlasConfidence;
};

/** Count observed benchmarks without allowing imputed values to satisfy admission. */
export function observedBenchmarkCount(
	model: unknown,
	keys: readonly string[],
): number {
	const modelRecord = asRecord(model);
	return keys.reduce(
		(count, key) =>
			count + (benchmarkMetricValue(modelRecord, key) != null ? 1 : 0),
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
		const observedValue = benchmarkMetricValue(model, key);
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
	evidenceThresholds: Confidence[BenchmarkDimension],
): QualityScoreResult {
	const qualityMean = weightedMeanOfFinite(
		benchmarkScoreInputs.map(({ value, weight }) => ({ value, weight })),
	);
	if (qualityMean == null) {
		return { score: null, confidence: null };
	}
	const evidenceMass = benchmarkScoreInputs.reduce(
		(total, { evidenceConfidence, weight }) =>
			total + evidenceConfidence * weight,
		0,
	);
	const confidence = evidenceMassConfidence(
		evidenceMass,
		evidenceThresholds.floor,
		evidenceThresholds.full,
	);
	return {
		score: qualityMean * confidence,
		confidence,
	};
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
	speedByModelId: Map<string, JsonObject>,
	scoringConfig: ScoringConfig,
): number[] {
	const impliedTokenUsages = Array.from(speedByModelId.values())
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
	const anchors = [q0, q1, q2, q3, q4].filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	if (anchors.length !== 5) {
		return [...scoringConfig.defaultSpeedOutputTokenAnchors];
	}

	const sourceMin = anchors[0] as number;
	const sourceMax = anchors.at(-1) as number;
	if (!(sourceMax > sourceMin)) {
		return [...scoringConfig.defaultSpeedOutputTokenAnchors];
	}

	return anchors.map((anchor) => {
		const normalized = (anchor - sourceMin) / (sourceMax - sourceMin);
		const mapped =
			scoringConfig.speedOutputTokenRangeMin +
			normalized *
				(scoringConfig.speedOutputTokenRangeMax -
					scoringConfig.speedOutputTokenRangeMin);
		return Math.round(mapped);
	});
}

export function buildComponentScoreResult(
	model: JsonObject,
	speed: ModelAtlasSpeed,
	speedOutputTokenAnchors: number[],
	scoringConfig: ScoringConfig,
	qualityContext: QualityScoringContext,
	imputedValuesByKey: ReadonlyMap<string, number> = new Map(),
	imputedConfidenceByKey: ReadonlyMap<string, number> = new Map(),
): ComponentScoreResult {
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
	const intelligence = qualityScore(
		intelligenceBenchmarkInputs,
		scoringConfig.confidence.intelligence,
	);
	const agentic = qualityScore(
		agenticBenchmarkInputs,
		scoringConfig.confidence.agentic,
	);
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
	return {
		componentScores:
			intelligence.score == null && agentic.score == null && speedScore == null
				? null
				: {
						intelligence_score: intelligence.score,
						agentic_score: agentic.score,
						speed_score: speedScore,
					},
		confidence: {
			intelligence: intelligence.confidence,
			agentic: agentic.confidence,
		},
	};
}
