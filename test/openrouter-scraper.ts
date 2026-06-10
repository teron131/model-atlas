import {
	buildOpenRouterSlugCandidates,
	parseOpenRouterWeeklyTokens,
	processOpenRouterModelStats,
	selectOpenRouterRawModelStats,
} from "../src/model-atlas/llm/sources/openrouter-scraper";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const model = processOpenRouterModelStats(
	"openai/example",
	{
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
	},
	{
		data: {
			weightedInputPrice: 1.2,
			weightedOutputPrice: 3.4,
		},
	},
);

assertDeepEqual(model, {
	id: "openai/example",
	performance: {
		throughput_tokens_per_second_median: 42,
		latency_seconds_median: 0.9,
		e2e_latency_seconds_median: 1.5,
	},
	pricing: {
		weighted_input_price_per_1m: 1.2,
		weighted_output_price_per_1m: 3.4,
	},
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
