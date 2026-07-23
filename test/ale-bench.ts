/** Verifies ALE-Bench refinement preservation, source-default selection, and Epoch contract validation. */

import assert from "node:assert/strict";
import {
	aleBenchModelEffort,
	buildAleBenchCrosswalkStatus,
	processAleBenchSakanaPayload,
	summarizeAleBenchSourceDefaultRows,
} from "../src/model-atlas/benchmarks/scrapers/ale-bench";
import { processAleBenchEpochCsv } from "../src/model-atlas/benchmarks/scrapers/epoch/ale-bench";

function statistics(mean: number) {
	return {
		all: { mean, median: mean, min: mean - 1, max: mean + 1, stdev: 1 },
		short: { mean, median: mean, min: mean - 1, max: mean + 1, stdev: 1 },
		long: { mean, median: mean, min: mean - 1, max: mean + 1, stdev: 1 },
	};
}

function configuration(numSelfRefine: number, performance: number) {
	return {
		num_self_refine: numSelfRefine,
		rank: statistics(100),
		performance: statistics(performance),
		input_tokens: statistics(1_000),
		output_tokens: statistics(2_000),
		total_tokens: statistics(3_000),
		cost: statistics(1),
		results: [
			{
				problem_id: "ahc001",
				code_language: "cpp20",
				overall_judge_result: "ACCEPTED",
				overall_absolute_score: 10,
				overall_relative_score: 11,
				max_execution_time_ms: 12,
				max_memory_usage_kib: 13,
				rank: 14,
				performance,
				input_tokens: 1_000,
				output_tokens: 2_000,
				total_tokens: 3_000,
				cost: 1,
			},
		],
	};
}

const sakanaRows = processAleBenchSakanaPayload([
	{
		model_name: "model-c",
		detail_path: "data/model-c.json",
		overall_results: [configuration(1, 300), configuration(2, 320)],
	},
	{
		model_name: "model-a",
		detail_path: "data/model-a.json",
		overall_results: [configuration(1, 100)],
	},
	{
		model_name: "model-b",
		detail_path: "data/model-b.json",
		overall_results: [configuration(1, 200)],
	},
	{
		model_name: "sakana-only",
		detail_path: "data/sakana-only.json",
		overall_results: [configuration(1, 400)],
	},
]);

assert.deepEqual(
	sakanaRows.map((row) => [row.model, row.num_self_refine]),
	[
		["model-a", 1],
		["model-b", 1],
		["model-c", 1],
		["model-c", 2],
		["sakana-only", 1],
	],
);
assert.equal(sakanaRows[0]?.results[0]?.problem_id, "ahc001");
assert.deepEqual(aleBenchModelEffort("gpt-5.6-sol-max"), {
	baseModel: "gpt-5.6-sol",
	reasoningEffort: "max",
});
assert.deepEqual(aleBenchModelEffort("mistral-large-3-2512"), {
	baseModel: "mistral-large-3-2512",
	reasoningEffort: null,
});
const sourceDefaultRows = summarizeAleBenchSourceDefaultRows(sakanaRows);
assert.equal(sourceDefaultRows.length, 4);
assert.equal(
	sourceDefaultRows.find((row) => row.model === "model-c")?.score,
	300,
);
assert.deepEqual(
	sourceDefaultRows.find((row) => row.model === "model-c"),
	{
		...sakanaRows.find(
			(row) => row.model === "model-c" && row.num_self_refine === 1,
		),
		base_model: "model-c",
		reasoning_effort: null,
		score: 300,
		cost_per_task_usd: 1,
		tokens_per_task: 3_000,
		input_tokens_per_task: 1_000,
		output_tokens_per_task: 2_000,
	},
);

assert.deepEqual(
	processAleBenchSakanaPayload([
		{
			model_name: "   ",
			detail_path: "data/empty-model.json",
			overall_results: [configuration(1, 500)],
		},
	]),
	[],
);

const malformedConfiguration = configuration(1, 500);
const [firstResult] = malformedConfiguration.results;
assert.ok(firstResult);
malformedConfiguration.results.push({
	...firstResult,
	total_tokens: Number.NaN,
});
assert.deepEqual(
	processAleBenchSakanaPayload([
		{
			model_name: "partial-task-evidence",
			detail_path: "data/partial-task-evidence.json",
			overall_results: [malformedConfiguration],
		},
	]),
	[],
);

const epochRows =
	processAleBenchEpochCsv(`Name,Model version,Performance,Cost,Total tokens (K),Input tokens (K),Output tokens (K),Rank
model-a,model-a-v1,100.00,1.00,3.00,1.00,2.00,100.00
model-b,model-b-v1,200.00,1.00,3.00,1.00,2.00,100.00
model-c,model-c-v1,300.00,1.00,3.00,1.00,2.00,100.00
`);
assert.equal(epochRows[0]?.total_tokens, 3_000);

const crosswalk = buildAleBenchCrosswalkStatus(sakanaRows, epochRows);
assert.equal(crosswalk.imputationAllowed, true);
assert.equal(crosswalk.overlapModelCount, 3);
assert.equal(crosswalk.validationModelCount, 3);
assert.equal(crosswalk.medianOffset, 0);
assert.equal(crosswalk.validationMedianAbsoluteError, 0);
assert.deepEqual(crosswalk.missingFromEpoch, ["sakana-only"]);
assert.equal(crosswalk.sakanaSourceDefaultRowCount, 4);
assert.equal(crosswalk.epochRowCount, 3);

const divergentEpochRows = epochRows.map((row, index) => ({
	...row,
	performance: row.performance + index * 10,
}));
assert.equal(
	buildAleBenchCrosswalkStatus(sakanaRows, divergentEpochRows)
		.imputationAllowed,
	false,
);
