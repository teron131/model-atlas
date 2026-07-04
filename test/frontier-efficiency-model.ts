/** Behavior checks for the Frontier Efficiency chart data model. */

import assert from "node:assert/strict";
import {
	axisSummaryDetail,
	frontierEfficiencyAxisConfigFor,
	frontierEfficiencyAxisOptions,
	frontierEfficiencyHoverRows,
	frontierEfficiencyRows,
	frontierEfficiencySummaryRows,
	selectedFrontierEfficiencyAxisKey,
} from "../app/dashboard/graphs/frontierEfficiencyModel";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../src/model-atlas/stats/types";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

const portfolio = {
	deep_swe: {
		group: "frontier",
		intelligencePortion: 1,
		agenticPortion: 0,
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "tokens",
		},
	},
	gpqa: {
		group: "baseline",
		intelligencePortion: 1,
		agenticPortion: 0,
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
	priceScore: 95,
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
	priceScore: 40,
	speedScore: 20,
	intelligenceScore: 91,
});

const rows = frontierEfficiencyRows([efficient, expensive], portfolio);
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

const costAxis = frontierEfficiencyAxisConfigFor("cost", false);
const summaryRows = frontierEfficiencySummaryRows(rows, costAxis);
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
	frontierEfficiencyHoverRows(topRow, costAxis),
	[
		["Benchmark score", "90%"],
		["Benchmark cost per task", "$8.0"],
		["Speed score", "20.0"],
	],
	"hover rows should describe selected benchmark score, resource axis, and speed",
);

assert.equal(
	axisSummaryDetail(secondRow, costAxis),
	"82% / Benchmark cost per task $2.0",
	"summary detail should combine benchmark score and selected axis metric",
);

const axisOptions = frontierEfficiencyAxisOptions(rows, false);
assert.equal(
	selectedFrontierEfficiencyAxisKey("tokens", axisOptions),
	"tokens",
	"available requested axes should remain selected",
);
assert.equal(
	selectedFrontierEfficiencyAxisKey(
		"time",
		axisOptions.map((option) =>
			option.key === "time" ? { ...option, disabled: true } : option,
		),
	),
	"cost",
	"disabled axes should fall back to the default available cost axis",
);

/** Build a minimal model with one Frontier Efficiency benchmark observation. */
function frontierModel({
	id,
	name,
	score,
	cost,
	seconds,
	inputTokens,
	outputTokens,
	priceScore,
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
	priceScore: number;
	speedScore: number;
	intelligenceScore: number;
}): LlmStatsModel {
	return {
		...minimalLlmStatsModel({ id, name }),
		evaluations: {
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
		relative_scores: {
			intelligence_score: intelligenceScore,
			agentic_score: 0,
			speed_score: speedScore,
			price_score: priceScore,
			cost_efficiency_score: priceScore,
			overall_score: 0,
		},
	};
}
