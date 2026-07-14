/** Chart-only reconstruction of price and cost-efficiency score signals. */

import {
	coverageConfidence,
	log10OnePlusPositive,
	meanOfFinite,
} from "../../../src/model-atlas/math-utils";
import { canonicalModelKey } from "../../../src/model-atlas/shared";
import {
	benchmarkResourceEfficiencyScores,
	modelBalancedMinMaxScores,
} from "../../../src/model-atlas/stats/scores/final-scoring";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
	LlmStatsTaskMetricValues,
} from "../../../src/model-atlas/stats/types";
import { modelVariantKey } from "../shared/modelDisplay";
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
	priceScore: number;
	costEfficiencyScore: number;
};

/** Rebuild the scored absolute-price and benchmark-only task-cost signals for chart comparison. */
export function priceEfficiencyComparisonRows(
	visibleModels: LlmStatsModel[],
	referenceModels: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
	expandReasoningVariants: boolean,
): PriceEfficiencyComparisonRow[] {
	const pricedModels = referenceModels.filter(isPriceEligibleModel);
	const priceScores = modelBalancedMinMaxScores(
		pricedModels,
		pricedModels.map((model) =>
			log10OnePlusPositive(finiteValue(model.cost?.blended_price)),
		),
		"lower",
	);
	const benchmarkCostEfficiencyScores = benchmarkCostEfficiencyByModel(
		pricedModels,
		portfolio,
	);
	const drafts = pricedModels.flatMap(
		(model, index): PriceEfficiencyDraft[] => {
			const blendedPrice = finiteValue(model.cost?.blended_price);
			const logCost = log10OnePlusPositive(blendedPrice);
			const qualityScore = meanOfFinite([
				finiteValue(model.scores?.intelligence_score),
				finiteValue(model.scores?.agentic_score),
			]);
			const benchmarkEfficiencyScore =
				benchmarkCostEfficiencyScores[index] ?? null;
			const priceScore = priceScores[index] ?? null;
			if (
				blendedPrice == null ||
				logCost == null ||
				qualityScore == null ||
				benchmarkEfficiencyScore == null ||
				priceScore == null
			) {
				return [];
			}
			return [
				{
					model,
					qualityScore,
					blendedPrice,
					costEfficiencyScore: benchmarkEfficiencyScore,
					priceScore,
				},
			];
		},
	);
	const strongestReferenceByIdentity = new Map<string, LlmStatsModel>();
	for (const model of referenceModels) {
		const key = comparisonIdentity(model, expandReasoningVariants);
		const existing = strongestReferenceByIdentity.get(key);
		if (
			existing == null ||
			model.scores.intelligence_score > existing.scores.intelligence_score
		) {
			strongestReferenceByIdentity.set(key, model);
		}
	}
	const draftByReference = new Map(drafts.map((draft) => [draft.model, draft]));
	return visibleModels
		.flatMap((model): PriceEfficiencyComparisonRow[] => {
			const strongestReference = strongestReferenceByIdentity.get(
				comparisonIdentity(model, expandReasoningVariants),
			);
			const draft =
				strongestReference == null
					? null
					: draftByReference.get(strongestReference);
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

function comparisonIdentity(
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

export function priceEfficiencyHoverRows(
	row: PriceEfficiencyComparisonRow,
): HoverRow[] {
	return [
		["Price score", fmtTooltipScore(row.priceScore)],
		["Cost efficiency score", fmtTooltipScore(row.costEfficiencyScore)],
		["Benchmark lift", signedScore(row.deltaScore)],
		["Blended price", fmtTooltipMoney(row.blendedPrice)],
		["Quality score", fmtTooltipScore(row.qualityScore)],
	];
}

export function priceEfficiencySummaryDetail(
	row: PriceEfficiencyComparisonRow,
): string {
	return `${row.costEfficiencyScore.toFixed(1)} efficiency / ${row.priceScore.toFixed(
		1,
	)} price / ${fmtMoney(row.blendedPrice)}`;
}

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
				signalsByModel[modelIndex]?.push(score);
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

function benchmarkScore(model: LlmStatsModel, key: string): number | null {
	return (
		finiteValue(model.intelligence?.[key]) ??
		finiteValue(model.evaluations?.[key])
	);
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

function signedScore(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
