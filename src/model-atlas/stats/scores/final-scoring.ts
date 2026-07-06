/** Final percentile scoring for public Model Atlas model rows. */

import {
	benchmarkDeviation,
	coverageConfidence,
	fillMissingWithQualityMirror,
	fixedWeightedScore,
	gaussianWeight,
	log10OnePlusPositive,
	logitBenchmarkScore,
	meanOfFinite,
	percentileScoreAt,
	percentileScoreForValue,
	positiveFiniteNumber,
	quantileFromSorted,
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

const MIN_RAW_SPEED_COMPONENTS = 2;
const ACTIVE_COMPONENT_WEIGHT = 1;
const PRICE_QUALITY_TRADEOFF_STRENGTH = 0.5;
const RESOURCE_EFFICIENCY_QUALITY_SIGMA = 0.5;
const MIN_BENCHMARK_DEVIATION = 0.35;
type WeightedSignal = {
	value: number | null;
	weight: number;
};

type ResourceEfficiencyBenchmarkPoint = {
	modelIndex: number;
	qualityDeviation: number;
	resourceAmount: number;
};

type ResourceEfficiencyEvidence = {
	benchmarkKeys: readonly string[];
	signalsByModel: number[][];
};

function meanSignal(
	signals: WeightedSignal[],
	minimumFiniteValues: number,
): number | null {
	if (weightedFinitePartCount(signals) < minimumFiniteValues) {
		return null;
	}
	return weightedMeanOfFinite(signals);
}

function lowerIsBetterPercentileScoreAt(
	values: Array<number | null>,
	index: number,
): number | null {
	const value = values[index] ?? null;
	if (value == null || !Number.isFinite(value)) {
		return null;
	}
	const finiteValues = values.filter(
		(item): item is number => item != null && Number.isFinite(item),
	);
	if (finiteValues.length === 0) {
		return null;
	}
	const greaterOrEqualCount = finiteValues.filter(
		(item) => item >= value,
	).length;
	return Number(((greaterOrEqualCount / finiteValues.length) * 100).toFixed(4));
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

type TaskResourceAmount = (
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
) => number | null;

const taskCostAmount: TaskResourceAmount = (model, key, scoringConfig) =>
	positiveFiniteNumber(resourceTaskMetric(model, key, scoringConfig)?.cost);

const taskSecondsAmount: TaskResourceAmount = (model, key, scoringConfig) =>
	effectiveTaskSeconds(model, resourceTaskMetric(model, key, scoringConfig));

function throughputSpeedSignal(model: LlmStatsModelCandidate): number | null {
	return positiveFiniteNumber(model.speed?.throughput_tokens_per_second_median);
}

function latencySecondsSignal(model: LlmStatsModelCandidate): number | null {
	return positiveFiniteNumber(model.speed?.latency_seconds_median);
}

function e2eSecondsSignal(model: LlmStatsModelCandidate): number | null {
	return positiveFiniteNumber(model.speed?.e2e_latency_seconds_median);
}

function activeResourceEfficiencyBenchmarkKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
	resourceAmountFor: TaskResourceAmount,
): string[] {
	return activeResourceBenchmarkKeys(models, scoringConfig).filter((key) =>
		models.some((model) => {
			return (
				benchmarkMetricValue(model, key) != null &&
				resourceAmountFor(model, key, scoringConfig) != null
			);
		}),
	);
}

function resourceEfficiencyBenchmarkPoints(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
	resourceAmountFor: TaskResourceAmount,
): ResourceEfficiencyBenchmarkPoint[] {
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
		const resourceAmount = resourceAmountFor(model, key, scoringConfig);
		if (score == null || resourceAmount == null) {
			return [];
		}
		return [
			{
				modelIndex,
				qualityDeviation:
					(logitBenchmarkScore(score) - benchmarkQualityMedian) /
					benchmarkQualityDeviation,
				resourceAmount,
			},
		];
	});
}

function localResourceEfficiencyScore(
	point: ResourceEfficiencyBenchmarkPoint,
	points: readonly ResourceEfficiencyBenchmarkPoint[],
): number | null {
	let totalWeight = 0;
	let atLeastAsLargeWeight = 0;
	for (const comparisonPoint of points) {
		const weight = gaussianWeight(
			point.qualityDeviation,
			comparisonPoint.qualityDeviation,
			RESOURCE_EFFICIENCY_QUALITY_SIGMA,
		);
		totalWeight += weight;
		if (comparisonPoint.resourceAmount >= point.resourceAmount) {
			atLeastAsLargeWeight += weight;
		}
	}
	return totalWeight > 0 ? (100 * atLeastAsLargeWeight) / totalWeight : null;
}

function resourceEfficiencyEvidence(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
	resourceAmountFor: TaskResourceAmount,
): ResourceEfficiencyEvidence {
	const benchmarkKeys = activeResourceEfficiencyBenchmarkKeys(
		models,
		scoringConfig,
		resourceAmountFor,
	);
	const signalsByModel = models.map(() => [] as number[]);
	for (const key of benchmarkKeys) {
		const points = resourceEfficiencyBenchmarkPoints(
			models,
			key,
			scoringConfig,
			resourceAmountFor,
		);
		for (const point of points) {
			const score = localResourceEfficiencyScore(point, points);
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

function resourceEfficiencySignals({
	benchmarkKeys,
	signalsByModel,
}: ResourceEfficiencyEvidence): Array<number | null> {
	return signalsByModel.map((signals) => {
		const meanValue = meanOfFinite(signals);
		return meanValue == null
			? null
			: meanValue * coverageConfidence(signals.length, benchmarkKeys.length);
	});
}

function equalWeightedScore(
	signals: Array<number | null>,
	totalCount: number,
): number | null {
	const meanValue = meanOfFinite(signals);
	return meanValue == null
		? null
		: meanValue *
				coverageConfidence(
					weightedFinitePartCount(
						signals.map((value) => ({
							value,
							weight: ACTIVE_COMPONENT_WEIGHT,
						})),
					),
					totalCount,
				);
}

export function attachFinalScores(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): LlmStatsScoredCandidate[] {
	const intelligenceScores = models.map(
		(model) => model.component_scores?.intelligence_score ?? null,
	);
	const agenticScores = models.map(
		(model) => model.component_scores?.agentic_score ?? null,
	);
	const qualityScores = models.map((_, index) =>
		meanOfFinite([
			intelligenceScores[index] ?? null,
			agenticScores[index] ?? null,
		]),
	);
	const blendedPriceSignals = models.map((model) =>
		inverseLogCostSignal(blendCost(model, scoringConfig)),
	);
	const qualityPerPriceSignals = models.map((model, index) => {
		const cost = blendCost(model, scoringConfig);
		const logCost = log10OnePlusPositive(cost);
		const qualityScore = qualityScores[index] ?? null;
		return logCost == null || qualityScore == null
			? null
			: qualityScore / logCost;
	});
	const workflowPriceValueSignals = models.map((model) =>
		workflowPriceEfficiencySignal(model, scoringConfig),
	);
	const valueInputScoresByModel = models.map((_, index) => [
		percentileScoreAt(blendedPriceSignals, index),
		percentileScoreAt(qualityPerPriceSignals, index),
		percentileScoreAt(workflowPriceValueSignals, index),
	]);
	const throughputSpeedSignals = models.map(throughputSpeedSignal);
	const latencySecondsSignals = models.map(latencySecondsSignal);
	const e2eSecondsSignals = models.map(e2eSecondsSignal);
	const workflowRuntimeSeconds = models.map((model) =>
		simulatedBlendSeconds(model.speed, scoringConfig),
	);
	const providerSpeedComponents = models.map((_, index) =>
		meanSignal(
			[
				{
					value: percentileScoreAt(throughputSpeedSignals, index),
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
				{
					value: lowerIsBetterPercentileScoreAt(latencySecondsSignals, index),
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
				{
					value: lowerIsBetterPercentileScoreAt(e2eSecondsSignals, index),
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
			],
			MIN_RAW_SPEED_COMPONENTS,
		),
	);
	const taskTimeComponentEvidence = resourceEfficiencyEvidence(
		models,
		scoringConfig,
		taskSecondsAmount,
	);
	const taskCostComponentEvidence = resourceEfficiencyEvidence(
		models,
		scoringConfig,
		taskCostAmount,
	);
	const taskTimeSignals = resourceEfficiencySignals(taskTimeComponentEvidence);
	const taskTimeOverallComponents = taskTimeSignals.map((signal) =>
		percentileScoreForValue(taskTimeSignals, signal),
	);
	const workflowSpeedComponents = workflowRuntimeSeconds.map((_, index) =>
		lowerIsBetterPercentileScoreAt(workflowRuntimeSeconds, index),
	);
	const blendedSpeedScores = models.map((_, index) =>
		equalWeightedScore(
			[
				providerSpeedComponents[index] ?? null,
				workflowSpeedComponents[index] ?? null,
				...(taskTimeComponentEvidence.signalsByModel[index] ?? []),
			],
			taskTimeComponentEvidence.benchmarkKeys.length + 2,
		),
	);
	const valueScores = models.map((_, index) =>
		equalWeightedScore(
			[
				...(valueInputScoresByModel[index] ?? []),
				...(taskCostComponentEvidence.signalsByModel[index] ?? []),
			],
			taskCostComponentEvidence.benchmarkKeys.length + 3,
		),
	);
	const overallTaskTimeComponents = fillMissingWithQualityMirror(
		qualityScores,
		taskTimeOverallComponents,
		PRICE_QUALITY_TRADEOFF_STRENGTH,
	);
	const overallValueScores = fillMissingWithQualityMirror(
		qualityScores,
		valueScores,
		PRICE_QUALITY_TRADEOFF_STRENGTH,
	);
	return models.map((model, index) => {
		const intelligenceScore = intelligenceScores[index] ?? null;
		const agenticScore = agenticScores[index] ?? null;
		const blendedSpeedScore = blendedSpeedScores[index] ?? null;
		const valueScore = valueScores[index] ?? null;
		const overallScore = fixedWeightedScore([
			{
				value: intelligenceScore,
				weight: scoringConfig.overallScoreWeights.intelligence,
			},
			{
				value: agenticScore,
				weight: scoringConfig.overallScoreWeights.agentic,
			},
			{
				value: overallTaskTimeComponents[index] ?? null,
				weight: scoringConfig.overallScoreWeights.speed,
			},
			{
				value: overallValueScores[index] ?? null,
				weight: scoringConfig.overallScoreWeights.value,
			},
		]);
		return {
			...model,
			scores: {
				intelligence_score: intelligenceScore,
				agentic_score: agenticScore,
				speed_score: blendedSpeedScore,
				value_score: valueScore,
				overall_score: overallScore,
			},
		};
	});
}
