/** Pure OpenRouter stat normalization, same-version permaslug resolution, and best-candidate selection policy. */

import { medianOfFinite } from "../../math-utils";
import { isSameOpenRouterModelRoute } from "../../openrouter-routes";
import { asRecord } from "../../shared";

export type OpenRouterFrontendModel = {
	slug?: string | null;
	permaslug?: string | null;
};

export type OpenRouterStatsPoint = {
	x?: string;
	y?: Record<string, number | null>;
};

export type OpenRouterStatsResponse = {
	data?: OpenRouterStatsPoint[];
};

export type OpenRouterModelStats = {
	summary?: OpenRouterPerformanceSummary | null;
	throughput?: OpenRouterStatsResponse | null;
	latency?: OpenRouterStatsResponse | null;
	latency_e2e?: OpenRouterStatsResponse | null;
};

export type OpenRouterEndpointStatsResponse = {
	data?: Array<{
		stats?: {
			p50_throughput?: number | null;
			p50_latency?: number | null;
		} | null;
	}>;
};

export type OpenRouterEffectivePricingResponse = {
	data?: {
		weightedInputPrice?: number | null;
		weightedOutputPrice?: number | null;
	};
};

export type OpenRouterPerformanceSummary = {
	throughput_tokens_per_second_median: number | null;
	latency_seconds_median: number | null;
	e2e_latency_seconds_median: number | null;
};

export type OpenRouterPricingSummary = {
	weighted_input_price_per_1m: number | null;
	weighted_output_price_per_1m: number | null;
};

export type OpenRouterScrapedModel = {
	id: string;
	performance: OpenRouterPerformanceSummary;
	pricing: OpenRouterPricingSummary;
};

export type OpenRouterScrapedPayload = {
	fetched_at_epoch_seconds: number;
	models: OpenRouterScrapedModel[];
};

export type OpenRouterRawScrapedModel = {
	id: string;
	selected_permaslug: string | null;
	candidate_permaslugs: string[];
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse | null;
};

export type OpenRouterCandidateStats = {
	permaslug: string;
	weekly_tokens: number | null;
	performance: OpenRouterModelStats;
	pricing: OpenRouterEffectivePricingResponse | null;
};

export type OpenRouterRawScrapedPayload = {
	fetched_at_epoch_seconds: number;
	directory: OpenRouterFrontendModel[];
	models: OpenRouterRawScrapedModel[];
};

export function sanitizeModelId(modelId: string): string {
	return (
		modelId
			.trim()
			.toLowerCase()
			// Normalize OpenRouter route suffixes (e.g. :free, :exacto) to base model id.
			.replace(/:[a-z0-9._-]+$/i, "")
	);
}

function asFiniteNumber(value: unknown): number | null {
	if (value == null || value === "") {
		return null;
	}
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

function average(values: number[]): number | null {
	if (values.length === 0) {
		return null;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toDailyAveragedValues(
	response: OpenRouterStatsResponse | null,
	scaleToSeconds: boolean,
): number[] {
	if (!response || !Array.isArray(response.data)) {
		return [];
	}
	return response.data
		.map((point) => {
			const y = asRecord(point.y);
			const values = Object.values(y)
				.map((value) => asFiniteNumber(value))
				.filter((value): value is number => value != null);
			const dailyAverage = average(values);
			if (dailyAverage == null) {
				return null;
			}
			return scaleToSeconds ? dailyAverage / 1000 : dailyAverage;
		})
		.filter(
			(value): value is number => value != null && Number.isFinite(value),
		);
}

/** Summarize OpenRouter historical performance series into stable medians. */
function summarizePerformance(
	stats: OpenRouterModelStats,
): OpenRouterPerformanceSummary {
	const summary = stats.summary;
	const throughputValues = toDailyAveragedValues(
		stats.throughput ?? null,
		false,
	);
	const latencyValues = toDailyAveragedValues(stats.latency ?? null, true);
	const e2eLatencyValues = toDailyAveragedValues(
		stats.latency_e2e ?? null,
		true,
	);

	return {
		throughput_tokens_per_second_median:
			summary?.throughput_tokens_per_second_median ??
			medianOfFinite(throughputValues),
		latency_seconds_median:
			summary?.latency_seconds_median ?? medianOfFinite(latencyValues),
		e2e_latency_seconds_median: medianOfFinite(e2eLatencyValues),
	};
}

/** Summarize endpoint-level OpenRouter performance into one model summary. */
export function summarizeEndpointPerformance(
	response: OpenRouterEndpointStatsResponse | null,
): OpenRouterPerformanceSummary {
	const endpointStats = Array.isArray(response?.data)
		? response.data.map((endpoint) => endpoint.stats ?? null)
		: [];
	const throughputValues = endpointStats
		.map((stats) => asFiniteNumber(stats?.p50_throughput))
		.filter((value): value is number => value != null);
	const latencyValues = endpointStats
		.map((stats) => asFiniteNumber(stats?.p50_latency))
		.filter((value): value is number => value != null);
	return {
		throughput_tokens_per_second_median:
			throughputValues.length === 0 ? null : Math.max(...throughputValues),
		latency_seconds_median:
			latencyValues.length === 0 ? null : Math.min(...latencyValues) / 1000,
		e2e_latency_seconds_median: null,
	};
}

/** Summarize OpenRouter effective pricing into per-million token prices. */
function summarizePricing(
	response: OpenRouterEffectivePricingResponse | null,
): OpenRouterPricingSummary {
	const data = asRecord(response?.data);
	return {
		weighted_input_price_per_1m: asFiniteNumber(data.weightedInputPrice),
		weighted_output_price_per_1m: asFiniteNumber(data.weightedOutputPrice),
	};
}

function hasMeaningfulRawPerformance(stats: OpenRouterModelStats): boolean {
	return hasMeaningfulPerformance(summarizePerformance(stats));
}

function hasMeaningfulRawPricing(
	pricing: OpenRouterEffectivePricingResponse | null,
): boolean {
	return hasMeaningfulPricing(summarizePricing(pricing));
}

export function emptyScrapedModel(modelId: string): OpenRouterScrapedModel {
	return {
		id: modelId,
		performance: summarizePerformance({}),
		pricing: summarizePricing(null),
	};
}

export function emptyRawScrapedModel(
	modelId: string,
	candidatePermaslugs: string[] = [],
): OpenRouterRawScrapedModel {
	return {
		id: modelId,
		selected_permaslug: null,
		candidate_permaslugs: candidatePermaslugs,
		performance: {},
		pricing: null,
	};
}

export function processOpenRouterModelStats(
	modelId: string,
	stats: OpenRouterModelStats,
	pricing: OpenRouterEffectivePricingResponse | null,
): OpenRouterScrapedModel {
	return {
		id: modelId,
		performance: summarizePerformance(stats),
		pricing: summarizePricing(pricing),
	};
}

function hasMeaningfulPerformance(
	performance: OpenRouterPerformanceSummary,
): boolean {
	return (
		performance.throughput_tokens_per_second_median != null ||
		performance.latency_seconds_median != null ||
		performance.e2e_latency_seconds_median != null
	);
}

function hasMeaningfulPricing(pricing: OpenRouterPricingSummary): boolean {
	const weightedInput = pricing.weighted_input_price_per_1m;
	const weightedOutput = pricing.weighted_output_price_per_1m;
	const hasInput = weightedInput != null && weightedInput > 0;
	const hasOutput = weightedOutput != null && weightedOutput > 0;
	return hasInput || hasOutput;
}

export function buildOpenRouterSlugCandidates(
	modelId: string,
	availableSlugs: string[],
): string[] {
	const normalized = sanitizeModelId(modelId);
	const [provider, modelName = ""] = normalized.split("/", 2);
	if (!provider || !modelName) {
		return [normalized];
	}

	const versionCandidates = availableSlugs
		.filter(
			(slug) =>
				slug !== normalized && isSameOpenRouterModelRoute(normalized, slug),
		)
		.sort((left, right) => left.localeCompare(right))
		.slice(0, 8);

	return [normalized, ...versionCandidates];
}

export function resolvePermaslugCandidates(
	modelId: string,
	availableSlugs: string[],
	permaslugBySlug: Map<string, string>,
): string[] {
	const slugCandidates = buildOpenRouterSlugCandidates(modelId, availableSlugs);
	return slugCandidates
		.map((slugCandidate) => permaslugBySlug.get(slugCandidate) ?? null)
		.filter(
			(permaslug): permaslug is string =>
				typeof permaslug === "string" && permaslug.length > 0,
		);
}

export function parseOpenRouterWeeklyTokens(html: string): number | null {
	const marker = "weeklyTokensPromise";
	const markerStart = html.indexOf(marker);
	if (markerStart < 0) {
		return null;
	}
	const markerSlice = html.slice(
		markerStart + marker.length,
		markerStart + 100,
	);
	const promiseMatch = markerSlice.match(/\$@([^\\"]+)/);
	const promiseId = promiseMatch?.[1];
	const valueStart = html.indexOf(`${promiseId}:`);
	const valueMatch =
		promiseId && valueStart >= 0
			? html.slice(valueStart + promiseId.length + 1).match(/(\d+)/)
			: null;
	return asFiniteNumber(valueMatch?.[1]);
}

function compareCandidateUsage(
	left: OpenRouterCandidateStats,
	right: OpenRouterCandidateStats,
): number {
	return (right.weekly_tokens ?? -1) - (left.weekly_tokens ?? -1);
}

function bestCandidateByUsage(
	candidates: OpenRouterCandidateStats[],
	predicate: (candidate: OpenRouterCandidateStats) => boolean,
): OpenRouterCandidateStats | null {
	let bestCandidate: OpenRouterCandidateStats | null = null;
	for (const candidate of candidates) {
		if (!predicate(candidate)) {
			continue;
		}
		if (
			bestCandidate == null ||
			compareCandidateUsage(bestCandidate, candidate) > 0
		) {
			bestCandidate = candidate;
		}
	}
	return bestCandidate;
}

export function selectOpenRouterRawModelStats(
	modelId: string,
	candidates: OpenRouterCandidateStats[],
): OpenRouterRawScrapedModel {
	const performanceCandidate =
		bestCandidateByUsage(candidates, (candidate) =>
			hasMeaningfulRawPerformance(candidate.performance),
		) ??
		bestCandidateByUsage(candidates, (candidate) =>
			hasMeaningfulRawPricing(candidate.pricing),
		) ??
		candidates[0] ??
		null;
	const pricingCandidate = performanceCandidate
		? hasMeaningfulRawPricing(performanceCandidate.pricing)
			? performanceCandidate
			: bestCandidateByUsage(candidates, (candidate) =>
					hasMeaningfulRawPricing(candidate.pricing),
				)
		: null;

	return {
		id: modelId,
		selected_permaslug: performanceCandidate?.permaslug ?? null,
		candidate_permaslugs: candidates.map((candidate) => candidate.permaslug),
		performance: performanceCandidate?.performance ?? {},
		pricing: pricingCandidate?.pricing ?? null,
	};
}
