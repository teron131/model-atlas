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
	series_token_weights?: Record<string, number | null> | null;
};

export type OpenRouterEndpointStatsResponse = {
	data?: Array<{
		id?: string | null;
		provider_display_name?: string | null;
		provider_name?: string | null;
		provider_info?: {
			displayName?: string | null;
		} | null;
		stats?: {
			p50_throughput?: number | null;
			p50_latency?: number | null;
			request_count?: number | null;
		} | null;
	}>;
};

export type OpenRouterEffectivePricingResponse = {
	data?: {
		weightedInputPrice?: number | null;
		weightedOutputPrice?: number | null;
		providerSummaries?: Array<{
			providerName?: string | null;
			totalTokens?: number | null;
		}>;
	};
};

export type OpenRouterPerformanceSummary = {
	throughput_tokens_per_second_median: number | null;
	latency_seconds_median: number | null;
	e2e_latency_seconds_median: number | null;
};

export type OpenRouterPerformanceMetric =
	| "throughput"
	| "latency"
	| "latency_e2e";

export type OpenRouterPerformanceEstimateKind =
	| "openrouter_aggregate"
	| "series_median"
	| "token_weighted_mean"
	| "final";

export type OpenRouterPerformanceEstimate = {
	metric: OpenRouterPerformanceMetric;
	estimate_kind: OpenRouterPerformanceEstimateKind;
	value: number | null;
};

type PerformanceEstimateSource = {
	metric: OpenRouterPerformanceMetric;
	summaryValue: number | null;
	series: OpenRouterStatsResponse | null;
	scaleToSeconds: boolean;
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

const OPENROUTER_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
	xai: "x-ai",
};

export function sanitizeModelId(modelId: string): string {
	const normalized = modelId
		.trim()
		.toLowerCase()
		// Normalize OpenRouter route suffixes (e.g. :free, :exacto) to base model id.
		.replace(/:[a-z0-9._-]+$/i, "");
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0) {
		return normalized;
	}
	const provider = normalized.slice(0, slashIndex);
	return `${OPENROUTER_PROVIDER_ALIASES[provider] ?? provider}${normalized.slice(slashIndex)}`;
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

function dailyAveragedValues(
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

function tokenWeightedMeanValue(
	response: OpenRouterStatsResponse | null,
	seriesTokenWeights: Record<string, number | null> | null | undefined,
	scaleToSeconds: boolean,
): number | null {
	if (
		!response ||
		!Array.isArray(response.data) ||
		seriesTokenWeights == null
	) {
		return null;
	}
	let weightedSum = 0;
	let totalWeight = 0;
	for (const point of response.data) {
		const y = asRecord(point.y);
		for (const [series, value] of Object.entries(y)) {
			const numericValue = asFiniteNumber(value);
			const weight = asFiniteNumber(seriesTokenWeights[series]);
			if (numericValue == null || weight == null || weight <= 0) {
				continue;
			}
			weightedSum +=
				(scaleToSeconds ? numericValue / 1000 : numericValue) * weight;
			totalWeight += weight;
		}
	}
	return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function performanceEstimateSources(
	stats: OpenRouterModelStats,
): PerformanceEstimateSource[] {
	return [
		{
			metric: "throughput",
			summaryValue: stats.summary?.throughput_tokens_per_second_median ?? null,
			series: stats.throughput ?? null,
			scaleToSeconds: false,
		},
		{
			metric: "latency",
			summaryValue: stats.summary?.latency_seconds_median ?? null,
			series: stats.latency ?? null,
			scaleToSeconds: true,
		},
		{
			metric: "latency_e2e",
			summaryValue: stats.summary?.e2e_latency_seconds_median ?? null,
			series: stats.latency_e2e ?? null,
			scaleToSeconds: true,
		},
	];
}

function performanceEstimatesForSource(
	source: PerformanceEstimateSource,
	seriesTokenWeights: Record<string, number | null> | null | undefined,
): OpenRouterPerformanceEstimate[] {
	const estimates: OpenRouterPerformanceEstimate[] = [
		{
			metric: source.metric,
			estimate_kind: "openrouter_aggregate",
			value: source.summaryValue,
		},
		{
			metric: source.metric,
			estimate_kind: "series_median",
			value: medianOfFinite(
				dailyAveragedValues(source.series, source.scaleToSeconds),
			),
		},
		{
			metric: source.metric,
			estimate_kind: "token_weighted_mean",
			value: tokenWeightedMeanValue(
				source.series,
				seriesTokenWeights,
				source.scaleToSeconds,
			),
		},
	];
	return [
		...estimates,
		{
			metric: source.metric,
			estimate_kind: "final",
			value: medianOfFinite(estimates.map((estimate) => estimate.value)),
		},
	];
}

export function summarizeOpenRouterPerformanceEstimates(
	stats: OpenRouterModelStats,
): OpenRouterPerformanceEstimate[] {
	const estimatesByMetric = performanceEstimateSources(stats).map((source) =>
		performanceEstimatesForSource(source, stats.series_token_weights),
	);
	return [
		...estimatesByMetric.flatMap((estimates) => estimates.slice(0, -1)),
		...estimatesByMetric.flatMap((estimates) => estimates.slice(-1)),
	];
}

/** Summarize OpenRouter historical performance series into stable medians. */
function summarizePerformance(
	stats: OpenRouterModelStats,
): OpenRouterPerformanceSummary {
	const estimates = summarizeOpenRouterPerformanceEstimates(stats);
	const finalValue = (metric: OpenRouterPerformanceMetric) =>
		estimates.find(
			(estimate) =>
				estimate.metric === metric && estimate.estimate_kind === "final",
		)?.value ?? null;
	return {
		throughput_tokens_per_second_median: finalValue("throughput"),
		latency_seconds_median: finalValue("latency"),
		e2e_latency_seconds_median: finalValue("latency_e2e"),
	};
}

function endpointProviderName(
	endpoint: NonNullable<OpenRouterEndpointStatsResponse["data"]>[number],
): string | null {
	return (
		endpoint.provider_display_name ??
		endpoint.provider_info?.displayName ??
		endpoint.provider_name ??
		null
	);
}

function endpointSeriesKey(endpointId: string): string {
	return `${endpointId}::default`;
}

export function buildOpenRouterSeriesTokenWeights(
	endpointResponse: OpenRouterEndpointStatsResponse | null,
	pricingResponse: OpenRouterEffectivePricingResponse | null,
): Record<string, number> {
	const endpoints = Array.isArray(endpointResponse?.data)
		? endpointResponse.data
		: [];
	const providerSummaries = pricingResponse?.data?.providerSummaries ?? [];
	const totalTokensByProviderName = new Map(
		providerSummaries.flatMap((provider) => {
			const name = provider.providerName;
			const totalTokens = asFiniteNumber(provider.totalTokens);
			return name != null && totalTokens != null && totalTokens > 0
				? [[name, totalTokens] as const]
				: [];
		}),
	);
	const endpointsByProviderName = new Map<
		string,
		Array<{
			id: string;
			requestCount: number | null;
		}>
	>();
	for (const endpoint of endpoints) {
		const id = endpoint.id;
		const providerName = endpointProviderName(endpoint);
		if (id == null || providerName == null) {
			continue;
		}
		const providerEndpoints = endpointsByProviderName.get(providerName) ?? [];
		providerEndpoints.push({
			id,
			requestCount: asFiniteNumber(endpoint.stats?.request_count),
		});
		endpointsByProviderName.set(providerName, providerEndpoints);
	}
	const weights: Record<string, number> = {};
	for (const [providerName, providerEndpoints] of endpointsByProviderName) {
		const totalTokens = totalTokensByProviderName.get(providerName);
		if (totalTokens == null) {
			continue;
		}
		const requestCountSum = providerEndpoints.reduce(
			(sum, endpoint) => sum + (endpoint.requestCount ?? 0),
			0,
		);
		if (requestCountSum > 0) {
			for (const endpoint of providerEndpoints) {
				if (endpoint.requestCount == null || endpoint.requestCount <= 0) {
					continue;
				}
				weights[endpointSeriesKey(endpoint.id)] =
					(totalTokens * endpoint.requestCount) / requestCountSum;
			}
			continue;
		}
		const tokenShare = totalTokens / providerEndpoints.length;
		for (const endpoint of providerEndpoints) {
			weights[endpointSeriesKey(endpoint.id)] = tokenShare;
		}
	}
	return weights;
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
	const pricing = asRecord(response?.data);
	return {
		weighted_input_price_per_1m: asFiniteNumber(pricing.weightedInputPrice),
		weighted_output_price_per_1m: asFiniteNumber(pricing.weightedOutputPrice),
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
