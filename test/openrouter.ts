import {
	buildOpenRouterSeriesTokenWeights,
	buildOpenRouterSlugCandidates,
	parseOpenRouterWeeklyTokens,
	processOpenRouterModelStats,
	selectOpenRouterRawModelStats,
	summarizeOpenRouterPerformanceEstimates,
} from "../src/model-atlas/scrapers/openrouter";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const performanceStats = {
	summary: {
		throughput_tokens_per_second_median: 42,
		latency_seconds_median: 0.9,
		e2e_latency_seconds_median: null,
	},
	throughput: {
		data: [
			{ x: "2026-01-01", y: { p50: 100, p90: 300 } },
			{ x: "2026-01-02", y: { p50: 500, p90: 700 } },
		],
	},
	latency: {
		data: [
			{ x: "2026-01-01", y: { p50: 1000 } },
			{ x: "2026-01-02", y: { p50: 3000 } },
		],
	},
	latency_e2e: {
		data: [{ x: "2026-01-01", y: { p50: 1500 } }],
	},
	series_token_weights: {
		p50: 9,
		p90: 1,
	},
};

const model = processOpenRouterModelStats("openai/example", performanceStats, {
	data: {
		weightedInputPrice: 1.2,
		weightedOutputPrice: 3.4,
	},
});

assertDeepEqual(summarizeOpenRouterPerformanceEstimates(performanceStats), [
	{
		metric: "throughput",
		estimate_kind: "openrouter_aggregate",
		value: 42,
	},
	{ metric: "throughput", estimate_kind: "series_median", value: 400 },
	{ metric: "throughput", estimate_kind: "token_weighted_mean", value: 320 },
	{ metric: "latency", estimate_kind: "openrouter_aggregate", value: 0.9 },
	{ metric: "latency", estimate_kind: "series_median", value: 2 },
	{ metric: "latency", estimate_kind: "token_weighted_mean", value: 2 },
	{
		metric: "latency_e2e",
		estimate_kind: "openrouter_aggregate",
		value: null,
	},
	{ metric: "latency_e2e", estimate_kind: "series_median", value: 1.5 },
	{
		metric: "latency_e2e",
		estimate_kind: "token_weighted_mean",
		value: 1.5,
	},
	{ metric: "throughput", estimate_kind: "final", value: 320 },
	{ metric: "latency", estimate_kind: "final", value: 2 },
	{ metric: "latency_e2e", estimate_kind: "final", value: 1.5 },
]);

assertDeepEqual(
	buildOpenRouterSeriesTokenWeights(
		{
			data: [
				{
					id: "endpoint-a-fast",
					provider_display_name: "Provider A",
					stats: { request_count: 3 },
				},
				{
					id: "endpoint-a-slow",
					provider_display_name: "Provider A",
					stats: { request_count: 1 },
				},
				{
					id: "endpoint-b",
					provider_info: { displayName: "Provider B" },
					stats: { request_count: null },
				},
			],
		},
		{
			data: {
				providerSummaries: [
					{ providerName: "Provider A", totalTokens: 80 },
					{ providerName: "Provider B", totalTokens: 20 },
				],
			},
		},
	),
	{
		"endpoint-a-fast::default": 60,
		"endpoint-a-slow::default": 20,
		"endpoint-b::default": 20,
	},
);

assertDeepEqual(model, {
	id: "openai/example",
	performance: {
		throughput_tokens_per_second_median: 320,
		latency_seconds_median: 2,
		e2e_latency_seconds_median: 1.5,
	},
	pricing: {
		weighted_input_price_per_1m: 1.2,
		weighted_output_price_per_1m: 3.4,
	},
});

const summaryOnlyModel = processOpenRouterModelStats(
	"openai/summary-only-example",
	{
		summary: {
			throughput_tokens_per_second_median: 42,
			latency_seconds_median: 0.9,
			e2e_latency_seconds_median: null,
		},
	},
	null,
);

assertDeepEqual(summaryOnlyModel.performance, {
	throughput_tokens_per_second_median: 42,
	latency_seconds_median: 0.9,
	e2e_latency_seconds_median: null,
});

const sparseModel = processOpenRouterModelStats(
	"openai/sparse-example",
	{
		throughput: {
			data: [
				{ x: "2026-01-01", y: { providerA: null, providerB: 100 } },
				{ x: "2026-01-02", y: { providerA: 200 } },
			],
		},
		latency: {
			data: [
				{ x: "2026-01-01", y: { providerA: null, providerB: 1000 } },
				{ x: "2026-01-02", y: { providerA: 3000 } },
			],
		},
		latency_e2e: {
			data: [{ x: "2026-01-01", y: { providerA: null, providerB: 1500 } }],
		},
	},
	null,
);

assertDeepEqual(sparseModel.performance, {
	throughput_tokens_per_second_median: 150,
	latency_seconds_median: 2,
	e2e_latency_seconds_median: 1.5,
});

assertDeepEqual(
	parseOpenRouterWeeklyTokens(
		String.raw`weeklyTokensPromise\":\"$@44\" somewhere 44:\"3550178782\"`,
	),
	3_550_178_782,
);

assertDeepEqual(
	buildOpenRouterSlugCandidates("provider/model-pro", [
		"provider/model-pro",
		"provider/model-pro-20260602",
		"provider/model-pro-preview-06-2026",
		"provider/model-max",
		"provider/model-legacy-pro-04-02",
		"provider/model-coder-pro",
	]),
	[
		"provider/model-pro",
		"provider/model-pro-20260602",
		"provider/model-pro-preview-06-2026",
	],
);

const selected = selectOpenRouterRawModelStats("provider/model", [
	{
		permaslug: "provider/model-low-volume",
		weekly_tokens: 10_000,
		performance: {
			throughput: { data: [{ x: "2026-01-01", y: { p50: 25 } }] },
		},
		pricing: {
			data: {
				weightedInputPrice: 1,
				weightedOutputPrice: 2,
			},
		},
	},
	{
		permaslug: "provider/model-high-volume-free-price",
		weekly_tokens: 1_000_000,
		performance: {
			throughput: { data: [{ x: "2026-01-01", y: { p50: 100 } }] },
		},
		pricing: {
			data: {
				weightedInputPrice: 0,
				weightedOutputPrice: 0,
			},
		},
	},
]);

assertDeepEqual(selected, {
	id: "provider/model",
	selected_permaslug: "provider/model-high-volume-free-price",
	candidate_permaslugs: [
		"provider/model-low-volume",
		"provider/model-high-volume-free-price",
	],
	performance: {
		throughput: { data: [{ x: "2026-01-01", y: { p50: 100 } }] },
	},
	pricing: {
		data: {
			weightedInputPrice: 1,
			weightedOutputPrice: 2,
		},
	},
});
