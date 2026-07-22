/** Verifies BrowseComp rows normalized through the shared ZeroEval adapter. */

import {
	buildBenchmarkScoreMap,
	findBenchmarkScoreRow,
} from "../src/model-atlas/scrapers/benchmark-score";
import { processZeroEvalDetailsJson } from "../src/model-atlas/scrapers/zeroeval";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processZeroEvalDetailsJson(
	{
		models: [
			{
				model_name: "GPT-5.5 Pro",
				organization_id: "openai",
				organization_name: "OpenAI",
				score: 0.901,
				normalized_score: 0.901,
				self_reported_source: "https://openai.com/index/introducing-gpt-5-5/",
				analysis_method: "GPT-5.5 Pro - BrowseComp.",
				verified: false,
				self_reported: true,
			},
			{
				model_name: "Claude Opus 4.6",
				organization_id: "anthropic",
				organization_name: "Anthropic",
				score: 0.84,
				normalized_score: null,
				self_reported_source: "https://www.anthropic.com/news/claude-opus-4-6",
				analysis_method: "Official BrowseComp score.",
				verified: false,
				self_reported: true,
			},
			{
				model_name: "MiniMax M3",
				organization_id: "minimax",
				organization_name: "MiniMax",
				score: null,
				normalized_score: 0.835,
			},
		],
	},
	{
		benchmarkKey: "browsecomp",
		sourceUrl:
			"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
	},
);

assertDeepEqual(rows, [
	{
		benchmark_key: "browsecomp",
		source: "zeroeval",
		source_url:
			"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
		model_id: null,
		model: "GPT-5.5 Pro",
		base_model: "GPT-5.5 Pro",
		reasoning_effort: null,
		provider: "openai",
		rank: null,
		score: 0.901,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {
			provider_name: "OpenAI",
			reported_source_url: "https://openai.com/index/introducing-gpt-5-5/",
			analysis_method: "GPT-5.5 Pro - BrowseComp.",
			verified: false,
			self_reported: true,
		},
	},
	{
		benchmark_key: "browsecomp",
		source: "zeroeval",
		source_url:
			"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
		model_id: null,
		model: "Claude Opus 4.6",
		base_model: "Claude Opus 4.6",
		reasoning_effort: null,
		provider: "anthropic",
		rank: null,
		score: 0.84,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {
			provider_name: "Anthropic",
			reported_source_url: "https://www.anthropic.com/news/claude-opus-4-6",
			analysis_method: "Official BrowseComp score.",
			verified: false,
			self_reported: true,
		},
	},
	{
		benchmark_key: "browsecomp",
		source: "zeroeval",
		source_url:
			"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
		model_id: null,
		model: "MiniMax M3",
		base_model: "MiniMax M3",
		reasoning_effort: null,
		provider: "minimax",
		rank: null,
		score: 0.835,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {
			provider_name: "MiniMax",
			reported_source_url: null,
			analysis_method: null,
			verified: null,
			self_reported: null,
		},
	},
]);

const rowsByModelName = buildBenchmarkScoreMap(rows);

assertDeepEqual(
	findBenchmarkScoreRow(["missing", "GPT 5.5 Pro"], null, rowsByModelName)
		?.score,
	0.901,
);
