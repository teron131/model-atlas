/** Behavior checks for reconstructed price-efficiency chart score signals. */

import assert from "node:assert/strict";
import {
	priceEfficiencyComparisonRows,
	priceEfficiencyHoverRows,
	priceEfficiencySummaryDetail,
} from "../app/dashboard/graphs/priceEfficiencyComparisonModel";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../src/model-atlas/stats/types";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

const portfolio = {
	deep_swe: {
		group: "frontier",
		intelligencePortion: 0,
		agenticPortion: 1,
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "output_tokens",
		},
	},
} satisfies BenchmarkPortfolio;

const cheapWeak = priceModel({
	id: "provider/cheap-weak",
	name: "Cheap Weak",
	price: 1,
	benchmarkCost: 0.9,
	intelligenceScore: 30,
	agenticScore: 30,
	valueScore: 100,
});
const middleStrong = priceModel({
	id: "provider/middle-strong",
	name: "Middle Strong",
	price: 2,
	benchmarkCost: 0.5,
	intelligenceScore: 80,
	agenticScore: 80,
	valueScore: 90,
});
const expensiveStrong = priceModel({
	id: "provider/expensive-strong",
	name: "Expensive Strong",
	price: 10,
	benchmarkCost: 0.1,
	intelligenceScore: 90,
	agenticScore: 90,
	valueScore: 1,
});
const rows = priceEfficiencyComparisonRows(
	[
		cheapWeak,
		middleStrong,
		expensiveStrong,
		priceModel({
			id: "provider/missing-price",
			name: "Missing Price",
			price: null,
			benchmarkCost: 0.01,
			intelligenceScore: 100,
			agenticScore: 100,
			valueScore: 100,
		}),
		priceModel({
			id: "provider/missing-benchmark-cost",
			name: "Missing Benchmark Cost",
			price: 0.1,
			benchmarkCost: null,
			intelligenceScore: 100,
			agenticScore: 100,
			valueScore: 100,
		}),
	],
	portfolio,
);

assert.deepEqual(
	rows.map((row) => [
		row.model.id,
		row.priceScore,
		Number(row.costEfficiencyScore.toFixed(4)),
		row.qualityScore,
		row.blendedPrice,
	]),
	[
		["provider/expensive-strong", 33.3333, 100, 90, 10],
		["provider/middle-strong", 66.6667, 66.6667, 80, 2],
		["provider/cheap-weak", 100, 33.3333, 30, 1],
	],
	"rows should rebuild price percentiles and plot benchmark-only cost efficiency",
);

const topRow = rows[0];
assert.ok(topRow);
assert.deepEqual(
	priceEfficiencyHoverRows(topRow),
	[
		["Price score", "33.3"],
		["Cost efficiency score", "100.0"],
		["Benchmark lift", "+66.7"],
		["Blend price", "$10.00"],
		["Quality score", "90.0"],
	],
	"hover rows should show reconstructed price, benchmark cost efficiency, raw price, and quality",
);
assert.equal(
	priceEfficiencySummaryDetail(topRow),
	"100.0 efficiency / 33.3 price / $10",
	"summary detail should combine the reconstructed score pair with raw price",
);

function priceModel({
	id,
	name,
	price,
	benchmarkCost,
	intelligenceScore,
	agenticScore,
	valueScore,
}: {
	id: string;
	name: string;
	price: number | null;
	benchmarkCost: number | null;
	intelligenceScore: number;
	agenticScore: number;
	valueScore: number | null;
}): LlmStatsModel {
	return {
		...minimalLlmStatsModel({ id, name }),
		cost:
			price == null
				? null
				: {
						blended_price: price,
					},
		evaluations: {
			deep_swe: 0.5,
		},
		task_metrics: {
			deep_swe:
				benchmarkCost == null
					? null
					: {
							cost: benchmarkCost,
						},
		},
		scores: {
			intelligence_score: intelligenceScore,
			agentic_score: agenticScore,
			speed_score: 0,
			value_score: valueScore,
			overall_score: 0,
		},
	};
}
