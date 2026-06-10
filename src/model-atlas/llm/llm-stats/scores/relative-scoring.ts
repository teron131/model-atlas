/** Relative percentile scoring for final Model Atlas model rows. */

import {
	clampScore,
	fixedWeightedScore,
	meanOfFinite,
	meanOfFiniteWithMinimum,
	percentileRank,
	quantileFromSorted,
	sortedFiniteScores,
} from "../../../math-utils";
import { asFiniteNumber } from "../../shared";
import type {
	ModelStatsProjectedModel,
	ModelStatsScoredModel,
	ScoringConfig,
} from "../types";
import { blendedPriceValue } from "./score-builders";
import {
	simulatedBlendSeconds,
	workflowSimulatedValueSignal,
} from "./workflow-simulation";

const MIN_DISPLAY_VALUE_COMPONENTS = 2;
const MIN_DISPLAY_SPEED_COMPONENTS = 2;
const VALUE_QUALITY_TRADEOFF_STRENGTH = 0.5;
type TaskMetricKey = "artificial_analysis" | "deep_swe" | "agents_last_exam";

function percentileScoreAt(
	values: Array<number | null>,
	index: number,
): number | null {
	const value = values[index] ?? null;
	return value == null ? null : percentileRank(values, value);
}

function fillMissingScoresWithMedian(
	targetScores: Array<number | null>,
): Array<number | null> {
	const knownScores = sortedFiniteScores(targetScores);
	const medianScore = quantileFromSorted(knownScores, 0.5);
	if (medianScore == null) {
		return targetScores;
	}
	return targetScores.map((targetScore) => targetScore ?? medianScore);
}

function fillMissingValuesWithQualityMirror(
	qualityScores: Array<number | null>,
	targetScores: Array<number | null>,
): Array<number | null> {
	const knownScores = sortedFiniteScores(targetScores);
	if (knownScores.length === 0) {
		return targetScores;
	}
	const qualityDistribution = qualityScores.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	return targetScores.map((targetScore, index) => {
		if (targetScore != null) {
			return targetScore;
		}
		const qualityScore = qualityScores[index] ?? null;
		const qualityPercentile = percentileRank(qualityDistribution, qualityScore);
		if (qualityPercentile == null) {
			return null;
		}
		const targetPercentile = clampScore(
			50 - VALUE_QUALITY_TRADEOFF_STRENGTH * (qualityPercentile - 50),
		);
		return quantileFromSorted(knownScores, targetPercentile / 100);
	});
}

function positiveNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number > 0 ? number : null;
}

function inversePositive(value: unknown): number | null {
	const number = positiveNumber(value);
	return number == null ? null : 1 / number;
}

function taskMetricCost(
	model: ModelStatsProjectedModel,
	key: TaskMetricKey,
): number | null {
	return positiveNumber(model.task_metrics?.[key]?.cost);
}

function taskMetricSeconds(
	model: ModelStatsProjectedModel,
	key: TaskMetricKey,
): number | null {
	return positiveNumber(model.task_metrics?.[key]?.seconds);
}

function blendCost(
	model: ModelStatsProjectedModel,
	scoringConfig: ScoringConfig,
): number | null {
	return (
		positiveNumber(model.cost?.blended_price) ??
		blendedPriceValue(model.cost, scoringConfig)
	);
}

/** Attach `relative_scores`; quality is already benchmark-relative, while speed/value use percentiles. */
export function attachRelativeScores(
	models: ModelStatsProjectedModel[],
	scoringConfig: ScoringConfig,
): ModelStatsScoredModel[] {
	const intelligenceRelativeScores = models.map(
		(model) => model.scores?.intelligence_score ?? null,
	);
	const agenticRelativeScores = models.map(
		(model) => model.scores?.agentic_score ?? null,
	);
	const qualityUtilityScores = models.map((_, index) =>
		meanOfFinite([
			intelligenceRelativeScores[index] ?? null,
			agenticRelativeScores[index] ?? null,
		]),
	);
	const artificialAnalysisCostValues = models.map((model) =>
		inversePositive(taskMetricCost(model, "artificial_analysis")),
	);
	const artificialAnalysisEfficiencyValues = models.map((model, index) => {
		const cost = taskMetricCost(model, "artificial_analysis");
		const intelligenceRelativeScore = intelligenceRelativeScores[index] ?? null;
		return cost == null || intelligenceRelativeScore == null
			? null
			: intelligenceRelativeScore / cost;
	});
	const deepSWECostValues = models.map((model) =>
		inversePositive(taskMetricCost(model, "deep_swe")),
	);
	const agentsLastExamCostValues = models.map((model) =>
		inversePositive(taskMetricCost(model, "agents_last_exam")),
	);
	const blendCostValues = models.map((model) =>
		inversePositive(blendCost(model, scoringConfig)),
	);
	const qualityAdjustedBlendCostValues = models.map((model, index) => {
		const cost = blendCost(model, scoringConfig);
		const qualityUtility = qualityUtilityScores[index] ?? null;
		return cost == null || qualityUtility == null
			? null
			: qualityUtility / cost;
	});
	const workflowSimulatedValueValues = models.map((model) =>
		workflowSimulatedValueSignal(model, scoringConfig),
	);
	const artificialAnalysisSpeedValues = models.map((model) =>
		inversePositive(taskMetricSeconds(model, "artificial_analysis")),
	);
	const deepSWESpeedValues = models.map((model) =>
		inversePositive(taskMetricSeconds(model, "deep_swe")),
	);
	const agentsLastExamSpeedValues = models.map((model) =>
		inversePositive(taskMetricSeconds(model, "agents_last_exam")),
	);
	const workflowSimulatedSpeedValues = models.map((model) =>
		inversePositive(simulatedBlendSeconds(model.speed, scoringConfig)),
	);
	const valueRelativeScores = models.map((_, index) =>
		meanOfFiniteWithMinimum(
			[
				percentileScoreAt(artificialAnalysisCostValues, index),
				percentileScoreAt(artificialAnalysisEfficiencyValues, index),
				percentileScoreAt(deepSWECostValues, index),
				percentileScoreAt(agentsLastExamCostValues, index),
				percentileScoreAt(blendCostValues, index),
				percentileScoreAt(qualityAdjustedBlendCostValues, index),
				percentileScoreAt(workflowSimulatedValueValues, index),
			],
			MIN_DISPLAY_VALUE_COMPONENTS,
		),
	);
	const speedRelativeScores = models.map((_, index) =>
		meanOfFiniteWithMinimum(
			[
				percentileScoreAt(artificialAnalysisSpeedValues, index),
				percentileScoreAt(deepSWESpeedValues, index),
				percentileScoreAt(agentsLastExamSpeedValues, index),
				percentileScoreAt(workflowSimulatedSpeedValues, index),
			],
			MIN_DISPLAY_SPEED_COMPONENTS,
		),
	);
	const overallSpeedScores = fillMissingScoresWithMedian(speedRelativeScores);
	const overallValueScores = fillMissingValuesWithQualityMirror(
		qualityUtilityScores,
		valueRelativeScores,
	);
	return models.map((model, index) => {
		const intelligenceRelativeScore = intelligenceRelativeScores[index] ?? null;
		const agenticRelativeScore = agenticRelativeScores[index] ?? null;
		const valueRelativeScore = valueRelativeScores[index] ?? null;
		const speedRelativeScore = speedRelativeScores[index] ?? null;
		const overallRelativeScore = fixedWeightedScore([
			{
				value: intelligenceRelativeScore,
				weight: scoringConfig.overallRelativeScoreWeights.intelligence,
			},
			{
				value: agenticRelativeScore,
				weight: scoringConfig.overallRelativeScoreWeights.agentic,
			},
			{
				value: overallSpeedScores[index] ?? null,
				weight: scoringConfig.overallRelativeScoreWeights.speed,
			},
			{
				value: overallValueScores[index] ?? null,
				weight: scoringConfig.overallRelativeScoreWeights.value,
			},
		]);
		return {
			...model,
			relative_scores: {
				intelligence_score: intelligenceRelativeScore,
				agentic_score: agenticRelativeScore,
				speed_score: speedRelativeScore,
				value_score: valueRelativeScore,
				overall_score: overallRelativeScore,
			},
		};
	});
}
