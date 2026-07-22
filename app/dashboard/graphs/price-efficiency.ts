/** Price-efficiency chart data reconstruction and summaries. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import {
	log10OnePlusPositive,
	meanOfFinite,
} from "../../../src/model-atlas/numeric";
import { coverageConfidence } from "../../../src/model-atlas/pipeline/scores/normalization";
import {
	benchmarkResourceEfficiencyScores,
	modelBalancedMinMaxScores,
} from "../../../src/model-atlas/pipeline/scores/resource-efficiency";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
	LlmStatsTaskMetricValues,
} from "../../../src/model-atlas/stats/types";
import { modelVariantKey } from "../shared/model-display";
import {
	finiteValue,
	fmtMoney,
	fmtTooltipMoney,
	fmtTooltipScore,
} from "./format";
import type { HoverRow } from "./types";

export type PriceEfficiencyRow = {
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
	priceScore: number;
	costEfficiencyScore: number;
};

/** Rebuild the scored absolute-price and benchmark-only task-cost signals for chart comparison. */
export function priceEfficiencyRows(
	visibleModels: LlmStatsModel[],
	referenceModels: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
	expandReasoningVariants: boolean,
): PriceEfficiencyRow[] {
	const eligibleModels = referenceModels.filter(isPriceEligibleModel);
	const priceScores = modelBalancedMinMaxScores(
		eligibleModels,
		eligibleModels.map((model) =>
			log10OnePlusPositive(finiteValue(model.cost?.blended_price)),
		),
		"lower",
	);
	const costEfficiencyScores = costEfficiencyByModel(eligibleModels, portfolio);
	const drafts = eligibleModels.flatMap(
		(model, index): PriceEfficiencyDraft[] => {
			const blendedPrice = finiteValue(model.cost?.blended_price);
			const logCost = log10OnePlusPositive(blendedPrice);
			const qualityScore = meanOfFinite([
				finiteValue(model.scores?.intelligence_score),
				finiteValue(model.scores?.agentic_score),
			]);
			const costEfficiencyScore = costEfficiencyScores[index] ?? null;
			const priceScore = priceScores[index] ?? null;
			if (
				blendedPrice == null ||
				logCost == null ||
				qualityScore == null ||
				costEfficiencyScore == null ||
				priceScore == null
			) {
				return [];
			}
			return [
				{
					model,
					qualityScore,
					blendedPrice,
					costEfficiencyScore,
					priceScore,
				},
			];
		},
	);
	const strongestByKey = new Map<string, LlmStatsModel>();
	for (const model of referenceModels) {
		const key = comparisonKey(model, expandReasoningVariants);
		const existing = strongestByKey.get(key);
		if (
			existing == null ||
			model.scores.intelligence_score > existing.scores.intelligence_score
		) {
			strongestByKey.set(key, model);
		}
	}
	const draftByModel = new Map(drafts.map((draft) => [draft.model, draft]));
	return visibleModels
		.flatMap((model): PriceEfficiencyRow[] => {
			const reference = strongestByKey.get(
				comparisonKey(model, expandReasoningVariants),
			);
			const draft = reference == null ? null : draftByModel.get(reference);
			if (draft == null) {
				return [];
			}
			return [
				{
					model: draft.model,
					priceScore: draft.priceScore,
					costEfficiencyScore: draft.costEfficiencyScore,
					qualityScore: draft.qualityScore,
					blendedPrice: draft.blendedPrice,
					deltaScore: draft.costEfficiencyScore - draft.priceScore,
				},
			];
		})
		.sort(
			(left, right) => right.costEfficiencyScore - left.costEfficiencyScore,
		);
}

function comparisonKey(
	model: LlmStatsModel,
	expandReasoningVariants: boolean,
): string {
	return expandReasoningVariants
		? modelVariantKey(model)
		: canonicalModelKey(model);
}

function isPriceEligibleModel(model: LlmStatsModel): boolean {
	const blendedPrice = finiteValue(model.cost?.blended_price);
	const qualityScore = meanOfFinite([
		finiteValue(model.scores?.intelligence_score),
		finiteValue(model.scores?.agentic_score),
	]);
	return log10OnePlusPositive(blendedPrice) != null && qualityScore != null;
}

export function priceEfficiencyHoverRows(row: PriceEfficiencyRow): HoverRow[] {
	return [
		["Price score", fmtTooltipScore(row.priceScore)],
		["Cost efficiency score", fmtTooltipScore(row.costEfficiencyScore)],
		["Benchmark lift", signedScore(row.deltaScore)],
		["Blended price", fmtTooltipMoney(row.blendedPrice)],
		["Quality score", fmtTooltipScore(row.qualityScore)],
	];
}

export function priceEfficiencySummaryDetail(row: PriceEfficiencyRow): string {
	return `${row.costEfficiencyScore.toFixed(1)} efficiency / ${row.priceScore.toFixed(
		1,
	)} price / ${fmtMoney(row.blendedPrice)}`;
}

export function priceEfficiencyDeltaDetail(row: PriceEfficiencyRow): string {
	return `${signedScore(row.deltaScore)} vs price score`;
}

function costEfficiencyByModel(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): Array<number | null> {
	const benchmarkKeys = activeBenchmarkCostKeys(models, portfolio);
	const scoresByModel = models.map(() => [] as number[]);
	for (const benchmarkKey of benchmarkKeys) {
		const scores = benchmarkResourceEfficiencyScores(
			models,
			models.map((model) => benchmarkScore(model, benchmarkKey)),
			models.map((model) => {
				const cost = taskCost(model, portfolio, benchmarkKey);
				return cost == null ? null : Math.log(cost);
			}),
		);
		for (const [modelIndex, score] of scores.entries()) {
			if (score != null) {
				scoresByModel[modelIndex]?.push(score);
			}
		}
	}
	return scoresByModel.map((scores) => {
		const meanScore = meanOfFinite(scores);
		return meanScore == null
			? null
			: meanScore * coverageConfidence(scores.length, benchmarkKeys.length);
	});
}

function activeBenchmarkCostKeys(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): string[] {
	const benchmarkKeys = new Set<string>();
	for (const model of models) {
		for (const benchmarkKey of Object.keys(model.evaluations ?? {})) {
			benchmarkKeys.add(benchmarkKey);
		}
		for (const benchmarkKey of Object.keys(model.intelligence ?? {})) {
			benchmarkKeys.add(benchmarkKey);
		}
	}
	return [...benchmarkKeys]
		.filter((benchmarkKey) =>
			models.some(
				(model) =>
					benchmarkScore(model, benchmarkKey) != null &&
					taskCost(model, portfolio, benchmarkKey) != null,
			),
		)
		.sort((left, right) => left.localeCompare(right));
}

function benchmarkScore(
	model: LlmStatsModel,
	benchmarkKey: string,
): number | null {
	return (
		finiteValue(model.intelligence?.[benchmarkKey]) ??
		finiteValue(model.evaluations?.[benchmarkKey])
	);
}

function taskCost(
	model: LlmStatsModel,
	portfolio: BenchmarkPortfolio,
	benchmarkKey: string,
): number | null {
	const directCost = positiveTaskCost(model.task_metrics?.[benchmarkKey]);
	if (directCost != null) {
		return directCost;
	}
	const resourcePolicy = portfolio[benchmarkKey]?.resourcePolicy;
	return resourcePolicy?.source === "artificial_analysis"
		? positiveTaskCost(model.task_metrics?.artificial_analysis)
		: null;
}

function positiveTaskCost(
	taskMetrics: LlmStatsTaskMetricValues | null | undefined,
) {
	const cost = finiteValue(taskMetrics?.cost);
	return cost != null && cost > 0 ? cost : null;
}

function signedScore(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
