/** Behavior checks for reconstructed price-efficiency chart score signals. */

import assert from "node:assert/strict";
import {
	priceEfficiencyHoverRows,
	priceEfficiencyRows,
	priceEfficiencySummaryDetail,
} from "../app/dashboard/graphs/price-efficiency";
import type {
	BenchmarkPortfolio,
	ModelAtlasModel,
} from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const portfolio = {
	deep_swe: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "output_tokens",
			qualityCoordinate: "logit",
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
const referenceModels = [
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
];
const rows = priceEfficiencyRows(
	referenceModels,
	referenceModels,
	portfolio,
	true,
);

assert.deepEqual(
	priceEfficiencyRows([middleStrong], referenceModels, portfolio, true)[0]
		?.priceScore,
	rows.find((row) => row.model === middleStrong)?.priceScore,
	"filters should not redefine chart calibration",
);
const effortReference = { ...middleStrong, reasoning_effort: "max" };
assert.equal(
	priceEfficiencyRows(
		[{ ...effortReference, reasoning_effort: null }],
		[effortReference],
		portfolio,
		false,
	).length,
	1,
	"collapsed display rows should resolve to their strongest scored variant",
);
const unavailableStrongestVariant = {
	...priceModel({
		id: "provider/effort-model",
		name: "Effort Model",
		price: 2,
		benchmarkCost: null,
		intelligenceScore: 90,
		agenticScore: 90,
		valueScore: 90,
	}),
	reasoning_effort: "max",
};
const availableWeakerVariant = {
	...priceModel({
		id: "provider/effort-model",
		name: "Effort Model",
		price: 2,
		benchmarkCost: 0.5,
		intelligenceScore: 80,
		agenticScore: 80,
		valueScore: 80,
	}),
	reasoning_effort: "high",
};
assert.equal(
	priceEfficiencyRows(
		[{ ...unavailableStrongestVariant, reasoning_effort: null }],
		[unavailableStrongestVariant, availableWeakerVariant, cheapWeak],
		portfolio,
		false,
	).length,
	0,
	"collapsed charts should not substitute another variant when the displayed variant lacks resource evidence",
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
		["provider/expensive-strong", 0, 75, 90, 10],
		["provider/middle-strong", 57.54775894572896, 48.6088, 80, 2],
		["provider/cheap-weak", 75.5065936163239, 33.3333, 30, 1],
	],
	"rows should rebuild winsorized price and hybrid quality-adjusted benchmark cost scores",
);

const topRow = rows[0];
assert.ok(topRow);
assert.deepEqual(
	priceEfficiencyHoverRows(topRow),
	[
		["Price score", "0.0"],
		["Cost efficiency score", "75.0"],
		["Benchmark lift", "+75.0"],
		["Blended price", "$10.00"],
		["Quality score", "90.0"],
	],
	"hover rows should show reconstructed price, benchmark cost efficiency, raw price, and quality",
);
assert.equal(
	priceEfficiencySummaryDetail(topRow),
	"75.0 efficiency / 0.0 price / $10",
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
}): ModelAtlasModel {
	return {
		...minimalModelAtlasModel({ id, name }),
		cost:
			price == null
				? null
				: {
						blended_price: price,
					},
		benchmarks: {
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
		},
	};
}
