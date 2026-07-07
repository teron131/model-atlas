/** Chart-only reconstruction of price and cost-efficiency score signals. */

import {
	benchmarkDeviation,
	coverageConfidence,
	gaussianWeight,
	log10OnePlusPositive,
	logitBenchmarkScore,
	meanOfFinite,
	percentileScoreForValue,
	quantileFromSorted,
} from "../../../src/model-atlas/math-utils";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
	LlmStatsTaskMetricValues,
} from "../../../src/model-atlas/stats/types";
import {
	finiteValue,
	fmtMoney,
	fmtTooltipMoney,
	fmtTooltipScore,
} from "./format";
import type { HoverRow } from "./types";

export type PriceEfficiencyComparisonRow = {
	model: LlmStatsModel;
	priceScore: number;
	costEfficiencyScore: number;
	qualityScore: number;
	blendedPrice: number;
	deltaScore: number;
};

type PriceEfficiencyDraft = {
	model: LlmStatsModel;
	qualityScore: number;
	blendedPrice: number;
	priceSignal: number;
	costEfficiencyScore: number;
};

type BenchmarkCostPoint = {
	modelIndex: number;
	qualityDeviation: number;
	cost: number;
};

const MIN_BENCHMARK_DEVIATION = 0.35;
const COST_EFFICIENCY_QUALITY_SIGMA = 0.5;

/** Rebuild old-style price percentiles and pair them with benchmark-only task-cost efficiency. */
export function priceEfficiencyComparisonRows(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): PriceEfficiencyComparisonRow[] {
	const pricedModels = models.filter(priceEligibleModel);
	const benchmarkCostEfficiencyScores = benchmarkCostEfficiencyByModel(
		pricedModels,
		portfolio,
	);
	const drafts = pricedModels
		.flatMap((model, index): PriceEfficiencyDraft[] => {
			const blendedPrice = finiteValue(model.cost?.blended_price);
			const logCost = log10OnePlusPositive(blendedPrice);
			const qualityScore = meanOfFinite([
				finiteValue(model.scores?.intelligence_score),
				finiteValue(model.scores?.agentic_score),
			]);
			const benchmarkEfficiencyScore =
				benchmarkCostEfficiencyScores[index] ?? null;
			if (
				blendedPrice == null ||
				logCost == null ||
				qualityScore == null ||
				benchmarkEfficiencyScore == null
			) {
				return [];
			}
			return [
				{
					model,
					qualityScore,
					blendedPrice,
					priceSignal: 1 / logCost,
					costEfficiencyScore: benchmarkEfficiencyScore,
				},
			];
		})
		.sort(
			(left, right) => right.costEfficiencyScore - left.costEfficiencyScore,
		);
	const priceSignals = drafts.map((draft) => draft.priceSignal);
	return drafts.flatMap((draft): PriceEfficiencyComparisonRow[] => {
		const priceScore = percentileScoreForValue(priceSignals, draft.priceSignal);
		if (priceScore == null) {
			return [];
		}
		return [
			{
				model: draft.model,
				priceScore,
				costEfficiencyScore: draft.costEfficiencyScore,
				qualityScore: draft.qualityScore,
				blendedPrice: draft.blendedPrice,
				deltaScore: draft.costEfficiencyScore - priceScore,
			},
		];
	});
}

function priceEligibleModel(model: LlmStatsModel): boolean {
	const blendedPrice = finiteValue(model.cost?.blended_price);
	const qualityScore = meanOfFinite([
		finiteValue(model.scores?.intelligence_score),
		finiteValue(model.scores?.agentic_score),
	]);
	return log10OnePlusPositive(blendedPrice) != null && qualityScore != null;
}

/** Build hover table rows for a reconstructed price-efficiency point. */
export function priceEfficiencyHoverRows(
	row: PriceEfficiencyComparisonRow,
): HoverRow[] {
	return [
		["Price score", fmtTooltipScore(row.priceScore)],
		["Cost efficiency score", fmtTooltipScore(row.costEfficiencyScore)],
		["Benchmark lift", signedScore(row.deltaScore)],
		["Blend price", fmtTooltipMoney(row.blendedPrice)],
		["Quality score", fmtTooltipScore(row.qualityScore)],
	];
}

/** Summarize one row with the old-style score pair and current blended price. */
export function priceEfficiencySummaryDetail(
	row: PriceEfficiencyComparisonRow,
): string {
	return `${row.costEfficiencyScore.toFixed(1)} efficiency / ${row.priceScore.toFixed(
		1,
	)} price / ${fmtMoney(row.blendedPrice)}`;
}

/** Format the benchmark-efficiency lift relative to provider price score. */
export function priceEfficiencyDeltaDetail(
	row: PriceEfficiencyComparisonRow,
): string {
	return `${signedScore(row.deltaScore)} vs price score`;
}

function benchmarkCostEfficiencyByModel(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): Array<number | null> {
	const benchmarkKeys = activeBenchmarkCostKeys(models, portfolio);
	const signalsByModel = models.map(() => [] as number[]);
	for (const benchmarkKey of benchmarkKeys) {
		const points = benchmarkCostPoints(models, portfolio, benchmarkKey);
		for (const point of points) {
			const score = localBenchmarkCostEfficiency(point, points);
			if (score != null) {
				signalsByModel[point.modelIndex]?.push(score);
			}
		}
	}
	return signalsByModel.map((signals) => {
		const meanValue = meanOfFinite(signals);
		return meanValue == null
			? null
			: meanValue * coverageConfidence(signals.length, benchmarkKeys.length);
	});
}

function activeBenchmarkCostKeys(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): string[] {
	const benchmarkKeys = new Set<string>();
	for (const model of models) {
		for (const key of Object.keys(model.evaluations ?? {})) {
			benchmarkKeys.add(key);
		}
		for (const key of Object.keys(model.intelligence ?? {})) {
			benchmarkKeys.add(key);
		}
	}
	return [...benchmarkKeys]
		.filter((key) =>
			models.some(
				(model) =>
					benchmarkScore(model, key) != null &&
					taskCost(model, portfolio, key) != null,
			),
		)
		.sort((left, right) => left.localeCompare(right));
}

function benchmarkCostPoints(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
	key: string,
): BenchmarkCostPoint[] {
	const logitScores = models
		.map((model) => benchmarkScore(model, key))
		.filter((score): score is number => score != null && Number.isFinite(score))
		.map(logitBenchmarkScore)
		.sort((left, right) => left - right);
	const medianScore = quantileFromSorted(logitScores, 0.5);
	const scoreDeviation = benchmarkDeviation(
		logitScores,
		MIN_BENCHMARK_DEVIATION,
	);
	if (medianScore == null || scoreDeviation == null) {
		return [];
	}
	return models.flatMap((model, modelIndex): BenchmarkCostPoint[] => {
		const benchmarkValue = benchmarkScore(model, key);
		const cost = taskCost(model, portfolio, key);
		if (benchmarkValue == null || cost == null) {
			return [];
		}
		return [
			{
				modelIndex,
				qualityDeviation:
					(logitBenchmarkScore(benchmarkValue) - medianScore) / scoreDeviation,
				cost,
			},
		];
	});
}

function benchmarkScore(model: LlmStatsModel, key: string): number | null {
	return (
		finiteValue(model.intelligence?.[key]) ??
		finiteValue(model.evaluations?.[key])
	);
}

function localBenchmarkCostEfficiency(
	point: BenchmarkCostPoint,
	points: readonly BenchmarkCostPoint[],
): number | null {
	let totalWeight = 0;
	let atLeastAsExpensiveWeight = 0;
	for (const comparisonPoint of points) {
		const weight = gaussianWeight(
			point.qualityDeviation,
			comparisonPoint.qualityDeviation,
			COST_EFFICIENCY_QUALITY_SIGMA,
		);
		totalWeight += weight;
		if (comparisonPoint.cost >= point.cost) {
			atLeastAsExpensiveWeight += weight;
		}
	}
	return totalWeight > 0
		? (100 * atLeastAsExpensiveWeight) / totalWeight
		: null;
}

function taskCost(
	model: LlmStatsModel,
	portfolio: BenchmarkPortfolio,
	key: string,
): number | null {
	const directCost = positiveTaskCost(model.task_metrics?.[key]);
	if (directCost != null) {
		return directCost;
	}
	const resourcePolicy = portfolio[key]?.resourcePolicy;
	return resourcePolicy?.source === "artificial_analysis"
		? positiveTaskCost(model.task_metrics?.artificial_analysis)
		: null;
}

function positiveTaskCost(task: LlmStatsTaskMetricValues | null | undefined) {
	const cost = finiteValue(task?.cost);
	return cost != null && cost > 0 ? cost : null;
}

function bestRow(
	rows: PriceEfficiencyComparisonRow[],
	score: (row: PriceEfficiencyComparisonRow) => number | null,
): PriceEfficiencyComparisonRow | null {
	return (
		[...rows].sort(
			(left, right) =>
				(score(right) ?? Number.NEGATIVE_INFINITY) -
				(score(left) ?? Number.NEGATIVE_INFINITY),
		)[0] ?? null
	);
}

function signedScore(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
