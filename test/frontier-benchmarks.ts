/** Behavior checks for the Frontier Benchmarks chart data model. */

import assert from "node:assert/strict";
import {
	axisSummaryDetail,
	frontierAxisDescription,
	frontierAxisMetricLabel,
	frontierBenchmarkAxisConfigFor,
	frontierBenchmarkAxisOptions,
	frontierBenchmarkHoverRows,
	frontierBenchmarkRows,
	frontierBenchmarkSummaryRows,
	selectedFrontierBenchmarkAxisKey,
	speedValueBlendScore,
} from "../app/dashboard/graphs/frontier-benchmarks";
import type {
	BenchmarkPortfolio,
	ModelAtlasModel,
} from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const portfolio = {
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "tokens",
			qualityCoordinate: "logit",
		},
	},
	gpqa: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
} satisfies BenchmarkPortfolio;

const efficient = frontierModel({
	id: "provider/efficient",
	name: "Efficient",
	score: 0.82,
	cost: 2,
	seconds: 30,
	inputTokens: 1_000,
	outputTokens: 200,
	valueScore: 95,
	speedScore: 80,
	intelligenceScore: 72,
});
const expensive = frontierModel({
	id: "provider/expensive",
	name: "Expensive",
	score: 0.9,
	cost: 8,
	seconds: 120,
	inputTokens: 2_000,
	outputTokens: 1_000,
	valueScore: 40,
	speedScore: 20,
	intelligenceScore: 91,
});

const rows = frontierBenchmarkRows([efficient, expensive], portfolio);
const topRow = rows[0];
const secondRow = rows[1];
assert.ok(topRow);
assert.ok(secondRow);

assert.deepEqual(
	rows.map((row) => [row.model.id, row.score, row.cost, row.totalTokens]),
	[
		["provider/expensive", 90, 8, 3_000],
		["provider/efficient", 82, 2, 1_200],
	],
	"frontier rows should normalize percentages and attach resource metrics",
);
const scoreOnlyPortfolio = {
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
} satisfies BenchmarkPortfolio;
const scoreOnlyRow = frontierBenchmarkRows([efficient], scoreOnlyPortfolio)[0];
assert.ok(scoreOnlyRow);
assert.equal(
	scoreOnlyRow.cost,
	null,
	"resource telemetry should require the policy supplied by the active portfolio",
);

const costAxis = frontierBenchmarkAxisConfigFor("cost", false);
const summaryRows = frontierBenchmarkSummaryRows(rows, costAxis);
assert.equal(
	summaryRows?.leader.model.id,
	"provider/expensive",
	"highest scoring model should remain the chart leader",
);
assert.equal(
	summaryRows?.highScoreAxisRow.model.id,
	"provider/efficient",
	"high-score axis row should prefer the cheaper model above the leader score floor",
);

assert.deepEqual(
	frontierBenchmarkHoverRows(topRow, costAxis),
	[
		["Benchmark score", "90%"],
		["DeepSWE cost per task", "$8.0"],
		["Speed and Value scores", "30.0"],
	],
	"hover rows should describe selected benchmark score, resource axis, and Efficiency score",
);

assert.equal(
	axisSummaryDetail(secondRow, costAxis),
	"82% / DeepSWE cost per task $2.0",
	"summary detail should combine benchmark score and selected axis metric",
);

assert.equal(
	speedValueBlendScore(topRow),
	30,
	"bubble size should use a 50/50 blend of Value and Speed",
);
const axisOptions = frontierBenchmarkAxisOptions(rows, false);
assert.deepEqual(
	axisOptions.map((option) => [option.key, option.label]),
	[
		["speedValue", "Efficiency"],
		["cost", "Task Cost ↓"],
		["time", "Task Time ↓"],
		["tokens", "Task Tokens ↓"],
	],
	"axis options should separate the combined score from raw resource units",
);
assert.equal(
	frontierAxisDescription("cost", true),
	"Task Cost is MEAN NORMALIZED cost across each frontier benchmark's own per-task or total resource policy.",
	"aggregate raw resource axes should explain that they are normalized amounts, not efficiency scores",
);
assert.equal(
	frontierAxisDescription("time", true),
	"Task Time is MEAN NORMALIZED runtime across each frontier benchmark's own per-task or total resource policy.",
	"aggregate time axis should use MEAN NORMALIZED task wording",
);
assert.equal(
	frontierAxisDescription("tokens", false, topRow),
	"Task Tokens is the observed per-task token use for the selected benchmark.",
	"benchmark token axis should use Task Tokens wording",
);
assert.equal(
	frontierAxisDescription("speedValue", true),
	"Efficiency combines public Speed and Value scores with equal weight.",
	"combined score should describe speed and value separately from raw cost",
);
const allCostAxis = frontierBenchmarkAxisConfigFor("cost", true);
assert.equal(
	frontierAxisMetricLabel(allCostAxis, true, rows),
	"MEAN NORMALIZED cost ↓ (per task/total)",
	"aggregate resource axes should use MEAN NORMALIZED task labels",
);
assert.equal(
	frontierAxisMetricLabel(costAxis, false, rows),
	"DeepSWE cost per task",
	"benchmark resource axes should name the selected benchmark resource",
);

const totalPortfolio = {
	agents_last_exam: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
		resourcePolicy: {
			source: "benchmark",
			unit: "total",
			tokenMeasure: "tokens",
			qualityCoordinate: "linear",
		},
	},
} satisfies BenchmarkPortfolio;
const totalModel = {
	...minimalModelAtlasModel({ id: "provider/total", name: "Total" }),
	benchmarks: {
		agents_last_exam: 0.7,
	},
	task_metrics: {
		agents_last_exam: {
			cost: 99,
			seconds: 3_600,
			input_tokens: 10_000,
			output_tokens: 2_000,
		},
	},
	scores: {
		intelligence_score: 70,
		agentic_score: 0,
		speed_score: 60,
		value_score: 40,
	},
} satisfies ModelAtlasModel;
const totalRow = frontierBenchmarkRows([totalModel], totalPortfolio)[0];
assert.ok(totalRow);
assert.deepEqual(
	frontierBenchmarkHoverRows(totalRow, costAxis),
	[
		["Benchmark score", "70%"],
		["Agents' Last Exam total cost", "$99"],
		["Speed and Value scores", "50.0"],
	],
	"total-resource benchmarks should say total instead of per task",
);
assert.equal(
	frontierAxisDescription("cost", false, totalRow),
	"Task Cost is the observed total dollars for the selected benchmark.",
	"total-resource benchmark descriptions should say total instead of per task",
);
assert.equal(
	selectedFrontierBenchmarkAxisKey("tokens", axisOptions),
	"tokens",
	"available requested axes should remain selected",
);
assert.equal(
	selectedFrontierBenchmarkAxisKey(
		"time",
		axisOptions.map((option) =>
			option.key === "time" ? { ...option, disabled: true } : option,
		),
	),
	"speedValue",
	"disabled axes should fall back to the default available efficiency axis",
);

/** Build a minimal model with one Frontier Benchmarks observation. */
function frontierModel({
	id,
	name,
	score,
	cost,
	seconds,
	inputTokens,
	outputTokens,
	valueScore,
	speedScore,
	intelligenceScore,
}: {
	id: string;
	name: string;
	score: number;
	cost: number;
	seconds: number;
	inputTokens: number;
	outputTokens: number;
	valueScore: number;
	speedScore: number;
	intelligenceScore: number;
}): ModelAtlasModel {
	return {
		...minimalModelAtlasModel({ id, name }),
		benchmarks: {
			deep_swe: score,
			gpqa: 0.9,
		},
		task_metrics: {
			deep_swe: {
				cost,
				seconds,
				input_tokens: inputTokens,
				output_tokens: outputTokens,
			},
		},
		scores: {
			intelligence_score: intelligenceScore,
			agentic_score: 0,
			speed_score: speedScore,
			value_score: valueScore,
		},
	};
}
