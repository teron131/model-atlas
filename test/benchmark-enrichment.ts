/** Verify shared benchmark enrichment maps source rows into evaluations and scoring sources. */

import assert from "node:assert/strict";
import type { ArtificialAnalysisEvaluationResourceRow } from "../src/model-atlas/scrapers/artificial-analysis/evaluation-resources";
import {
	type BenchmarkEnrichmentLookups,
	benchmarkEnrichment,
} from "../src/model-atlas/stats/benchmarks";
import { buildTaskMetrics } from "../src/model-atlas/stats/selection/task-metrics";

const deepSWERow = {
	model: "Example Model",
	reasoning_effort: null,
	config: null,
	pass_at_1: 0.72,
	ci_lo: null,
	ci_hi: null,
	ci_half: null,
	n_tasks_attempted: 113,
	mean_cost_usd: 4.2,
	mean_duration_seconds: 300,
	mean_output_tokens: 12_000,
};
const automationBenchRow = {
	model: "Example Model",
	reasoning_effort: null,
	score: 0.66,
	cost_per_task_usd: 0.12,
	domain_lead_scores: [],
	domain_lead_score_median: null,
	adjusted_score: 0.68,
};
const cursorBenchRow = {
	rank: 1,
	model: "Example Model",
	base_model: "Example Model",
	reasoning_effort: null,
	score: 0.52,
	cost_per_task_usd: 0.42,
	tokens_per_task: 12345,
	steps_per_task: 12,
};
const terminalBenchAAResourceRow: ArtificialAnalysisEvaluationResourceRow = {
	benchmark_key: "terminalbench_v21",
	source_url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 0.82,
	task_count: 267,
	cost_per_task_usd: 0.32,
	seconds_per_task: 40,
	tokens_per_task: 555,
	input_tokens_per_task: 111,
	output_tokens_per_task: 444,
	answer_tokens_per_task: null,
	reasoning_tokens_per_task: null,
};
const artificialAnalysisHleResourceRow = {
	benchmark_key: "hle",
	source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 0.4,
	task_count: 2158,
	cost_per_task_usd: 0.02,
	seconds_per_task: 3,
	tokens_per_task: 123,
	input_tokens_per_task: 23,
	output_tokens_per_task: 100,
	answer_tokens_per_task: 40,
	reasoning_tokens_per_task: 60,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const valsTerminalBenchRow = {
	task: "overall" as const,
	task_label: "Overall",
	raw_model_id: "test/example-model",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	harness: null,
	score: 0.72,
	cost_per_task_usd: 0.36,
	seconds_per_task: 50,
};

const enrichment = benchmarkEnrichment(
	["Example Model"],
	{
		artificialAnalysisEvaluationResources: {
			scoreByModelName: new Map([
				["hle", new Map([["example-model", artificialAnalysisHleResourceRow]])],
				[
					"terminalbench_v21",
					new Map([["example-model", terminalBenchAAResourceRow]]),
				],
			]),
		},
		valsTerminalBench: {
			scoreByModelName: new Map([["example-model", [valsTerminalBenchRow]]]),
		},
		deepSWE: {
			scoreByModelName: new Map([["example-model", deepSWERow]]),
		},
		agentsLastExam: {
			scoreByModelName: emptyLookup(),
		},
		automationBench: {
			scoreByModelName: new Map([["example-model", automationBenchRow]]),
		},
		blueprintBench: {
			scoreByModelName: emptyLookup(),
		},
		gdpPdf: {
			scoreByModelName: emptyLookup(),
		},
		riemannBench: {
			scoreByModelName: emptyLookup(),
		},
		browseComp: {
			scoreByModelName: emptyLookup(),
		},
		toolathlon: {
			scoreByModelName: emptyLookup(),
		},
		valsIndex: {
			scoreByModelName: emptyLookup(),
		},
		cursorBench: {
			scoreByModelName: new Map([["example-model", cursorBenchRow]]),
		},
	} satisfies BenchmarkEnrichmentLookups,
	{
		hle: 0.4,
		terminalbench_v21: 0.82,
	},
);

assert.deepEqual(enrichment.evaluations, {
	terminalbench_v21: 0.82,
	deep_swe: 0.72,
	automation_bench: 0.68,
	cursorbench: 0.52,
});
assert.deepEqual(enrichment.scoringSources, {
	hle: artificialAnalysisHleResourceRow,
	terminalbench_v21: {
		model_id: "test/example-model",
		model: "Example Model",
		provider: "Test",
		harness: null,
		sources: ["artificial_analysis", "vals"],
		source_count: 2,
		score: 0.82,
		cost_per_task_usd: 0.33999999999999997,
		seconds_per_task: 45,
		tokens_per_task: 555,
		input_tokens_per_task: 111,
		output_tokens_per_task: 444,
	},
	deep_swe: deepSWERow,
	automation_bench: automationBenchRow,
	cursorbench: cursorBenchRow,
});
assert.deepEqual(buildTaskMetrics(null, null, enrichment.scoringSources), {
	hle: {
		cost: 0.02,
		seconds: 3,
		tokens: 123,
		input_tokens: 23,
		output_tokens: 100,
	},
	terminalbench_v21: {
		cost: 0.33999999999999997,
		seconds: 45,
		tokens: 555,
		input_tokens: 111,
		output_tokens: 444,
	},
	automation_bench: {
		cost: 0.12,
	},
	cursorbench: {
		cost: 0.42,
		tokens: 12345,
	},
	deep_swe: {
		cost: 4.2,
		seconds: 300,
		output_tokens: 12000,
	},
});

/** Return a typed empty lookup map for sources not involved in this test. */
function emptyLookup(): Map<string, never> {
	return new Map<string, never>();
}
