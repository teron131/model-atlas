/** Workflow-shaped runtime and value simulation for Model Atlas scoring. */

import {
	type WeightedScorePart,
	weightedMeanOfFinite,
} from "../../../math-utils";
import { asFiniteNumber } from "../../shared";
import type {
	LlmStatsModelCandidate,
	LlmStatsSpeed,
	ScoringConfig,
	SimulationProfile,
	SimulationTokenRange,
} from "../types";

const DEFAULT_INPUT_TOKEN_SECONDS = 0.0001;

function positiveNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number > 0 ? number : null;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
	const clamped = clamp01(value);
	return clamped * clamped * (3 - 2 * clamped);
}

function expectedLogUniformTokens(range: SimulationTokenRange): number {
	if (range.lower <= 0 || range.upper <= 0 || range.lower === range.upper) {
		return (range.lower + range.upper) / 2;
	}
	return (
		(range.upper - range.lower) /
		(Math.log(range.upper) - Math.log(range.lower))
	);
}

function validSimulationProfile(profile: SimulationProfile): boolean {
	return (
		profile.weight > 0 &&
		profile.calls > 0 &&
		profile.input_tokens_per_call.upper > profile.input_tokens_per_call.lower &&
		profile.output_tokens_per_call.upper > profile.output_tokens_per_call.lower
	);
}

function expectedCacheHitRate(profile: SimulationProfile): number {
	return clamp01(
		(profile.cache_hit_rate_after_first_call.lower +
			profile.cache_hit_rate_after_first_call.upper) /
			2,
	);
}

function profileSeconds(
	profile: SimulationProfile,
	latencySeconds: number,
	throughputTokensPerSecond: number,
	inputTokenSeconds: number,
): number {
	const inputTokens = expectedLogUniformTokens(profile.input_tokens_per_call);
	const outputTokens = expectedLogUniformTokens(profile.output_tokens_per_call);
	return (
		profile.calls *
		(latencySeconds +
			inputTokens * inputTokenSeconds +
			outputTokens / throughputTokensPerSecond)
	);
}

function profileCost(
	model: LlmStatsModelCandidate,
	profile: SimulationProfile,
	useCache: boolean,
): number | null {
	const inputPrice = asFiniteNumber(model.cost?.input);
	const outputPrice = asFiniteNumber(model.cost?.output);
	if (inputPrice == null || outputPrice == null) {
		return null;
	}
	const inputTokens = expectedLogUniformTokens(profile.input_tokens_per_call);
	const outputTokens = expectedLogUniformTokens(profile.output_tokens_per_call);
	if (!useCache || profile.calls <= 1) {
		return (
			(profile.calls *
				(inputTokens * inputPrice + outputTokens * outputPrice)) /
			1_000_000
		);
	}
	const cacheReadPrice = asFiniteNumber(model.cost?.cache_read) ?? inputPrice;
	const cachedInputFraction =
		clamp01(profile.cacheable_input_share) * expectedCacheHitRate(profile);
	const laterInputPrice =
		cachedInputFraction * cacheReadPrice +
		(1 - cachedInputFraction) * inputPrice;
	const firstCallInputCost = inputTokens * inputPrice;
	const laterCallInputCost =
		(profile.calls - 1) * inputTokens * laterInputPrice;
	const outputCost = profile.calls * outputTokens * outputPrice;
	return (firstCallInputCost + laterCallInputCost + outputCost) / 1_000_000;
}

function profileQualityMultiplier(
	model: LlmStatsModelCandidate,
	profile: SimulationProfile,
): number | null {
	const intelligenceScore = asFiniteNumber(model.scores?.intelligence_score);
	const agenticScore = asFiniteNumber(model.scores?.agentic_score);
	const qualityScore = weightedMeanOfFinite([
		{ value: intelligenceScore, weight: profile.quality_blend.intelligence },
		{ value: agenticScore, weight: profile.quality_blend.agentic },
	]);
	return qualityScore == null
		? null
		: smoothstep(qualityScore / profile.quality_full_credit_at);
}

function weightedProfileMean(
	profiles: Iterable<SimulationProfile>,
	valueForProfile: (profile: SimulationProfile) => number | null,
): number | null {
	const parts: WeightedScorePart[] = [];
	for (const profile of profiles) {
		if (!validSimulationProfile(profile)) {
			continue;
		}
		parts.push({
			value: valueForProfile(profile),
			weight: profile.weight,
		});
	}
	return weightedMeanOfFinite(parts);
}

/** Estimate expected workflow seconds from latency, input friction, and decode throughput. */
export function simulatedBlendSeconds(
	speed: LlmStatsSpeed,
	scoringConfig: ScoringConfig,
): number | null {
	const throughputTokensPerSecond = positiveNumber(
		speed.throughput_tokens_per_second_median,
	);
	const latencySeconds = asFiniteNumber(speed.latency_seconds_median);
	if (
		throughputTokensPerSecond == null ||
		latencySeconds == null ||
		latencySeconds < 0
	) {
		return null;
	}
	const inputTokenSeconds =
		asFiniteNumber(scoringConfig.simulationInputTokenSeconds) ??
		DEFAULT_INPUT_TOKEN_SECONDS;
	return weightedProfileMean(
		Object.values(scoringConfig.simulationProfiles),
		(profile) =>
			profileSeconds(
				profile,
				latencySeconds,
				throughputTokensPerSecond,
				Math.max(0, inputTokenSeconds),
			),
	);
}

/** Estimate quality-gated useful workflow per dollar, including cache reads for repeated calls. */
export function workflowSimulatedValueSignal(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return weightedProfileMean(
		Object.values(scoringConfig.simulationProfiles),
		(profile) => {
			const cost = profileCost(model, profile, true);
			const multiplier = profileQualityMultiplier(model, profile);
			return cost == null || cost <= 0 || multiplier == null
				? null
				: multiplier / cost;
		},
	);
}
