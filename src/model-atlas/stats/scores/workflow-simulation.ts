/** Workflow-shaped runtime and value simulation for Model Atlas scoring. */

import {
	clamp01,
	expectedLogUniformValue,
	log10OnePlusPositive,
	positiveFiniteNumber,
	smoothstep,
	type WeightedScorePart,
	weightedMeanOfFinite,
} from "../../math-utils";
import { asFiniteNumber } from "../../shared";
import type {
	LlmStatsModelCandidate,
	LlmStatsSpeed,
	ScoringConfig,
	SimulationProfile,
} from "../types";

const DEFAULT_INPUT_TOKEN_SECONDS = 0.0001;

function isValidSimulationProfile(profile: SimulationProfile): boolean {
	return (
		profile.weight > 0 &&
		profile.calls > 0 &&
		profile.input_tokens_per_call.upper > profile.input_tokens_per_call.lower &&
		profile.output_tokens_per_call.upper > profile.output_tokens_per_call.lower
	);
}

/** Averages the configured cache hit-rate range onto the 0-1 scale. */
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
	const inputTokens = expectedLogUniformValue(
		profile.input_tokens_per_call.lower,
		profile.input_tokens_per_call.upper,
	);
	const outputTokens = expectedLogUniformValue(
		profile.output_tokens_per_call.lower,
		profile.output_tokens_per_call.upper,
	);
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
	const inputTokens = expectedLogUniformValue(
		profile.input_tokens_per_call.lower,
		profile.input_tokens_per_call.upper,
	);
	const outputTokens = expectedLogUniformValue(
		profile.output_tokens_per_call.lower,
		profile.output_tokens_per_call.upper,
	);
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
	const intelligenceScore = asFiniteNumber(
		model.component_scores?.intelligence_score,
	);
	const agenticScore = asFiniteNumber(model.component_scores?.agentic_score);
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
		if (!isValidSimulationProfile(profile)) {
			continue;
		}
		parts.push({
			value: valueForProfile(profile),
			weight: profile.weight,
		});
	}
	return weightedMeanOfFinite(parts);
}

export function simulatedBlendSeconds(
	speed: LlmStatsSpeed,
	scoringConfig: ScoringConfig,
): number | null {
	const throughputTokensPerSecond = positiveFiniteNumber(
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

export function workflowPriceEfficiencySignal(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return weightedProfileMean(
		Object.values(scoringConfig.simulationProfiles),
		(profile) => {
			const cost = profileCost(model, profile, true);
			const logCost = log10OnePlusPositive(cost);
			const multiplier = profileQualityMultiplier(model, profile);
			return logCost == null || multiplier == null
				? null
				: multiplier / logCost;
		},
	);
}
