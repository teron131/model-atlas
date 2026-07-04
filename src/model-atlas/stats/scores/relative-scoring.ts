/** Relative percentile scoring for final Model Atlas model rows. */

import {
	benchmarkDeviation,
	fillMissingWithMedian,
	fillMissingWithQualityMirror,
	fixedWeightedScore,
	gaussianWeight,
	inversePositiveFinite,
	log10OnePlusPositive,
	logitBenchmarkScore,
	meanOfFinite,
	minMaxScale,
	percentileScoreAt,
	percentileScoreForValue,
	positiveFiniteNumber,
	quantileFromSorted,
	smoothstep,
	weightedCoverageRatio,
	weightedFinitePartCount,
	weightedMeanOfFinite,
} from "../../math-utils";
import {
	benchmarkMetricValue,
	effectiveTaskSeconds,
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
	workflowPriceEfficiencySignal,
} from "./workflow-simulation";

const MIN_DISPLAY_PRICE_COMPONENTS = 2;
const MIN_DISPLAY_SPEED_COMPONENTS = 2;
const ACTIVE_COMPONENT_WEIGHT = 1;
const RESOURCE_SIGNAL_WEIGHT = 0.7;
const WORKFLOW_SIGNAL_WEIGHT = 0.3;
const RESOURCE_PERFORMANCE_WEIGHT = 0.65;
const RESOURCE_EVIDENCE_WEIGHT = 0.35;
const PRICE_QUALITY_TRADEOFF_STRENGTH = 0.5;
const COST_EFFICIENCY_QUALITY_SIGMA = 0.5;
const MIN_BENCHMARK_DEVIATION = 0.35;
const COST_COVERAGE_FLOOR = 0.1;
const COST_COVERAGE_FULL = 0.6;
type WeightedSignal = {
	value: number | null;
	weight: number;
};

type ResourceGroup = {
	metricKey: string;
	taskMetricKey: string;
	benchmarkKeys: readonly string[];
	weight: number;
};

type CostEfficiencyBenchmarkPoint = {
	modelIndex: number;
	qualityDeviation: number;
	taskCost: number;
};

type CostEfficiencyEvidence = {
	benchmarkKeys: readonly string[];
	signalsByModel: number[][];
};

function blendedResourceAndWorkflowSignal(
	resourceSignals: WeightedSignal[],
	workflowSignals: WeightedSignal[],
	minimumFiniteValues: number,
): number | null {
	if (
		weightedFinitePartCount(resourceSignals) +
			weightedFinitePartCount(workflowSignals) <
		minimumFiniteValues
	) {
		return null;
	}
	return weightedMeanOfFinite([
		{
			value: resourceEvidenceAdjustedSignal(resourceSignals),
			weight: RESOURCE_SIGNAL_WEIGHT,
		},
		{
			value: weightedMeanOfFinite(workflowSignals),
			weight: WORKFLOW_SIGNAL_WEIGHT,
		},
	]);
}

function meanSignal(
	signals: WeightedSignal[],
	minimumFiniteValues: number,
): number | null {
	if (weightedFinitePartCount(signals) < minimumFiniteValues) {
		return null;
	}
	return weightedMeanOfFinite(signals);
}

function resourceEvidenceAdjustedSignal(
	resourceSignals: WeightedSignal[],
): number | null {
	const coverage = weightedCoverageRatio(resourceSignals);
	if (coverage == null) {
		return null;
	}
	return fixedWeightedScore([
		{
			value: weightedMeanOfFinite(resourceSignals) ?? 0,
			weight: RESOURCE_PERFORMANCE_WEIGHT,
		},
		{
			value: coverage * 100,
			weight: RESOURCE_EVIDENCE_WEIGHT,
		},
	]);
}

function hasPositiveResourceMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	const task = resourceTaskMetric(model, key, scoringConfig);
	return (
		positiveFiniteNumber(task?.cost) != null ||
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

function resourceTaskMetricKey(
	key: string,
	scoringConfig: ScoringConfig,
): string {
	const resourcePolicy = scoringConfig.benchmarkPortfolio[key]?.resourcePolicy;
	return resourcePolicy?.source === "artificial_analysis"
		? "artificial_analysis"
		: key;
}

function hasDirectResourceTaskMetric(
	models: readonly LlmStatsModelCandidate[],
	key: string,
): boolean {
	return models.some(
		(model) =>
			benchmarkMetricValue(model, key) != null &&
			hasUsableResourceTask(model, taskMetricFromModel(model, key)),
	);
}

function resourceGroupMetricKey(
	models: readonly LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): string {
	return hasDirectResourceTaskMetric(models, key)
		? key
		: resourceTaskMetricKey(key, scoringConfig);
}

function hasUsableResourceTask(
	model: LlmStatsModelCandidate,
	task: LlmStatsTaskMetricValues | null,
): boolean {
	return (
		positiveFiniteNumber(task?.cost) != null ||
		effectiveTaskSeconds(model, task) != null
	);
}

function resourceTaskMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): LlmStatsTaskMetricValues | null {
	const directTask = taskMetricFromModel(model, key);
	if (hasUsableResourceTask(model, directTask)) {
		return directTask;
	}
	const taskMetricKey = resourceTaskMetricKey(key, scoringConfig);
	const primaryTask = taskMetricFromModel(model, taskMetricKey);
	if (hasUsableResourceTask(model, primaryTask)) {
		return primaryTask;
	}
	return primaryTask;
}

function activeResourceGroups(
	models: readonly LlmStatsModelCandidate[],
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
			taskMetricKey: metricKey,
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
	scoringConfig: ScoringConfig,
): LlmStatsTaskMetricValues | null {
	const primaryTask = taskMetricFromModel(model, group.taskMetricKey);
	if (hasUsableResourceTask(model, primaryTask)) {
		return primaryTask;
	}
	for (const benchmarkKey of group.benchmarkKeys) {
		const task = resourceTaskMetric(model, benchmarkKey, scoringConfig);
		if (hasUsableResourceTask(model, task)) {
			return task;
		}
	}
	return primaryTask;
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
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
	scoringConfig: ScoringConfig,
) {
	return new Map(
		groups.map((group) => [
			group.metricKey,
			models
				.map((model) =>
					resourceGroupSpeedValue(
						model,
						group,
						benchmarkValuesByKey,
						scoringConfig,
					),
				)
				.filter(
					(value): value is number => value != null && Number.isFinite(value),
				),
		]),
	);
}

function resourceGroupSpeedValue(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
	scoringConfig: ScoringConfig,
): number | null {
	const score = groupBenchmarkScore(model, group, benchmarkValuesByKey);
	const seconds = effectiveTaskSeconds(
		model,
		groupTaskMetric(model, group, scoringConfig),
	);
	return score == null || seconds == null ? null : score / seconds;
}

/** Scores resource speed within one resource group so task duration scales do not dominate. */
function normalizedResourceGroupSpeedScore(
	model: LlmStatsModelCandidate,
	group: ResourceGroup,
	groupSpeedValuesByKey: ReadonlyMap<string, readonly number[]>,
	benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>,
	scoringConfig: ScoringConfig,
): number | null {
	const speed = resourceGroupSpeedValue(
		model,
		group,
		benchmarkValuesByKey,
		scoringConfig,
	);
	return percentileScoreForValue(
		groupSpeedValuesByKey.get(group.metricKey) ?? [],
		speed,
	);
}

function blendCost(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return (
		positiveFiniteNumber(model.cost?.blended_price) ??
		blendedPriceValue(model.cost, scoringConfig)
	);
}

function inverseLogCostSignal(cost: unknown): number | null {
	const logCost = log10OnePlusPositive(cost);
	return logCost == null ? null : 1 / logCost;
}

function activeCostEfficiencyBenchmarkKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): string[] {
	return activeResourceBenchmarkKeys(models, scoringConfig).filter((key) =>
		models.some((model) => {
			return (
				benchmarkMetricValue(model, key) != null &&
				positiveFiniteNumber(
					resourceTaskMetric(model, key, scoringConfig)?.cost,
				) != null
			);
		}),
	);
}

function costEfficiencyBenchmarkPoints(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): CostEfficiencyBenchmarkPoint[] {
	const logitQualityValues = models
		.map((model) => benchmarkMetricValue(model, key))
		.filter((value): value is number => value != null && Number.isFinite(value))
		.map(logitBenchmarkScore)
		.sort((left, right) => left - right);
	const benchmarkQualityMedian = quantileFromSorted(logitQualityValues, 0.5);
	const benchmarkQualityDeviation = benchmarkDeviation(
		logitQualityValues,
		MIN_BENCHMARK_DEVIATION,
	);
	if (benchmarkQualityMedian == null || benchmarkQualityDeviation == null) {
		return [];
	}
	return models.flatMap((model, modelIndex) => {
		const score = benchmarkMetricValue(model, key);
		const task = resourceTaskMetric(model, key, scoringConfig);
		const cost = positiveFiniteNumber(task?.cost);
		if (score == null || cost == null) {
			return [];
		}
		return [
			{
				modelIndex,
				qualityDeviation:
					(logitBenchmarkScore(score) - benchmarkQualityMedian) /
					benchmarkQualityDeviation,
				taskCost: cost,
			},
		];
	});
}

function localCostEfficiencyScore(
	point: CostEfficiencyBenchmarkPoint,
	points: readonly CostEfficiencyBenchmarkPoint[],
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
		if (comparisonPoint.taskCost >= point.taskCost) {
			atLeastAsExpensiveWeight += weight;
		}
	}
	return totalWeight > 0
		? (100 * atLeastAsExpensiveWeight) / totalWeight
		: null;
}

function costEfficiencyCoverageConfidence(
	availableCount: number,
	totalCount: number,
) {
	if (totalCount <= 0) {
		return 0;
	}
	const coverage = availableCount / totalCount;
	if (coverage >= COST_COVERAGE_FULL) {
		return 1;
	}
	return smoothstep(
		(coverage - COST_COVERAGE_FLOOR) /
			(COST_COVERAGE_FULL - COST_COVERAGE_FLOOR),
	);
}

function costEfficiencyEvidence(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): CostEfficiencyEvidence {
	const benchmarkKeys = activeCostEfficiencyBenchmarkKeys(
		models,
		scoringConfig,
	);
	const signalsByModel = models.map(() => [] as number[]);
	for (const key of benchmarkKeys) {
		const points = costEfficiencyBenchmarkPoints(models, key, scoringConfig);
		for (const point of points) {
			const score = localCostEfficiencyScore(point, points);
			if (score != null) {
				signalsByModel[point.modelIndex]?.push(score);
			}
		}
	}
	return {
		benchmarkKeys,
		signalsByModel,
	};
}

function costEfficiencySignals({
	benchmarkKeys,
	signalsByModel,
}: CostEfficiencyEvidence): Array<number | null> {
	return signalsByModel.map((signals) => {
		const meanValue = meanOfFinite(signals);
		return meanValue == null
			? null
			: meanValue *
					costEfficiencyCoverageConfidence(
						signals.length,
						benchmarkKeys.length,
					);
	});
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
		resourceValuesByKey,
		scoringConfig,
	);
	const intelligenceScores = models.map(
		(model) => model.scores?.intelligence_score ?? null,
	);
	const agenticScores = models.map(
		(model) => model.scores?.agentic_score ?? null,
	);
	const qualityScores = models.map((_, index) =>
		meanOfFinite([
			intelligenceScores[index] ?? null,
			agenticScores[index] ?? null,
		]),
	);
	const cheapnessSignals = models.map((model) =>
		inverseLogCostSignal(blendCost(model, scoringConfig)),
	);
	const qualityPriceSignals = models.map((model, index) => {
		const cost = blendCost(model, scoringConfig);
		const logCost = log10OnePlusPositive(cost);
		const qualityScore = qualityScores[index] ?? null;
		return logCost == null || qualityScore == null
			? null
			: qualityScore / logCost;
	});
	const workflowPriceSignals = models.map((model) =>
		workflowPriceEfficiencySignal(model, scoringConfig),
	);
	const workflowSpeedSignals = models.map((model) =>
		inversePositiveFinite(simulatedBlendSeconds(model.speed, scoringConfig)),
	);
	const priceSignals = models.map((_, index) => {
		const priceComponents = [
			{
				value: percentileScoreAt(cheapnessSignals, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
			{
				value: percentileScoreAt(qualityPriceSignals, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
			{
				value: percentileScoreAt(workflowPriceSignals, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
		];
		return meanSignal(priceComponents, MIN_DISPLAY_PRICE_COMPONENTS);
	});
	const speedSignals = models.map((model, index) => {
		const resourceSpeedSignals = resourceGroups.map((group) => ({
			value: normalizedResourceGroupSpeedScore(
				model,
				group,
				resourceSpeedValuesByKey,
				resourceValuesByKey,
				scoringConfig,
			),
			weight: group.weight,
		}));
		const workflowSpeedComponents = [
			{
				value: percentileScoreAt(workflowSpeedSignals, index),
				weight: ACTIVE_COMPONENT_WEIGHT,
			},
		];
		return blendedResourceAndWorkflowSignal(
			resourceSpeedSignals,
			workflowSpeedComponents,
			MIN_DISPLAY_SPEED_COMPONENTS,
		);
	});
	const costEfficiencyBenchmarkEvidence = costEfficiencyEvidence(
		models,
		scoringConfig,
	);
	const taskCostSignals = costEfficiencySignals(
		costEfficiencyBenchmarkEvidence,
	);
	const priceRelativeScores = priceSignals.map((signal) =>
		percentileScoreForValue(priceSignals, signal),
	);
	const speedRelativeScores = speedSignals.map((signal) =>
		percentileScoreForValue(speedSignals, signal),
	);
	const costEfficiencyRelativeScores = taskCostSignals.map((signal) =>
		percentileScoreForValue(taskCostSignals, signal),
	);
	const overallSpeedScores = fillMissingWithMedian(speedRelativeScores);
	const overallCostEfficiencyScores = fillMissingWithQualityMirror(
		qualityScores,
		costEfficiencyRelativeScores,
		PRICE_QUALITY_TRADEOFF_STRENGTH,
	);
	return models.map((model, index) => {
		const intelligenceRelativeScore = intelligenceScores[index] ?? null;
		const agenticRelativeScore = agenticScores[index] ?? null;
		const priceRelativeScore = priceRelativeScores[index] ?? null;
		const speedRelativeScore = speedRelativeScores[index] ?? null;
		const costEfficiencyRelativeScore =
			costEfficiencyRelativeScores[index] ?? null;
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
				value: overallCostEfficiencyScores[index] ?? null,
				weight: scoringConfig.overallRelativeScoreWeights.price,
			},
		]);
		return {
			...model,
			relative_scores: {
				intelligence_score: intelligenceRelativeScore,
				agentic_score: agenticRelativeScore,
				speed_score: speedRelativeScore,
				price_score: priceRelativeScore,
				cost_efficiency_score: costEfficiencyRelativeScore,
				overall_score: overallRelativeScore,
			},
		};
	});
}
