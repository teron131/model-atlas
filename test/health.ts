import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { buildSourceHealth } from "../src/model-atlas/database/health";
import {
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
} from "../src/model-atlas/database/types";
import { benchmarkRowsFromDb } from "../src/model-atlas/stats/benchmarks";
import { buildBenchmarkUpdateHealth } from "../src/model-atlas/stats/health";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

const sparseHealth = buildBenchmarkUpdateHealth(
	[
		model("frontier/a", "Frontier A", 100, 0.98),
		model("frontier/b", "Frontier B", 95, 0.92),
		model("older/c", "Older C", 40, 0.91),
		model("older/d", "Older D", 35, 0.9),
		model("frontier/e", "Frontier E", 90, null),
		model("frontier/f", "Frontier F", 89, null),
		model("frontier/g", "Frontier G", 88, null),
		model("frontier/h", "Frontier H", 87, null),
		model("frontier/i", "Frontier I", 86, null),
		model("frontier/j", "Frontier J", 85, null),
		model("frontier/k", "Frontier K", 84, null),
		model("frontier/l", "Frontier L", 83, null),
	],
	{
		...STAGE_CONFIG.scoring,
		intelligenceBenchmarkKeys: ["sparse_benchmark"],
		agenticBenchmarkKeys: [],
	},
);

assert.deepEqual(sparseHealth.sparse_benchmark, {
	status: "current",
	observed_count: 4,
	checked_top_count: 4,
	reference_top_count: 10,
	overlap_count: 2,
	overlap_model_ids: ["frontier/a", "frontier/b"],
	top_model_ids: ["frontier/a", "frontier/b", "older/c", "older/d"],
	checked_model_ids: ["frontier/a", "frontier/b", "older/c", "older/d"],
	top_model_labels: ["Frontier A", "Frontier B", "Older C", "Older D"],
	unrepresented_top_model_labels: [],
	top_model_reference_rank: 1,
	reference_metric: "relative_overall_score",
});

const staleSparseHealth = buildBenchmarkUpdateHealth(
	[
		model("frontier/a", "Frontier A", 100, null),
		model("frontier/b", "Frontier B", 95, null),
		model("frontier/c", "Frontier C", 90, null),
		model("frontier/d", "Frontier D", 89, null),
		model("frontier/e", "Frontier E", 88, null),
		model("frontier/f", "Frontier F", 87, null),
		model("frontier/g", "Frontier G", 86, null),
		model("frontier/h", "Frontier H", 85, null),
		model("frontier/i", "Frontier I", 84, null),
		model("frontier/j", "Frontier J", 83, null),
		model("older/d", "Older D", 20, 0.8),
		model("older/e", "Older E", 19, 0.7),
		model("older/f", "Older F", 18, 0.6),
		model("older/g", "Older G", 17, 0.5),
	],
	{
		...STAGE_CONFIG.scoring,
		intelligenceBenchmarkKeys: ["sparse_benchmark"],
		agenticBenchmarkKeys: [],
	},
);

assert.equal(
	staleSparseHealth.sparse_benchmark?.status,
	"stale_possible",
	"Sparse benchmarks should warn when their top rows miss the current top models entirely",
);

const officialRowHealth = buildBenchmarkUpdateHealth(
	[
		model("openai/gpt-5.5", "GPT-5.5", 100, 0.74),
		model("anthropic/claude-fable-5", "Claude Fable 5", 99, 0.7),
		model("google/gemini-3.1-pro-preview", "Gemini 3.1 Pro", 98.5, null),
		model("frontier/c", "Frontier C", 98, null),
		model("frontier/d", "Frontier D", 97, null),
		model("frontier/e", "Frontier E", 96, null),
		model("frontier/f", "Frontier F", 95, null),
		model("frontier/g", "Frontier G", 94, null),
		model("frontier/h", "Frontier H", 93, null),
		model("frontier/i", "Frontier I", 92, null),
		model("frontier/j", "Frontier J", 91, null),
	],
	{
		...STAGE_CONFIG.scoring,
		intelligenceBenchmarkKeys: ["sparse_benchmark"],
		agenticBenchmarkKeys: [],
	},
	{
		sparse_benchmark: [
			{
				id: "openai/gpt-5-2-codex",
				label: "GPT-5.2 Codex (xhigh)",
				provider: null,
				value: 0.76,
			},
			{
				id: null,
				label: "Claude Mythos Preview",
				provider: "anthropic",
				value: 0.755,
			},
			{
				id: "openai/gpt-5-5-pro",
				label: "GPT-5.5 Pro",
				provider: null,
				value: 0.75,
			},
			{
				id: "openai/gpt-5-5",
				label: "GPT-5.5 (xhigh)",
				provider: null,
				value: 0.74,
			},
			{
				id: "anthropic/claude-fable-5",
				label: "Claude Fable 5",
				provider: null,
				value: 0.7,
			},
			{
				id: null,
				label: "Gemini 3.1 Pro",
				provider: "google",
				value: 0.73,
			},
		],
	},
	STAGE_CONFIG.matcher,
);

assert.deepEqual(
	officialRowHealth.sparse_benchmark?.top_model_labels,
	[
		"GPT-5.2 Codex (xhigh)",
		"Claude Mythos Preview",
		"GPT-5.5 Pro",
		"GPT-5.5 (xhigh)",
		"Gemini 3.1 Pro",
	],
	"Health should preserve official leaderboard labels instead of reporting only normalized Atlas ids",
);
assert.deepEqual(
	officialRowHealth.sparse_benchmark?.top_model_ids,
	[
		"openai/gpt-5-2-codex",
		"anthropic/claude-mythos-preview",
		"openai/gpt-5-5-pro",
		"openai/gpt-5-5",
		"google/gemini-3-1-pro",
	],
	"Health should report official source ids in top_model_ids",
);
assert.deepEqual(
	officialRowHealth.sparse_benchmark?.checked_model_ids,
	["openai/gpt-5.5", "google/gemini-3.1-pro-preview"],
	"Health should check represented official rows against Atlas ids",
);
assert.deepEqual(
	officialRowHealth.sparse_benchmark?.unrepresented_top_model_labels,
	["GPT-5.2 Codex (xhigh)", "Claude Mythos Preview", "GPT-5.5 Pro"],
);
assert.equal(
	officialRowHealth.sparse_benchmark?.status,
	"current",
	"Known-unrepresented official leaders should not make a benchmark look stale when represented rows still overlap current best models",
);

const dbBenchmarkRows = benchmarkRowsFromDb({
	artificialAnalysisRows: [
		{
			model_id: "openai/gpt-5",
			name: "GPT-5",
			gpqa: 0.94,
			deep_swe: 0.2,
			not_a_benchmark: 1,
		},
	],
	agentsLastExamRows: [
		{
			row_kind: "raw",
			model: "Raw Harness Row",
			median_score: 1,
		},
		{
			row_kind: "model_score",
			model: "Agent Score Row",
			median_score: 0.81,
		},
	],
	blueprintBenchRows: [],
	browseCompRows: [
		{
			model: "Browse Row",
			provider: "example",
			score: 0.72,
		},
	],
	cursorBenchRows: [],
	deepSWERows: [],
	gdpPdfRows: [],
	riemannBenchRows: [],
	terminalBenchRows: [],
	toolathlonRows: [],
});

assert.deepEqual(dbBenchmarkRows.gpqa, [
	{
		id: "openai/gpt-5",
		label: "GPT-5",
		provider: null,
		value: 0.94,
	},
]);
assert.deepEqual(dbBenchmarkRows.agents_last_exam, [
	{
		id: null,
		label: "Agent Score Row",
		provider: null,
		value: 0.81,
	},
]);
assert.deepEqual(dbBenchmarkRows.browsecomp, [
	{
		id: null,
		label: "Browse Row",
		provider: "example",
		value: 0.72,
	},
]);
assert.equal(dbBenchmarkRows.deep_swe, undefined);

const sourceHealth = buildSourceHealth({
	generatedAtEpochSeconds: 1_800_000_000,
	sourceCache: sourceCache({
		gdp_pdf: {
			last_fetch_epoch_seconds: 1_799_000_000,
			source_input_count: 12,
			cache_hit: false,
			refreshed: false,
		},
	}),
	sourceRowStates: [
		{
			source: "gdp_pdf",
			row_key: "surge|example-current",
			row_label: "Example Current",
			status: "active",
			missing_from_source_since_epoch_seconds: null,
		},
		{
			source: "gdp_pdf",
			row_key: "surge|example-missing",
			row_label: "Example Missing",
			status: "quarantined_missing_from_source",
			missing_from_source_since_epoch_seconds: 1_799_500_000,
		},
	],
});

assert.deepEqual(sourceHealth.sources.gdp_pdf, {
	source: "gdp_pdf",
	status: "using_cached_rows",
	last_fetch_epoch_seconds: 1_799_000_000,
	source_input_count: 12,
	cache_hit: false,
	refreshed: false,
	using_cached_rows: true,
	active_row_count: 1,
	quarantined_row_count: 1,
});

function model(
	id: string,
	name: string,
	overallScore: number,
	benchmarkScore: number | null,
) {
	return {
		...minimalLlmStatsModel({ id, name }),
		relative_scores: {
			intelligence_score: overallScore,
			agentic_score: overallScore,
			speed_score: null,
			value_score: null,
			overall_score: overallScore,
		},
		evaluations:
			benchmarkScore == null
				? null
				: {
						sparse_benchmark: benchmarkScore,
					},
	};
}

function sourceCache(
	overrides: Partial<Record<RawSourceName, Partial<RawSourceCacheStatus>>>,
): Record<RawSourceName, RawSourceCacheStatus> {
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source) => [
			source,
			{
				last_fetch_epoch_seconds: null,
				source_input_count: 0,
				cache_hit: false,
				refreshed: false,
				...overrides[source],
			},
		]),
	) as Record<RawSourceName, RawSourceCacheStatus>;
}
