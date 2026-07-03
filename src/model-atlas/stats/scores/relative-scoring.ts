/** Relative percentile scoring for final Model Atlas model rows. */

import { benchmarkResourcePolicy } from "../../config/benchmark-portfolio";
import {
	clampScore,
	fixedWeightedScore,
	meanOfFinite,
	minMaxScale,
	percentileRank,
	quantileFromSorted,
	sortedFiniteScores,
	weightedMeanOfFinite,
} from "../../math-utils";
import {
	benchmarkMetricValue,
	effectiveTaskSeconds,
	positiveNumber,
	taskMetricFromModel,
} from "../resource-metrics";
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
const ACTIVE_COMPONENT_WEIGHT = 1;
const RESOURCE_SIGNAL_WEIGHT = 0.7;
const RAW_SIGNAL_WEIGHT = 0.3;
const VALUE_QUALITY_TRADEOFF_STRENGTH = 0.5;
type RelativeComponent = {
	value: number | null;
	weight: number;
};

type ResourceGroup = {
	metricKey: string;
	benchmarkKeys: readonly string[];
	weight: number;
};

/** Convert sorted metric positions onto the same 0-100 score scale used by public relative scores. */
function percentileScoreAt(
	values: Array<number | null>,
	index: number,
): number | null {
	const value = values[index] ?? null;
	return value == null ? null : percentileRank(values, value);
}

function percentileScoreForSignal(
	values: ReadonlyArray<number | null>,
	value: number | null,
): number | null {
	return value == null ? null : percentileRank([...values], value);
}

function componentValueCount(components: RelativeComponent[]): number {
	return components.filter(
		(component) =>
			component.value != null &&
			Number.isFinite(component.value) &&
			Number.isFinite(component.weight) &&
			component.weight > 0,
	).length;
}

function weightedSignalBlock(
	resourceComponents: RelativeComponent[],
	rawComponents: RelativeComponent[],
	minimumFiniteValues: number,
): number | null {
	if (
		componentValueCount(resourceComponents) +
			componentValueCount(rawComponents) <
		minimumFiniteValues
	) {
		return null;
	}
	return weightedMeanOfFinite([
		{
			value: weightedMeanOfFinite(resourceComponents),
			weight: RESOURCE_SIGNAL_WEIGHT,
		},
		{
			value: weightedMeanOfFinite(rawComponents),
			weight: RAW_SIGNAL_WEIGHT,
		},
	]);
}

/** Median imputation keeps missing dimensions neutral instead of rewarding or punishing absent measurements. */
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

/** When cost is missing, infer value conservatively from quality so high-quality models do not get free value credit. */
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

/** Invert lower-is-better resource metrics before percentile scoring so every downstream score remains higher-is-better. */
function inversePositive(value: unknown): number | null {
	const number = positiveNumber(value);
	return number == null ? null : 1 / number;
}

function logCostDenominator(value: unknown): number | null {
	const number = positiveNumber(value);
	if (number == null) {
		return null;
	}
	const denominator = Math.log10(1 + number);
	return denominator > 0 ? denominator : null;
}

function resourceTaskMetricForBenchmark(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): LlmStatsTaskMetricValues | null {
	const directTask = taskMetricFromModel(model, key);
	if (directTask != null) {
		return directTask;
	}
	return benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio)
		?.source === "artificial_analysis"
		? taskMetricFromModel(model, "artificial_analysis")
		: null;
}

function hasPositiveResourceMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	const task = resourceTaskMetricForBenchmark(model, key, scoringConfig);
	return (
		positiveNumber(task?.cost) != null ||
		effectiveTaskSeconds(model, task) != null
	);
}

/** A benchmark contributes resource scoring when any scored row carries matching task telemetry. */
function hasBenchmarkResourceMetric(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	return models.some(
		(model) =>
			benchmarkMetricValue(model, key) != null &&
			hasPositiveResourceMetric(model, key, scoringConfig),
	);
}

function activeResourceBenchmarkKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
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
		.filter((key) => hasBenchmarkResourceMetric(models, key, scoringConfig))
		.sort((left, right) => left.localeCompare(right));
}

function hasDirectResourceTaskMetric(
	models: LlmStatsModelCandidate[],
	key: string,
): boolean {
	return models.some(
		(model) =>
			benchmarkMetricValue(model, key) != null &&
			taskMetricFromModel(model, key) != null,
	);
}

function resourceGroupMetricKey(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): string {
	if (hasDirectResourceTaskMetric(models, key)) {
		return key;
	}
	return benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio)
		?.source === "artificial_analysis"
		? "artificial_analysis"
		: key;
}

function activeResourceGroups(
	models: LlmStatsModelCandidate[],
	keys: readonly string[],
	scoringConfig: ScoringConfig,
): ResourceGroup[] {
	const benchmarkKeysByMetricKey = new Map<string, string[]>();
	for (const key of keys) {
		const metricKey = resourceGroupMetricKey(models, key, scoringConfig);
		const benchmarkKeys = benchmarkKeysByMetricKey.get(metricKey) ?? [];
		benchmarkKeys.push(key);
		benchmarkKeysByMetricKey.set(metricKey, benchmarkKeys);
	}
	return [...benchmarkKeysByMetricKey.entries()]
		.map(([metricKey, benchmarkKeys]) => ({
			metricKey,
			benchmarkKeys: benchmarkKeys.sort((left, right) =>
				left.localeCompare(right),
			),
			weight: benchmarkKeys.length,
		}))
		.sort((left, right) => left.metricKey.localeCompare(right.metricKey));
}

function benchmarkValuesByKey(
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

function groupTaskMetric(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
): LlmStatsTaskMetricValues | null {
	return taskMetricFromModel(model, group.metricKey);
}

function groupHasBenchmarkScore(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
): boolean {
	return group.benchmarkKeys.some(
		(key) => benchmarkMetricValue(model, key) != null,
	);
}

function groupBenchmarkScore(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	return meanOfFinite(
		group.benchmarkKeys.map((key) =>
			minMaxScale(
				benchmarkValuesByKey.get(key) ?? [],
				benchmarkMetricValue(model, key),
			),
		),
	);
}

function resourceGroupSpeedValuesByKey(
	models: LlmStatsModelCandidate[],
	groups: readonly ResourceGroup[],
) {
	return new Map(
		groups.map((group) => [
			group.metricKey,
			models
				.map((model) => {
					if (!groupHasBenchmarkScore(model, group)) {
						return null;
					}
					return inversePositive(
						effectiveTaskSeconds(model, groupTaskMetric(model, group)),
					);
				})
				.filter(
					(value): value is number => value != null && Number.isFinite(value),
				),
		]),
	);
}

function resourceGroupEfficiencyValue(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	const score = groupBenchmarkScore(model, group, benchmarkValuesByKey);
	const cost = logCostDenominator(groupTaskMetric(model, group)?.cost);
	return score == null || cost == null ? null : score / cost;
}

function resourceGroupEfficiencyValuesByKey(
	models: LlmStatsModelCandidate[],
	groups: readonly ResourceGroup[],
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
) {
	return new Map(
		groups.map((group) => [
			group.metricKey,
			models
				.map((model) =>
					resourceGroupEfficiencyValue(model, group, benchmarkValuesByKey),
				)
				.filter(
					(value): value is number => value != null && Number.isFinite(value),
				),
		]),
	);
}

/** Scores quality per resource unit within one resource group before cross-group averaging. */
function normalizedResourceGroupEfficiencyScore(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	groupEfficiencyValuesByKey: ReadonlyMap<string, readonly number[]>,
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	const efficiency = resourceGroupEfficiencyValue(
		model,
		group,
		benchmarkValuesByKey,
	);
	return percentileScoreForSignal(
		groupEfficiencyValuesByKey.get(group.metricKey) ?? [],
		efficiency,
	);
}

/** Scores resource speed within one resource group so task duration scales do not dominate. */
function normalizedResourceGroupSpeedScore(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	groupSpeedValuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
	if (!groupHasBenchmarkScore(model, group)) {
		return null;
	}
	const speed = inversePositive(
		effectiveTaskSeconds(model, groupTaskMetric(model, group)),
	);
	return percentileScoreForSignal(
		groupSpeedValuesByKey.get(group.metricKey) ?? [],
		speed,
	);
}

function blendCost(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return (
		positiveNumber(model.cost?.blended_price) ??
		blendedPriceValue(model.cost, scoringConfig)
	);
}

export function attachRelativeScores(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): LlmStatsScoredCandidate[] {
	const resourceKeys = activeResourceBenchmarkKeys(models, scoringConfig);
	const resourceGroups = activeResourceGroups(
		models,
		resourceKeys,
		scoringConfig,
	);
	const resourceValuesByKey = benchmarkValuesByKey(models, resourceKeys);
	const resourceSpeedValuesByKey = resourceGroupSpeedValuesByKey(
		models,
		resourceGroups,
	);
	const resourceEfficiencyValuesByKey = resourceGroupEfficiencyValuesByKey(
		models,
		resourceGroups,
		resourceValuesByKey,
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
	const workflowSimulatedSpeedValues = models.map((model) =>
		inversePositive(simulatedBlendSeconds(model.speed, scoringConfig)),
	);
	const valueCompositeSignals = models.map((model, index) => {
		const resourceEfficiencyComponents = resourceGroups.map((group) => ({
			value: normalizedResourceGroupEfficiencyScore(
				model,
				group,
				resourceEfficiencyValuesByKey,
				resourceValuesByKey,
			),
			weight: group.weight,
		}));
		const rawValueComponents = [
			{
				value: percentileScoreAt(blendCostValues, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
			{
				value: percentileScoreAt(qualityAdjustedBlendCostValues, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
			{
				value: percentileScoreAt(workflowSimulatedValueValues, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
		];
		return weightedSignalBlock(
			resourceEfficiencyComponents,
			rawValueComponents,
			MIN_DISPLAY_VALUE_COMPONENTS,
		);
	});
	const speedCompositeSignals = models.map((model, index) => {
		const resourceSpeedComponents = resourceGroups.map((group) => ({
			value: normalizedResourceGroupSpeedScore(
				model,
				group,
				resourceSpeedValuesByKey,
			),
			weight: group.weight,
		}));
		const rawSpeedComponents = [
			{
				value: percentileScoreAt(workflowSimulatedSpeedValues, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
		];
		return weightedSignalBlock(
			resourceSpeedComponents,
			rawSpeedComponents,
			MIN_DISPLAY_SPEED_COMPONENTS,
		);
	});
	const valueRelativeScores = valueCompositeSignals.map((signal) =>
		percentileScoreForSignal(valueCompositeSignals, signal),
	);
	const speedRelativeScores = speedCompositeSignals.map((signal) =>
		percentileScoreForSignal(speedCompositeSignals, signal),
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
