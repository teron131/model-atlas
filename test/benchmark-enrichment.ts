/** Verify shared benchmark enrichment maps source rows into evaluations and scoring sources. */

import assert from "node:assert/strict";

import {
	type BenchmarkEnrichmentLookups,
	benchmarkEnrichment,
} from "../src/model-atlas/llm/stats/benchmarks";

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

const enrichment = benchmarkEnrichment(["Example Model"], {
	deepSWE: {
		scoreByModelName: new Map([["example-model", deepSWERow]]),
	},
	terminalBench: {
		accuracyByModelName: emptyLookup(),
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
	cursorBench: {
		scoreByModelName: emptyLookup(),
	},
} satisfies BenchmarkEnrichmentLookups);

assert.deepEqual(enrichment.evaluations, {
	deep_swe: 0.72,
	automation_bench: 0.68,
});
assert.deepEqual(enrichment.scoringSources, {
	deep_swe: deepSWERow,
	automation_bench: automationBenchRow,
});

/** Return a typed empty lookup map for sources not involved in this test. */
function emptyLookup(): Map<string, never> {
	return new Map<string, never>();
}
