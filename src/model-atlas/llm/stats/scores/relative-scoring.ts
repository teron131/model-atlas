/** Relative percentile scoring for final Model Atlas model rows. */

import {
	ARTIFICIAL_ANALYSIS_RESOURCE_SOURCE_COUNT,
	benchmarkResourcePolicy,
	RAW_RESOURCE_COMPONENT_WEIGHT,
	resourceComponentWeightsFor,
} from "../../../config/benchmark-portfolio";
import {
	clampScore,
	fixedWeightedScore,
	meanOfFinite,
	minMaxScale,
	percentileRank,
	quantileFromSorted,
	sortedFiniteScores,
	weightedMeanOfFinite,
} from "../../../math-utils";
import { asFiniteNumber } from "../../shared";
import type {
	LlmStatsModelCandidate,
	LlmStatsScoredCandidate,
	LlmStatsTaskMetricValues,
	ScoringConfig,
} from "../types";
import { blendedPriceValue } from "./score-builders";
import {
	simulatedBlendSeconds,
	workflowSimulatedValueSignal,
} from "./workflow-simulation";

const MIN_DISPLAY_VALUE_COMPONENTS = 2;
const MIN_DISPLAY_SPEED_COMPONENTS = 2;
const VALUE_RAW_COMPONENT_WEIGHT = RAW_RESOURCE_COMPONENT_WEIGHT / 3;
const SPEED_SIMULATION_COMPONENT_WEIGHT = RAW_RESOURCE_COMPONENT_WEIGHT;
const VALUE_QUALITY_TRADEOFF_STRENGTH = 0.5;
type RelativeComponent = {
	value: number | null;
	weight: number;
};

/** Converts a sorted metric position into a percentile-like 0-100 score. */
function percentileScoreAt(
	values: Array<number | null>,
	index: number,
): number | null {
	const value = values[index] ?? null;
	return value == null ? null : percentileRank(values, value);
}

/** Averages weighted metrics only when enough finite inputs are present. */
function weightedMeanOfFiniteWithMinimum(
	components: RelativeComponent[],
	minimumFiniteValues: number,
): number | null {
	const finiteValueCount = components.filter(
		(component) =>
			component.value != null &&
			Number.isFinite(component.value) &&
			Number.isFinite(component.weight) &&
			component.weight > 0,
	).length;
	return finiteValueCount >= minimumFiniteValues
		? weightedMeanOfFinite(components)
		: null;
}

/** Fills absent score dimensions with the observed median score. */
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

/** Mirrors quality score into missing value inputs when needed. */
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

/** Accepts only positive finite values for relative scoring inputs. */
function positiveNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number > 0 ? number : null;
}

/** Turns lower-is-better positive metrics into higher-is-better signals. */
function inversePositive(value: unknown): number | null {
	const number = positiveNumber(value);
	return number == null ? null : 1 / number;
}

/** Reads per-task cost from benchmark task metrics. */
function taskMetricCost(
	model: LlmStatsModelCandidate,
	key: string,
): number | null {
	return positiveNumber(model.task_metrics?.[key]?.cost);
}

/** Reads per-task duration from benchmark task metrics. */
function taskMetricSeconds(
	model: LlmStatsModelCandidate,
	key: string,
): number | null {
	return positiveNumber(model.task_metrics?.[key]?.seconds);
}

/** Reads a finite benchmark metric from model evaluation fields. */
function benchmarkMetricValue(
	model: LlmStatsModelCandidate,
	key: string,
): number | null {
	return (
		asFiniteNumber(model.intelligence?.[key]) ??
		asFiniteNumber(model.evaluations?.[key]) ??
		null
	);
}

/** Finds the resource metric attached to a frontier benchmark. */
function frontierResourceTaskMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): LlmStatsTaskMetricValues | null {
	const policy = benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio);
	if (policy == null) {
		return null;
	}
	const taskMetricKey =
		policy.source === "artificial_analysis" ? "artificial_analysis" : key;
	return model.task_metrics?.[taskMetricKey] ?? null;
}

/** Checks whether a model has a positive resource metric for a benchmark. */
function hasPositiveResourceMetric(
	model: LlmStatsModelCandidate,
	key: string,
): boolean {
	const task = model.task_metrics?.[key];
	return (
		positiveNumber(task?.cost) != null || positiveNumber(task?.seconds) != null
	);
}

/** Checks whether a frontier benchmark has enough resource data to score. */
function hasBenchmarkFrontierResourceMetric(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	const policy = benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio);
	if (policy == null) {
		return false;
	}
	const taskMetricKey =
		policy.source === "artificial_analysis" ? "artificial_analysis" : key;
	return models.some(
		(model) =>
			benchmarkMetricValue(model, key) != null &&
			hasPositiveResourceMetric(model, taskMetricKey),
	);
}

/** Lists frontier benchmarks that can contribute resource signals. */
function frontierResourceKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): string[] {
	return scoringConfig.frontierBenchmarkKeys.filter((key) =>
		hasBenchmarkFrontierResourceMetric(models, key, scoringConfig),
	);
}

/** Collects finite frontier benchmark values by benchmark key. */
function frontierBenchmarkValuesByKey(
	models: LlmStatsModelCandidate[],
	keys: readonly string[],
) {
	return new Map(
		keys.map((key) => [
			key,
			models
				.map((model) => benchmarkMetricValue(model, key))
				.filter(
					(value): value is number => value != null && Number.isFinite(value),
				),
		]),
	);
}

/** Collects inverted frontier speed signals by benchmark key. */
function frontierBenchmarkSpeedValuesByKey(
	models: LlmStatsModelCandidate[],
	keys: readonly string[],
	scoringConfig: ScoringConfig,
) {
	return new Map(
		keys.map((key) => [
			key,
			models
				.map((model) => {
					if (benchmarkMetricValue(model, key) == null) {
						return null;
					}
					return inversePositive(
						frontierResourceTaskMetric(model, key, scoringConfig)?.seconds,
					);
				})
				.filter(
					(value): value is number => value != null && Number.isFinite(value),
				),
		]),
	);
}

/** Scores frontier benchmark cost as a lower-is-better resource signal. */
function frontierResourceCostSignal(
	model: LlmStatsModelCandidate,
	keys: readonly string[],
	scoringConfig: ScoringConfig,
): number | null {
	return meanOfFinite(
		keys.map((key) => {
			if (benchmarkMetricValue(model, key) == null) {
				return null;
			}
			return inversePositive(
				frontierResourceTaskMetric(model, key, scoringConfig)?.cost,
			);
		}),
	);
}

/** Scores quality per resource unit for frontier benchmarks. */
function frontierResourceEfficiencySignal(
	model: LlmStatsModelCandidate,
	keys: readonly string[],
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
	scoringConfig: ScoringConfig,
): number | null {
	return meanOfFinite(
		keys.map((key) => {
			const score = minMaxScale(
				benchmarkValuesByKey.get(key) ?? [],
				benchmarkMetricValue(model, key),
			);
			const cost = positiveNumber(
				frontierResourceTaskMetric(model, key, scoringConfig)?.cost,
			);
			return score == null || cost == null ? null : score / cost;
		}),
	);
}

/** Scores frontier benchmark speed as a lower-is-better signal. */
function frontierResourceSpeedSignal(
	model: LlmStatsModelCandidate,
	keys: readonly string[],
	benchmarkSpeedValuesByKey: ReadonlyMap<string, readonly number[]>,
	scoringConfig: ScoringConfig,
): number | null {
	return meanOfFinite(
		keys.map((key) => {
			if (benchmarkMetricValue(model, key) == null) {
				return null;
			}
			const speed = inversePositive(
				frontierResourceTaskMetric(model, key, scoringConfig)?.seconds,
			);
			return percentileRank(
				[...(benchmarkSpeedValuesByKey.get(key) ?? [])],
				speed,
			);
		}),
	);
}

/** Blends list-price and benchmark-measured cost signals. */
function blendCost(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return (
		positiveNumber(model.cost?.blended_price) ??
		blendedPriceValue(model.cost, scoringConfig)
	);
}

/** Attach `relative_scores`; quality is already benchmark-relative, while speed/value use percentiles. */
export function attachRelativeScores(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): LlmStatsScoredCandidate[] {
	const frontierKeys = frontierResourceKeys(models, scoringConfig);
	const aaResourceSourceCount = models.some((model) =>
		hasPositiveResourceMetric(model, "artificial_analysis"),
	)
		? ARTIFICIAL_ANALYSIS_RESOURCE_SOURCE_COUNT
		: 0;
	const { aaResourceWeight, frontierResourceWeight } =
		resourceComponentWeightsFor({
			aaResourceSourceCount,
			frontierResourceSourceCount: frontierKeys.length,
		});
	const aaResourcePairComponentWeight = aaResourceWeight / 2;
	const frontierResourcePairComponentWeight = frontierResourceWeight / 2;
	const frontierValuesByKey = frontierBenchmarkValuesByKey(
		models,
		frontierKeys,
	);
	const frontierSpeedValuesByKey = frontierBenchmarkSpeedValuesByKey(
		models,
		frontierKeys,
		scoringConfig,
	);
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
	const frontierResourceCostValues = models.map((model) =>
		frontierResourceCostSignal(model, frontierKeys, scoringConfig),
	);
	const frontierResourceEfficiencyValues = models.map((model) =>
		frontierResourceEfficiencySignal(
			model,
			frontierKeys,
			frontierValuesByKey,
			scoringConfig,
		),
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
	const aaResourceSpeedValues = models.map((_, index) =>
		percentileScoreAt(artificialAnalysisSpeedValues, index),
	);
	const frontierResourceSpeedValues = models.map((model) =>
		frontierResourceSpeedSignal(
			model,
			frontierKeys,
			frontierSpeedValuesByKey,
			scoringConfig,
		),
	);
	const workflowSimulatedSpeedValues = models.map((model) =>
		inversePositive(simulatedBlendSeconds(model.speed, scoringConfig)),
	);
	const valueRelativeScores = models.map((_, index) =>
		weightedMeanOfFiniteWithMinimum(
			[
				{
					value: percentileScoreAt(artificialAnalysisCostValues, index),
					weight: aaResourcePairComponentWeight,
				},
				{
					value: percentileScoreAt(artificialAnalysisEfficiencyValues, index),
					weight: aaResourcePairComponentWeight,
				},
				{
					value: percentileScoreAt(frontierResourceCostValues, index),
					weight: frontierResourcePairComponentWeight,
				},
				{
					value: percentileScoreAt(frontierResourceEfficiencyValues, index),
					weight: frontierResourcePairComponentWeight,
				},
				{
					value: percentileScoreAt(blendCostValues, index),
					weight: VALUE_RAW_COMPONENT_WEIGHT,
				},
				{
					value: percentileScoreAt(qualityAdjustedBlendCostValues, index),
					weight: VALUE_RAW_COMPONENT_WEIGHT,
				},
				{
					value: percentileScoreAt(workflowSimulatedValueValues, index),
					weight: VALUE_RAW_COMPONENT_WEIGHT,
				},
			],
			MIN_DISPLAY_VALUE_COMPONENTS,
		),
	);
	const speedRelativeScores = models.map((_, index) =>
		weightedMeanOfFiniteWithMinimum(
			[
				{
					value: aaResourceSpeedValues[index] ?? null,
					weight: aaResourceWeight,
				},
				{
					value: frontierResourceSpeedValues[index] ?? null,
					weight: frontierResourceWeight,
				},
				{
					value: percentileScoreAt(workflowSimulatedSpeedValues, index),
					weight: SPEED_SIMULATION_COMPONENT_WEIGHT,
				},
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
