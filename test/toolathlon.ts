/** Verifies Toolathlon rows normalized through the shared ZeroEval adapter. */

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
				rank: 1,
				model_name: "Claude Opus 4.8",
				organization_id: "anthropic",
				organization_name: "Anthropic",
				score: 0.599,
				normalized_score: 0.599,
				self_reported_source: "https://www.anthropic.com/news/claude-opus-4-8",
				analysis_method:
					"Pass@1 averaged over 3 trials across all 108 tasks. Internal harness with adaptive thinking at max effort. Pass@3: 67.6%.",
				verified: false,
				self_reported: true,
				announcement_date: "2026-05-28",
			},
			{
				rank: 2,
				model_name: "Gemini 3.5 Flash",
				organization_id: "google",
				organization_name: "Google",
				score: 0.565,
				normalized_score: null,
				self_reported_source:
					"https://deepmind.google/models/evals-methodology/gemini-3-5-flash/",
				verified: false,
				self_reported: true,
			},
			{
				model_name: "Invalid Score",
				organization_id: "example",
				normalized_score: 1.2,
			},
		],
	},
	{
		benchmarkKey: "toolathlon",
		sourceUrl:
			"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
		rankField: "rank",
		observedAtField: "announcement_date",
	},
);

assertDeepEqual(rows, [
	{
		benchmark_key: "toolathlon",
		source: "zeroeval",
		source_url:
			"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
		model_id: null,
		model: "Claude Opus 4.8",
		base_model: "Claude Opus 4.8",
		reasoning_effort: null,
		provider: "anthropic",
		rank: 1,
		score: 0.599,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: "2026-05-28",
		metadata: {
			provider_name: "Anthropic",
			reported_source_url: "https://www.anthropic.com/news/claude-opus-4-8",
			analysis_method:
				"Pass@1 averaged over 3 trials across all 108 tasks. Internal harness with adaptive thinking at max effort. Pass@3: 67.6%.",
			verified: false,
			self_reported: true,
			announcement_date: "2026-05-28",
		},
	},
	{
		benchmark_key: "toolathlon",
		source: "zeroeval",
		source_url:
			"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
		model_id: null,
		model: "Gemini 3.5 Flash",
		base_model: "Gemini 3.5 Flash",
		reasoning_effort: null,
		provider: "google",
		rank: 2,
		score: 0.565,
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {
			provider_name: "Google",
			reported_source_url:
				"https://deepmind.google/models/evals-methodology/gemini-3-5-flash/",
			analysis_method: null,
			verified: false,
			self_reported: true,
			announcement_date: null,
		},
	},
]);

const rowsByModelName = buildBenchmarkScoreMap(rows);

assertDeepEqual(
	findBenchmarkScoreRow(["missing", "Claude Opus 4.8"], null, rowsByModelName)
		?.score,
	0.599,
);
