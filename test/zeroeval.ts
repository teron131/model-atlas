/** Verifies shared ZeroEval normalization without duplicating per-benchmark fixtures. */

import assert from "node:assert/strict";
import { processZeroEvalDetailsJson } from "../src/model-atlas/benchmarks/scrapers/zeroeval";

const rows = processZeroEvalDetailsJson(
	{
		models: [
			{
				rank: 1,
				model_name: "Normalized Model",
				organization_id: "example",
				organization_name: "Example",
				score: 0.6,
				normalized_score: 0.625,
				self_reported_source: "https://example.test/model",
				analysis_method: "Three-trial average.",
				verified: false,
				self_reported: true,
				announcement_date: "2026-05-28",
			},
			{
				rank: 2,
				model_name: "Raw Fallback",
				organization_id: "example",
				score: 0.5,
				normalized_score: null,
			},
			{
				rank: 3,
				model_name: "Normalized Fallback",
				organization_id: "example",
				score: null,
				normalized_score: 0.4,
			},
			{
				model_name: "Invalid Score",
				organization_id: "example",
				normalized_score: 1.2,
			},
		],
	},
	{
		benchmarkKey: "example_benchmark",
		sourceUrl: "https://api.zeroeval.com/example",
		rankField: "rank",
		observedAtField: "announcement_date",
	},
);

assert.deepEqual(
	rows.map((row) => ({
		model: row.model,
		reportedValue: row.reported_value,
		canonicalValue: row.canonical_value,
		rank: row.rank,
		observedAt: row.observed_at,
	})),
	[
		{
			model: "Normalized Model",
			reportedValue: 0.6,
			canonicalValue: 0.625,
			rank: 1,
			observedAt: "2026-05-28",
		},
		{
			model: "Raw Fallback",
			reportedValue: 0.5,
			canonicalValue: 0.5,
			rank: 2,
			observedAt: null,
		},
		{
			model: "Normalized Fallback",
			reportedValue: 0.4,
			canonicalValue: 0.4,
			rank: 3,
			observedAt: null,
		},
	],
);
assert.deepEqual(rows[0]?.metadata, {
	reported_source_url: "https://example.test/model",
	analysis_method: "Three-trial average.",
	verified: false,
	self_reported: true,
	announcement_date: "2026-05-28",
});
assert.equal(rows[0]?.benchmark_key, "example_benchmark");
assert.equal(rows[0]?.source_url, "https://api.zeroeval.com/example");
