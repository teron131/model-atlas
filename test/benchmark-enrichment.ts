/** Verify shared benchmark enrichment maps source rows into evaluations and scoring sources. */

import assert from "node:assert/strict";
import {
	type BenchmarkObservationRow,
	buildBenchmarkObservationLookup,
} from "../src/model-atlas/benchmarks/observation";
import { buildBenchmarkModelMap } from "../src/model-atlas/identity/normalization";
import {
	type BenchmarkEnrichmentLookups,
	enrichBenchmarkAggregate,
	enrichBenchmarkObservation,
	enrichModelRowsWithBenchmarks,
} from "../src/model-atlas/pipeline/benchmark-rows";
import { buildTaskMetrics } from "../src/model-atlas/pipeline/selection/candidate";
import type { AgentArenaModelScoreRow } from "../src/model-atlas/scrapers/agent-arena";
import type { AleBenchModelScoreRow } from "../src/model-atlas/scrapers/ale-bench";
import type { ArtificialAnalysisEvaluationResourceRow } from "../src/model-atlas/scrapers/artificial-analysis/benchmark-resources";
import type { FrontierCodeModelEffortRow } from "../src/model-atlas/scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../src/model-atlas/scrapers/mercor-apex-agents";
import type { HarveyLabModelScoreRow } from "../src/model-atlas/scrapers/vals/harvey-lab";
import type { VendingBench2ModelScoreRow } from "../src/model-atlas/scrapers/vending-bench-2";

const deepSWERow = {
	model: "Example Model Preview",
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
const cursorBenchRow = {
	rank: 1,
	model: "Example Model",
	base_model: "Example Model",
	reasoning_effort: null,
	score_eligible: true,
	score: 0.52,
	cost_per_task_usd: 0.42,
	tokens_per_task: 12345,
	steps_per_task: 12,
};
const agentArenaRow: AgentArenaModelScoreRow = {
	rank: 1,
	contender_name: "contenders/example-model-agent",
	model: "Example Model",
	base_model: "Example Model",
	reasoning_effort: null,
	organization: "Test",
	score: 0.14,
};
const aleStatistics = (mean: number) => ({
	all: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
	short: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
	long: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
});
const aleBenchRow: AleBenchModelScoreRow = {
	model: "Example Model-high",
	base_model: "Example Model",
	reasoning_effort: "high",
	detail_path: "data/example-model-high.json",
	num_self_refine: 1,
	rank: aleStatistics(5),
	performance: aleStatistics(700),
	input_tokens: aleStatistics(1_000),
	output_tokens: aleStatistics(2_000),
	total_tokens: aleStatistics(3_000),
	cost: aleStatistics(0.3),
	results: [],
	score: 700,
	cost_per_task_usd: 0.3,
	tokens_per_task: 3_000,
	input_tokens_per_task: 1_000,
	output_tokens_per_task: 2_000,
};
const frontierCodeRow: FrontierCodeModelEffortRow = {
	revision: "v1_1",
	model: "Example Model (high)",
	base_model: "Example Model",
	source_effort: "high",
	reasoning_effort: "high",
	harness: "codex",
	score_eligible: true,
	official_rank: 1,
	official_best_effort: true,
	main: {
		pass_rate: 0.58,
		score: 0.535,
		cost_per_task_usd: 0.75,
		tokens_per_task: 4_500,
		tool_calls_per_task: 18,
		steps_per_task: 12,
		output_token_equivalent_per_task: 2_000,
	},
	extended: {
		pass_rate: 0.4,
		score: 0.35,
		cost_per_task_usd: 0.6,
		tokens_per_task: 3_500,
		tool_calls_per_task: 14,
		steps_per_task: 10,
		output_token_equivalent_per_task: 1_500,
	},
	score: 0.535,
	cost_per_task_usd: 0.75,
	tokens_per_task: 4_500,
};
const mercorApexRow: MercorApexAgentsRow = {
	model_id: "test/example-model",
	source_model: "Example Model (High)",
	model: "Example Model (high)",
	base_model: "Example Model",
	reasoning_effort: "high",
	organization: "Test",
	score: 0.4,
};
const vendingBench2Row: VendingBench2ModelScoreRow = {
	rank: 1,
	model: "Example Model",
	base_model: "Example Model",
	reasoning_effort: null,
	run_count: 5,
	final_balance_usd: 9_000,
	daily_balance_usd: [500, 9_000],
};
const terminalBenchResourceRow: ArtificialAnalysisEvaluationResourceRow = {
	benchmark_key: "terminalbench_v21",
	source_url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 0.82,
	task_run_count: 267,
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
	task_run_count: 2158,
	cost_per_task_usd: 0.02,
	seconds_per_task: 3,
	tokens_per_task: 123,
	input_tokens_per_task: 23,
	output_tokens_per_task: 100,
	answer_tokens_per_task: 40,
	reasoning_tokens_per_task: 60,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const briefcaseResourceRow = {
	benchmark_key: "briefcase",
	source_url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 1500,
	task_run_count: 91,
	cost_per_task_usd: 2.5,
	seconds_per_task: 120,
	tokens_per_task: 1000,
	input_tokens_per_task: 800,
	output_tokens_per_task: 200,
	answer_tokens_per_task: 80,
	reasoning_tokens_per_task: 120,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const automationBenchResourceRow = {
	benchmark_key: "automation_bench",
	source_url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 0.68,
	task_run_count: 657,
	cost_per_task_usd: 0.12,
	seconds_per_task: 15,
	tokens_per_task: 700,
	input_tokens_per_task: 600,
	output_tokens_per_task: 100,
	answer_tokens_per_task: 60,
	reasoning_tokens_per_task: 40,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const harveyLabRow = {
	task: "overall",
	task_label: "Overall",
	metric: "task_resolution",
	model_id: "test/example-model",
	model: "example-model",
	base_model: "example-model",
	reasoning_effort: null,
	provider: "Test",
	rank: 1,
	score: 0.1125,
	criterion_pass: 0.9048,
	standard_error: 0.024,
	cost_per_task_usd: 19.225253,
	seconds_per_task: 1613.04,
	temperature: 1,
	top_p: null,
	max_output_tokens: 128_000,
	verbosity: null,
	compute_effort: null,
	harness: null,
} satisfies HarveyLabModelScoreRow;
const itbenchResourceRow = {
	benchmark_key: "itbench_sre",
	source_url: "https://artificialanalysis.ai/evaluations/itbench-aa",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	provider_id: "test",
	reasoning_effort: null,
	score: 0.56,
	task_run_count: 177,
	cost_per_task_usd: 1.2,
	seconds_per_task: 180,
	tokens_per_task: 1500,
	input_tokens_per_task: 1300,
	output_tokens_per_task: 200,
	answer_tokens_per_task: 80,
	reasoning_tokens_per_task: 120,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const terminalBenchRow = {
	task: "overall" as const,
	task_label: "Overall",
	source_model_id: "test/example-model",
	model_id: "test/example-model",
	model: "Example Model",
	provider: "Test",
	harness: null,
	score: 0.72,
	cost_per_task_usd: 0.36,
	seconds_per_task: 50,
};
const legalResearchRow = {
	benchmark_key: "legal_research",
	source_url: "https://www.vals.ai/benchmarks/legal_research",
	model_id: "test/example-model",
	model: "Example Model",
	base_model: "Example Model",
	reasoning_effort: null,
	model_creator_id: null,
	model_creator: "Test",
	inference_provider: null,
	rank: 1,
	reported_value: 61,
	reported_unit: "percent",
	canonical_value: 0.61,
	canonical_unit: "proportion",
	score_eligible: true,
	standard_error: null,
	confidence_low: null,
	confidence_high: null,
	observed_at: null,
	metadata: {},
} satisfies BenchmarkObservationRow;
const chartographyRow = {
	...legalResearchRow,
	benchmark_key: "chartography",
	source_url: "https://www.surgehq.ai/leaderboard/chartography",
	reported_value: 47,
	canonical_value: 0.47,
} satisfies BenchmarkObservationRow;

const resourceRowsByBenchmark = new Map([
	["briefcase", new Map([["example-model", briefcaseResourceRow]])],
	[
		"automation_bench",
		new Map([["example-model", automationBenchResourceRow]]),
	],
	["hle", new Map([["example-model", artificialAnalysisHleResourceRow]])],
	["itbench_sre", new Map([["example-model", itbenchResourceRow]])],
	["terminalbench_v21", new Map([["example-model", terminalBenchResourceRow]])],
]);
const lookups = {
	artificialAnalysisEvaluationResources: {
		observationByModelName: resourceRowsByBenchmark,
		defaultEffortByModelName: resourceRowsByBenchmark,
	},
	agentArena: {
		rowsByModelName: new Map([["example-model", agentArenaRow]]),
	},
	agentsLastExam: {
		rowsByModelName: emptyLookup(),
	},
	aleBench: { rowsByModelName: buildBenchmarkModelMap([aleBenchRow]) },
	blueprintBench: {
		rowsByModelName: emptyLookup(),
	},
	browseComp: {
		rowsByModelName: emptyLookup(),
	},
	codeMigration: { rowsByModelName: emptyLookup() },
	chartography: {
		rowsByModelName: buildBenchmarkObservationLookup([chartographyRow]),
	},
	chessPuzzles: { rowsByModelName: new Map() },
	cursorBench: {
		rowsByModelName: new Map([["example-model", cursorBenchRow]]),
	},
	cyberBench: { rowsByModelName: emptyLookup() },
	deepSWE: {
		rowsByModelName: new Map([["example-model-preview", deepSWERow]]),
	},
	ebrBench: { rowsByModelName: new Map() },
	emb: { rowsByModelName: emptyLookup() },
	enterpriseBenchCoreCraft: { rowsByModelName: new Map() },
	epochCapabilitiesIndex: { rowsByModelName: new Map() },
	financeAgentV2: { rowsByModelName: emptyLookup() },
	frontierCode: {
		rowsByModelName: buildBenchmarkModelMap([frontierCodeRow]),
	},
	frontierMathTier4: { rowsByModelName: new Map() },
	gdpPdf: {
		rowsByModelName: emptyLookup(),
	},
	handbookMd: { rowsByModelName: new Map() },
	harveyLab: {
		rowsByModelName: new Map([["example-model", harveyLabRow]]),
	},
	legalResearch: {
		rowsByModelName: buildBenchmarkObservationLookup([legalResearchRow]),
	},
	medCode: { rowsByModelName: emptyLookup() },
	mercorApexAgents: {
		rowsByModelName: new Map([["example-model", mercorApexRow]]),
	},
	proofBench: { rowsByModelName: new Map() },
	programBench: { rowsByModelName: emptyLookup() },
	publicBenefitsBench: { rowsByModelName: emptyLookup() },
	riemannBench: {
		rowsByModelName: emptyLookup(),
	},
	terminalBench: {
		rowsByModelName: new Map([["example-model", [terminalBenchRow]]]),
	},
	toolathlon: {
		rowsByModelName: emptyLookup(),
	},
	valsIndex: {
		rowsByModelName: emptyLookup(),
	},
	vendingBench2: {
		rowsByModelName: new Map([["example-model", vendingBench2Row]]),
	},
	vibeCode: { rowsByModelName: emptyLookup() },
	weirdMl: { rowsByModelName: new Map() },
} satisfies BenchmarkEnrichmentLookups;

const observationEnrichment = enrichBenchmarkObservation(
	["Example Model"],
	lookups,
	{
		hle: 0.4,
		terminalbench_v21: 0.82,
	},
);
assert.deepEqual(observationEnrichment.evaluations, {
	ale_bench: 700,
	automation_bench: 0.68,
	briefcase: 0.5,
	frontier_code: 0.535,
	itbench_sre: 0.56,
	terminalbench_v21: 0.82,
});
assert.equal(
	(observationEnrichment.evaluations as Record<string, unknown>).deep_swe,
	undefined,
);
assert.equal(
	(observationEnrichment.evaluations as Record<string, unknown>).cursorbench,
	undefined,
);

const enrichment = enrichBenchmarkAggregate(["Example Model"], lookups, {
	hle: 0.4,
	terminalbench_v21: 0.82,
});

assert.deepEqual(enrichment.evaluations, {
	agent_arena: 0.14,
	ale_bench: 700,
	automation_bench: 0.68,
	briefcase: 0.5,
	chartography: 0.47,
	cursorbench: 0.52,
	deep_swe: 0.72,
	frontier_code: 0.535,
	harvey_lab: 0.1125,
	itbench_sre: 0.56,
	legal_research: 0.61,
	terminalbench_v21: 0.82,
	vending_bench_2: 9_000,
});
assert.deepEqual(enrichment.scoringSources, {
	agent_arena: agentArenaRow,
	ale_bench: aleBenchRow,
	apex_agents_mercor: mercorApexRow,
	automation_bench: automationBenchResourceRow,
	briefcase: briefcaseResourceRow,
	chartography: chartographyRow,
	cursorbench: cursorBenchRow,
	deep_swe: deepSWERow,
	frontier_code: frontierCodeRow,
	harvey_lab: harveyLabRow,
	hle: artificialAnalysisHleResourceRow,
	itbench_sre: itbenchResourceRow,
	legal_research: legalResearchRow,
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
	vending_bench_2: vendingBench2Row,
});
const effortQualifiedAggregate = enrichBenchmarkAggregate(
	["Example Model - Max"],
	lookups,
	{},
	"max",
);
assert.deepEqual(effortQualifiedAggregate.evaluations, {
	agent_arena: 0.14,
	chartography: 0.47,
	legal_research: 0.61,
	vending_bench_2: 9_000,
});
assert.deepEqual(effortQualifiedAggregate.scoringSources, {
	agent_arena: agentArenaRow,
	chartography: chartographyRow,
	legal_research: legalResearchRow,
	vending_bench_2: vendingBench2Row,
});
assert.deepEqual(buildTaskMetrics(null, enrichment.scoringSources), {
	ale_bench: {
		cost: 0.3,
		tokens: 3_000,
		input_tokens: 1_000,
		output_tokens: 2_000,
	},
	automation_bench: {
		cost: 0.12,
		seconds: 15,
		tokens: 700,
		input_tokens: 600,
		output_tokens: 100,
	},
	briefcase: {
		cost: 2.5,
		seconds: 120,
		tokens: 1000,
		input_tokens: 800,
		output_tokens: 200,
	},
	cursorbench: {
		cost: 0.42,
		tokens: 12345,
	},
	frontier_code: {
		cost: 0.75,
		tokens: 4_500,
	},
	deep_swe: {
		cost: 4.2,
		seconds: 300,
		output_tokens: 12000,
	},
	harvey_lab: {
		cost: 19.225253,
		seconds: 1613.04,
	},
	hle: {
		cost: 0.02,
		seconds: 3,
		tokens: 123,
		input_tokens: 23,
		output_tokens: 100,
	},
	itbench_sre: {
		cost: 1.2,
		seconds: 180,
		tokens: 1500,
		input_tokens: 1300,
		output_tokens: 200,
	},
	terminalbench_v21: {
		cost: 0.33999999999999997,
		seconds: 45,
		tokens: 555,
		input_tokens: 111,
		output_tokens: 444,
	},
});

const variantAutomationBenchResourceRow = {
	...automationBenchResourceRow,
	model_id: "test/example-model-medium",
	model: "Example Model (medium)",
	reasoning_effort: "medium",
	score: 0.61,
	cost_per_task_usd: 0.04,
	seconds_per_task: 6,
} satisfies ArtificialAnalysisEvaluationResourceRow;
const [supplementedObservation, supplementedDefault, supplementedFastRoute] =
	enrichModelRowsWithBenchmarks(
		[
			{
				id: "test/example-model",
				name: "Example Model",
				artificial_analysis_id: "test/example-model-medium",
				reasoning_effort: "medium",
				evaluations: {
					automation_bench: variantAutomationBenchResourceRow.score,
				},
				scoring_sources: {
					automation_bench: variantAutomationBenchResourceRow,
				},
			},
			{
				id: "test/example-model",
				name: "Example Model",
				artificial_analysis_id: "test/example-model",
				reasoning_effort: "max",
				evaluations: {},
			},
			{
				id: "test/example-model-fast",
				name: "Example Model (Fast)",
				reasoning_effort: null,
				evaluations: {},
			},
		],
		lookups,
	);
assert.ok(
	supplementedObservation,
	"benchmark enrichment must preserve the input observation",
);
assert.equal(
	(supplementedObservation.evaluations as Record<string, unknown>)
		.automation_bench,
	variantAutomationBenchResourceRow.score,
	"aggregate benchmarks must not overwrite an effort observation's benchmark value",
);
assert.equal(
	(
		(supplementedObservation.scoring_sources as Record<string, unknown>)
			.automation_bench as ArtificialAnalysisEvaluationResourceRow
	).cost_per_task_usd,
	variantAutomationBenchResourceRow.cost_per_task_usd,
	"aggregate benchmarks must not overwrite effort-specific resources",
);
assert.equal(
	(supplementedObservation.evaluations as Record<string, unknown>).cursorbench,
	undefined,
	"model-level benchmarks should not be copied onto lower effort variants",
);
assert.ok(supplementedDefault, "expected the default-effort observation");
assert.equal(
	(supplementedDefault.evaluations as Record<string, unknown>).cursorbench,
	cursorBenchRow.score,
	"model-level benchmarks should belong to the highest default effort",
);
assert.ok(supplementedFastRoute, "expected the catalog-only fast route");
assert.equal(
	(supplementedFastRoute.evaluations as Record<string, unknown>).cursorbench,
	undefined,
	"catalog-only routes should not outrank matched effort observations",
);

const chartographyRows = [
	{
		benchmark_key: "chartography",
		source_url: "https://surgehq.ai/benchmarks/chartography",
		model_id: null,
		model: "Example Model",
		base_model: "Example Model",
		reasoning_effort: null,
		model_creator_id: null,
		model_creator: "Test",
		inference_provider: null,
		rank: 2,
		reported_value: 29.5,
		reported_unit: "percent",
		canonical_value: 0.295,
		canonical_unit: "proportion",
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {},
	},
	{
		benchmark_key: "chartography",
		source_url: "https://surgehq.ai/benchmarks/chartography",
		model_id: null,
		model: "Example Model (max)",
		base_model: "Example Model",
		reasoning_effort: "max",
		model_creator_id: null,
		model_creator: "Test",
		inference_provider: null,
		rank: 1,
		reported_value: 34.8,
		reported_unit: "percent",
		canonical_value: 0.348,
		canonical_unit: "proportion",
		score_eligible: true,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: {},
	},
] satisfies BenchmarkObservationRow[];
const [defaultOnlyModel] = enrichModelRowsWithBenchmarks(
	[
		{
			id: "test/example-model",
			name: "Example Model",
			artificial_analysis_id: "test/example-model",
			reasoning_effort: null,
			evaluations: { chartography: 0.295 },
		},
	],
	{
		...lookups,
		chartography: {
			rowsByModelName: buildBenchmarkObservationLookup(chartographyRows),
		},
	},
);
assert.equal(
	(defaultOnlyModel?.evaluations as Record<string, unknown>).chartography,
	0.348,
	"a source max effort should become the sole Atlas row's default",
);
/** Return a typed empty lookup map for sources not involved in this test. */
function emptyLookup(): Map<string, never> {
	return new Map<string, never>();
}
